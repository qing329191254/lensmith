"""Multi-vendor image generation (Google Gemini / OpenAI / Zhipu CogView)."""

from __future__ import annotations

import base64
from typing import Any

import httpx

from app.request_keys import (
    image_provider,
    resolve_ai_gateway_key,
    resolve_compatible_api_base_url,
    resolve_gateway_base_url,
    resolve_image_model,
)
from app.services.gateway import GatewayError, chat_completion, extract_images, extract_text, extract_usage
from app.services.provider_errors import friendly_provider_error


def _aspect_to_openai_size(aspect_ratio: str) -> str:
    ar = (aspect_ratio or "1:1").strip()
    if ar in ("16:9", "16/9"):
        return "1536x1024"
    if ar in ("9:16", "9/16"):
        return "1024x1536"
    return "1024x1024"


def _aspect_to_compatible_size(aspect_ratio: str) -> str:
    ar = (aspect_ratio or "1:1").strip()
    if ar in ("16:9", "16/9"):
        return "1280x720"
    if ar in ("9:16", "9/16"):
        return "720x1280"
    return "1024x1024"


def _strip_provider_prefix(model: str) -> str:
    """Keep SiliconFlow-style ids (org/name); only strip known Lensmith prefixes."""
    mid = model.strip()
    lower = mid.lower()
    for prefix in ("zhipu/", "zai/", "siliconflow/", "sf/"):
        if lower.startswith(prefix):
            rest = mid.split("/", 1)[1]
            return rest or mid
    return mid or "cogview-3-flash"


async def _url_to_data_url(url: str) -> str:
    if url.startswith("data:"):
        return url
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type") or "image/jpeg"
        b64 = base64.b64encode(response.content).decode("ascii")
        return f"data:{content_type};base64,{b64}"


async def generate_text_to_image(prompt: str, aspect_ratio: str) -> tuple[str, str, dict[str, int]]:
    model = resolve_image_model()
    provider = image_provider(model)
    if provider == "openai":
        return await _openai_text_to_image(prompt, aspect_ratio, model)
    if provider == "ark":
        from app.services import ark_jimeng

        return await ark_jimeng.generate_seedream_image(prompt, aspect_ratio, model)
    if provider == "compatible":
        return await _compatible_text_to_image(prompt, aspect_ratio, model)
    return await _google_text_to_image(prompt, aspect_ratio, model)


async def generate_editing(
    prompt: str,
    aspect_ratio: str,
    image1_data_url: str,
    image2_data_url: str | None = None,
) -> tuple[str, str, str, dict[str, int]]:
    model = resolve_image_model()
    provider = image_provider(model)
    editing_prompt = (
        f"{prompt}. Combine these two images creatively while following the instructions."
        if image2_data_url
        else f"{prompt}. Edit or transform this image based on the instructions."
    )
    if provider == "ark":
        from app.services import ark_jimeng

        url, _cap, usage = await ark_jimeng.generate_seedream_image(
            editing_prompt,
            aspect_ratio,
            model,
            image=image1_data_url,
            image2=image2_data_url,
        )
        return url, editing_prompt, editing_prompt, usage
    if provider == "compatible":
        # CogView has no native img2img: describe with GLM-4V then redraw via CogView.
        return await _compatible_approx_editing(
            editing_prompt, aspect_ratio, image1_data_url, image2_data_url, model
        )
    if provider == "openai":
        # GPT Image via gateway chat multimodal (best-effort edit).
        return await _google_editing(editing_prompt, aspect_ratio, image1_data_url, image2_data_url, model)
    return await _google_editing(editing_prompt, aspect_ratio, image1_data_url, image2_data_url, model)


async def _google_text_to_image(
    prompt: str, aspect_ratio: str, model: str
) -> tuple[str, str, dict[str, int]]:
    image_generation_prompt = (
        f"Generate a high-quality image based on this description: {prompt}. "
        "The image should be visually appealing and match the description as closely as possible."
    )
    result = await chat_completion(
        model=model,
        messages=[{"role": "user", "content": image_generation_prompt}],
        provider_options={
            "google": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": aspect_ratio},
            }
        },
    )
    images = extract_images(result)
    if not images:
        raise GatewayError("No image generated", details="The model did not return any images")
    return images[0]["data_url"], extract_text(result), extract_usage(result)


async def _google_editing(
    editing_prompt: str,
    aspect_ratio: str,
    image1_data_url: str,
    image2_data_url: str | None,
    model: str,
) -> tuple[str, str, str, dict[str, int]]:
    from app.services.gateway import image_content_part, text_content_part

    content: list[dict[str, Any]] = [image_content_part(image1_data_url)]
    if image2_data_url:
        content.append(image_content_part(image2_data_url))
    content.append(text_content_part(editing_prompt))

    provider_options: dict[str, Any] | None = None
    if image_provider(model) == "google" or model.startswith("google/"):
        provider_options = {
            "google": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": aspect_ratio},
            }
        }

    result = await chat_completion(
        model=model,
        messages=[{"role": "user", "content": content}],
        provider_options=provider_options,
    )
    images = extract_images(result)
    if not images:
        raise GatewayError("No image generated", details="The model did not return any images")
    return images[0]["data_url"], editing_prompt, extract_text(result), extract_usage(result)


