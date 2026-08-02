"""用户名密码注册 / 登录 / 资料 / 头像。"""

import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_auth_config
from app.models import User
from app.schemas.auth import (
    CaptchaResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.services.auth_tokens import create_access_token, hash_password, verify_password
from app.services.captcha import create_captcha, verify_captcha
from app.services.avatars import (
    ALLOWED_EXT,
    CONTENT_TYPE_EXT,
    avatar_path,
    clear_user_avatars,
    ensure_avatar_dir,
)

router = APIRouter()

_USERNAME_RE = re.compile(r"^[\u4e00-\u9fffa-zA-Z0-9_]{3,20}$")
_PASSWORD_RE = re.compile(
    r"^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]{6,32}$"
)
_MAX_AVATAR_BYTES = 2 * 1024 * 1024


def _validate_username(username: str) -> None:
    if not _USERNAME_RE.match(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3–20 chars: Chinese, letters, numbers, underscore",
        )


def _validate_password(password: str) -> None:
    if not _PASSWORD_RE.match(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be 6–32 chars and include letters and numbers",
        )


def _validate_credentials(username: str, password: str) -> None:
    _validate_username(username)
    _validate_password(password)


def user_to_out(user: User) -> UserOut:
    avatar_url = None
    if user.avatar_ext:
        # cache-bust when file changes by appending mtime if available
        path = avatar_path(user.id, user.avatar_ext)
        version = int(path.stat().st_mtime) if path.exists() else 0
        avatar_url = f"/api/auth/avatar/{user.id}?v={version}"
    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=avatar_url,
        created_at=user.created_at,
    )


@router.get("/captcha", response_model=CaptchaResponse)
def captcha() -> CaptchaResponse:
    require_auth_config()
    token, image = create_captcha()
    return CaptchaResponse(captcha_token=token, image=image)


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    require_auth_config()
    username = body.username.strip()
    _validate_credentials(username, body.password)
    exists = db.scalar(select(User).where(User.username == username))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    verify_captcha(body.captcha_token, body.captcha_code)

    user = User(username=username, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=user.id, username=user.username)
    return TokenResponse(access_token=token, user=user_to_out(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    require_auth_config()
    username = body.username.strip()
    _validate_credentials(username, body.password)
    verify_captcha(body.captcha_token, body.captcha_code)
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token(user_id=user.id, username=user.username)
    return TokenResponse(access_token=token, user=user_to_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_to_out(user)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    body: UpdateProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    username = body.username.strip()
    _validate_username(username)
    if username != user.username:
        taken = db.scalar(select(User).where(User.username == username))
        if taken is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        user.username = username
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.post("/password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    _validate_password(body.new_password)
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different",
        )
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    db.commit()
    return {"ok": True}


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    content_type = (file.content_type or "").lower()
    ext = CONTENT_TYPE_EXT.get(content_type)
    if not ext or ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be jpg, png, or webp",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar must be under 2MB")

    ensure_avatar_dir()
    clear_user_avatars(user.id)
    path = avatar_path(user.id, ext)
    path.write_bytes(data)
    user.avatar_ext = "jpg" if ext == "jpeg" else ext
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    clear_user_avatars(user.id)
    user.avatar_ext = None
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.get("/avatar/{user_id}")
def get_avatar(user_id: int, db: Session = Depends(get_db)):
    require_auth_config()
    user = db.get(User, user_id)
    if user is None or not user.avatar_ext:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    path = avatar_path(user.id, user.avatar_ext)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    media = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(user.avatar_ext, "application/octet-stream")
    return FileResponse(path, media_type=media)
