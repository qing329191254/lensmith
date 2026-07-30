from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_gateway_api_key: str = ""
    text_api_key: str = ""
    fal_key: str = ""
    fal_fal_key: str = ""
    # Fallback OpenAI-compatible base for image/video APIs (e.g. CogView) when user
    # did not set a custom Gateway URL — not a product “vendor zone”.
    compatible_api_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    ai_gateway_base_url: str = "https://ai-gateway.vercel.sh/v1"

    # MySQL，例如：mysql+pymysql://user:pass@127.0.0.1:3306/lensmith
    database_url: str = ""
    # JWT 签名密钥，生产环境请换成足够长的随机字符串
    jwt_secret: str = ""
    jwt_expire_minutes: int = 60 * 24 * 7

    @property
    def fal_credentials(self) -> str:
        return self.fal_key or self.fal_fal_key

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def auth_configured(self) -> bool:
        return bool(self.database_url.strip() and self.jwt_secret.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
