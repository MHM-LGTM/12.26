"""
数学讲解相关请求模型
---------------------------------
功能：
- 定义最小的数学渲染请求体：文本描述与（可选）图片路径。

后续扩展：
- 可增加语音脚本、时间戳、动画脚本等字段；
- 若渲染采用异步任务队列（如 RQ/Redis），可加入 `task_id` 与状态查询接口模型。
"""

from typing import Optional
from pydantic import BaseModel


class MathRenderRequest(BaseModel):
    prompt: str
    image_path: Optional[str] = None