"""
OpenCV 图像处理服务（裁剪精灵 + 智能背景填充）
---------------------------------
功能：
- `extract_sprite(image_path, contour)`：按多边形轮廓在原图上裁剪元素，输出带透明背景的 PNG data URL；
- `inpaint_remove_objects(image_path, contours, method='auto', dilate=5, radius=5)`：
  将若干轮廓并集生成掩码，智能检测背景色并选择最佳填充策略，返回"已清理动态物体"的背景图（PNG data URL）。

2025-12-08 更新（智能背景填充）：
- 新增背景检测功能：采样图片边缘区域，检测背景是否为单色
- 修改 `inpaint_remove_objects()` 的 `method` 参数：
  * "auto"（默认）：自动检测背景，统一背景用纯色填充，否则用白色
  * "white"：强制白色填充
  * "detected"：强制使用检测到的背景色
  * "telea" / "ns"：传统 OpenCV inpaint 算法（保留兼容）

使用说明：
- 坐标需与原图尺寸一致；`contours` 采用 `List[List[Tuple[int,int]]]`；
- 对于物理题图片（通常白底或单色背景），推荐使用 `method='auto'`；
- 对于复杂纹理背景，可尝试 `method='telea'` 或 `method='ns'`。
"""

from __future__ import annotations

from typing import List, Tuple, Optional

import base64
import cv2
import numpy as np


# ============================================================================
# 背景填充配置（可根据需要调整）
# ============================================================================

# 边缘采样区域占图片尺寸的比例（用于检测背景色）
_BG_SAMPLE_RATIO = 0.05

# 颜色方差阈值（低于此值认为背景统一，建议 15~50）
_BG_VARIANCE_THRESHOLD = 25

# 近白色判定阈值（RGB 各通道 >= 此值视为白色）
_BG_WHITE_THRESHOLD = 240


# ============================================================================
# 背景检测相关函数
# ============================================================================

def _detect_background_color(
    image: np.ndarray,
    object_mask: Optional[np.ndarray] = None,
) -> Tuple[Tuple[int, int, int], bool, float]:
    """检测图片背景色，判断背景是否统一。

    策略：采样图片四周边缘区域的像素，分析颜色分布。
    """
    h, w = image.shape[:2]
    margin_x = max(1, int(w * _BG_SAMPLE_RATIO))
    margin_y = max(1, int(h * _BG_SAMPLE_RATIO))

    # 创建边缘采样掩码
    edge_mask = np.zeros((h, w), dtype=np.uint8)
    edge_mask[0:margin_y, :] = 255          # 上
    edge_mask[h - margin_y:h, :] = 255      # 下
    edge_mask[:, 0:margin_x] = 255          # 左
    edge_mask[:, w - margin_x:w] = 255      # 右

    # 排除物体区域
    if object_mask is not None:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        expanded = cv2.dilate(object_mask, kernel, iterations=2)
        edge_mask = cv2.bitwise_and(edge_mask, cv2.bitwise_not(expanded))

    edge_pixels = image[edge_mask > 0]

    # 采样太少则回退到四角
    if len(edge_pixels) < 100:
        corners = [
            image[0:margin_y*3, 0:margin_x*3],
            image[0:margin_y*3, w-margin_x*3:w],
            image[h-margin_y*3:h, 0:margin_x*3],
            image[h-margin_y*3:h, w-margin_x*3:w],
        ]
        edge_pixels = np.vstack([c.reshape(-1, 3) for c in corners if c.size > 0])

    if len(edge_pixels) == 0:
        return (255, 255, 255), False, 999.0

    mean_color = np.mean(edge_pixels, axis=0).astype(np.uint8)
    variance = float(np.mean(np.var(edge_pixels, axis=0)))
    is_uniform = variance < _BG_VARIANCE_THRESHOLD

    return tuple(mean_color.tolist()), is_uniform, variance


