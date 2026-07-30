"""头像文件存取。"""

from pathlib import Path

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "avatars"
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp"}
CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def ensure_avatar_dir() -> Path:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOAD_ROOT


def avatar_path(user_id: int, ext: str) -> Path:
    safe_ext = ext.lower().lstrip(".")
    if safe_ext == "jpeg":
        safe_ext = "jpg"
    return ensure_avatar_dir() / f"{user_id}.{safe_ext}"


def clear_user_avatars(user_id: int) -> None:
    folder = ensure_avatar_dir()
    for p in folder.glob(f"{user_id}.*"):
        try:
            p.unlink()
        except OSError:
            pass
