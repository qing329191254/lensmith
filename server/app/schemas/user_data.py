from pydantic import BaseModel, Field


class UsageEventIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    ts: int
    route: str = Field(min_length=1, max_length=64)
    durationMs: int = 0
    ok: bool = True
    status: int | None = None
    tokens: int = 0
    promptTokens: int = 0
    completionTokens: int = 0
    cachedTokens: int = 0
    estimated: bool = True
    model: str | None = None
    sample: bool = False


class UsageEventOut(UsageEventIn):
    pass


class UsageBatchIn(BaseModel):
    events: list[UsageEventIn] = Field(default_factory=list, max_length=800)


class MediaAssetIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    kind: str = Field(min_length=1, max_length=16)
    url: str = Field(min_length=1)
    thumbUrl: str | None = None
    prompt: str | None = None
    source: str = "other"
    model: str | None = None
    createdAt: int


class MediaAssetOut(MediaAssetIn):
    pass


class MediaBatchIn(BaseModel):
    assets: list[MediaAssetIn] = Field(default_factory=list, max_length=200)


class UserSettingsIn(BaseModel):
    textApiKey: str = ""
    aiGatewayKey: str = ""
    falKey: str = ""
    textModel: str = ""
    imageModel: str = ""
    videoModel: str = ""
    gatewayBaseUrl: str = ""


class UserSettingsOut(UserSettingsIn):
    pass
