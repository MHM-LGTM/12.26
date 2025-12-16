# 后端说明（FastAPI + SAM + 豆包多模态）

> 变更：加入 `.env` 自动加载机制与使用指南，避免将密钥硬编码到代码中。

## 快速开始（Windows PowerShell）

- 安装依赖（首次）：
  - `pip install -r backend/requirements.txt`
- 配置环境变量（二选一）：
  - 方式 A：复制项目根目录的 `.env.example` 为 `.env`，填写真实值：
    - `ARK_API_KEY`：豆包方舟平台 API Key（必填）
    - `DOUBAO_MODEL_ID`：方舟控制台对应的模型 ID（可用默认）
    - 其余项按需修改（`FRONTEND_ORIGIN`、`SAM_MODEL_TYPE`、`SAM_DEVICE` 等）
  - 方式 B：直接在终端设置临时环境变量：
    - `$env:ARK_API_KEY = '你的豆包ARK密钥'`
    - `$env:DOUBAO_MODEL_ID = 'doubao-seed-1-6-flash-250828'`（或你的模型）
- 启动后端：
  - `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload`

## .env 文件位置与加载逻辑

- 文件路径：项目根目录 `./.env`（与 `.env.example` 同级）。
- 加载时机：`backend/app/config/settings.py` 在模块初始化阶段自动尝试加载 `.env`。
- 覆盖策略：`override=False`，即如果系统环境变量已存在，则不会被 `.env` 覆盖；方便生产环境以系统变量为准。

## 关键环境变量说明

- `FRONTEND_ORIGIN`：允许跨域的前端地址（默认 `http://localhost:5174`）。
- `ARK_BASE_URL`：豆包 Ark 地域端点（默认北京 `https://ark.cn-beijing.volces.com/api/v3`）。
- `ARK_API_KEY`：豆包 Ark API Key（必填）。
- `DOUBAO_MODEL_ID`：使用的模型 ID（默认 `doubao-seed-1-6-flash-250828`）。
- `SAM_MODEL_TYPE`：`vit_b | vit_l | vit_h`。
- `SAM_CHECKPOINT_PATH`：SAM 权重文件路径（默认 `backend/app/models/sam_vit_l_0b3195.pth`）。
- `SAM_DEVICE`：`cpu` 或 `cuda`。

## 常见问题

- 多模态识别耗时显示为 `-1 ms`：通常表示未设置 `ARK_API_KEY` 或网络/端点配置异常。
  - 请检查 `.env` 是否存在且填写了有效的 `ARK_API_KEY`；或在终端以 `$env:ARK_API_KEY = '...'` 临时设置。
  - 若切换地域，请同时调整 `ARK_BASE_URL`。
- 前端跨域错误：请确认 `FRONTEND_ORIGIN` 与实际前端端口一致（5174 或 5175）。