"""Volcengine Ark (火山方舟) — Seedream images + Seedance video.

Jimeng C-end models are based on Seedream/Seedance. Ark uses a single API Key
(Bearer), which fits the Workspace one-key UX better than Visual AK/SK.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.request_keys import resolve_ai_gateway_key, resolve_compatible_api_base_url
from app.services.gateway import GatewayError
from app.services.provider_errors import friendly_provider_error

DEFAULT_ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"

# Well-known public model ids; users may replace with their Ark endpoint ids.
DEFAULT_SEEDREAM = "doubao-seedream-4-0-250828"
DEFAULT_SEEDANCE_I2V = "doubao-seedance-2-0-fast-260128"


def resolve_ark_base_url() -> str:
    custom = resolve_compatible_api_base_url().rstrip("/")
    if "volces.com" in custom or "volcengine" in custom or custom.endswith("/api/v3"):
        return custom
    return DEFAULT_ARK_BASE


def _ark_key() -> str:
    key = resolve_ai_gateway_key()
    if not key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details="No Ark / 即梦 API key. Paste your 火山方舟 API Key in Workspace.",
        )
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_ark_key()}",
        "Content-Type": "application/json",
    }


def _aspect_to_seedream_size(aspect_ratio: str) -> str:
    ar = (aspect_ratio or "1:1").strip().replace("/", ":")
    # Seedream accepts pixel sizes; keep within common 2K-ish bounds.
    mapping = {
        "1:1": "2048x2048",
        "16:9": "2560x1440",
        "9:16": "1440x2560",
        "4:3": "2304x1728",
        "3:4": "1728x2304",
        "3:2": "2496x1664",
        "2:3": "1664x2496",
        "21:9": "3024x1296",
    }
    return mapping.get(ar, "2048x2048")


def _looks_like_url(value: str) -> bool:
    try:
        p = urlparse(value)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def _normalize_image_ref(image: str) -> str:
    """Ark accepts https URL or data-URL / raw base64."""
    value = (image or "").strip()
    if not value:
        return value
    if value.startswith("data:") or _looks_like_url(value):
        return value
    return value


async def generate_seedream_image(
    prompt: str,
    aspect_ratio: str,
    model: str,
    *,
    image: str | None = None,
    image2: str | None = None,
) -> tuple[str, str, dict[str, int]]:
    base = resolve_ark_base_url()
    model_id = (model or "").strip() or DEFAULT_SEEDREAM
    # Allow lensmith aliases
    if model_id in ("jimeng-seedream", "jimeng", "seedream"):
        model_id = DEFAULT_SEEDREAM

    size = _aspect_to_seedream_size(aspect_ratio)
    payload: dict[str, Any] = {
        "model": model_id,
        "prompt": prompt,
        "size": size,
        "response_format": "url",
        "watermark": False,
    }

    refs: list[str] = []
    if image:
        refs.append(_normalize_image_ref(image))
    if image2:
        refs.append(_normalize_image_ref(image2))
    if len(refs) == 1:
        payload["image"] = refs[0]
    elif len(refs) > 1:
        payload["image"] = refs

    url = f"{base}/images/generations"
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        if response.status_code >= 400:
            raw = response.text[:2000]
            raise GatewayError(
                friendly_provider_error(raw, status_code=response.status_code, what="image"),
                status_code=500,
                details=raw,
            )
        data = response.json()

    items = data.get("data") or []
    if not items:
        raise GatewayError("No image generated", details=str(data)[:500])
    item = items[0] if isinstance(items[0], dict) else {}
    remote = item.get("url")
    empty_usage = {"promptTokens": 0, "completionTokens": 0, "cachedTokens": 0, "totalTokens": 0}
    # Prefer https URL so the client can persist history (giant data-URIs are dropped).
    if isinstance(remote, str) and remote.startswith(("http://", "https://")):
        return remote, "", empty_usage
    if isinstance(remote, str) and remote.startswith("data:"):
        return remote, "", empty_usage
    b64 = item.get("b64_json")
    if b64:
        return f"data:image/png;base64,{b64}", "", empty_usage
    raise GatewayError("No image generated", details="Ark response missing image url")


def _extract_task_video_url(body: dict[str, Any]) -> str | None:
    if not isinstance(body, dict):
        return None
    content = body.get("content")
    if isinstance(content, dict):
        v = content.get("video_url")
        if isinstance(v, str) and v:
            return v
    output = body.get("output")
    if isinstance(output, dict):
        v = output.get("video_url") or output.get("url")
        if isinstance(v, str) and v:
            return v
    if isinstance(body.get("video_url"), str):
        return body["video_url"]
    # Nested results list
    for key in ("results", "data"):
        block = body.get(key)
        if isinstance(block, list) and block:
            first = block[0]
            if isinstance(first, dict):
                v = first.get("video_url") or first.get("url")
                if isinstance(v, str) and v:
                    return v
        if isinstance(block, dict):
            v = block.get("video_url") or block.get("url")
            if isinstance(v, str) and v:
                return v
    return None


async def generate_seedance_video(
    *,
    prompt: str,
    image_url: str,
    linked_image_url: str | None = None,
    aspect_ratio: str = "16:9",
    duration: float = 5,
    model: str | None = None,
) -> dict[str, Any]:
    base = resolve_ark_base_url()
    model_id = (model or "").strip() or DEFAULT_SEEDANCE_I2V
    aliases = {
        "jimeng-seedance": DEFAULT_SEEDANCE_I2V,
        "jimeng-seedance-fast": DEFAULT_SEEDANCE_I2V,
        "doubao-seedance-2-0-fast": "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-2-0": "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-mini": "doubao-seedance-2-0-mini-260128",
        "doubao-seedance-1-0-lite-i2v": "doubao-seedance-1-0-lite-i2v-250428",
        "doubao-seedance-lite-i2v": "doubao-seedance-1-0-lite-i2v-250428",
    }
    model_id = aliases.get(model_id, model_id)

    ratio = (aspect_ratio or "16:9").replace("/", ":")
    if ratio not in ("16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"):
        ratio = "16:9"
    dur = int(duration) if duration else 5
    dur = max(2, min(12, dur))

    content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt or "Cinematic motion"},
        {
            "type": "image_url",
            "image_url": {"url": _normalize_image_ref(image_url)},
            "role": "first_frame",
        },
    ]
    if linked_image_url:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": _normalize_image_ref(linked_image_url)},
                "role": "last_frame",
            }
        )

    payload: dict[str, Any] = {
        "model": model_id,
        "content": content,
        "ratio": ratio,
        "duration": dur,
        "watermark": False,
    }

    create_url = f"{base}/contents/generations/tasks"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(create_url, headers=_headers(), json=payload)
        if response.status_code >= 400:
            raw = response.text[:2000]
            raise GatewayError(
                friendly_provider_error(raw, status_code=response.status_code, what="video"),
                status_code=500,
                details=raw,
            )
        created = response.json()

    task_id = created.get("id") or (created.get("data") or {}).get("id") or created.get("task_id")
    if not task_id:
        raise GatewayError("Ark video task id missing", details=str(created)[:800])

    status_url = f"{base}/contents/generations/tasks/{task_id}"
    deadline = time.monotonic() + 360
    async with httpx.AsyncClient(timeout=60.0) as client:
        while time.monotonic() < deadline:
            await asyncio.sleep(3)
            poll = await client.get(status_url, headers=_headers())
            if poll.status_code >= 400:
                raw = poll.text[:2000]
                raise GatewayError(
                    friendly_provider_error(raw, status_code=poll.status_code, what="video"),
                    status_code=500,
                    details=raw,
                )
            body = poll.json()
            status = str(body.get("status") or "").lower()
            if status in ("succeeded", "success", "completed", "done"):
                video_url = _extract_task_video_url(body)
                if not video_url:
                    raise GatewayError("Video succeeded but no URL", details=str(body)[:800])
                return {"video": {"url": video_url}, "taskId": task_id, "provider": "ark", "raw": body}
            if status in ("failed", "error", "cancelled", "canceled"):
                raise GatewayError(
                    "Video generation failed",
                    details=str(body.get("error") or body)[:800],
                )

    raise GatewayError("Video generation timed out", details=f"task_id={task_id}")
