from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.request_keys import resolve_ai_gateway_key, resolve_fal_key, resolve_text_api_key

router = APIRouter()


@router.get("/check-api-key")
async def check_api_key(request: Request):
    gateway = bool(resolve_ai_gateway_key())
    text = bool(resolve_text_api_key())
    fal = bool(resolve_fal_key())
    env = get_settings()
    return JSONResponse(
        {
            "configured": gateway,
            "textConfigured": text,
            "falConfigured": fal,
            "sources": {
                "aiGateway": "request"
                if request.headers.get("x-ai-gateway-api-key")
                else ("env" if env.ai_gateway_api_key else "none"),
                "text": "request"
                if request.headers.get("x-text-api-key")
                else ("env" if env.text_api_key else ("gateway" if gateway else "none")),
                "fal": "request"
                if request.headers.get("x-fal-key")
                else ("env" if env.fal_credentials else "none"),
            },
        }
    )
