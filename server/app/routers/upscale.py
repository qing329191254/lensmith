from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import fal as fal_service

router = APIRouter()


class UpscaleRequest(BaseModel):
    image_url: str
    prompt: str | None = None


@router.post("/upscale")
async def upscale(body: UpscaleRequest):
    if not body.image_url:
        return JSONResponse({"error": "Image URL is required"}, status_code=400)
    try:
        fal_service.ensure_fal_key(required=False)
        result = fal_service.subscribe("fal-ai/ccsr", {"image_url": body.image_url})
        if hasattr(result, "data"):
            data = result.data
            return data.dict() if hasattr(data, "dict") else data
        if isinstance(result, dict):
            return result
        return result
    except Exception as exc:
        return JSONResponse({"error": str(exc) or "Failed to upscale image"}, status_code=500)
