"""
统一返回模型（ApiResponse）
---------------------------------
功能：
- 定义后端接口统一返回结构：code、message、data。
- 提供便捷的 `ok` 与 `error` 工厂方法，便于路由快速构建返回体。

后续扩展：
- 可根据需要增加 `request_id`、`trace_id` 等字段，便于链路追踪。
- 若需要更复杂的泛型类型，可迁移到 Pydantic v2 的 `typing.Annotated` 或自定义泛型模型。
"""

from typing import Any, Optional
from pydantic import BaseModel


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[Any] = None

    @classmethod
    def ok(cls, data: Any | None = None, message: str = "success") -> "ApiResponse":
        return cls(code=0, message=message, data=data)

    @classmethod
    def error(cls, message: str = "error", code: int = 1, data: Any | None = None) -> "ApiResponse":
        return cls(code=code, message=message, data=data)