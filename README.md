# Lensmith

面向创作者的 AI 影像工作室：用文字生成分镜、打磨镜头画面，并在时间线上完成剪辑。

**Vue 3 + FastAPI** · 支持即梦/方舟、智谱、fal、AI Gateway 等 BYO Key 工作流。

## 界面预览

| 落地页 | 图片工坊 | 时间线 |
| :---: | :---: | :---: |
| ![落地页](docs/screenshots/landing.png) | ![图片工坊](docs/screenshots/image-playground.png) | ![时间线](docs/screenshots/timeline.png) |

## 功能概览

- **分镜向导**：提示词 → 主分镜网格 → 分析抽镜 → 可选生视频
- **图片工坊**：文生图 / 参考图编辑，历史沉淀，拖拽回填参考槽
- **时间线**：导入媒体、多轨剪辑、浏览器端导出 MP4（ffmpeg.wasm）
- **工作台**：自备 API Key、模型偏好、用量与媒体库同步（需登录 + MySQL）

## 技术栈与版本

| 层级 | 技术 | 版本要求 |
| --- | --- | --- |
| 运行时 | Node.js | **22+** |
| 包管理 | pnpm | **11.9+**（见根目录 `packageManager`） |
| 前端 | Vue 3 · Vite · Pinia · Vue Router · Tailwind CSS 4 · vue-i18n | Vue `^3.5` · Vite `^6` |
| 前端媒体 | `@ffmpeg/ffmpeg` | `0.12.x` |
| Python | Conda 环境 `lensmith` | **Python 3.12** |
| 后端 | FastAPI · Uvicorn · SQLAlchemy · Alembic · LangGraph | 见 `server/requirements.txt` |
| 数据库（可选） | MySQL | 登录 / 云同步时需要 |

主要后端依赖：`fastapi`、`uvicorn`、`httpx`、`langgraph`、`sqlalchemy`、`pymysql`、`alembic`、`PyJWT`、`bcrypt`、`fal-client` 等。

## 目录结构

```text
lensmith/
├── client/                 # Vue 3 前端（pnpm workspace 包 lensmith-client）
│   ├── src/
│   │   ├── api/            # HTTP / 业务接口
│   │   ├── components/     # 分镜、图片、时间线等组件
│   │   ├── views/          # 路由页面
│   │   ├── stores/         # Pinia
│   │   └── i18n/           # 中英文案
│   ├── scripts/            # 如 copy-ffmpeg.mjs
│   └── Dockerfile          # 前端静态资源镜像
├── server/                 # FastAPI 后端
│   ├── app/                # 路由、模型服务、鉴权
│   ├── alembic/            # 数据库迁移
│   ├── run.py              # 本地开发启动
│   ├── requirements.txt
│   ├── environment.yml     # Conda：python=3.12
│   └── Dockerfile
├── deploy/                 # 宝塔 / Nginx / CI 部署说明
├── docs/screenshots/       # README 截图
├── docker-compose.yml      # 生产编排（api + web）
├── package.json            # 根脚本：pnpm dev 同时启前后端
└── pnpm-workspace.yaml
```

## 环境准备

```bash
# 1) Conda 后端环境（一次性）
cd server
conda env create -f environment.yml
cp .env.example .env
# 编辑 .env：至少可先留空 Key，在网页「工作台」粘贴；
# 若要登录/同步，填写 DATABASE_URL 与 JWT_SECRET
cd ..

# 2) 前端依赖（一次性）
pnpm install
```

### 环境变量（`server/.env`）

| 变量 | 说明 |
| --- | --- |
| `AI_GATEWAY_API_KEY` | 可选服务端兜底；即梦/方舟可填 Ark Key |
| `FAL_KEY` | 可选；fal 视频 / 放大等 |
| `CORS_ORIGINS` | 本地默认含 `http://localhost:5173` |
| `DATABASE_URL` | 可选；例 `mysql+pymysql://user:pass@127.0.0.1:3306/lensmith` |
| `JWT_SECRET` | 启用登录时必填 |

多数 Key 也可只在浏览器工作台配置（BYO），不必写进 `.env`。

启用账号体系时：

```bash
conda activate lensmith
cd server
alembic upgrade head
```

## 启动命令

### 一键启动（推荐）

在仓库根目录：

```bash
pnpm dev
```

会并行启动：

| 服务 | 地址 |
| --- | --- |
| FastAPI | http://127.0.0.1:8000 · 文档 http://127.0.0.1:8000/docs |
| Vue (Vite) | http://127.0.0.1:5173 |

停止：`Ctrl+C`。

> 根脚本通过 `conda run -n lensmith` 调起后端，请先完成上面的 `conda env create`。

### 分别启动

```bash
# 后端
conda activate lensmith
python server/run.py

# 前端（另一终端）
pnpm --filter lensmith-client dev
```

### 生产部署

Docker Compose + 宝塔反代 + GitHub Actions（GHCR）：见 [deploy/README.md](deploy/README.md)。

## 主要路由

| 路径 | 说明 |
| --- | --- |
| `/` | 落地页 |
| `/storyboard` | AI 分镜向导 |
| `/image-playground` | 图片工坊 |
| `/timeline` | 时间线剪辑 |
| `/workspace` | 密钥与模型偏好 |
| `/demo` | 产品演示 |
