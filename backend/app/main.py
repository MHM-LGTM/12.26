"""
后端入口（FastAPI 应用）
---------------------------------
功能：
- 创建 FastAPI 应用并配置 CORS，允许前端开发环境跨域访问。
- 暴露健康检查接口 `/healthz`，便于前端/测试验证服务可用。
- 挂载物理模拟与数学讲解两个路由模块，路径分别为 `/physics` 与 `/math`。

后续扩展：
- 若需要增加统一前缀（例如 `/api`），可在 include_router 时增加 `prefix="/api/physics"` 等。
- 若要集成鉴权、中间件（日志、请求限流、跟踪等），在 `app.add_middleware` 处集中配置。
- 部署到生产时建议使用 `gunicorn`/`uvicorn` 结合反向代理（如 Nginx），并在 `settings.py` 中维护配置项。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .routers.physics_router import router as physics_router
from .routers.auth_router import router as auth_router
from .routers.animation_router import router as animation_router
from .services.segment_service import init_sam
from .config.settings import FRONTEND_ORIGINS, UPLOAD_DIR


app = FastAPI(title="Physics & Math API", version="0.2.0")

# 允许前端开发端口跨域访问（默认 vite 5174）
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    """健康检查接口：用于确认服务已启动且可访问。"""
    return {"status": "ok"}


# 挂载静态文件目录（用于提供上传的图片）
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# 路由挂载（可根据需要调整 prefix）
app.include_router(physics_router, prefix="/physics", tags=["physics"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(animation_router, prefix="/api", tags=["animations"])
_enable_math = os.getenv("ENABLE_MATH", "false").lower() == "true"
if _enable_math:
    try:
        from .routers.math_router import router as math_router
        app.include_router(math_router, prefix="/math", tags=["math"])
    except Exception:
        pass


@app.on_event("startup")
async def _load_models():
    """应用启动时加载 SAM 模型，提升首次分割请求的速度。"""
    init_sam()
