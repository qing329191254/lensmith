"""Start the Lensmith API: python run.py"""

from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent


if __name__ == "__main__":
    # Allow starting from repo root or any cwd
    import os

    os.chdir(ROOT)
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[str(ROOT / "app")],
    )
