"""
动画数据模型
---------------------------------
功能：
- 定义 Animation 表结构，用于存储用户保存的动画
- 定义 AnimationLike 表结构，用于存储点赞记录

使用：
- 用于保存、加载、分享动画
- 支持点赞、发布到广场等社区功能
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from datetime import datetime
from .base import Base


class Animation(Base):
    """动画模型"""
    __tablename__ = "animations"
    
    id = Column(Integer, primary_key=True, index=True, comment="动画ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="创建者ID")
    title = Column(String(100), nullable=False, comment="动画名称")
    description = Column(Text, nullable=True, comment="动画描述")
    thumbnail_url = Column(Text, nullable=True, comment="封面图URL（data URL或相对路径）")
    scene_data = Column(JSON, nullable=False, comment="场景数据（JSON格式）")
    
    # 社区功能相关
    is_public = Column(Boolean, default=False, comment="是否发布到广场")
    show_author = Column(Boolean, default=True, comment="是否显示作者")
    like_count = Column(Integer, default=0, comment="点赞数")
    fork_from = Column(Integer, nullable=True, comment="Fork来源动画ID")
    share_code = Column(String(10), unique=True, nullable=True, index=True, comment="分享链接code")
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, comment="更新时间")
    
    def __repr__(self):
        return f"<Animation(id={self.id}, title={self.title}, user_id={self.user_id})>"


class AnimationLike(Base):
    """动画点赞记录"""
    __tablename__ = "animation_likes"
    
    id = Column(Integer, primary_key=True, index=True, comment="记录ID")
    animation_id = Column(Integer, ForeignKey("animations.id", ondelete="CASCADE"), nullable=False, index=True, comment="动画ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="点赞用户ID")
    created_at = Column(DateTime, default=datetime.utcnow, comment="点赞时间")
    
    def __repr__(self):
        return f"<AnimationLike(animation_id={self.animation_id}, user_id={self.user_id})>"

