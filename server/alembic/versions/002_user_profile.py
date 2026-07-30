"""add user profile fields

Revision ID: 002_user_profile
Revises: 001_create_users
Create Date: 2026-07-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_user_profile"
down_revision: Union[str, Sequence[str], None] = "001_create_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("avatar_ext", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_ext")
    op.drop_column("users", "display_name")
