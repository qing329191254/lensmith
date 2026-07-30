from datetime import datetime

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=6, max_length=32)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=6, max_length=32)


class UpdateProfileRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=32)
    new_password: str = Field(min_length=6, max_length=32)


class UserOut(BaseModel):
    id: int
    username: str
    avatar_url: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
