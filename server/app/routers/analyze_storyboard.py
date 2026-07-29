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
    try:
        panel_count, description, usage = await gateway.analyze_storyboard(body.imageUrl)
        return {
            "panelCount": panel_count,
            "description": description,
            "model": gateway._resolve_vision_model(),
            "usage": usage,
        }
    except gateway.GatewayError as exc:
        return JSONResponse(
            {"error": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception as exc:
        return JSONResponse(
            {"error": "Failed to analyze storyboard", "details": str(exc)},
            status_code=500,
        )
