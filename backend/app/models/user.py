"""
用户数据模型
---------------------------------
功能：
- 定义 User 表结构，用于存储用户注册信息
- 字段包括：id、手机号、密码哈希、创建时间、最后登录时间

使用：
- 用于用户注册、登录验证
- 手机号作为唯一标识
"""

from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from .base import Base


class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, comment="用户ID")
    phone_number = Column(String(11), unique=True, index=True, nullable=False, comment="手机号")
    hashed_password = Column(String(255), nullable=False, comment="密码哈希")
    created_at = Column(DateTime, default=datetime.utcnow, comment="创建时间")
    last_login = Column(DateTime, nullable=True, comment="最后登录时间")
    
    def __repr__(self):
        return f"<User(id={self.id}, phone={self.phone_number})>"




