"""
物理模拟路由（含豆包多模态接入、元素参数聚合与精灵裁剪）
---------------------------------
功能：
- `/upload`：接收前端图片并保存到 `uploads/physics`，同步执行两步：
  1) 预热 SAM embedding（避免首次交互卡顿）；
  2) 调用豆包多模态分析图片，返回识别到的元素及耗时；
   响应包含：
   - `path`：图片保存路径；
   - `embed_ms`：预热耗时；
   - `ai_ms`：多模态识别耗时（失败时为 -1）；
   - `elements`：简化名称数组；
   - `elements_detailed`：规范化后的元素详情（含 `id`/`display_name`/`role`/`parameters`），对同名元素自动做 A/B 标注；
   - `analysis`：保留 `assumptions` 与 `confidence` 等额外信息；
   - `doubao_error`：当多模态调用异常时的错误信息。
- `/segment`：根据点或框选调用 SAM 生成掩码，提取轮廓坐标（像素坐标）。
- `/simulate`：接收图片路径、元素名称集合与各自轮廓坐标，使用 OpenCV 精准裁剪每个元素的精灵图，返回 `objects` 列表（含 `sprite_data_url` 与坐标）。

本次修改（刚体碰撞参数透传）：
- `/simulate` 增强：除名称与轮廓外，支持透传每个元素的 `role` 与 `parameters`（初速度、摩擦、弹性等），
  以便前端物理引擎在创建刚体时应用这些属性。

本次修改（动态物体消除 + 背景修复）：
- 在 `/simulate` 汇总所有 `role=dynamic` 的轮廓，调用 OpenCV inpaint 移除图中的动态物体并修复背景；
- 响应新增 `background_clean_data_url` 字段（PNG data URL），前端直接作为背景显示。

后续扩展：
- 在 `/simulate` 中整合几何参数提取与元素参数合并，返回给前端用作真实物理引擎模拟；
- 在 `/upload` 增加题目文本，以提升参数推断准确性。
"""

from fastapi import APIRouter, UploadFile, File
from typing import Dict, List
from uuid import uuid4

import numpy as np

from ..models.response_schema import ApiResponse
from ..models.physics_schema import PhysicsSegmentRequest, PhysicsSimulateRequest
from ..utils.file_utils import save_upload_file
from ..utils.logger import log
from ..services.segment_service import segment_with_points, segment_with_box, preload_image
from ..services.multimodal_service import analyze_physics_image
from ..services.opencv_service import extract_sprite, inpaint_remove_objects


router = APIRouter()


