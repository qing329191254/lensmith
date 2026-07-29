from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.graphs.storyboard import (
    get_storyboard_session,
    resume_storyboard_session,
    start_storyboard_session,
)
from app.services.fal import FalError
from app.services.gateway import GatewayError

router = APIRouter()


class StoryboardSessionOptions(BaseModel):
    enhanceText: bool = False
    aspectRatio: str = "3:2"
    maxPanels: int = Field(default=6, ge=1, le=12)
    useFastVideo: bool = True


class StoryboardStartRequest(BaseModel):
    prompt: str = ""
    masterUrl: str | None = None
    options: StoryboardSessionOptions | None = None


class StoryboardResumeRequest(BaseModel):
    action: str
    transitionPrompt: str | None = None
    prompt: str | None = None
    panelCount: int | None = None
    panels: list[dict | str] | None = None
    enhanceVideoPrompts: bool | None = None
    generateVideos: bool | None = None
    useFastVideo: bool | None = None


@router.post("/storyboard/session")
async def storyboard_session_start(body: StoryboardStartRequest):
    prompt = (body.prompt or "").strip()
    master_url = (body.masterUrl or "").strip() or None
    if not prompt and not master_url:
        return JSONResponse({"error": "Prompt or masterUrl is required"}, status_code=400)

    opts = body.options or StoryboardSessionOptions()
    try:
        return await start_storyboard_session(
            prompt,
            master_url=master_url,
            options={
                "enhance_text": opts.enhanceText,
                "aspect_ratio": opts.aspectRatio,
                "max_panels": opts.maxPanels,
                "use_fast_video": opts.useFastVideo,
            },
        )
    except GatewayError as exc:
        return JSONResponse({"error": exc.message, "details": exc.details}, status_code=exc.status_code)
    except FalError as exc:
        return JSONResponse({"error": exc.message}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Failed to start storyboard session", "details": str(exc)}, status_code=500)


@router.post("/storyboard/session/{thread_id}/resume")
async def storyboard_session_resume(thread_id: str, body: StoryboardResumeRequest):
    decision: dict = {"action": body.action}
    if body.transitionPrompt is not None:
        decision["transitionPrompt"] = body.transitionPrompt
    if body.prompt is not None:
        decision["prompt"] = body.prompt
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
        return await resume_storyboard_session(thread_id, decision)
    except GatewayError as exc:
        return JSONResponse({"error": exc.message, "details": exc.details}, status_code=exc.status_code)
    except FalError as exc:
        return JSONResponse({"error": exc.message}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Failed to resume storyboard session", "details": str(exc)}, status_code=500)


@router.get("/storyboard/session/{thread_id}")
async def storyboard_session_get(thread_id: str):
    try:
        result = await get_storyboard_session(thread_id)
    except Exception as exc:
        return JSONResponse({"error": "Failed to load storyboard session", "details": str(exc)}, status_code=500)
    if result.get("status") == "not_found":
        return JSONResponse(result, status_code=404)
    return result


# Keep legacy one-shot endpoint as a thin wrapper for docs/clients that still call it.
@router.post("/storyboard/run")
async def storyboard_run_legacy(body: StoryboardStartRequest):
    from app.graphs.storyboard import run_storyboard_pipeline

    prompt = (body.prompt or "").strip()
    if not prompt and not body.masterUrl:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)
    opts = body.options or StoryboardSessionOptions()
    try:
        result = await run_storyboard_pipeline(
            prompt or "Uploaded master",
            options={
                "enhance_text": opts.enhanceText,
                "aspect_ratio": opts.aspectRatio,
                "max_panels": opts.maxPanels,
                "use_fast_video": opts.useFastVideo,
            },
        )
    except Exception as exc:
        return JSONResponse({"error": "Storyboard pipeline failed", "details": str(exc)}, status_code=500)

    return {
        "engine": "langgraph",
        "phase": result.get("phase"),
        "prompt": result.get("prompt"),
        "workingPrompt": result.get("working_prompt"),
        "masterUrl": result.get("master_url") or None,
        "panelCount": result.get("panel_count") or 0,
        "analysis": result.get("analysis") or "",
        "panels": result.get("panels") or [],
        "errors": result.get("errors") or [],
        "note": "Legacy auto-approve path. Prefer /storyboard/session for human-in-the-loop.",
    }