def _is_near_white(color: Tuple[int, int, int]) -> bool:
    """判断颜色是否接近白色。"""
    return all(c >= _BG_WHITE_THRESHOLD for c in color)


def _smart_fill(image: np.ndarray, mask: np.ndarray, method: str, radius: int) -> np.ndarray:
    """根据方法填充被移除物体的区域。"""
    result = image.copy()

    # 传统 inpaint
    if method == "telea":
        return cv2.inpaint(image, mask, max(1, radius), cv2.INPAINT_TELEA)
    if method == "ns":
        return cv2.inpaint(image, mask, max(1, radius), cv2.INPAINT_NS)

    # 强制白色
    if method == "white":
        result[mask > 0] = (255, 255, 255)
        return result

    # 自动检测或强制使用检测色
    bg_color, is_uniform, _ = _detect_background_color(image, mask)

    if method == "detected" or (method == "auto" and is_uniform):
        fill_color = (255, 255, 255) if _is_near_white(bg_color) else bg_color
        result[mask > 0] = fill_color
        return result

    # auto 模式下背景不统一：默认白色
    if method == "auto":
        result[mask > 0] = (255, 255, 255)
        return result

    return result


# ============================================================================
# 原有函数（保留不变）
# ============================================================================

def extract_sprite(image_path: str, contour: List[Tuple[int, int]]) -> str:
    """根据多边形轮廓裁剪元素并返回 PNG data URL。

    - image_path: 原图绝对路径；
    - contour: 像素坐标点序列；
    - 返回：`data:image/png;base64,<...>`。
    """

    if not image_path:
        raise ValueError("image_path is required")
    if not contour or len(contour) < 3:
        raise ValueError("contour must contain at least 3 points")

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"image not found: {image_path}")

    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    pts = np.array(contour, dtype=np.int32).reshape((-1, 1, 2))
    cv2.fillPoly(mask, [pts], 255)

    # 转 BGRA，并使用 mask 作为 alpha 通道
    if img.shape[2] == 4:
        bgra = img.copy()
        bgra[:, :, 3] = mask
    else:
        bgr = img if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
        bgra[:, :, 3] = mask

    # 裁剪到最小外接矩形，降低传输体积
    x, y, ww, hh = cv2.boundingRect(pts)
    cropped = bgra[y : y + hh, x : x + ww]

    ok, buf = cv2.imencode(".png", cropped)
    if not ok:
        raise RuntimeError("encode png failed")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ============================================================================
# 改进后的主函数
# ============================================================================

def inpaint_remove_objects(
    image_path: str,
    contours: List[List[Tuple[int, int]]],
    method: str = "auto",
    dilate: int = 5,
    radius: int = 5,
) -> str:
    """根据多个轮廓区域移除图像中的对象并填充背景，返回 PNG data URL。

    参数：
    - image_path: 原图绝对路径；
    - contours: 多个多边形轮廓的像素坐标点序列；
    - method: 填充方法：
      * "auto"（默认）：自动检测背景，统一则用检测色填充，否则用白色；
      * "white"：强制白色填充；
      * "detected"：强制使用检测到的背景色填充；
      * "telea"：传统 OpenCV Telea 算法；
      * "ns"：传统 OpenCV Navier-Stokes 算法。
    - dilate: 掩码膨胀核的尺寸（像素），用于覆盖边缘锯齿；
    - radius: 修复半径（像素），仅 telea/ns 使用。
    """

    if not image_path:
        raise ValueError("image_path is required")
    if not contours or all(len(c) < 3 for c in contours):
        raise ValueError("contours must contain at least one polygon with 3+ points")

    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"image not found: {image_path}")

    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for poly in contours:
        if not poly or len(poly) < 3:
            continue
        pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], 255)

    if dilate and dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(1, dilate), max(1, dilate)))
        mask = cv2.dilate(mask, k)

    clean = _smart_fill(img, mask, method, radius)

    ok, buf = cv2.imencode(".png", clean)
    if not ok:
        raise RuntimeError("encode png failed")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"