async def _openai_text_to_image(
    prompt: str, aspect_ratio: str, model: str
) -> tuple[str, str, dict[str, int]]:
    api_key = resolve_ai_gateway_key()
    if not api_key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details="No AI Gateway API key configured.",
        )
    base = resolve_gateway_base_url()
    url = f"{base}/images/generations"
    payload = {
        "model": model,
        "prompt": prompt,
        "size": _aspect_to_openai_size(aspect_ratio),
        "n": 1,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
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
        raise GatewayError("No image generated", details="OpenAI returned empty data")
    item = items[0]
    remote = item.get("url")
    # Prefer https so clients can persist history (giant data-URIs are dropped).
    if isinstance(remote, str) and remote.startswith(("http://", "https://")):
        return remote, "", extract_usage(data)
    b64 = item.get("b64_json")
    if b64:
        return f"data:image/png;base64,{b64}", "", extract_usage(data)
    if isinstance(remote, str) and remote.startswith("data:"):
        return remote, "", extract_usage(data)
    raise GatewayError("No image generated", details="OpenAI response missing image")


async def _compatible_text_to_image(
    prompt: str, aspect_ratio: str, model: str
) -> tuple[str, str, dict[str, int]]:
    """OpenAI-style /images/generations on user base URL (中转 / 国内平台等)."""
    api_key = resolve_ai_gateway_key()
    if not api_key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details="No API key configured. Set it in Workspace (same key as your endpoint).",
        )
    base = resolve_compatible_api_base_url()
    url = f"{base}/images/generations"
    size = _aspect_to_compatible_size(aspect_ratio)
    payload = {
        "model": _strip_provider_prefix(model),
        "prompt": prompt,
        "size": size,
        # SiliconFlow and some CN OpenAI-compatible APIs use image_size
        "image_size": size,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
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
    if isinstance(remote, str) and remote.startswith(("http://", "https://")):
        return remote, "", empty_usage
    b64 = item.get("b64_json")
    if b64:
        return f"data:image/png;base64,{b64}", "", empty_usage
    if isinstance(remote, str) and remote.startswith("data:"):
        return remote, "", empty_usage
    raise GatewayError("No image generated", details="Response missing image url")


async def _compatible_approx_editing(
    editing_prompt: str,
    aspect_ratio: str,
    image1_data_url: str,
    image2_data_url: str | None,
    model: str,
) -> tuple[str, str, str, dict[str, int]]:
    """Approximate img2img for CogView: GLM-4V describes the ask, CogView redraws from text."""
    from app.request_keys import COMPATIBLE_VISION_MODEL
    from app.services.gateway import (
        chat_completion,
        extract_text,
        extract_usage,
        image_content_part,
        text_content_part,
    )

    describe_bits = [
        "You help rewrite an image-edit request into a single detailed text-to-image prompt.",
        "Look at the reference image(s) and the instruction, then output ONLY the generation prompt.",
        "Preserve subject, style, lighting, and composition unless the instruction changes them.",
        "No markdown, no explanation — just the prompt (under 120 words).",
        f"Instruction: {editing_prompt}",
    ]
    content: list[dict[str, Any]] = [image_content_part(image1_data_url)]
    if image2_data_url:
        content.append(image_content_part(image2_data_url))
    content.append(text_content_part("\n".join(describe_bits)))

    usage_acc: dict[str, int] = {
        "promptTokens": 0,
        "completionTokens": 0,
        "cachedTokens": 0,
        "totalTokens": 0,
    }
    gen_prompt = editing_prompt
    try:
        vision = await chat_completion(
            model=COMPATIBLE_VISION_MODEL,
            messages=[{"role": "user", "content": content}],
            timeout=120.0,
        )
        described = extract_text(vision).strip()
        usage_acc = {
            k: int(usage_acc.get(k) or 0) + int(extract_usage(vision).get(k) or 0)
            for k in usage_acc
        }
        if described:
            gen_prompt = described
    except Exception:
        # Vision optional — still attempt CogView from the edit instruction alone.
        pass

    url, _caption, img_usage = await _compatible_text_to_image(gen_prompt, aspect_ratio, model)
    usage_acc = {
        k: int(usage_acc.get(k) or 0) + int(img_usage.get(k) or 0) for k in usage_acc
    }
    return url, editing_prompt, gen_prompt, usage_acc
