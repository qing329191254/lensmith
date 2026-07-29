"""Proxy fal.ai browser requests (mirrors @fal-ai/server-proxy behavior)."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.config import get_settings

router = APIRouter()

TARGET_HEADER = "x-fal-target-url"
ALLOWED_HOST_SUFFIXES = (".fal.ai", ".fal.run")


def _credentials() -> str | None:
    from app.request_keys import resolve_fal_key

    return resolve_fal_key() or None


def _validate_target(url: str) -> str | None:
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http"):
        return "Invalid target URL scheme"
    host = (parsed.hostname or "").lower()
    if not any(host == s.lstrip(".") or host.endswith(s) for s in ALLOWED_HOST_SUFFIXES):
        if host not in ("fal.ai", "fal.run", "api.fal.ai", "queue.fal.run", "rest.alpha.fal.ai"):
            return "Target host is not allowed"
    return None


async def _proxy(request: Request) -> Response:
    target = request.headers.get(TARGET_HEADER)
    if not target:
        return JSONResponse({"error": f"Missing {TARGET_HEADER} header"}, status_code=400)

    err = _validate_target(target)
    if err:
        return JSONResponse({"error": err}, status_code=400)

    key = _credentials()
    if not key:
        return JSONResponse({"error": "FAL API key not configured"}, status_code=500)

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower()
        not in {
            "host",
            "content-length",
            "connection",
            "authorization",
            TARGET_HEADER.lower(),
        }
    }
    headers["Authorization"] = f"Key {key}"

    body = await request.body()
    async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
        upstream = await client.request(
            request.method,
            target,
            content=body if body else None,
            headers=headers,
            params=dict(request.query_params),
        )

    excluded = {"content-encoding", "transfer-encoding", "connection"}
    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in excluded}
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )


@router.api_route("/fal/proxy", methods=["GET", "POST"])
async def fal_proxy(request: Request):
    return await _proxy(request)
