# Lensmith API (FastAPI)

Uses conda env `lensmith` (Python 3.12).

```bash
conda env create -f environment.yml
conda activate lensmith
pip install -r requirements.txt
cp .env.example .env
# 填写 DATABASE_URL、JWT_SECRET 后再迁移 / 启动
alembic upgrade head
python run.py
```

- 业务接口：`/api/seq/*`
- 登录注册：`/api/auth/register`、`/api/auth/login`、`/api/auth/me`

`.env` 中与登录相关：

```env
DATABASE_URL=mysql+pymysql://user:pass@127.0.0.1:3306/lensmith
JWT_SECRET=请换成随机长字符串
```
