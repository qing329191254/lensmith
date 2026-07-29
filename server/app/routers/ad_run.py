from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.graphs.ad_short import get_ad_session, resume_ad_session, start_ad_session
from app.services.fal import FalError
from app.services.gateway import GatewayError

router = APIRouter()


class AdBriefBody(BaseModel):
    product: str
    sellingPoints: str = ""
    audience: str = ""
    cta: str = ""
    durationSec: int = Field(default=15, ge=6, le=60)
    aspectRatio: str = "9:16"
    platform: str = "tiktok"
    template: str = "pain-product-cta"
    tone: str = "energetic"


class AdStartRequest(BaseModel):
    brief: AdBriefBody
    options: dict | None = None


class AdResumeRequest(BaseModel):
    action: str
    hook: str | None = None
    lines: list[str] | None = None
    cta: str | None = None
    visualBrief: str | None = None
    notes: str | None = None
    transitionPrompt: str | None = None
    panelCount: int | None = None
    panels: list[dict | str] | None = None
    enhanceVideoPrompts: bool | None = None
    generateVideos: bool | None = None
    useFastVideo: bool | None = None


@router.post("/ads/session")
async def ad_session_start(body: AdStartRequest):
    product = (body.brief.product or "").strip()
    if not product:
        return JSONResponse({"error": "Product is required"}, status_code=400)

    brief = body.brief.model_dump()
    opts = body.options or {}
    try:
        return await start_ad_session(
            brief,
            options={
                "aspect_ratio": brief.get("aspectRatio") or "9:16",
                "max_panels": int(opts.get("maxPanels") or 6),
                "use_fast_video": bool(opts.get("useFastVideo", True)),
            },
        )
    except GatewayError as exc:
        return JSONResponse({"error": exc.message, "details": exc.details}, status_code=exc.status_code)
    except FalError as exc:
        return JSONResponse({"error": exc.message}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Failed to start ad session", "details": str(exc)}, status_code=500)


@router.post("/ads/session/{thread_id}/resume")
async def ad_session_resume(thread_id: str, body: AdResumeRequest):
    decision: dict = {"action": body.action}
    if body.hook is not None:
        decision["hook"] = body.hook
    if body.lines is not None:
        decision["lines"] = body.lines
    if body.cta is not None:
        decision["cta"] = body.cta
    if body.visualBrief is not None:
        decision["visualBrief"] = body.visualBrief
    if body.notes is not None:
        decision["notes"] = body.notes
    if body.transitionPrompt is not None:
        decision["transitionPrompt"] = body.transitionPrompt
    if body.panelCount is not None:
        decision["panelCount"] = body.panelCount
    if body.panels is not None:
        decision["panels"] = body.panels
    if body.enhanceVideoPrompts is not None:
        decision["enhanceVideoPrompts"] = body.enhanceVideoPrompts
    if body.generateVideos is not None:
        decision["generateVideos"] = body.generateVideos
    if body.useFastVideo is not None:
        decision["useFastVideo"] = body.useFastVideo

    try:
        return await resume_ad_session(thread_id, decision)
    except GatewayError as exc:
        return JSONResponse({"error": exc.message, "details": exc.details}, status_code=exc.status_code)
    except FalError as exc:
        return JSONResponse({"error": exc.message}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Failed to resume ad session", "details": str(exc)}, status_code=500)


@router.get("/ads/session/{thread_id}")
async def ad_session_get(thread_id: str):
    try:
        result = await get_ad_session(thread_id)
    except Exception as exc:
        return JSONResponse({"error": "Failed to load ad session", "details": str(exc)}, status_code=500)
    if result.get("status") == "not_found":
        return JSONResponse(result, status_code=404)
    return result
