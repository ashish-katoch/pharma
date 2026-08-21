"""add_invoice_prefix_to_shops

Revision ID: c4d8e2f1b5a9
Revises: b3c9d1f2a4e7
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d8e2f1b5a9"
down_revision: Union[str, None] = "b3c9d1f2a4e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column("invoice_prefix", sa.String(20), nullable=False, server_default="INV"),
    )


def downgrade() -> None:
    op.drop_column("shops", "invoice_prefix")