def _normalize_elements(full: Dict[str, object] | None) -> List[Dict[str, object]]:
    """将多模态返回的元素标准化，保留原始名称，不再对同名元素添加标注。

    2025-11-23 更新：
    - 新增 element_type 字段：决定前端交互行为（rigid_body/pendulum_bob/spring_constraint/spring_launcher/pivot/anchor/surface）
    - 新增 constraints 字段：包含约束关系信息（needs_pivot/needs_second_pivot/suggested_pivot/pivot_prompt/second_pivot_prompt/constraint_type）
    - 新增 visual_description 字段：大模型生成的视觉描述，帮助用户识别元素

    2025-11-25 更新（弹簧系统支持）：
    - element_type 新增 spring_constraint 和 spring_launcher 两种弹簧类型
    - constraints 新增 needs_second_pivot 和 second_pivot_prompt 字段，支持两端点选择
    - spring_constraint: 约束型弹簧，连接两个物体
    - spring_launcher: 弹射型弹簧，一端固定，另一端弹射物体
    """
    raw_list: List[object] = []
    allowed_types = {
        "rigid_body",
        "pendulum_bob",
        "spring_constraint",
        "spring_launcher",
        "pivot",
        "anchor",
        "surface",
        "conveyor_belt",
    }
    if isinstance(full, dict):
        tmp = full.get("elements", []) or []
        raw_list = tmp if isinstance(tmp, list) else []
    normalized: List[Dict[str, object]] = []
    for i, item in enumerate(raw_list):
        base_name = item.get("name") if isinstance(item, dict) else None
        base_name = base_name if isinstance(base_name, str) and base_name else "未知元素"
        role = item.get("role") if isinstance(item, dict) else None
        params = item.get("parameters") if isinstance(item, dict) else {}
        if not isinstance(params, dict):
            params = {}
        # 提取凹面体标识，由大模型判断
        is_concave = item.get("is_concave", False) if isinstance(item, dict) else False

        # 提取元素类型（element_type），决定前端交互行为
        # rigid_body: 普通刚体 | pendulum_bob: 摆球 | spring_constraint: 约束型弹簧 | spring_launcher: 弹射型弹簧 | pivot/anchor: 支点 | surface: 表面
        element_type = item.get("element_type", "rigid_body") if isinstance(item, dict) else "rigid_body"
        if element_type not in allowed_types:
            continue

        # 提取视觉描述，帮助用户在图片中识别元素
        visual_description = item.get("visual_description", "") if isinstance(item, dict) else ""

        # 提取约束关系信息
        constraints_raw = item.get("constraints", {}) if isinstance(item, dict) else {}
        if not isinstance(constraints_raw, dict):
            constraints_raw = {}

        # 标准化约束信息（2025-11-25 更新：添加弹簧系统的双端点支持）
        constraints = {
            # 是否需要用户选择第一个支点（pendulum_bob/spring_constraint/spring_launcher 应为 true）
            "needs_pivot": bool(constraints_raw.get("needs_pivot", False)),
            # 是否需要用户选择第二个支点（spring_constraint/spring_launcher 应为 true）
            "needs_second_pivot": bool(constraints_raw.get("needs_second_pivot", False)),
            # 大模型建议的支点元素名称
            "suggested_pivot": constraints_raw.get("suggested_pivot") or None,
            # 前端显示的第一个端点提示文案
            "pivot_prompt": constraints_raw.get("pivot_prompt") or None,
            # 前端显示的第二个端点提示文案（弹簧系统专用）
            "second_pivot_prompt": constraints_raw.get("second_pivot_prompt") or None,
            # 约束类型：pendulum/spring/rope/hinge/none
            "constraint_type": constraints_raw.get("constraint_type", "none") or "none",
        }

        if element_type == "pendulum_bob":
            constraints["needs_pivot"] = True
            constraints["needs_second_pivot"] = False
            constraints["constraint_type"] = "pendulum"
            if constraints.get("pivot_prompt") is None:
                constraints["pivot_prompt"] = "请选择摆球的支点"

        # 传送带类型规整与速度参数透传
        name_lower = str(base_name).lower()
        desc_lower = str(visual_description).lower()
        is_conveyor = (
            element_type == "conveyor_belt"
            or ("传送带" in base_name)
            or ("传送带" in visual_description)
            or ("conveyor" in name_lower)
            or ("conveyor" in desc_lower)
            or ("belt" in name_lower)
            or ("belt" in desc_lower)
        )
        if is_conveyor:
            element_type = "conveyor_belt"
            # 保持模型返回的 role，不在此强制静态
            sp = None
            for k in ("conveyor_speed", "belt_speed", "speed", "velocity"):
                v = params.get(k)
                if isinstance(v, (int, float)):
                    sp = float(v)
                    break
                if isinstance(v, str):
                    try:
                        sp = float(v)
                        break
                    except Exception:
                        pass
            if sp is not None:
                params["conveyor_speed"] = sp
            else:
                params.setdefault("conveyor_speed", 0.0)

        normalized.append({
            "id": f"{base_name}-{i}",
            "name": base_name,
            "display_name": base_name,
            "role": role or "unknown",
            "parameters": params,
            "is_concave": bool(is_concave),  # 凹面体标识，前端用于显示和物理引擎处理
            "element_type": element_type,     # 元素类型，决定前端交互行为
            "visual_description": visual_description,  # 视觉描述，帮助用户识别
            "constraints": constraints,       # 约束关系信息
        })
    return normalized


@router.post("/upload", response_model=ApiResponse)
async def upload_image(file: UploadFile = File(...)):
    """保存物理模拟图片，预热 embedding 并调用豆包分析，返回元素与耗时。

    返回字段说明：
    - `path`: 图片在后端的保存路径（字符串）。
    - `embed_ms`: 预热 embedding 的耗时（毫秒）。
    - `ai_ms`: 豆包多模态分析耗时（毫秒），当为 -1 表示调用失败或未启用。
    - `elements`: 模型识别到的元素名称数组（已做简化）。
    - `doubao_error`: 当调用异常时附带错误信息，方便前端直观展示问题来源。
    """
    save_path = save_upload_file("physics", file)
    log.info(f"Physics image saved: {save_path}")
    # 同步预热：计算该图片的 embedding，避免用户首次交互等待
    embed_ms = preload_image(str(save_path))
    # 同步调用豆包多模态分析（若失败不影响上传流程）
    ai_ms = -1
    elements: list[str] = []
    elements_detailed: list[Dict[str, object]] = []
    analysis: Dict[str, object] | None = None
    doubao_error: str | None = None
    try:
        ai_result = analyze_physics_image(str(save_path))
        ai_ms = int(ai_result.get("ai_ms", -1))
        elements = ai_result.get("elements", [])
        full = ai_result.get("full")
        elements_detailed = _normalize_elements(full)
        analysis = {
            "elements": elements_detailed,
            "assumptions": (full or {}).get("assumptions", []),
            "confidence": (full or {}).get("confidence"),
        }
        log.info(f"AI elements: {elements}")
    except Exception as e:
        log.error(f"AI 分析失败（忽略并继续）：{e}")
        doubao_error = str(e)

    return ApiResponse.ok({
        "path": str(save_path),
        "embed_ms": embed_ms,
        "ai_ms": ai_ms,
        "elements": elements,
        "elements_detailed": elements_detailed,
        "analysis": analysis,
        "doubao_error": doubao_error,
    })


