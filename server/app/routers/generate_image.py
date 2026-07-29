from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.services import gateway

router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

GEMINI_ASPECT_RATIO_MAP = {
    "portrait": "9:16",
    "landscape": "16:9",
    "wide": "21:9",
    "4:3": "4:3",
    "3:4": "3:4",
    "3:2": "3:2",
    "2:3": "2:3",
    "5:4": "5:4",
    "4:5": "4:5",
    "square": "1:1",
}


@router.post("/generate-image")
async def generate_image(
    mode: str = Form(...),
    prompt: str = Form(...),
    aspectRatio: str = Form("square"),
    uploadToBlob: str = Form("false"),
    image1: UploadFile | None = File(None),
    image2: UploadFile | None = File(None),
    image1Url: str | None = Form(None),
    image2Url: str | None = Form(None),
):
    _ = uploadToBlob  # Blob upload intentionally skipped in this phase
    gemini_aspect = GEMINI_ASPECT_RATIO_MAP.get(aspectRatio, "1:1")

    try:
        if mode == "text-to-image":
            url, description, usage = await gateway.generate_image_text_to_image(prompt, gemini_aspect)
            return {
                "url": url,
                "prompt": prompt,
                "description": description or "",
                "model": gateway._resolve_image_model(),
                "usage": usage,
            }

        if mode == "image-editing":
            has_image1 = bool(image1 is not None or image1Url)
            has_image2 = bool(image2 is not None or image2Url)
            if not has_image1:
                return JSONResponse(
                    {"error": "At least one image is required for editing mode"},
                    status_code=400,
                )

            async def load_image(file: UploadFile | None, url: str | None) -> str:
                if file is not None:
                    data = await file.read()
                    if len(data) > MAX_FILE_SIZE:
                        raise gateway.GatewayError(
                            f"Image too large. Maximum {MAX_FILE_SIZE // (1024 * 1024)}MB allowed.",
                            status_code=400,
                        )
                    content_type = file.content_type or "image/jpeg"
                    if content_type not in ALLOWED_IMAGE_TYPES:
                        raise gateway.GatewayError(
                            "Invalid format. Allowed: JPEG, PNG, WebP, GIF",
                            status_code=400,
                        )
                    return await gateway.file_to_data_url(data, content_type)
                assert url is not None
                return await gateway.url_to_data_url(url)

            image1_data = await load_image(image1, image1Url)
            image2_data = await load_image(image2, image2Url) if has_image2 else None
            url, editing_prompt, description, usage = await gateway.generate_image_editing(
                prompt, gemini_aspect, image1_data, image2_data
            )
            return {
                "url": url,
                "prompt": editing_prompt,
                "description": description or "",
                "model": gateway._resolve_image_model(),
                "usage": usage,
            }


        return JSONResponse(
            {"error": "Invalid mode", "details": "Mode must be 'text-to-image' or 'image-editing'"},
            status_code=400,
        )
    except gateway.GatewayError as exc:
        return JSONResponse(
            {"error": exc.message, "details": exc.details},
            status_code=exc.status_code,
        )
    except Exception as exc:
        return JSONResponse(
            {"error": "Failed to generate image", "details": str(exc)},
            status_code=500,
        )
