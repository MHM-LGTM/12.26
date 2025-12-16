"""
后端基础配置（含 SAM 与豆包多模态 + .env 自动加载）
---------------------------------
功能：
- 定义上传目录（physics/math）并在模块加载时确保目录存在。
- 定义允许的前端跨域源（默认 vite 开发地址）。
- 定义 Segment Anything 模型配置：模型类型与 checkpoint 路径、设备。
- 定义豆包（Doubao Ark）多模态调用配置：`ARK_BASE_URL`、`ARK_API_KEY`、`DOUBAO_MODEL_ID`。

本次修改（同步权重新位置）：
- 默认的 `SAM_CHECKPOINT_PATH` 从 `backend/app/models/sam_vit_l_0b3195.pth` 更新为
  `backend/app/checkpoints/sam_vit_l_0b3195.pth`，以避免与 Pydantic “数据模型”目录混放。
- 仍支持通过环境变量覆盖（`.env` 或系统环境变量），无需改代码即可指向自定义权重路径。

使用说明：
- 请在部署环境中设置环境变量 `ARK_API_KEY`（来自豆包方舟平台），也可通过 `.env` 注入；
- 如需更换模型或地域端点，可设置 `DOUBAO_MODEL_ID` 与 `ARK_BASE_URL`；
- 若权重文件不在默认位置，可设置 `SAM_CHECKPOINT_PATH` 指向实际文件。
- 其余配置项可根据机器情况切换到 GPU（`SAM_DEVICE=cuda`）。

后续扩展：
- 可迁移到 pydantic-settings 进行更健壮的配置管理；
- 统一维护端口、日志等级、数据库等。
"""

from pathlib import Path
import os
from dotenv import find_dotenv, load_dotenv


# 注意：settings.py 位于 project_root/backend/app/config/
# 因此项目根目录应为 `parents[3]`
PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = PROJECT_ROOT / "backend"
UPLOAD_DIR = BACKEND_DIR / "uploads"

# 自动加载项目根目录 .env（若存在）。
# 注意：`override=False`，即环境变量已存在时不被 .env 覆盖，方便在生产环境直接通过系统环境变量注入。
_found = find_dotenv(filename=".env", usecwd=True)
if _found:
    load_dotenv(_found, override=False)
else:
    load_dotenv(str(PROJECT_ROOT / ".env"), override=False)

PHYSICS_UPLOAD_DIR = UPLOAD_DIR / "physics"
MATH_UPLOAD_DIR = UPLOAD_DIR / "math"

# 确保目录存在
PHYSICS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MATH_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 允许跨域的前端地址
_origins_csv = os.getenv("FRONTEND_ORIGINS", "").strip()
if _origins_csv:
    FRONTEND_ORIGINS = [o.strip() for o in _origins_csv.split(",") if o.strip()]
else:
    FRONTEND_ORIGINS = [
        os.getenv("FRONTEND_ORIGIN", "http://localhost:5174"),
        "http://localhost:5175",
    ]

# --- Segment Anything 配置 ---
# 模型类型可选："vit_b"、"vit_l"、"vit_h"（对应官方权重）
SAM_MODEL_TYPE = os.getenv("SAM_MODEL_TYPE", "vit_b")
# 模型权重文件路径：
# - 默认指向 `backend/app/checkpoints/sam_vit_l_0b3195.pth`（与数据模型分离，便于归档管理）。
# - 可通过环境变量 `SAM_CHECKPOINT_PATH` 覆盖为任意绝对/相对路径。
# - 该值被 `segment_service.init_sam` 在启动时读取并校验存在性。
SAM_CHECKPOINT_PATH = Path(
    os.getenv(
        "SAM_CHECKPOINT_PATH",
        BACKEND_DIR / "app" / "checkpoints" / "sam_vit_b_01ec64.pth",
    )
).expanduser().resolve()

# 设备与性能设置
SAM_DEVICE = os.getenv("SAM_DEVICE", "cpu")  # 可设为 "cuda"（若有 GPU）

# --- Doubao Ark 配置 ---
# 端点与模型：默认使用北京地域与用户提供的示例模型 ID，可通过环境变量覆盖
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
# 从环境变量或 .env 中读取豆包 API Key，不要在代码中硬编码真实密钥。
ARK_API_KEY = os.getenv("ARK_API_KEY", "")
DOUBAO_MODEL_ID = os.getenv("DOUBAO_MODEL_ID", "doubao-seed-1-6-flash-250828")

# --- JWT 认证配置 ---
# JWT 密钥：用于签名和验证 Token，生产环境必须修改为强密钥
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-please-change-in-production")
# JWT 算法
JWT_ALGORITHM = "HS256"
# Token 过期时间（分钟），默认 7 天
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 60 * 24 * 7))
