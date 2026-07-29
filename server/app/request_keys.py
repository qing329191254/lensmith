"""Per-request API key and model overrides from client headers."""

from __future__ import annotations

from contextvars import ContextVar

from app.config import get_settings

HEADER_AI_GATEWAY = "x-ai-gateway-api-key"
HEADER_TEXT_API = "x-text-api-key"
HEADER_FAL = "x-fal-key"
HEADER_TEXT_MODEL = "x-text-model"
HEADER_VISION_MODEL = "x-vision-model"
HEADER_IMAGE_MODEL = "x-image-model"
HEADER_VIDEO_MODEL = "x-video-model"
HEADER_GATEWAY_BASE = "x-ai-gateway-base-url"
HEADER_TEXT_BASE = "x-text-base-url"

DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash"
DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image"
DEFAULT_VISION_MODEL = "google/gemini-3-pro-image"
DEFAULT_VIDEO_MODEL = "veo3-fast"
DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"

_ai_gateway_key: ContextVar[str] = ContextVar("ai_gateway_key", default="")
_text_api_key: ContextVar[str] = ContextVar("text_api_key", default="")
_fal_key: ContextVar[str] = ContextVar("fal_key", default="")
_text_model: ContextVar[str] = ContextVar("text_model", default="")
_vision_model: ContextVar[str] = ContextVar("vision_model", default="")
_image_model: ContextVar[str] = ContextVar("image_model", default="")
_video_model: ContextVar[str] = ContextVar("video_model", default="")
_gateway_base_url: ContextVar[str] = ContextVar("gateway_base_url", default="")
_text_base_url: ContextVar[str] = ContextVar("text_base_url", default="")


def set_request_keys(
    ai_gateway: str | None,
    fal: str | None,
    *,
    text_api_key: str | None = None,
    text_model: str | None = None,
    vision_model: str | None = None,
    image_model: str | None = None,
    video_model: str | None = None,
    gateway_base_url: str | None = None,
    text_base_url: str | None = None,
):
    return (
        _ai_gateway_key.set((ai_gateway or "").strip()),
        _text_api_key.set((text_api_key or "").strip()),
        _fal_key.set((fal or "").strip()),
        _text_model.set((text_model or "").strip()),
        _vision_model.set((vision_model or "").strip()),
        _image_model.set((image_model or "").strip()),
        _video_model.set((video_model or "").strip()),
        _gateway_base_url.set((gateway_base_url or "").strip()),
        _text_base_url.set((text_base_url or "").strip()),
    )


def reset_request_keys(tokens: tuple) -> None:
    for i, token in enumerate(tokens):
        (
            _ai_gateway_key,
            _text_api_key,
            _fal_key,
            _text_model,
            _vision_model,
            _image_model,
            _video_model,
            _gateway_base_url,
            _text_base_url,
        )[i].reset(token)


def resolve_ai_gateway_key() -> str:
    return _ai_gateway_key.get() or get_settings().ai_gateway_api_key or ""


def resolve_text_api_key() -> str:
    """Prefer dedicated text key (DeepSeek etc.); fall back to image/Gateway key."""
    return _text_api_key.get() or resolve_ai_gateway_key() or get_settings().text_api_key or ""


def resolve_fal_key() -> str:
    return _fal_key.get() or get_settings().fal_credentials or ""


def resolve_gateway_base_url() -> str:
    custom = _gateway_base_url.get().strip()
    if custom:
        return custom.rstrip("/")
    return get_settings().ai_gateway_base_url.rstrip("/")


def resolve_text_base_url() -> str:
    """Text chat endpoint: explicit text base → shared 中转 → DeepSeek direct → Gateway."""
    text_custom = _text_base_url.get().strip()
    if text_custom:
        return text_custom.rstrip("/")
    # Same proxy URL as image/Gateway when user configured a 中转站.
    shared = _gateway_base_url.get().strip()
    if shared:
        return shared.rstrip("/")
    model = resolve_text_model().lower()
    if _text_api_key.get() and (model.startswith("deepseek/") or "deepseek" in model):
        return DEFAULT_DEEPSEEK_BASE
    return resolve_gateway_base_url()


def resolve_compatible_api_base_url() -> str:
    custom = _gateway_base_url.get().strip()
    if custom:
        return custom.rstrip("/")
    return get_settings().compatible_api_base_url.rstrip("/")


def resolve_text_model(override: str | None = None) -> str:
    return (override or "").strip() or _text_model.get() or DEFAULT_TEXT_MODEL


def normalize_model_for_base(model: str, base: str) -> str:
    """DeepSeek official API wants `deepseek-chat`, not `deepseek/deepseek-chat`."""
    mid = (model or "").strip()
    base_l = (base or "").lower()
    if "deepseek.com" in base_l and "/" in mid:
        return mid.split("/", 1)[1]
    return mid


def resolve_image_model(override: str | None = None) -> str:
    return (override or "").strip() or _image_model.get() or DEFAULT_IMAGE_MODEL


def resolve_vision_model(override: str | None = None) -> str:
    if (override or "").strip():
        return override.strip()
    image = resolve_image_model()
    if _is_multimodal_chat(image):
        return image
    text = resolve_text_model()
    if _is_multimodal_chat(text):
        return text
    return DEFAULT_VISION_MODEL


def _is_multimodal_chat(model: str) -> bool:
    mid = (model or "").strip().lower()
    if not mid:
        return False
    if "cogview" in mid or "gpt-image" in mid or mid.startswith("glm-image"):
        return False
    if mid.startswith("deepseek/"):
        return False
    if "gemini" in mid or mid.startswith("google/"):
        return True
    if mid.startswith("openai/gpt-4") or mid.startswith("openai/o"):
        return True
    if mid.startswith("anthropic/"):
        return True
    if "glm-4.6v" in mid or "glm-4v" in mid or mid.endswith("-v") and "glm" in mid:
        return True
    if mid.startswith("zai/") and "v" in mid.split("/")[-1]:
        return True
    return False


def resolve_video_model(override: str | None = None) -> str:
    return (override or "").strip() or _video_model.get() or DEFAULT_VIDEO_MODEL


def image_provider(model: str | None = None) -> str:
    mid = resolve_image_model(model).lower()
    if mid.startswith("openai/") or mid.startswith("gpt-image"):
        return "openai"
    if (
        mid.startswith("zhipu/")
        or mid.startswith("zai/")
        or "cogview" in mid
        or mid.startswith("glm-image")
    ):
        return "compatible"
    return "google"
