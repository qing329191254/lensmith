"""Create MySQL database from DATABASE_URL if missing, then print status."""

from urllib.parse import urlparse

import pymysql
from dotenv import load_dotenv
import os

load_dotenv()
url = os.getenv("DATABASE_URL", "").strip()
if not url:
    raise SystemExit(
        "DATABASE_URL is empty inside the api container.\n"
        "Fix: ensure /opt/lensmith/.env exists, is readable by the deploy user, "
        "then: docker compose up -d --force-recreate"
    )

# mysql+pymysql://user:pass@host:port/dbname
normalized = url.replace("mysql+pymysql://", "mysql://", 1)
parsed = urlparse(normalized)
db_name = (parsed.path or "").lstrip("/")
if not db_name:
    raise SystemExit("DATABASE_URL has no database name")

conn = pymysql.connect(
    host=parsed.hostname or "127.0.0.1",
    port=parsed.port or 3306,
    user=parsed.username or "root",
    password=parsed.password or "",
)
try:
    with conn.cursor() as cur:
        cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    conn.commit()
    print(f"database ready: {db_name}")
finally:
    conn.close()
