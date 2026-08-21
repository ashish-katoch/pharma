"""add_mrp_history_table

Revision ID: b3c9d1f2a4e7
Revises: 5ff28802e9be
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b3c9d1f2a4e7"
down_revision: Union[str, None] = "5ff28802e9be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mrp_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("medicine_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("old_mrp", sa.Numeric(10, 2), nullable=False),
        sa.Column("new_mrp", sa.Numeric(10, 2), nullable=False),
        sa.Column("changed_by", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("mrp_history")
