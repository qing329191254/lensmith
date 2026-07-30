"""Multi-vendor video generation (fal brands + OpenAI-compatible / Zhipu family)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.request_keys import resolve_ai_gateway_key, resolve_compatible_api_base_url, resolve_video_model
from app.services import fal as fal_service
from app.services.gateway import GatewayError
from app.services.provider_errors import friendly_provider_error


# id -> capabilities + how to call
# provider "fal" needs fal key; "compatible" uses image/Gateway key + optional 中转 Base URL.
VIDEO_CATALOG: dict[str, dict[str, Any]] = {
    "veo3-fast": {
        "provider": "fal",
        "i2v": True,
        "first_last": True,
        "generate_audio": True,
        "fal_i2v": "fal-ai/veo3.1/fast/image-to-video",
        "fal_fl": "fal-ai/veo3.1/fast/first-last-frame-to-video",
        "fal_style": "veo",
    },
    "veo3-standard": {
        "provider": "fal",
        "i2v": True,
        "first_last": True,
        "generate_audio": True,
        "fal_i2v": "fal-ai/veo3.1/image-to-video",
        "fal_fl": "fal-ai/veo3.1/first-last-frame-to-video",
        "fal_style": "veo",
    },
    "kling-2.5": {
        "provider": "fal",
        "i2v": True,
        "first_last": True,
        "generate_audio": False,
        "fal_i2v": "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
        "fal_style": "kling25",
    },
    "kling-3": {
        "provider": "fal",
        "i2v": True,
        "first_last": True,
        "generate_audio": True,
        "fal_i2v": "fal-ai/kling-video/v3/pro/image-to-video",
        "fal_style": "kling3",
    },
    "seedance-2-fast": {
        "provider": "fal",
        "i2v": True,
        "first_last": True,
        "generate_audio": True,
        "fal_i2v": "bytedance/seedance-2.0/fast/image-to-video",
        "fal_style": "seedance",
    },
    "wan-2.5": {
        "provider": "fal",
        "i2v": True,
        "first_last": False,
        "generate_audio": False,
        "fal_i2v": "fal-ai/wan-25-preview/image-to-video",
        "fal_style": "wan25",
    },
    "wan-2.2": {
        "provider": "fal",
        "i2v": False,
        "first_last": True,
        "generate_audio": False,
        "fal_fl": "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
        "fal_style": "wan22",
    },
    "minimax-hailuo": {
        "provider": "fal",
        "i2v": True,
        "first_last": False,
        "generate_audio": False,
        "fal_i2v": "fal-ai/minimax-video/image-to-video",
        "fal_style": "minimax",
    },
    # Zhipu / OpenAI-compatible videos/generations (same adapter; 中转 Base URL applies)
    "cogvideox-3": {
        "provider": "compatible",
        "i2v": True,
        "first_last": True,
        "with_audio": False,
        "api_model": "cogvideox-3",
    },
    "cogvideox-2": {
        "provider": "compatible",
        "i2v": True,
        "first_last": False,
        "with_audio": False,
        "api_model": "cogvideox-2",
    },
    "viduq1": {
        "provider": "compatible",
        "i2v": True,
        "first_last": True,
        "with_audio": False,
        "api_model": "viduq1",
    },
    "vidu2-image": {
        "provider": "compatible",
        "i2v": True,
        "first_last": False,
        "with_audio": False,
        "api_model": "vidu2-image",
    },
    # Volcengine Ark / 即梦同源 Seedance（与 Seedream 共用方舟 API Key）
    "doubao-seedance-2-0-fast": {
        "provider": "ark",
        "i2v": True,
        "first_last": True,
        "api_model": "doubao-seedance-2-0-fast-260128",
    },
    "doubao-seedance-2-0": {
        "provider": "ark",
        "i2v": True,
        "first_last": True,
        "api_model": "doubao-seedance-2-0-260128",
    },
    "doubao-seedance-2-0-mini": {
        "provider": "ark",
        "i2v": True,
        "first_last": True,
        "api_model": "doubao-seedance-2-0-mini-260128",
    },
    "jimeng-seedance": {
        "provider": "ark",
        "i2v": True,
        "first_last": True,
        "api_model": "doubao-seedance-2-0-fast-260128",
    },
}


def _serialize(result: Any) -> dict[str, Any]:
    if hasattr(result, "data"):
        data = result.data
        if hasattr(data, "dict"):
            return data.dict()
        if isinstance(data, dict):
            return data
        return {"data": data}
    if isinstance(result, dict):
        return result
    if hasattr(result, "dict"):
        return result.dict()
    return {"result": result}


def generate_via_fal(
    *,
    model_id: str,
    prompt: str,
    image_url: str,
    linked_image_url: str | None,
    aspect_ratio: str,
    duration: float,
) -> dict[str, Any]:
    meta = VIDEO_CATALOG.get(model_id) or VIDEO_CATALOG["veo3-fast"]
    is_fl = bool(linked_image_url)
    style = meta.get("fal_style") or "veo"
    want_audio = bool(meta.get("generate_audio"))

    if is_fl and not meta.get("first_last"):
        raise fal_service.FalError(
            f"Model {model_id} does not support first–last frame transitions. "
            "Pick Veo, Kling, Seedance, WAN 2.2, or a compatible model (e.g. CogVideoX)."
        )
    if not is_fl and not meta.get("i2v"):
        raise fal_service.FalError(
            f"Model {model_id} is for transitions only. Pick Veo, Kling, Seedance, WAN 2.5, or MiniMax for single-image video."
        )

    if style == "kling25":
        payload: dict[str, Any] = {
            "prompt": prompt,
            "image_url": image_url,
            "duration": "5",
            "aspect_ratio": aspect_ratio or "16:9",
        }
        if linked_image_url:
            payload["tail_image_url"] = linked_image_url
        result = fal_service.subscribe(meta["fal_i2v"], payload)
        return {**_serialize(result), "model": model_id}

    if style == "kling3":
        payload = {
            "prompt": prompt,
            "start_image_url": image_url,
            "duration": "5" if duration < 8 else "10",
            "generate_audio": want_audio,
        }
        if linked_image_url:
            payload["end_image_url"] = linked_image_url
        result = fal_service.subscribe(meta["fal_i2v"], payload)
        return {**_serialize(result), "model": model_id}

    if style == "seedance":
        video_duration = str(max(4, min(15, int(duration) if duration else 5)))
        payload = {
            "prompt": prompt,
            "image_url": image_url,
            "resolution": "720p",
            "duration": video_duration,
            "aspect_ratio": aspect_ratio or "auto",
            "generate_audio": want_audio,
        }
        if linked_image_url:
            payload["end_image_url"] = linked_image_url
        result = fal_service.subscribe(meta["fal_i2v"], payload)
        return {**_serialize(result), "model": model_id}

    if style == "wan25":
        video_duration = "10" if duration >= 8 else "5"
        result = fal_service.subscribe(
            meta["fal_i2v"],
            {
                "prompt": prompt,
                "image_url": image_url,
                "duration": video_duration,
                "resolution": "1080p",
                "negative_prompt": "low resolution, error, worst quality, low quality, defects",
                "enable_prompt_expansion": True,
                "enable_safety_checker": True,
            },
        )
        return {**_serialize(result), "model": model_id}

    if style == "wan22":
        result = fal_service.subscribe(
            meta["fal_fl"],
            {
                "prompt": prompt,
                "image_url": image_url,
                "end_image_url": linked_image_url,
                "resolution": "720p",
                "aspect_ratio": "auto",
                "enable_safety_checker": True,
                "enable_output_safety_checker": False,
                "enable_prompt_expansion": False,
                "acceleration": "regular",
                "video_quality": "high",
                "video_write_mode": "balanced",
            },
        )
        return {**_serialize(result), "model": model_id}

    if style == "minimax":
        result = fal_service.subscribe(
            meta["fal_i2v"],
            {"prompt": prompt, "image_url": image_url, "prompt_optimizer": True},
        )
        return {**_serialize(result), "model": model_id}

    # Veo family — native audio when the model supports it
    if is_fl:
        result = fal_service.subscribe(
            meta["fal_fl"],
            {
                "prompt": prompt,
                "first_frame_url": image_url,
                "last_frame_url": linked_image_url,
                "duration": "8s",
                "aspect_ratio": aspect_ratio or "16:9",
                "resolution": "720p",
                "generate_audio": want_audio,
            },
        )
    else:
        result = fal_service.subscribe(
            meta["fal_i2v"],
            {
                "prompt": prompt,
                "image_url": image_url,
                "duration": "8s",
                "aspect_ratio": aspect_ratio or "16:9",
                "generate_audio": want_audio,
            },
        )
    return {**_serialize(result), "model": model_id}


async def generate_via_compatible_video(
    *,
    model_id: str,
    prompt: str,
    image_url: str,
    linked_image_url: str | None,
    aspect_ratio: str,
    duration: float = 5,
) -> dict[str, Any]:
    """Zhipu-style / OpenAI-compatible POST /videos/generations + async poll."""
    api_key = resolve_ai_gateway_key()
    if not api_key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details="No API key configured. Set Image / multimodal key in Workspace (Zhipu or proxy key).",
        )
    meta = VIDEO_CATALOG.get(model_id) or {}
    if linked_image_url and not meta.get("first_last", True):
        raise GatewayError(
            f"Model {model_id} does not support first–last frame transitions.",
            status_code=400,
        )
    if not linked_image_url and not meta.get("i2v", True):
        raise GatewayError(
            f"Model {model_id} requires first–last frames.",
            status_code=400,
        )

    api_model = meta.get("api_model") or model_id
    base = resolve_compatible_api_base_url()

    size = "1920x1080" if (aspect_ratio or "16:9") in ("16:9", "16/9") else "1080x1920"
    if linked_image_url:
        image_payload: str | list[str] = [image_url, linked_image_url]
    else:
        image_payload = image_url

    # Zhipu CogVideoX accepts 5 or 10 seconds.
    duration_sec = 10 if float(duration or 5) >= 7.5 else 5

    create_body: dict[str, Any] = {
        "model": api_model,
        "prompt": prompt,
        "image_url": image_payload,
        "quality": meta.get("quality", "speed"),
        "with_audio": bool(meta.get("with_audio", False)),
        "size": size,
        "fps": int(meta.get("fps", 30)),
        "duration": duration_sec,
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        create = await client.post(f"{base}/videos/generations", headers=headers, json=create_body)
        if create.status_code >= 400:
            raw = create.text[:2000]
            raise GatewayError(
                friendly_provider_error(raw, status_code=create.status_code, what="video"),
                status_code=500,
                details=raw,
            )
        created = create.json()
        task_id = created.get("id") or created.get("request_id") or (created.get("data") or {}).get("id")
        if not task_id:
            raise GatewayError("Video request failed", details=f"Missing task id: {created}")

        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            await asyncio.sleep(3)
            status_res = await client.get(f"{base}/async-result/{task_id}", headers=headers)
            if status_res.status_code >= 400:
                status_res = await client.get(
                    f"{base}/videos/generations/{task_id}",
                    headers=headers,
                )
            if status_res.status_code >= 400:
                raw = status_res.text[:2000]
                raise GatewayError(
                    friendly_provider_error(raw, status_code=status_res.status_code, what="video"),
                    status_code=500,
                    details=raw,
                )
            body = status_res.json()
            task_status = (
                body.get("task_status")
                or body.get("status")
                or (body.get("data") or {}).get("task_status")
                or ""
            ).upper()
            if task_status in ("SUCCESS", "SUCCEEDED", "COMPLETED"):
                video_url = _extract_compatible_video_url(body)
                if not video_url:
                    raise GatewayError("Video succeeded but no URL", details=str(body)[:800])
                return {"video": {"url": video_url}, "model": model_id}
            if task_status in ("FAIL", "FAILED", "ERROR"):
                raise GatewayError("Video generation failed", details=str(body)[:800])

    raise GatewayError("Video timed out", details=f"task_id={task_id}")


def _extract_compatible_video_url(body: dict[str, Any]) -> str | None:
    for key in ("video_result", "video_results"):
        items = body.get(key)
        if isinstance(items, list) and items:
            url = items[0].get("url") if isinstance(items[0], dict) else None
            if url:
                return url
    data = body.get("data")
    if isinstance(data, dict):
        nested = _extract_compatible_video_url(data)
        if nested:
            return nested
        if isinstance(data.get("video_url"), str):
            return data["video_url"]
    if isinstance(body.get("video_url"), str):
        return body["video_url"]
    video = body.get("video")
    if isinstance(video, dict) and isinstance(video.get("url"), str):
        return video["url"]
    return None


async def generate_video(
    *,
    prompt: str,
    image_url: str | None,
    linked_image_url: str | None = None,
    aspect_ratio: str = "16:9",
    duration: float = 8,
    model: str | None = None,
) -> dict[str, Any]:
    model_id = resolve_video_model(model)
    if model_id not in VIDEO_CATALOG:
        if model_id.startswith("veo3"):
            model_id = "veo3-fast" if "fast" in model_id else "veo3-standard"
        else:
            raise GatewayError(
                f"Unknown video model: {model_id}",
                status_code=400,
                details=f"Supported: {', '.join(VIDEO_CATALOG)}",
            )

    meta = VIDEO_CATALOG[model_id]
    if not image_url:
        raise GatewayError("imageUrl is required for storyboard video", status_code=400)

    if meta["provider"] == "compatible":
        return await generate_via_compatible_video(
            model_id=model_id,
            prompt=prompt.strip(),
            image_url=image_url.strip(),
            linked_image_url=linked_image_url.strip() if linked_image_url else None,
            aspect_ratio=aspect_ratio or "16:9",
            duration=duration,
        )

    if meta["provider"] == "ark":
        from app.services import ark_jimeng

        return await ark_jimeng.generate_seedance_video(
            prompt=prompt.strip(),
            image_url=image_url.strip(),
            linked_image_url=linked_image_url.strip() if linked_image_url else None,
            aspect_ratio=aspect_ratio or "16:9",
            duration=duration,
            model=str(meta.get("api_model") or model_id),
        )

    return generate_via_fal(
        model_id=model_id,
        prompt=prompt.strip(),
        image_url=image_url.strip(),
        linked_image_url=linked_image_url.strip() if linked_image_url else None,
        aspect_ratio=aspect_ratio or "16:9",
        duration=duration,
    )
