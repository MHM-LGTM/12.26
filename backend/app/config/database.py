"""
数据库连接配置
---------------------------------
功能：
- 配置 SQLite 异步数据库引擎
- 提供数据库会话管理
- 提供依赖注入函数供路由使用

使用：
- 在路由中通过 Depends(get_db) 获取数据库会话
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from pathlib import Path

# 数据库路径：与现有 sql_app.db 同目录
DATABASE_URL = "sqlite+aiosqlite:///./backend/sql_app.db"

# 创建异步引擎
engine = create_async_engine(
    DATABASE_URL, 
    echo=False,  # 生产环境设为 False
    future=True
)

# 创建异步会话工厂
AsyncSessionLocal = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False,
    autoflush=False,
    autocommit=False
)


async def get_db():
    """
    依赖注入：获取数据库会话
    
    使用示例：
    @router.get("/example")
    async def example(db: AsyncSession = Depends(get_db)):
        ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()




