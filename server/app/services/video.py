"""Shared video generation helpers for routers and LangGraph nodes."""

from __future__ import annotations

from typing import Any

from app.services import video_providers


def extract_video_url(result: Any) -> str | None:
    data = result
    if hasattr(result, "data"):
        data = result.data
        if hasattr(data, "dict"):
            data = data.dict()
    if not isinstance(data, dict):
        if hasattr(result, "dict"):
            data = result.dict()
        else:
            return None

    nested = data.get("data") if isinstance(data.get("data"), dict) else data
    video = nested.get("video") if isinstance(nested, dict) else None
    if isinstance(video, dict) and isinstance(video.get("url"), str):
        return video["url"]
    if isinstance(nested, dict) and isinstance(nested.get("url"), str):
        return nested["url"]
    if isinstance(data.get("video_url"), str):
        return data["video_url"]
    return None


async def generate_image_to_video(
    *,
    prompt: str,
    image_url: str,
    linked_image_url: str | None = None,
    aspect_ratio: str = "16:9",
    use_fast_model: bool = True,
    model: str | None = None,
) -> dict[str, Any]:
    model_id = model
    if not model_id:
        model_id = "veo3-fast" if use_fast_model else "veo3-standard"

    return await video_providers.generate_video(
        prompt=prompt,
        image_url=image_url,
        linked_image_url=linked_image_url,
        aspect_ratio=aspect_ratio,
        model=model_id,
    )
