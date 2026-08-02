"""图形验证码：SVG 图 + 短时签名 token（无需 Redis / Pillow）。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import random
import secrets
import time
from datetime import datetime, timedelta, timezone
from html import escape

import jwt
from fastapi import HTTPException, status

from app.config import get_settings

# 去掉易混淆字符 0/O、1/I/l
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CAPTCHA_LEN = 4
_TTL_SECONDS = 5 * 60
_TOKEN_TYP = "captcha"
# 进程内已用 jti；多 worker 下各进程独立，对本地部署够用
_used_jti: dict[str, float] = {}


def _purge_used(now: float | None = None) -> None:
    cutoff = (now or time.time()) - _TTL_SECONDS
    stale = [k for k, ts in _used_jti.items() if ts < cutoff]
    for k in stale:
        del _used_jti[k]


def _answer_digest(answer: str) -> str:
    settings = get_settings()
    secret = settings.jwt_secret.encode("utf-8")
    normalized = answer.strip().upper().encode("utf-8")
    return hmac.new(secret, normalized, hashlib.sha256).hexdigest()


def _require_secret() -> str:
    secret = get_settings().jwt_secret.strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET is not configured",
        )
    return secret


def create_captcha() -> tuple[str, str]:
    """返回 (captcha_token, image_data_url)。"""
    secret = _require_secret()
    answer = "".join(secrets.choice(_ALPHABET) for _ in range(_CAPTCHA_LEN))
    expire = datetime.now(timezone.utc) + timedelta(seconds=_TTL_SECONDS)
    token = jwt.encode(
        {
            "typ": _TOKEN_TYP,
            "dig": _answer_digest(answer),
            "exp": expire,
            "jti": secrets.token_hex(8),
        },
        secret,
        algorithm="HS256",
    )
    svg = _render_svg(answer)
    data_url = "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return token, data_url


def verify_captcha(token: str, code: str) -> None:
    secret = _require_secret()
    if not token.strip() or not code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha is required",
        )
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha expired",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid captcha",
        ) from exc

    if payload.get("typ") != _TOKEN_TYP or not payload.get("dig") or not payload.get("jti"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid captcha",
        )

    jti = str(payload["jti"])
    now = time.time()
    _purge_used(now)
    if jti in _used_jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha already used",
        )

    expected = str(payload["dig"])
    actual = _answer_digest(code)
    if not hmac.compare_digest(expected, actual):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect captcha",
        )

    _used_jti[jti] = now


def _render_svg(text: str) -> str:
    width, height = 140, 48
    rng = random.Random(secrets.token_bytes(16))
    lines: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#0f172a"/>',
    ]

    for _ in range(5):
        x1, y1 = rng.randint(0, width), rng.randint(0, height)
        x2, y2 = rng.randint(0, width), rng.randint(0, height)
        color = f"rgb({rng.randint(60, 140)},{rng.randint(80, 160)},{rng.randint(100, 180)})"
        lines.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.2" opacity="0.55"/>'
        )

    for i, ch in enumerate(text):
        x = 18 + i * 28 + rng.randint(-2, 2)
        y = 32 + rng.randint(-3, 3)
        rot = rng.randint(-22, 22)
        fill = f"rgb({rng.randint(200, 255)},{rng.randint(170, 220)},{rng.randint(140, 200)})"
        size = rng.randint(20, 24)
        safe = escape(ch)
        lines.append(
            f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" '
            f'font-family="ui-monospace, Consolas, monospace" font-weight="700" '
            f'transform="rotate({rot} {x} {y})">{safe}</text>'
        )

    for _ in range(18):
        cx, cy = rng.randint(0, width), rng.randint(0, height)
        r = rng.uniform(0.6, 1.8)
        color = f"rgb({rng.randint(80, 180)},{rng.randint(100, 200)},{rng.randint(120, 220)})"
        lines.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="{color}" opacity="0.45"/>')

    lines.append("</svg>")
    return "".join(lines)
