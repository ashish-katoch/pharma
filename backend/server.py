"""Supervisor entrypoint shim.

The Emergent supervisor launches `uvicorn server:app` from /app/backend, but the
real FastAPI application lives in the `src/pharma` package (src-layout). This shim
puts `src` on the import path and re-exports the ASGI `app` so the existing
process manager keeps working without changing its command.
"""
import os
import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Ensure settings read the .env next to this file regardless of cwd.
os.chdir(Path(__file__).resolve().parent)

from pharma.main import app  # noqa: E402,F401
