"""
文件存储工具
---------------------------------
功能：
- 保存前端上传的文件到 `backend/uploads/<category>/` 目录。
- 返回保存后的绝对路径，供后续路由/服务使用。

后续扩展：
- 可增加子目录（按日期/用户ID）与存储后清理策略；
- 可接入对象存储（如 S3、OSS），在此处替换落盘逻辑即可。
"""

from pathlib import Path
from uuid import uuid4
from typing import Literal

from fastapi import UploadFile

from ..config.settings import PHYSICS_UPLOAD_DIR, MATH_UPLOAD_DIR


def _target_dir(category: Literal["physics", "math"]) -> Path:
    return PHYSICS_UPLOAD_DIR if category == "physics" else MATH_UPLOAD_DIR


def save_upload_file(category: Literal["physics", "math"], file: UploadFile) -> Path:
    """保存上传文件到对应目录，返回保存后的绝对路径。

    命名策略：`<uuid>_<原文件名>`，避免重名覆盖。
    """

    target = _target_dir(category)
    target.mkdir(parents=True, exist_ok=True)

    original_name = Path(file.filename or "upload.bin").name
    safe_name = f"{uuid4().hex}_{original_name}"
    save_path = target / safe_name

    with save_path.open("wb") as out:
        content = file.file.read()
        out.write(content)

    return save_path.resolve()