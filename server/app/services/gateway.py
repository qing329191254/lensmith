"""Vercel AI Gateway client (OpenAI-compatible chat completions)."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx

from app.config import get_settings
from app.services.provider_errors import friendly_provider_error

# Recommended defaults (overridable per request via headers / function args).
TEXT_MODEL = "google/gemini-2.5-flash"
VISION_MODEL = "google/gemini-3-pro-image"
IMAGE_MODEL = "google/gemini-3-pro-image"


class GatewayError(Exception):
    def __init__(self, message: str, status_code: int = 500, details: str | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


def _require_key(*, for_text: bool = False) -> str:
    from app.request_keys import resolve_ai_gateway_key, resolve_text_api_key

    key = resolve_text_api_key() if for_text else resolve_ai_gateway_key()
    if not key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details=(
                "No text API key configured. Set Text API key in Workspace (or Image/Gateway key as fallback)."
                if for_text
                else "No image/Gateway API key configured. Set it in Workspace or add AI_GATEWAY_API_KEY to .env."
            ),
        )
    return key


def _resolve_text_model(model: str | None = None) -> str:
    from app.request_keys import resolve_text_model

    return resolve_text_model(model)


def _resolve_image_model(model: str | None = None) -> str:
    from app.request_keys import resolve_image_model

    return resolve_image_model(model)


def _resolve_vision_model(model: str | None = None) -> str:
    from app.request_keys import resolve_vision_model

    return resolve_vision_model(model)


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


async def chat_completion(
    *,
    model: str,
    messages: list[dict[str, Any]],
    system: str | None = None,
    provider_options: dict[str, Any] | None = None,
    timeout: float = 180.0,
    for_text: bool = False,
) -> dict[str, Any]:
    from app.request_keys import (
        normalize_model_for_base,
        resolve_gateway_base_url,
        resolve_text_base_url,
    )

    api_key = _require_key(for_text=for_text)
    base = resolve_text_base_url() if for_text else resolve_gateway_base_url()
    model_id = normalize_model_for_base(model, base) if for_text else model

    payload: dict[str, Any] = {"model": model_id, "messages": messages}
    if system:
        payload["messages"] = [{"role": "system", "content": system}, *messages]
    # providerOptions is Gateway-specific; skip on direct DeepSeek / other OpenAI APIs.
    if provider_options and (not for_text or "ai-gateway" in base or "vercel.sh" in base):
        payload["providerOptions"] = provider_options

    url = f"{base}/chat/completions"
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=_headers(api_key), json=payload)
        if response.status_code >= 400:
            raw = response.text[:2000]
            raise GatewayError(
                friendly_provider_error(raw, status_code=response.status_code, what="chat"),
                status_code=500,
                details=raw,
            )
        return response.json()


def extract_usage(result: dict[str, Any] | None) -> dict[str, int]:
    """Normalize provider usage into prompt / completion / cached / total tokens."""
    if not result or not isinstance(result, dict):
        return {"promptTokens": 0, "completionTokens": 0, "cachedTokens": 0, "totalTokens": 0}

    usage = result.get("usage") or result.get("usageMetadata") or {}
    if not isinstance(usage, dict):
        usage = {}

    prompt = int(
        usage.get("prompt_tokens")
        or usage.get("promptTokens")
        or usage.get("input_tokens")
        or usage.get("inputTokens")
        or usage.get("promptTokenCount")
        or 0
    )
    completion = int(
        usage.get("completion_tokens")
        or usage.get("completionTokens")
        or usage.get("output_tokens")
        or usage.get("outputTokens")
        or usage.get("candidatesTokenCount")
        or 0
    )

    cached = 0
    details = (
        usage.get("prompt_tokens_details")
        or usage.get("promptTokensDetails")
        or usage.get("input_tokens_details")
        or {}
    )
    if isinstance(details, dict):
        cached = int(
            details.get("cached_tokens")
            or details.get("cachedTokens")
            or details.get("cache_read_input_tokens")
            or 0
        )
    cached = int(
        cached
        or usage.get("cached_tokens")
        or usage.get("cachedTokens")
        or usage.get("cache_read_input_tokens")
        or usage.get("cacheReadInputTokens")
        or usage.get("cachedContentTokenCount")
        or 0
    )

    total = int(
        usage.get("total_tokens")
        or usage.get("totalTokens")
        or usage.get("totalTokenCount")
        or (prompt + completion)
        or 0
    )
    if total <= 0 and (prompt or completion):
        total = prompt + completion

    return {
        "promptTokens": max(0, prompt),
        "completionTokens": max(0, completion),
        "cachedTokens": max(0, min(cached, prompt) if prompt else cached),
        "totalTokens": max(0, total),
    }


def extract_text(result: dict[str, Any]) -> str:
    choices = result.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
            elif isinstance(part, str):
                parts.append(part)
        return "\n".join(p for p in parts if p).strip()
    return ""


def extract_images(result: dict[str, Any]) -> list[dict[str, str]]:
    """Return list of {media_type, base64, data_url} from gateway response."""
    images: list[dict[str, str]] = []
    choices = result.get("choices") or []
    if not choices:
        return images
    message = choices[0].get("message") or {}

    # OpenAI-style images array (some providers)
    for img in message.get("images") or []:
        if isinstance(img, dict):
            url = img.get("image_url", {}).get("url") if isinstance(img.get("image_url"), dict) else img.get("url")
            if isinstance(url, str) and url.startswith("data:"):
                media_type, b64 = _split_data_url(url)
                images.append({"media_type": media_type, "base64": b64, "data_url": url})

    content = message.get("content")
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            ptype = part.get("type")
            if ptype in ("image", "image_url"):
                url = None
                if ptype == "image_url":
                    image_url = part.get("image_url")
                    url = image_url.get("url") if isinstance(image_url, dict) else image_url
                else:
                    url = part.get("image") or part.get("url")
                if isinstance(url, str) and url.startswith("data:"):
                    media_type, b64 = _split_data_url(url)
                    images.append({"media_type": media_type, "base64": b64, "data_url": url})
            # Inline binary from some gateways
            if part.get("inlineData") or part.get("inline_data"):
                inline = part.get("inlineData") or part.get("inline_data")
                mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                data = inline.get("data") or ""
                data_url = f"data:{mime};base64,{data}"
                images.append({"media_type": mime, "base64": data, "data_url": data_url})

    # Files-style (AI SDK shape mirrored in custom gateways)
    for f in message.get("files") or result.get("files") or []:
        if not isinstance(f, dict):
            continue
        media_type = f.get("mediaType") or f.get("media_type") or "image/png"
        b64 = f.get("base64") or f.get("data")
        if b64 and str(media_type).startswith("image/"):
            data_url = f"data:{media_type};base64,{b64}"
            images.append({"media_type": media_type, "base64": b64, "data_url": data_url})

    return images


def _split_data_url(url: str) -> tuple[str, str]:
    # data:image/png;base64,AAAA
    match = re.match(r"data:([^;]+);base64,(.+)", url, re.DOTALL)
    if not match:
        return "image/png", url
    return match.group(1), match.group(2)


def image_content_part(image_url: str) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": image_url}}


def text_content_part(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


async def enhance_text(prompt: str) -> tuple[str, dict[str, int]]:
    system_prompt = """
      You are an expert prompt engineer specializing in AI image and video generation.
      
      Task: Enhance the user's prompt to make it more detailed and effective for storyboard generation.
      
      Guidelines:
      1. Add specific visual details (lighting, camera angles, composition)
      2. Include style references (cinematic, anime, photorealistic, etc.)
      3. Clarify the number of panels and their sequence if not specified
      4. Add emotional and atmospheric descriptors
      5. Keep the enhanced prompt concise but comprehensive (under 200 words)
      6. Maintain the user's original intent and story
      
      Return ONLY the enhanced prompt text, no explanations or metadata.
    """
    result = await chat_completion(
        model=_resolve_text_model(),
        system=system_prompt,
        messages=[{"role": "user", "content": f"Enhance this storyboard prompt:\n\n{prompt}"}],
        provider_options={"openai": {"promptCacheKey": "lensmith-enhance-text"}},
        for_text=True,
    )
    return extract_text(result), extract_usage(result)


async def enhance_prompt(
    image_url: str,
    master_description: str | None = None,
    panel_prompt: str | None = None,
) -> tuple[str, dict[str, int]]:
    enhance = f"""
      You are an expert film director and prompt engineer for AI video generation.
      
      Task: Create a concise, high-quality video generation prompt based on the provided image and the context.
      
      Master Story Context: "{master_description or "No global context provided."}"
      Specific Shot Notes: "{panel_prompt or "Infer action from image and context."}"
      
      Instructions:
      1. Analyze the image to understand the visual context, lighting, style, and subject.
      2. Use the Master Story Context to align the style and narrative.
      3. Use the Specific Shot Notes (if any) to determine the specific action/movement.
      4. Output a SINGLE sentence optimized for Veo/Sora style video generation models.
      5. Focus on describing the MOTION and CAMERA MOVEMENT.
      6. Keep it under 40 words.
      
      Example Output: "Cinematic push-in on the character's face as they look up in realization, subtle wind blowing hair, warm sunset lighting."
    """
    result = await chat_completion(
        model=_resolve_vision_model(),
        messages=[
            {
                "role": "user",
                "content": [image_content_part(image_url), text_content_part(enhance)],
            }
        ],
        provider_options={"openai": {"promptCacheKey": "lensmith-enhance-prompt"}},
    )
    return extract_text(result), extract_usage(result)


async def analyze_storyboard(image_url: str) -> tuple[int, str, dict[str, int]]:
    analysis_prompt = """
      Analyze this storyboard image to determine the exact number of distinct narrative panels.

      CRITICAL LAYOUT WARNING:
      - Some storyboards use irregular grids where ONE panel may span across multiple columns or rows (e.g., a wide panoramic shot covering 2 slots).
      - Count a single continuous image as ONE panel, even if it occupies the space of multiple standard grid slots.
      - Do not double-count merged panels.
      - Look for distinct panel borders to define separation.

      Return ONLY a JSON object with a single key "panelCount" containing the integer number of panels.
      Example: {"panelCount": 6}
      Do not include any markdown formatting or other text.
    """
    result = await chat_completion(
        model=_resolve_vision_model(),
        messages=[
            {
                "role": "user",
                "content": [image_content_part(image_url), text_content_part(analysis_prompt)],
            }
        ],
        provider_options={"openai": {"promptCacheKey": "lensmith-analyze-storyboard"}},
    )
    text = extract_text(result).replace("```json", "").replace("```", "").strip()
    panel_count = 6
    try:
        parsed = json.loads(text)
        if isinstance(parsed.get("panelCount"), int):
            panel_count = parsed["panelCount"]
    except json.JSONDecodeError:
        match = re.search(r"\d+", text)
        if match:
            panel_count = int(match.group(0))

    panel_count = max(1, min(12, panel_count))
    return panel_count, extract_text(result), extract_usage(result)


async def generate_image_text_to_image(prompt: str, aspect_ratio: str) -> tuple[str, str, dict[str, int]]:
    from app.services import image_providers

    return await image_providers.generate_text_to_image(prompt, aspect_ratio)


async def generate_image_editing(
    prompt: str,
    aspect_ratio: str,
    image1_data_url: str,
    image2_data_url: str | None = None,
) -> tuple[str, str, str, dict[str, int]]:
    from app.services import image_providers

    return await image_providers.generate_editing(prompt, aspect_ratio, image1_data_url, image2_data_url)


async def file_to_data_url(data: bytes, content_type: str) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{content_type or 'image/jpeg'};base64,{b64}"


async def url_to_data_url(url: str) -> str:
    if url.startswith("data:"):
        return url
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type") or "image/jpeg"
        return await file_to_data_url(response.content, content_type)
