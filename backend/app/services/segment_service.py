"""
Segment Anything 分割服务（最小可用）
---------------------------------
功能：
- 在应用启动时加载 SAM 模型（CPU），并暴露预测函数：根据点击点坐标生成掩码；
- 将掩码通过 `mask_utils.extract_contour` 转换为轮廓坐标数组。

后续扩展：
- 支持框选、文本提示与多点融合；
- 支持返回多条轮廓与置信度；
- 根据设备配置切换到 GPU。
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image

from ..utils.mask_utils import extract_contour
from ..utils.logger import log
from ..config.settings import SAM_MODEL_TYPE, SAM_CHECKPOINT_PATH, SAM_DEVICE

_predictor = None  # SamPredictor 实例（懒加载）
_current_image_path: str | None = None  # 已设置到 predictor 的图片路径（用于避免重复 set_image）


def init_sam() -> None:
    """加载 SAM 模型到内存。默认使用 CPU。"""
    global _predictor
    try:
        from segment_anything import sam_model_registry, SamPredictor
    except Exception as e:
        log.error(f"segment-anything 未安装或导入失败: {e}")
        _predictor = None
        return

    ckpt = Path(SAM_CHECKPOINT_PATH)
    if not ckpt.exists():
        log.error(f"SAM 权重文件不存在: {ckpt}")
        _predictor = None
        return

    sam = sam_model_registry[SAM_MODEL_TYPE](checkpoint=str(ckpt))
    device = SAM_DEVICE  # 可按需切换 "cuda"
    sam.to(device)
    _predictor = SamPredictor(sam)
    log.info(f"SAM 模型已加载: type={SAM_MODEL_TYPE}, device={device}, ckpt={ckpt}")


def _ensure_image(image_path: str) -> int:
    """确保 predictor 已设置为该图片，并返回 embedding 耗时（毫秒）。

    - 若当前图片已在 predictor 中，则返回 0；
    - 若需重新设置图片，则计算 `set_image` 的耗时并返回。

    注意：SamPredictor 在调用一次 set_image 后，后续的 predict 会复用 embedding；
    因此对同一张图片的多次分割，不需要重复 set_image（可显著减少耗时）。
    """
    global _current_image_path
    if _predictor is None:
        raise RuntimeError("SAM 模型未加载，请检查权重路径与依赖安装")
    if _current_image_path == image_path:
        return 0
    import time
    t0 = time.perf_counter()
    img = np.array(Image.open(image_path).convert("RGB"))
    _predictor.set_image(img)
    _current_image_path = image_path
    ms = int((time.perf_counter() - t0) * 1000)
    log.debug(f"set_image done in {ms} ms: {image_path}")
    return ms


def segment_with_points(image_path: str, points: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """根据点击点坐标生成掩码并返回轮廓坐标。

    - image_path: 服务器本地图片路径
    - points: [(x, y), ...] 像素坐标
    """
    _ensure_image(image_path)

    if not points:
        # 无点时返回空
        return []

    pts = np.array(points)
    labels = np.ones((len(points),), dtype=np.int64)  # 所有点作为前景提示
    # 返回 (N, H, W) 掩码；此处取第一个得分最高的掩码
    import time
    t1 = time.perf_counter()
    masks, scores, _ = _predictor.predict(point_coords=pts, point_labels=labels, multimask_output=True)
    if masks is None or len(masks) == 0:
        return []
    best_idx = int(np.argmax(scores))
    mask = masks[best_idx]
    t2 = time.perf_counter()
    contour = extract_contour(mask.astype(np.uint8))
    log.info(f"segment(points) time: predict={int((t2-t1)*1000)}ms, contour={int((time.perf_counter()-t2)*1000)}ms, points={len(contour)}")
    return contour


def segment_with_box(image_path: str, box: Tuple[int, int, int, int]) -> List[Tuple[int, int]]:
    """根据框选提示生成掩码并返回轮廓坐标。

    - box: [x1, y1, x2, y2] 像素坐标（左上到右下）。
    """
    _ensure_image(image_path)

    x1, y1, x2, y2 = box
    # SAM 支持 box 提示
    import time
    t1 = time.perf_counter()
    # 对框选，关闭 multimask_output 以减少计算量（返回单掩码）
    masks, scores, _ = _predictor.predict(box=np.array([x1, y1, x2, y2]), multimask_output=False)
    if masks is None or len(masks) == 0:
        return []
    best_idx = int(np.argmax(scores))
    mask = masks[best_idx]
    t2 = time.perf_counter()
    contour = extract_contour(mask.astype(np.uint8))
    log.info(f"segment(box) time: predict={int((t2-t1)*1000)}ms, contour={int((time.perf_counter()-t2)*1000)}ms, points={len(contour)}")
    return contour


def preload_image(image_path: str) -> int:
    """对上传图片进行一次 embedding 预热，并返回耗时（毫秒）。

    该函数供路由在图片上传后调用，从而使用户在第一次点选/框选时无需再等待 embedding 计算。
    """
    try:
        ms = _ensure_image(image_path)
        # 统一日志（便于前后端排查性能）
        log.info(f"preload_image: image={image_path}, embed_ms={ms}")
        return ms
    except Exception as e:
        # 不中断上传流程；记录错误供排查
        log.error(f"preload_image failed: {e}")
        return -1