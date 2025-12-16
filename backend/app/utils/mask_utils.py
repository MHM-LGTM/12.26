"""
掩码到轮廓坐标转换工具
---------------------------------
功能：
- 提供 `extract_contour(mask)` 方法，将二值掩码转换为轮廓点坐标数组。
- 使用 OpenCV `findContours` 提取最大轮廓，并返回像素坐标点列表。

后续扩展：
- 可返回多条轮廓（按面积排序），或做平滑/采样以减少点数。
- 若前端需要浮点坐标（归一化），在此处做坐标换算即可。
"""

from typing import List, Tuple

import numpy as np
import cv2


def extract_contour(mask: np.ndarray) -> List[Tuple[int, int]]:
    """根据二值掩码提取外部轮廓坐标点数组。

    参数说明：
    - mask: 2D numpy 数组；0 表示背景，非 0 表示前景（物体）。

    返回：
    - 点坐标数组：[(x1, y1), (x2, y2), ...]，按照轮廓顺序排列。
    """

    if mask.ndim != 2:
        raise ValueError("mask must be a 2D array")

    # OpenCV 期望 uint8，前景值为 255
    mask_uint8 = (mask > 0).astype(np.uint8) * 255

    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return []

    # 取面积最大的轮廓
    largest = max(contours, key=cv2.contourArea)

    # 转为 (x, y) 点列表
    pts = [(int(p[0][0]), int(p[0][1])) for p in largest]
    return pts
