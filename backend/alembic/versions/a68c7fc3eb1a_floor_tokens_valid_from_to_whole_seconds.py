"""floor tokens_valid_from to whole seconds

Revision ID: a68c7fc3eb1a
Revises: 36cfc60b2f8e
Create Date: 2026-08-16 23:22:36.332844

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a68c7fc3eb1a'
down_revision: Union[str, None] = '36cfc60b2f8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "tokens_valid_from",
        server_default=sa.text("date_trunc('second', now())"),
    )
    op.execute("UPDATE users SET tokens_valid_from = date_trunc('second', tokens_valid_from)")


def downgrade() -> None:
    op.alter_column("users", "tokens_valid_from", server_default=sa.text("now()"))
