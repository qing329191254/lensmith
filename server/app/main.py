from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import time

load_dotenv()

from app.config import get_settings
from app.request_keys import (
    HEADER_AI_GATEWAY,
    HEADER_FAL,
    HEADER_GATEWAY_BASE,
    HEADER_IMAGE_MODEL,
    HEADER_TEXT_API,
    HEADER_TEXT_BASE,
    HEADER_TEXT_MODEL,
    HEADER_VIDEO_MODEL,
    HEADER_VISION_MODEL,
    reset_request_keys,
    set_request_keys,
)
from app.routers import (
    analyze_storyboard,
    auth,
    check_api_key,
    enhance_prompt,
    enhance_text,
    fal_proxy,
    generate_image,
    generate_video,
    storyboard_run,
    upscale,
    user_data,
)

settings = get_settings()

app = FastAPI(title="Lensmith API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Response-Time-Ms"],
)


@app.middleware("http")
async def inject_api_keys(request: Request, call_next):
    tokens = set_request_keys(
        request.headers.get(HEADER_AI_GATEWAY),
        request.headers.get(HEADER_FAL),
        text_api_key=request.headers.get(HEADER_TEXT_API),
        text_model=request.headers.get(HEADER_TEXT_MODEL),
        vision_model=request.headers.get(HEADER_VISION_MODEL),
        image_model=request.headers.get(HEADER_IMAGE_MODEL),
        video_model=request.headers.get(HEADER_VIDEO_MODEL),
        gateway_base_url=request.headers.get(HEADER_GATEWAY_BASE),
        text_base_url=request.headers.get(HEADER_TEXT_BASE),
    )
    try:
        return await call_next(request)
    finally:
        reset_request_keys(tokens)


@app.middleware("http")
async def response_timing(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response


prefix = "/api/seq"
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(user_data.router, prefix="/api/me", tags=["me"])
app.include_router(check_api_key.router, prefix=prefix, tags=["seq"])
app.include_router(analyze_storyboard.router, prefix=prefix, tags=["seq"])
app.include_router(enhance_text.router, prefix=prefix, tags=["seq"])
app.include_router(enhance_prompt.router, prefix=prefix, tags=["seq"])
app.include_router(generate_image.router, prefix=prefix, tags=["seq"])
app.include_router(generate_video.router, prefix=prefix, tags=["seq"])
app.include_router(upscale.router, prefix=prefix, tags=["seq"])
app.include_router(fal_proxy.router, prefix=prefix, tags=["seq"])
app.include_router(storyboard_run.router, prefix=prefix, tags=["seq", "langgraph"])


@app.get("/health")
async def health():
    return {"ok": True}
