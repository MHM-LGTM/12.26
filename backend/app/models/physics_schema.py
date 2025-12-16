"""
物理模拟相关请求模型
---------------------------------
功能：
- 定义前端与后端交互的最小请求体：分割请求与生成模拟请求。
- 支持多种物理场景：重力、单摆、弹簧、碰撞等。
- 包含完整的物理参数定义。

扩展说明：
- 添加了场景类型、元素类型、约束关系等字段；
- 支持弹簧系数、绳长、碰撞恢复系数等多种物理参数；
- 坐标类型采用整数像素坐标。

本次修改（刚体碰撞参数透传兼容）：
- 在 `PhysicsSimulateRequest` 中新增可选字段 `roles` 与 `parameters_list`，
  用于在未构造完整 `elements` 列表时，仍可按旧流程传递每个元素的角色与参数。
  这两个字段与 `elements_simple`/`contours` 按索引对齐；若同时提供完整 `elements`，以完整定义为准。
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Point(BaseModel):
    """二维坐标点"""
    x: int
    y: int


class PhysicsParameters(BaseModel):
    """物理参数定义"""
    mass_kg: Optional[float] = Field(None, description="质量（千克）")
    friction_coefficient: Optional[float] = Field(None, description="摩擦系数")
    restitution: Optional[float] = Field(None, description="碰撞恢复系数 (0-1)")
    slope_angle_deg: Optional[float] = Field(None, description="斜面角度（度）")
    gravity_m_s2: Optional[float] = Field(9.8, description="重力加速度 (m/s²)")
    initial_velocity_m_s: Optional[float] = Field(None, description="初速度 (m/s)")
    initial_position_px: Optional[List[int]] = Field(None, description="初始位置（像素）")
    spring_stiffness: Optional[float] = Field(None, description="弹簧劲度系数 k (N/m)")
    spring_damping: Optional[float] = Field(None, description="弹簧阻尼系数 (0-1)")
    rope_length_m: Optional[float] = Field(None, description="绳长（米）")
    initial_angle_deg: Optional[float] = Field(None, description="初始角度（度）")
    radius_px: Optional[float] = Field(None, description="圆形物体半径（像素）")


class ElementConstraint(BaseModel):
    """元素约束关系"""
    attached_to: Optional[str] = Field(None, description="连接到的元素名称")
    constraint_type: Optional[str] = Field("none", description="约束类型：spring|rope|hinge|none")
    anchor_point: Optional[List[int]] = Field(None, description="锚点坐标（像素）")


class PhysicsElement(BaseModel):
    """物理元素完整定义"""
    name: str = Field(..., description="元素名称")
    role: str = Field(..., description="元素角色：dynamic|static|constraint")
    element_type: str = Field(..., description="元素类型：rigid_body|pendulum_bob|spring|rope|pivot|surface")
    parameters: PhysicsParameters = Field(default_factory=PhysicsParameters, description="物理参数")
    constraints: Optional[ElementConstraint] = Field(None, description="约束关系")
    contour: List[Point] = Field(default_factory=list, description="轮廓坐标")
    sprite_data_url: Optional[str] = Field(None, description="精灵图 data URL")


class PhysicsSegmentRequest(BaseModel):
    """分割请求：用若干点提示生成掩码，然后提取轮廓坐标。

    - image_path: 服务器端已保存的图片路径（可选）。
    - image_size: [height, width]（备用字段）。
    - points: 用户点击转换的点提示集合。
    - box: 框选提示，格式 [x1, y1, x2, y2]。
    """

    image_path: Optional[str] = None
    image_size: Optional[List[int]] = None  # [h, w]
    points: List[Point] = []
    box: Optional[List[int]] = None


class PhysicsSimulateRequest(BaseModel):
    """生成模拟请求：前端在确认分割后，提交图片路径、元素与其轮廓坐标。

    - image_path: 服务器本地图片路径（用于 OpenCV 精准裁剪精灵）。
    - scene_type: 场景类型（gravity|pendulum|spring|collision|compound）。
    - elements: 完整的元素信息列表（包含参数和约束关系）。
    - elements_simple: 简化的元素名称集合（向后兼容）。
    - contours: 每个元素的轮廓点坐标（向后兼容）。
    """

    image_path: Optional[str] = None
    scene_type: Optional[str] = Field("gravity", description="场景类型")
    elements: Optional[List[PhysicsElement]] = Field(None, description="完整元素列表")
    # 向后兼容字段
    elements_simple: Optional[List[str]] = Field(None, description="简化元素名称")
    # 轮廓坐标：兼容多种形态
    # - List[List[Point]]（推荐）
    # - List[List[Dict[str,int]]]（前端直接传 {x,y}）
    # - List[List[Tuple[int,int]]]（某些工具返回 (x,y)）
    contours: Optional[List[List[Any]]] = Field(None, description="轮廓坐标（兼容 {x,y} 或 (x,y)）")
    # 兼容：简单请求体下的角色与参数列表（与 elements_simple/contours 对齐）
    roles: Optional[List[str]] = Field(None, description="每个元素的角色：static|dynamic")
    parameters_list: Optional[List[Dict[str, Any]]] = Field(None, description="每个元素的参数字典")