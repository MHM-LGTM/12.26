# -*- coding: utf-8 -*-
"""
多模态物理分析服务（豆包 Ark）
---------------------------------
功能：
- 调用豆包多模态对话接口（OpenAI SDK 兼容）分析图片，识别参与模拟的元素并返回结构化参数；
- 支持本地图片通过 data URL 直接传入，无需外网托管；
- 解析模型输出的 JSON，提供标准化结果给路由层。

使用说明：
- 需在环境中设置 `ARK_API_KEY`，可选设置 `ARK_BASE_URL` 与 `DOUBAO_MODEL_ID`；
- 若模型输出含额外文本，服务会尝试提取首个 JSON 区块；
 - 返回包含耗时 `ai_ms` 与 `elements`（简化名称数组）及 `full`（完整结构）。
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

from ..config.settings import ARK_BASE_URL, ARK_API_KEY, DOUBAO_MODEL_ID
from ..utils.pictures_utils import image_to_data_url
from ..utils.prompt_utils import physics_analysis_system_prompt, build_user_prompt
from ..utils.logger import log


def _get_client():
    """创建 OpenAI 兼容客户端（豆包 Ark）。

    - 使用 `base_url` 指向方舟推理端点；
    - 从环境读取 `ARK_API_KEY`；
    - 若依赖缺失或密钥为空，抛出异常。
    """
    try:
        from openai import OpenAI
    except Exception as e:
        raise RuntimeError(f"openai SDK 未安装：{e}")
    if not ARK_API_KEY:
        raise RuntimeError("ARK_API_KEY 未设置，请在环境变量中提供豆包 API Key")
    return OpenAI(base_url=ARK_BASE_URL, api_key=ARK_API_KEY)


def _extract_json(text: str) -> Dict[str, Any]:
    """尽力从文本中提取 JSON 对象。

    - 优先直接解析整体文本；
    - 若失败，使用正则查找首个 `{...}` 区块再解析；
    - 若仍失败，返回空结构。
    """
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass
    # 兼容模型返回带注释/说明的情况
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        block = m.group(0)
        try:
            return json.loads(block)
        except Exception:
            log.warning("extract_json: 正则块解析失败")
    return {}


def _simplify_elements(full: Dict[str, Any]) -> List[str]:
    """将完整结构化结果压缩为元素名称数组，用于前端快速展示。"""
    arr = full.get("elements", []) if isinstance(full, dict) else []
    names: List[str] = []
    for item in arr:
        name = item.get("name") if isinstance(item, dict) else None
        if isinstance(name, str) and name:
            names.append(name)
    return names


def analyze_physics_image(image_path: str, user_text: Optional[str] = None) -> Dict[str, Any]:
    """调用豆包多模态分析物理场景并返回结构化结果。

    返回字典示例：
    {
      "ai_ms": 1532,
      "elements": ["斜面", "滑块", "地面"],
      "full": { ... 原始 JSON ... },
      "raw": "模型原始字符串"
    }
    """
    client = _get_client()
    data_url = image_to_data_url(image_path)
    system_prompt = physics_analysis_system_prompt()
    user_prompt = build_user_prompt(user_text)

    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=DOUBAO_MODEL_ID,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": user_prompt},
                    ],
                },
            ],
            temperature=0.2,
            # 关闭深度思考（thinking），与官方接入示例保持一致
            extra_body={"thinking": {"type": "disabled"}},
        )
    except Exception as e:
        log.error(f"Doubao 调用失败: {e}")
        raise
    ms = int((time.perf_counter() - t0) * 1000)

    # OpenAI SDK v1 风格：取首个 choice 的 message content
    raw_text = None
    try:
        raw_text = resp.choices[0].message.content
    except Exception:
        # 某些平台可能返回不同结构，保守处理
        raw_text = getattr(resp.choices[0], "text", None) or ""

    full = _extract_json(raw_text or "")
    elements = _simplify_elements(full)
    payload: Dict[str, Any] = {
        "ai_ms": ms,
        "elements": elements,
        "full": full,
        "raw": raw_text,
    }
    log.info(f"Doubao 分析完成: ai_ms={ms}ms, elements={elements}")
    return payload
