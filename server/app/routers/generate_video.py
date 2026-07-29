from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import fal as fal_service
from app.services import video_providers
from app.services.gateway import GatewayError

router = APIRouter()


class GenerateVideoRequest(BaseModel):
    prompt: str
    imageUrl: str | None = None
    linkedImageUrl: str | None = None
    duration: float | int | None = None
    aspectRatio: str | None = None
    useFastModel: bool = True
    model: str | None = None


def _valid_image_url(url: str) -> bool:
    return url.startswith("https://") or url.startswith("data:image/")


@router.post("/generate-video")
async def generate_video(body: GenerateVideoRequest):
    prompt = body.prompt
    if not prompt or not isinstance(prompt, str) or not prompt.strip():
        return JSONResponse(
            {"error": "Prompt must be a non-empty string"} if prompt is not None else {"error": "Missing prompt"},
            status_code=400,
        )

    image_url = body.imageUrl
    linked_image_url = body.linkedImageUrl
    duration = float(body.duration) if body.duration is not None else 8
    aspect_ratio = body.aspectRatio or "16:9"
    model = body.model

    has_image = isinstance(image_url, str) and bool(image_url.strip())

    if has_image and image_url and not _valid_image_url(image_url):
        return JSONResponse(
            {
                "error": "Invalid image URL format",
                "details": "Supported formats: HTTPS URLs or data URIs (base64). Blob URLs are not supported.",
            },
            status_code=400,
        )

    if linked_image_url and not _valid_image_url(linked_image_url):
        return JSONResponse(
            {
                "error": "Invalid linked image URL format",
                "details": "Supported formats: HTTPS URLs or data URIs (base64). Blob URLs are not supported.",
            },
            status_code=400,
        )

    try:
        if not has_image:
            # Legacy text-only path via fal minimax
            fal_model = "fal-ai/minimax-video"
            if model == "fal-ai/hunyuan-video":
                fal_model = "fal-ai/hunyuan-video"
            result = fal_service.subscribe(
                fal_model,
                {"prompt": prompt.strip(), "prompt_optimizer": True},
            )
            payload = result
            if hasattr(result, "data"):
                data = result.data
                payload = data.dict() if hasattr(data, "dict") else data
            if isinstance(payload, dict):
                return {**payload, "model": model or fal_model}
            return payload

        result = await video_providers.generate_video(
            prompt=prompt.strip(),
            image_url=image_url,
            linked_image_url=linked_image_url,
            aspect_ratio=aspect_ratio,
            duration=duration,
            model=model,
        )
        return result
    except fal_service.FalError as exc:
        return JSONResponse({"error": exc.message}, status_code=500)
    except GatewayError as exc:
        return JSONResponse(
            {"error": exc.message, "details": exc.details},
            status_code=exc.status_code or 500,
        )
    except Exception as exc:
        error_message = fal_service.moderation_message(exc)
        return JSONResponse(
            {
                "error": error_message,
                "details": {"message": error_message, "originalMessage": str(exc)},
            },
            status_code=500,
        )
