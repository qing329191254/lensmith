from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import gateway

router = APIRouter()


class AnalyzeRequest(BaseModel):
    imageUrl: str


@router.post("/analyze-storyboard")
async def analyze_storyboard(body: AnalyzeRequest):
    if not body.imageUrl:
        return JSONResponse({"error": "Image URL is required"}, status_code=400)
    # Soft-fail: CogView-only keys / unavailable vision models should not block upload.
    panel_count, description, usage = await gateway.analyze_storyboard_or_default(
        body.imageUrl,
        default_panel_count=6,
    )
    return {
        "panelCount": panel_count,
        "description": description,
        "model": gateway._resolve_vision_model(),
        "usage": usage,
        "softDefault": not bool(description),
    }
