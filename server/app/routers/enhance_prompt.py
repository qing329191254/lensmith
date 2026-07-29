from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import gateway

router = APIRouter()


class EnhancePromptRequest(BaseModel):
    imageUrl: str
    masterDescription: str | None = None
    panelPrompt: str | None = None


@router.post("/enhance-prompt")
async def enhance_prompt(body: EnhancePromptRequest):
    if not body.imageUrl:
        return JSONResponse({"error": "Image URL is required"}, status_code=400)
    try:
        enhanced, usage = await gateway.enhance_prompt(
            body.imageUrl,
            master_description=body.masterDescription,
            panel_prompt=body.panelPrompt,
        )
        return {"enhancedPrompt": enhanced, "model": gateway._resolve_vision_model(), "usage": usage}
    except gateway.GatewayError as exc:
        return JSONResponse(
            {"error": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception as exc:
        return JSONResponse(
            {"error": "Failed to enhance prompt", "details": str(exc)},
            status_code=500,
        )
