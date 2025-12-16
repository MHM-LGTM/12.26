"""
动画相关的 Pydantic Schema
---------------------------------
功能：
- 定义请求和响应的数据模型
- 用于 FastAPI 的自动验证和文档生成

使用：
- AnimationCreateRequest: 创建动画的请求体
- AnimationResponse: 动画信息的响应
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class AnimationCreateRequest(BaseModel):
    """创建动画请求"""
    title: str = Field(..., min_length=1, max_length=100, description="动画名称")
    description: Optional[str] = Field(None, max_length=500, description="动画描述")
    thumbnail_url: Optional[str] = Field(None, description="封面图URL（data URL）")
    scene_data: Dict[str, Any] = Field(..., description="场景数据（JSON）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "弹性碰撞演示",
                "description": "展示两个小球的弹性碰撞过程",
                "thumbnail_url": "data:image/png;base64,iVBOR...",
                "scene_data": {
                    "imagePreview": "data:image/png;base64,...",
                    "imageNaturalSize": {"w": 800, "h": 600},
                    "objects": [],
                    "constraints": []
                }
            }
        }


class AnimationUpdateRequest(BaseModel):
    """更新动画请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    thumbnail_url: Optional[str] = None
    scene_data: Optional[Dict[str, Any]] = None


class AnimationResponse(BaseModel):
    """动画响应"""
    id: int
    user_id: int
    title: str
    description: Optional[str]
    thumbnail_url: Optional[str]
    is_public: bool
    like_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class AnimationDetailResponse(BaseModel):
    """动画详情响应（包含 scene_data）"""
    id: int
    user_id: int
    title: str
    description: Optional[str]
    thumbnail_url: Optional[str]
    scene_data: Dict[str, Any]
    is_public: bool
    like_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class AnimationListItem(BaseModel):
    """动画列表项（用于列表展示）"""
    id: int
    title: str
    thumbnail_url: Optional[str]
    like_count: int
    created_at: str  # ISO格式字符串
    
    class Config:
        from_attributes = True

