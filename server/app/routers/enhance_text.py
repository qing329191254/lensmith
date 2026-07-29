from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import gateway

router = APIRouter()


class EnhanceTextRequest(BaseModel):
    prompt: str


@router.post("/enhance-text")
async def enhance_text(body: EnhanceTextRequest):
    if not body.prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)
    try:
        enhanced, usage = await gateway.enhance_text(body.prompt)
        return {"enhancedPrompt": enhanced, "model": gateway._resolve_text_model(), "usage": usage}
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
