"""
数据库模型基类
---------------------------------
功能：
- 提供统一的 Base 供所有模型继承
- 确保所有模型在同一个 metadata 中

使用：
from .base import Base

class MyModel(Base):
    __tablename__ = "my_table"
    ...
"""

from sqlalchemy.orm import declarative_base

# 创建统一的 Base
Base = declarative_base()

