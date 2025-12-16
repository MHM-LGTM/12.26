"""
数据库初始化脚本
---------------------------------
功能：
- 创建 users 表
- 创建 animations 表
- 创建 animation_likes 表

使用：
python backend/init_db.py
"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "sqlite+aiosqlite:///./backend/sql_app.db"

# 导入 Base 和所有模型（这会自动注册到 Base.metadata）
from app.models.base import Base
from app.models.user import User
from app.models.animation import Animation, AnimationLike


async def init_database():
    """初始化数据库表"""
    print("正在初始化数据库...")
    
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        # 删除所有表（可选，用于重建）
        # await conn.run_sync(Base.metadata.drop_all)
        
        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()
    
    print("✅ 数据库表创建成功！")
    print(f"   数据库位置：{DATABASE_URL}")
    print(f"   已创建表：{', '.join(Base.metadata.tables.keys())}")


if __name__ == "__main__":
    asyncio.run(init_database())




