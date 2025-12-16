"""
图片编码工具（供多模态模型使用）
---------------------------------
功能：
- 提供将本地图片读取为 base64 并封装为 data URL 的方法，便于直接传递给支持 `image_url` 的对话模型；
- 自动根据文件扩展名推断 MIME 类型（jpg/png/webp 等）。

使用说明：
- `image_to_data_url(path)` 返回形如 `data:image/jpeg;base64,<...>` 的字符串；
- 若无法识别扩展名，会回退到 `application/octet-stream`；
- 仅做编码与简单校验，不处理图像缩放/压缩；如需对超大图下采样，请在调用前处理。
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Tuple

from .logger import log


def _guess_mime(path: Path) -> str:
    """根据文件扩展名推断 MIME 类型，默认回退为 `application/octet-stream`。

    仅用于构造 data URL 的 `image/*` 前缀；不会影响实际内容。
    """
    mime, _ = mimetypes.guess_type(str(path))
    if not mime:
        return "application/octet-stream"
    return mime


def read_file_bytes(path: str | Path) -> bytes:
    """读取文件为字节串。

    - path: 文件路径（字符串或 Path）。
    - 返回：bytes；若失败则抛出异常并记录日志。
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"file not found: {p}")
    try:
        return p.read_bytes()
    except Exception as e:
        log.error(f"read_file_bytes failed: {p} -> {e}")
        raise


def image_to_data_url(path: str | Path) -> str:
    """将图片编码为 base64 data URL。

    示例返回：`data:image/png;base64,iVBORw0KGgo...`
    """
    p = Path(path)
    content = read_file_bytes(p)
    b64 = base64.b64encode(content).decode("utf-8")
    mime = _guess_mime(p)
    # 常用图片类型的简化修正：若 MIME 不以 image/ 开头但扩展名是常见图片，则修正为 image/jpeg
    if not mime.startswith("image/"):
        suffix = p.suffix.lower()
        if suffix in {".jpg", ".jpeg"}:
            mime = "image/jpeg"
        elif suffix in {".png"}:
            mime = "image/png"
        elif suffix in {".webp"}:
            mime = "image/webp"
    data_url = f"data:{mime};base64,{b64}"
    log.debug(f"image_to_data_url: {p} -> {mime}, bytes={len(content)}")
    return data_url