"""Per-user usage / media library / workspace settings (DB-backed)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import MediaAsset, UsageEvent, User, UserSettings
from app.schemas.user_data import (
    MediaAssetIn,
    MediaAssetOut,
    MediaBatchIn,
    UsageBatchIn,
    UsageEventOut,
    UserSettingsIn,
    UserSettingsOut,
)
from app.services.secret_box import decrypt_secret, encrypt_secret

router = APIRouter()

MAX_USAGE = 800
MAX_ASSETS = 120


def _usage_out(row: UsageEvent) -> UsageEventOut:
    return UsageEventOut(
        id=row.client_id,
        ts=row.ts,
        route=row.route,
        durationMs=row.duration_ms,
        ok=row.ok,
        status=row.status,
        tokens=row.tokens,
        promptTokens=row.prompt_tokens,
        completionTokens=row.completion_tokens,
        cachedTokens=row.cached_tokens,
        estimated=row.estimated,
        model=row.model,
        sample=row.sample,
    )


def _asset_out(row: MediaAsset) -> MediaAssetOut:
    return MediaAssetOut(
        id=row.client_id,
        kind=row.kind,
        url=row.url,
        thumbUrl=row.thumb_url,
        prompt=row.prompt,
        source=row.source,
        model=row.model,
        createdAt=row.created_at_ms,
    )


@router.get("/usage", response_model=list[UsageEventOut])
def list_usage(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UsageEventOut]:
    rows = db.scalars(
        select(UsageEvent)
        .where(UsageEvent.user_id == user.id)
        .order_by(UsageEvent.ts.desc())
        .limit(MAX_USAGE)
    ).all()
    return [_usage_out(r) for r in rows]


@router.post("/usage", response_model=dict)
def upsert_usage(
    body: UsageBatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if not body.events:
        return {"ok": True, "count": 0}

    existing = {
        r.client_id: r
        for r in db.scalars(
            select(UsageEvent).where(
                UsageEvent.user_id == user.id,
                UsageEvent.client_id.in_([e.id for e in body.events]),
            )
        ).all()
    }

    for event in body.events:
        row = existing.get(event.id)
        if row is None:
            row = UsageEvent(user_id=user.id, client_id=event.id)
            db.add(row)
        row.ts = int(event.ts)
        row.route = event.route[:64]
        row.duration_ms = max(0, int(event.durationMs))
        row.ok = bool(event.ok)
        row.status = event.status
        row.tokens = max(0, int(event.tokens))
        row.prompt_tokens = max(0, int(event.promptTokens))
        row.completion_tokens = max(0, int(event.completionTokens))
        row.cached_tokens = max(0, int(event.cachedTokens))
        row.estimated = bool(event.estimated)
        row.model = (event.model or None)
        if row.model:
            row.model = row.model[:128]
        row.sample = bool(event.sample)

    db.commit()

    # Trim oldest beyond cap
    ids = list(
        db.scalars(
            select(UsageEvent.id)
            .where(UsageEvent.user_id == user.id)
            .order_by(UsageEvent.ts.desc())
            .offset(MAX_USAGE)
        ).all()
    )
    if ids:
        db.execute(delete(UsageEvent).where(UsageEvent.id.in_(ids)))
        db.commit()

    return {"ok": True, "count": len(body.events)}


@router.delete("/usage", response_model=dict)
def clear_usage(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    db.execute(delete(UsageEvent).where(UsageEvent.user_id == user.id))
    db.commit()
    return {"ok": True}


@router.get("/assets", response_model=list[MediaAssetOut])
def list_assets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MediaAssetOut]:
    rows = db.scalars(
        select(MediaAsset)
        .where(MediaAsset.user_id == user.id)
        .order_by(MediaAsset.created_at_ms.desc())
        .limit(MAX_ASSETS)
    ).all()
    return [_asset_out(r) for r in rows]


@router.post("/assets", response_model=MediaAssetOut)
def upsert_asset(
    body: MediaAssetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MediaAssetOut:
    if body.kind not in ("image", "video"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")
    row = db.scalar(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.client_id == body.id,
        )
    )
    if row is None:
        row = MediaAsset(user_id=user.id, client_id=body.id)
        db.add(row)
    row.kind = body.kind
    row.url = body.url
    row.thumb_url = body.thumbUrl
    row.prompt = (body.prompt or "")[:512] or None
    row.source = (body.source or "other")[:32]
    row.model = (body.model or None)
    if row.model:
        row.model = row.model[:128]
    row.created_at_ms = int(body.createdAt)
    db.commit()
    db.refresh(row)

    # Trim
    ids = list(
        db.scalars(
            select(MediaAsset.id)
            .where(MediaAsset.user_id == user.id)
            .order_by(MediaAsset.created_at_ms.desc())
            .offset(MAX_ASSETS)
        ).all()
    )
    if ids:
        db.execute(delete(MediaAsset).where(MediaAsset.id.in_(ids)))
        db.commit()

    return _asset_out(row)


@router.post("/assets/batch", response_model=dict)
def upsert_assets_batch(
    body: MediaBatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if not body.assets:
        return {"ok": True, "count": 0}

    existing = {
        r.client_id: r
        for r in db.scalars(
            select(MediaAsset).where(
                MediaAsset.user_id == user.id,
                MediaAsset.client_id.in_([a.id for a in body.assets]),
            )
        ).all()
    }
    for asset in body.assets:
        if asset.kind not in ("image", "video"):
            continue
        row = existing.get(asset.id)
        if row is None:
            row = MediaAsset(user_id=user.id, client_id=asset.id)
            db.add(row)
        row.kind = asset.kind
        row.url = asset.url
        row.thumb_url = asset.thumbUrl
        row.prompt = (asset.prompt or "")[:512] or None
        row.source = (asset.source or "other")[:32]
        row.model = (asset.model[:128] if asset.model else None)
        row.created_at_ms = int(asset.createdAt)
    db.commit()

    ids = list(
        db.scalars(
            select(MediaAsset.id)
            .where(MediaAsset.user_id == user.id)
            .order_by(MediaAsset.created_at_ms.desc())
            .offset(MAX_ASSETS)
        ).all()
    )
    if ids:
        db.execute(delete(MediaAsset).where(MediaAsset.id.in_(ids)))
        db.commit()
    return {"ok": True, "count": len(body.assets)}


@router.delete("/assets/{client_id}", response_model=dict)
def delete_asset(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    db.execute(
        delete(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.client_id == client_id,
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/assets", response_model=dict)
def clear_assets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    db.execute(delete(MediaAsset).where(MediaAsset.user_id == user.id))
    db.commit()
    return {"ok": True}


@router.get("/settings", response_model=UserSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserSettingsOut:
    row = db.get(UserSettings, user.id)
    if row is None:
        return UserSettingsOut()
    return UserSettingsOut(
        textApiKey=decrypt_secret(row.text_api_key_enc),
        aiGatewayKey=decrypt_secret(row.ai_gateway_key_enc),
        falKey=decrypt_secret(row.fal_key_enc),
        textModel=row.text_model or "",
        imageModel=row.image_model or "",
        videoModel=row.video_model or "",
        gatewayBaseUrl=row.gateway_base_url or "",
    )


@router.put("/settings", response_model=UserSettingsOut)
def put_settings(
    body: UserSettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserSettingsOut:
    row = db.get(UserSettings, user.id)
    if row is None:
        row = UserSettings(user_id=user.id)
        db.add(row)
    row.text_api_key_enc = encrypt_secret(body.textApiKey)
    row.ai_gateway_key_enc = encrypt_secret(body.aiGatewayKey)
    row.fal_key_enc = encrypt_secret(body.falKey)
    row.text_model = (body.textModel or "")[:128]
    row.image_model = (body.imageModel or "")[:128]
    row.video_model = (body.videoModel or "")[:128]
    row.gateway_base_url = (body.gatewayBaseUrl or "")[:512]
    db.commit()
    return get_settings(db, user)
