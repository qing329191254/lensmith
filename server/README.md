# Lensmith API (FastAPI)

Uses conda env `lensmith` (Python 3.12).

```bash
conda env create -f environment.yml
conda activate lensmith
cp .env.example .env
python run.py
```

Endpoints are mounted under `/api/seq/*` to match the previous Next.js routes.