@router.post("/segment", response_model=ApiResponse)
async def segment(req: PhysicsSegmentRequest):
    """调用 SAM 根据点击点或框选生成掩码并返回轮廓坐标。"""
    if not req.image_path:
        return ApiResponse.error("请先上传图片后再进行分割")

    try:
        contour = []
        if req.box:
            # 优先使用框选
            bx = tuple(int(v) for v in req.box)
            contour = segment_with_box(req.image_path, bx)
        else:
            # 退化为点提示
            pts = [(p.x, p.y) for p in (req.points or [])]
            contour = segment_with_points(req.image_path, pts)
    except Exception as e:
        log.error(f"SAM 分割失败: {e}")
        return ApiResponse.error("分割失败，请检查模型与依赖")

    log.info(f"Segment contour points: {len(contour)}")
    contour_dicts = [{"x": int(x), "y": int(y)} for (x, y) in contour]
    return ApiResponse.ok({"contour": contour_dicts})


@router.post("/simulate", response_model=ApiResponse)
async def simulate(req: PhysicsSimulateRequest):
    """接收图片路径、元素与各自轮廓坐标，返回模拟任务ID与裁剪后的精灵。"""
    task_id = f"sim-{uuid4().hex[:8]}"
    objects: List[Dict[str, object]] = []
    # 兼容两种元素输入形态：完整元素对象或简化字符串数组
    names: List[str] = []
    roles_in: List[str] = []
    params_in: List[Dict[str, object]] = []
    try:
        if isinstance(req.elements, list) and len(req.elements) > 0:
            # 完整元素对象
            for el in req.elements:
                nm = getattr(el, "name", None) or "elem"
                names.append(nm)
                roles_in.append(getattr(el, "role", None) or "unknown")
                p = getattr(el, "parameters", None)
                params_in.append(dict(p) if isinstance(p, dict) else (p.dict() if p is not None else {}))
        else:
            # 旧版：字符串名称数组 + 对齐的角色/参数列表
            names = list(req.elements_simple or [])
            roles_in = list(req.roles or [])
            params_in = list(req.parameters_list or [])
    except Exception:
        names = list(req.elements_simple or [])
        roles_in = list(req.roles or [])
        params_in = list(req.parameters_list or [])
    dyn_contours: List[List[tuple[int, int]]] = []
    try:
        for i, pts in enumerate(req.contours or []):
            # 兼容多形态：Point | dict{x,y} | (x,y)
            contour_xy = []
            for p in pts:
                try:
                    if hasattr(p, "x") and hasattr(p, "y"):
                        contour_xy.append((int(p.x), int(p.y)))
                    elif isinstance(p, dict):
                        contour_xy.append((int(p.get("x", 0)), int(p.get("y", 0))))
                    elif isinstance(p, (list, tuple)) and len(p) >= 2:
                        contour_xy.append((int(p[0]), int(p[1])))
                except Exception:
                    pass
            sprite_url = None
            try:
                if req.image_path:
                    sprite_url = extract_sprite(req.image_path, contour_xy)
            except Exception as e:
                log.error(f"extract_sprite failed: {e}")
            name = names[i] if i < len(names) else f"elem-{i}"
            role = None
            params = None
            # 兼容：角色与参数列表（或来自完整元素）
            if i < len(roles_in):
                role = roles_in[i]
            if i < len(params_in):
                params = params_in[i]

            objects.append({
                "name": name,
                "role": role or "unknown",
                "parameters": params or {},
                "sprite_data_url": sprite_url,
                "contour": [{"x": x, "y": y} for (x, y) in contour_xy],
            })
            # 收集需要从背景中移除的元素轮廓（动态物体 + 约束类元素如弹簧）
            # 2025-11-25 更新：弹簧的 role 为 "constraint"，也需要从背景中移除
            if contour_xy and ((role or "unknown") == "dynamic" or (role or "unknown") == "constraint"):
                dyn_contours.append(contour_xy)
    except Exception as e:
        log.error(f"simulate failed: {e}")
        return ApiResponse.error("模拟任务创建失败")

    background_clean = None
    try:
        if req.image_path and dyn_contours:
            background_clean = inpaint_remove_objects(req.image_path, dyn_contours)
    except Exception as e:
        log.error(f"inpaint background failed: {e}")

    payload: Dict[str, object] = {
        "simulation_id": task_id,
        "objects": objects,
        "background_clean_data_url": background_clean,
    }
    log.info(f"Create simulate task: id={task_id}, count={len(objects)}")
    return ApiResponse.ok(payload)
