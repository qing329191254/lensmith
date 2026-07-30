"""Same-origin media fetch — bypass browser CORS for copy / download / edit input."""

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter()

# Hosts we expect generated media from (suffix match). Blocks open SSRF proxy.
_ALLOWED_HOST_SUFFIXES = (
    ".volces.com",
    ".volcengineapi.com",
    ".fal.media",
    ".fal.ai",
    ".amazonaws.com",
    ".googleusercontent.com",
    ".aliyuncs.com",
    ".bigmodel.cn",
    ".zhipuai.cn",
    ".siliconflow.cn",
    ".openai.com",
    ".blob.core.windows.net",
)


def _host_allowed(host: str) -> bool:
    h = host.lower().rstrip(".")
    if not h or h == "localhost" or h.endswith(".local"):
        return False
    if h.replace(".", "").isdigit():
        return False
    return any(h == s.lstrip(".") or h.endswith(s) for s in _ALLOWED_HOST_SUFFIXES)


@router.get("/fetch-media")
async def fetch_media(url: str = Query(..., min_length=8, max_length=4096)) -> Response:
    parsed = urlparse(url.strip())
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Only https media URLs are allowed")
    if not _host_allowed(parsed.hostname or ""):
        raise HTTPException(status_code=400, detail="Media host is not allowed")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            upstream = await client.get(url, headers={"User-Agent": "Lensmith/1.0"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch media: {exc}") from exc

    if upstream.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Upstream returned {upstream.status_code}")

    content_type = upstream.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
    if not content_type.startswith("image/") and not content_type.startswith("video/"):
        # Signed CDN URLs sometimes omit type; sniff jpeg/png magic
        body = upstream.content
        if body[:3] == b"\xff\xd8\xff":
            content_type = "image/jpeg"
        elif body[:8] == b"\x89PNG\r\n\x1a\n":
            content_type = "image/png"
        elif body[:4] == b"RIFF" and body[8:12] == b"WEBP":
            content_type = "image/webp"
        else:
            raise HTTPException(status_code=400, detail="URL did not return an image or video")
        return Response(content=body, media_type=content_type, headers={"Cache-Control": "private, max-age=300"})

    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )
