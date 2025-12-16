/**
 * 物理模拟输入框组件（含豆包多模态识别展示与错误提示）
 * ---------------------------------
 * 功能：
 * - 支持点击/拖拽上传图片，上传到后端 `/physics/upload`；
 * - 后端在保存后同步执行：预热 SAM embedding 与豆包多模态分析，并返回 `embed_ms`、`ai_ms`、`elements`；
 * - 页面展示识别到的元素名称，引导用户进行框选确认；支持多次选择并为每次选择分配元素标签（滑块/斜面/地面）。
 * - 当豆包调用失败时，后端会返回 `doubao_error`，前端在状态行下展示友好提示；
 * - 用户在上传区域点击或框选，调用 `/physics/segment`，绘制返回轮廓；
 * - 右侧外部"开始模拟"按钮：将图片路径、元素与各自轮廓提交到 `/physics/simulate`，接收裁剪后的精灵并调用前端物理引擎。
 * - 初始化时调用 `/healthz` 显示后端状态。
 *
 * 说明：
 * - 识别到的元素仅用于指引（示例显示），最终仍需用户通过框选确认具体物体；
 * - 若 `ai_ms` 为 -1，表示当前图片的多模态分析失败或超时。
 *
 * 2025-11-23 更新（单摆/约束系统支持）：
 * ====================================
 * 核心概念：
 * - 交互模式（interactionMode）：'segment' | 'select_pivot'
 *   * segment: 正常的 SAM 分割模式，用户点击/框选进行物体分割
 *   * select_pivot: 支点选择模式，用户点击选择约束的支点（此时禁用 SAM 分割）
 *
 * - 特殊元素识别：
 *   * element_type === 'pendulum_bob': 摆球，需要选择支点
 *   * （已移除）单端弹簧 spring_end：统一改为双端弹簧
 *   * constraints.needs_pivot === true: 该元素需要用户选择支点
 *
 * - 约束关系（constraintRelations）：
 *   * 存储用户建立的约束关系：{ bodyName, pivotName, pivotPoint, constraintType, length }
 *   * 传递给物理引擎用于创建 Matter.Constraint
 *
 * 交互流程：
 * 1. 用户选择元素并完成 SAM 分割
 * 2. 用户点击元素标签进行分配
 * 3. 如果该元素 needs_pivot === true：
 *    a. 切换到 'select_pivot' 模式（禁用 SAM 监听）
 *    b. 显示提示让用户选择支点
 *    c. 用户点击画布选择支点位置
 *    d. 检测点击是否落在已分割元素区域内，或创建临时锚点
 *    e. 建立约束关系，切换回 'segment' 模式
 * 4. 如果该元素 needs_pivot === false：直接完成分配
 *
 * 扩展性设计：
 * - 新增特殊元素类型时，只需在 SPECIAL_ELEMENT_TYPES 中添加配置
 * - 每种类型定义自己的交互模式和处理函数
 */

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { health as apiHealth, uploadImage, segment, simulate } from '../api/physicsApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ErrorToast from './ErrorToast.jsx';
import SaveAnimationModal from './SaveAnimationModal.jsx';
import useAuthStore from '../store/authStore';
import { drawContour, clear, drawDragRect } from '../utils/drawMask.js';
import { runSimulation } from '../utils/physicsEngine.js';

// ============================================================================
// 特殊元素类型配置（扩展性设计）
// 新增特殊元素时，在此添加配置即可
//
// 2025-11-25 更新：添加弹簧系统支持
// - spring_constraint: 约束型弹簧，需要选择两个连接点
// - spring_launcher: 弹射型弹簧，需要选择固定点和弹射端
// ============================================================================
const SPECIAL_ELEMENT_TYPES = {
  // 摆球：需要选择支点
  pendulum_bob: {
    needsPivot: true,
    needsSecondPivot: false,  // 只需要一个支点
    interactionMode: 'select_pivot',
    defaultPrompt: '请点击选择该摆球的支点（悬挂点）',
    defaultSecondPrompt: null,
  },
  // 约束型弹簧：需要选择两个连接点
  spring_constraint: {
    needsPivot: true,
    needsSecondPivot: true,  // 需要两个端点
    interactionMode: 'select_spring_endpoints',
    defaultPrompt: '请点击选择弹簧的第一个连接点',
    defaultSecondPrompt: '请点击选择弹簧的第二个连接点',
  },
  // 弹射型弹簧：需要选择固定点和弹射端
  spring_launcher: {
    needsPivot: true,
    needsSecondPivot: true,  // 需要两个端点
    interactionMode: 'select_spring_endpoints',
    defaultPrompt: '请点击选择弹簧的固定支点（墙壁或固定物体）',
    defaultSecondPrompt: '请点击选择弹簧的弹射端连接点',
  },
  // 可在此添加更多特殊元素类型...
};

// ============================================================================
// 辅助函数：检查元素是否需要特殊交互
// 2025-11-25 更新：添加第二个端点的支持
// ============================================================================

// 检查元素是否需要第一个支点选择
const elementNeedsSpecialInteraction = (elem) => {
  if (!elem) return false;
  // 优先使用后端返回的 constraints.needs_pivot
  if (elem.constraints?.needs_pivot === true) return true;
  // 其次根据 element_type 判断
  const typeConfig = SPECIAL_ELEMENT_TYPES[elem.element_type];
  return typeConfig?.needsPivot === true;
};

// 检查元素是否需要第二个支点选择（弹簧系统专用）
const elementNeedsSecondPivot = (elem) => {
  if (!elem) return false;
  // 优先使用后端返回的 constraints.needs_second_pivot
  if (elem.constraints?.needs_second_pivot === true) return true;
  // 其次根据 element_type 判断
  const typeConfig = SPECIAL_ELEMENT_TYPES[elem.element_type];
  return typeConfig?.needsSecondPivot === true;
};

// 获取元素的第一个端点交互提示文案
const getElementPivotPrompt = (elem) => {
  if (!elem) return '请选择支点';
  // 优先使用后端返回的提示文案
  if (elem.constraints?.pivot_prompt) return elem.constraints.pivot_prompt;
  // 其次使用默认提示
  const typeConfig = SPECIAL_ELEMENT_TYPES[elem.element_type];
  return typeConfig?.defaultPrompt || '请选择支点';
};

// 获取元素的第二个端点交互提示文案（弹簧系统专用）
const getElementSecondPivotPrompt = (elem) => {
  if (!elem) return '请选择第二个连接点';
  // 优先使用后端返回的提示文案
  if (elem.constraints?.second_pivot_prompt) return elem.constraints.second_pivot_prompt;
  // 其次使用默认提示
  const typeConfig = SPECIAL_ELEMENT_TYPES[elem.element_type];
  return typeConfig?.defaultSecondPrompt || '请选择第二个连接点';
};

const PhysicsInputBox = forwardRef(({ animationSource }, ref) => {
  const [serverStatus, setServerStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [imagePreview, setImagePreview] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [contour, setContour] = useState([]);
  const [lastImageContour, setLastImageContour] = useState([]); // 原图坐标，用于提交后端
  const [imageNaturalSize, setImageNaturalSize] = useState({ w: 0, h: 0 });
  const [recognized, setRecognized] = useState([]); // 豆包识别到的元素名称数组
  const [recognizedDetailed, setRecognizedDetailed] = useState([]); // 详细元素（含 role/parameters/display_name）
  const [pendingElements, setPendingElements] = useState([]); // 待分配元素标签
  
  // 阶段一新增：下载动画功能相关状态
  const [canDownload, setCanDownload] = useState(false); // 是否显示下载按钮
  const [showSaveModal, setShowSaveModal] = useState(false); // 是否显示保存弹窗
  const [currentPlazaAnimationId, setCurrentPlazaAnimationId] = useState(null); // 当前广场动画ID
  const [assignments, setAssignments] = useState([]); // {label, name, role, parameters, contour}
  const [embedMs, setEmbedMs] = useState(null);
  const [aiMs, setAiMs] = useState(null);
  const [doubaoError, setDoubaoError] = useState('');

  // ============================================================================
  // 约束系统相关状态（2025-11-23 新增，2025-11-25 扩展支持弹簧系统）
  // ============================================================================

  // 交互模式：
  // - 'segment': SAM分割模式
  // - 'select_pivot': 支点选择模式（单摆专用，只需一个支点）
  // - 'select_first_endpoint': 选择第一个端点（弹簧系统）
  // - 'select_second_endpoint': 选择第二个端点（弹簧系统）
  const [interactionMode, setInteractionMode] = useState('segment');

  // 等待选择端点的元素信息
  // {
  //   element: 元素对象,
  //   contour: 该元素的轮廓,
  //   firstPrompt: 第一个端点提示文案,
  //   secondPrompt: 第二个端点提示文案（弹簧专用）,
  //   firstPoint: 第一个端点信息 { x, y, bodyName }（选择第二个端点时会用到）,
  //   needsSecondPoint: 是否需要第二个端点（弹簧为true，单摆为false）
  // }
  const [pendingPivotSelection, setPendingPivotSelection] = useState(null);

  // 约束关系列表，传递给物理引擎
  // [{
  //   bodyName,
  //   bodyContour,
  //   pivotName,
  //   pivotPoint,
  //   secondPivotName (弹簧专用),
  //   secondPivotPoint (弹簧专用),
  //   constraintType,
  //   stiffness,
  //   springType: 'constraint' | 'launcher' | null (弹簧专用)
  // }]
  const [constraintRelations, setConstraintRelations] = useState([]);
  
  // 记录最后一次鼠标操作的位置，用于弹窗定位
  const [lastMousePos, setLastMousePos] = useState(null);

  const uploadRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const simRef = useRef(null);
  const simulationCache = useRef(null); // 缓存模拟结果（避免重复OpenCV处理）
  const runningSimulation = useRef(null); // 当前运行的模拟实例（用于停止和清理）

  // 框选拖拽状态
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, y: 0 });

  // 阶段二新增：暴露给父组件的加载动画方法
  useImperativeHandle(ref, () => ({
    loadAnimation: (sceneData, plazaAnimationId = null) => {
      console.log('[PhysicsInputBox] loadAnimation 被调用，sceneData:', sceneData);
      
      if (!sceneData) {
        console.error('[PhysicsInputBox] sceneData 为空');
        alert('加载失败：动画数据为空');
        return;
      }

      try {
        // 【重要】先清理旧的模拟，避免刚体残留
        if (runningSimulation.current) {
          console.log('[PhysicsInputBox] 清理旧的模拟实例');
          runningSimulation.current.stop();
          runningSimulation.current = null;
        }

        // 清除画布上的绘制
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }

        // 恢复图片预览
        if (sceneData.imagePreview) {
          setImagePreview(sceneData.imagePreview);
          console.log('[PhysicsInputBox] 已恢复 imagePreview');
        }

        // 恢复图片尺寸
        if (sceneData.imageNaturalSize) {
          setImageNaturalSize(sceneData.imageNaturalSize);
          console.log('[PhysicsInputBox] 已恢复 imageNaturalSize:', sceneData.imageNaturalSize);
        }

        // 恢复图片路径
        if (sceneData.imagePath) {
          setImagePath(sceneData.imagePath);
          console.log('[PhysicsInputBox] 已恢复 imagePath:', sceneData.imagePath);
        }

        // 恢复物体数据（assignments）
        if (sceneData.objects) {
          setAssignments(sceneData.objects);
          console.log('[PhysicsInputBox] 已恢复 objects，数量:', sceneData.objects.length);
        }

        // 恢复约束关系
        if (sceneData.constraints) {
          setConstraintRelations(sceneData.constraints);
          console.log('[PhysicsInputBox] 已恢复 constraints，数量:', sceneData.constraints.length);
        }

        // 缓存数据，显示下载按钮
        simulationCache.current = sceneData;
        setCanDownload(true);
        
        // 记录广场动画ID（用于Fork）
        setCurrentPlazaAnimationId(plazaAnimationId);

        // 提示用户
        alert('✅ 动画已加载！点击"开始模拟"即可运行');
      } catch (error) {
        console.error('[PhysicsInputBox] 加载动画失败:', error);
        alert(`加载失败：${error.message}`);
      }
    }
  }));

  // 当图片加载或窗口变化时，同步 Canvas 尺寸
  const syncCanvasSize = () => {
    if (!canvasRef.current) return;
    const target = imgRef.current;
    if (target) {
      const w = target.clientWidth;
      const h = target.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = Math.max(1, Math.floor(w * dpr));
      canvasRef.current.height = Math.max(1, Math.floor(h * dpr));
      canvasRef.current.style.width = `${Math.max(1, w)}px`;
      canvasRef.current.style.height = `${Math.max(1, h)}px`;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  };

  useEffect(() => {
    // 健康检查
    apiHealth()
      .then((res) => setServerStatus(`后端状态：${res.status}`))
      .catch(() => setServerStatus('后端状态：连接失败'));

    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, []);

  // 将后端返回的坐标统一为 {x,y} 并映射到当前“图片显示区域”尺寸
  const toCanvasPoints = (rawPoints, rect) => {
    const arr = Array.isArray(rawPoints) ? rawPoints : [];
    const normalized = arr.map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p?.x ?? 0), y: Number(p?.y ?? 0) }));
    const canvasW = Math.floor(rect.width);
    const canvasH = Math.floor(rect.height);
    const naturalW = imageNaturalSize.w || canvasW;
    const naturalH = imageNaturalSize.h || canvasH;
    const scaleX = naturalW ? canvasW / naturalW : 1;
    const scaleY = naturalH ? canvasH / naturalH : 1;
    return normalized.map((pt) => ({ x: Math.round(pt.x * scaleX), y: Math.round(pt.y * scaleY) }));
  };

  // 将 Canvas 坐标转换为原图坐标（SAM 在原图尺寸上推理）
  const toImagePoint = (pt, rect) => {
    const canvasW = Math.floor(rect.width);
    const canvasH = Math.floor(rect.height);
    const naturalW = imageNaturalSize.w || canvasW;
    const naturalH = imageNaturalSize.h || canvasH;
    const scaleX = naturalW ? naturalW / canvasW : 1;
    const scaleY = naturalH ? naturalH / canvasH : 1;
    return { x: Math.round(pt.x * scaleX), y: Math.round(pt.y * scaleY) };
  };

  const toImageBox = (x1, y1, x2, y2, rect) => {
    const p1 = toImagePoint({ x: x1, y: y1 }, rect);
    const p2 = toImagePoint({ x: x2, y: y2 }, rect);
    return [p1.x, p1.y, p2.x, p2.y];
  };

  const onFilePicked = async (file) => {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      setImagePreview(localUrl);

      const resp = await uploadImage(file);
      const data = resp?.data || {};
      setImagePath(data?.path || '');
      setEmbedMs(typeof data?.embed_ms === 'number' ? data.embed_ms : null);
      setAiMs(typeof data?.ai_ms === 'number' ? data.ai_ms : null);
      setRecognized(Array.isArray(data?.elements) ? data.elements : []);
      const detailed = Array.isArray(data?.elements_detailed) ? data.elements_detailed : [];
      setRecognizedDetailed(detailed);
      setPendingElements(detailed);
      setDoubaoError(data?.doubao_error || '');
      simulationCache.current = null; // 新图片上传，清空缓存
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || '图片上传失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImageLoad = (ev) => {
    // 记录图片原始尺寸
    setImageNaturalSize({ w: ev.target.naturalWidth, h: ev.target.naturalHeight });
    // 同步画布尺寸
    syncCanvasSize();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    onFilePicked(file);
  };

  const handleClickUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev) => onFilePicked(ev.target.files[0]);
    input.click();
  };

  const handleMouseDown = (ev) => {
    if (!canvasRef.current) return;
    if (!imagePath) {
      setError('请先上传图片再进行点选/框选');
      return;
    }

    // ========================================================================
    // 根据交互模式决定行为（2025-11-25 更新：添加弹簧端点选择模式）
    // ========================================================================
    if (interactionMode === 'select_pivot' ||
        interactionMode === 'select_first_endpoint' ||
        interactionMode === 'select_second_endpoint') {
      // 端点选择模式：不启动拖拽，直接在 mouseUp 时处理点击
      // 这里不做任何操作，让 mouseUp 来处理端点选择
      return;
    }

    // segment 模式：正常的 SAM 分割拖拽逻辑
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(ev.clientX - rect.left);
    const y = Math.floor(ev.clientY - rect.top);
    setDragStart({ x, y });
    setDragEnd({ x, y });
    setDragging(true);
  };

  const handleMouseMove = (ev) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(ev.clientX - rect.left);
    const y = Math.floor(ev.clientY - rect.top);
    setDragEnd({ x, y });
    const ctx = canvasRef.current.getContext('2d');
    clear(ctx, Math.floor(rect.width), Math.floor(rect.height));
    // 绘制当前拖拽矩形
    const x1 = Math.min(dragStart.x, x);
    const y1 = Math.min(dragStart.y, y);
    const x2 = Math.max(dragStart.x, x);
    const y2 = Math.max(dragStart.y, y);
    drawDragRect(ctx, x1, y1, x2, y2);
  };

  // ============================================================================
  // 辅助函数：检测点击位置是否在某个轮廓内部
  // 使用射线法（Ray Casting Algorithm）判断点是否在多边形内部
  // ============================================================================
  const isPointInContour = (point, contourPoints) => {
    if (!contourPoints || contourPoints.length < 3) return false;
    let inside = false;
    const n = contourPoints.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = contourPoints[i].x, yi = contourPoints[i].y;
      const xj = contourPoints[j].x, yj = contourPoints[j].y;
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // ============================================================================
  // 辅助函数：计算轮廓的质心
  // ============================================================================
  const calculateContourCentroid = (contourPoints) => {
    if (!contourPoints || contourPoints.length === 0) return { x: 0, y: 0 };
    const sum = contourPoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / contourPoints.length, y: sum.y / contourPoints.length };
  };

  // ============================================================================
  // 辅助函数：计算两点之间的距离
  // ============================================================================
  const calculateDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // ============================================================================
  // 处理第一个端点选择（2025-11-25更新：支持单摆和弹簧）
  // @param isSpring - 是否是弹簧（true=需要第二个端点，false=单摆只需一个）
  // ============================================================================
  const handlePivotSelection = (clickPoint, imgRect, isSpring) => {
    if (!pendingPivotSelection) return;

    const { element, contour: bodyContour, needsSecondPoint } = pendingPivotSelection;
    const bodyName = element.display_name || element.name;

    // 将点击坐标转换为原图坐标
    const pivotPointImage = toImagePoint(clickPoint, imgRect);

    // 检查点击是否落在已分割的元素区域内
    let pivotName = null;
    let pivotElement = null;

    for (const assignment of assignments) {
      // 将已分配元素的轮廓转换为画布坐标进行比较
      const assignmentCanvasContour = toCanvasPoints(assignment.contour, imgRect);
      if (isPointInContour(clickPoint, assignmentCanvasContour)) {
        pivotName = assignment.label;
        pivotElement = assignment;
        break;
      }
    }

    // 判断：是否需要第二个端点（弹簧系统）
    if (needsSecondPoint || isSpring) {
      // 弹簧系统：保存第一个端点，等待第二个端点
      console.log(`[弹簧系统] 第一个端点: ${pivotName || '临时锚点'}`, pivotPointImage);

      setPendingPivotSelection(prev => ({
        ...prev,
        firstPoint: {
          x: pivotPointImage.x,
          y: pivotPointImage.y,
          bodyName: pivotName || '临时锚点',
          bodyElement: pivotElement
        }
      }));

      setInteractionMode('select_second_endpoint');
      setError('');
    } else {
      // 单摆系统：只需一个端点，直接创建约束
      const bodyCentroid = calculateContourCentroid(bodyContour);
      const length = calculateDistance(bodyCentroid, pivotPointImage);

      const newConstraint = {
        bodyName: bodyName,
        bodyContour: bodyContour,
        pivotName: pivotName || '临时锚点',
        pivotPoint: pivotPointImage,
        constraintType: element.constraints?.constraint_type || 'pendulum',
        stiffness: element.parameters?.constraint_stiffness ?? 1.0,
        length: length,
        springType: null
      };

      console.log('[约束系统] 建立单摆约束:', newConstraint);
      setConstraintRelations(prev => [...prev, newConstraint]);

      setPendingPivotSelection(null);
      setInteractionMode('segment');

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        const width = Math.floor(canvasRef.current.getBoundingClientRect().width);
        const height = Math.floor(canvasRef.current.getBoundingClientRect().height);
        clear(ctx, width, height);
      }

      if (pivotElement && elementNeedsSpecialInteraction(pivotElement)) {
        const hasConstraint = constraintRelations.some(c => c.bodyName === pivotName);
        if (!hasConstraint) {
          console.log(`[约束系统] 支点 "${pivotName}" 也需要选择支点`);
        }
      }
    }
  };

  // ============================================================================
  // 处理第二个端点选择（2025-11-25新增：弹簧系统专用）
  // ============================================================================
  const handleSecondPivotSelection = (clickPoint, imgRect) => {
    if (!pendingPivotSelection || !pendingPivotSelection.firstPoint) return;

    const { element, contour: bodyContour, firstPoint } = pendingPivotSelection;
    const bodyName = element.display_name || element.name;

    // 转换为原图坐标
    const secondPivotPointImage = toImagePoint(clickPoint, imgRect);

    // 检查是否落在已分割元素内
    let secondPivotName = null;
    for (const assignment of assignments) {
      const assignmentCanvasContour = toCanvasPoints(assignment.contour, imgRect);
      if (isPointInContour(clickPoint, assignmentCanvasContour)) {
        secondPivotName = assignment.label;
        break;
      }
    }

    console.log(`[弹簧系统] 第二个端点: ${secondPivotName || '临时锚点'}`, secondPivotPointImage);

    // 计算弹簧长度
    const springLength = calculateDistance(firstPoint, secondPivotPointImage);
    const springType = element.element_type === 'spring_launcher' ? 'launcher' : 'constraint';

    // 创建弹簧约束
    const newConstraint = {
      bodyName: bodyName,
      bodyContour: bodyContour,
      pivotName: firstPoint.bodyName,
      pivotPoint: { x: firstPoint.x, y: firstPoint.y },
      secondPivotName: secondPivotName || '临时锚点',
      secondPivotPoint: secondPivotPointImage,
      constraintType: 'spring',
      stiffness: element.parameters?.spring_stiffness ?? (springType === 'launcher' ? 200 : 100),
      damping: element.parameters?.spring_damping ?? 0.1,
      springLength: springLength,
      springType: springType
    };

    console.log('[弹簧系统] 建立弹簧约束:', newConstraint);
    setConstraintRelations(prev => [...prev, newConstraint]);

    setPendingPivotSelection(null);
    setInteractionMode('segment');
    setError('');

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      const width = Math.floor(canvasRef.current.getBoundingClientRect().width);
      const height = Math.floor(canvasRef.current.getBoundingClientRect().height);
      clear(ctx, width, height);
    }
  };

  const handleMouseUp = async (ev) => {
    if (!canvasRef.current || !imagePath) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const imgRect = imgRef.current?.getBoundingClientRect?.() || canvasRect;
    const x = Math.floor(ev.clientX - canvasRect.left);
    const y = Math.floor(ev.clientY - canvasRect.top);

    // ========================================================================
    // 端点选择模式：处理端点选择点击（2025-11-25 更新：支持弹簧的两次选择）
    // ========================================================================
    if (interactionMode === 'select_pivot') {
      // 单摆模式：只需一个支点
      handlePivotSelection({ x, y }, imgRect, false);
      return;
    }

    if (interactionMode === 'select_first_endpoint') {
      // 弹簧第一个端点选择
      handlePivotSelection({ x, y }, imgRect, true);
      return;
    }

    if (interactionMode === 'select_second_endpoint') {
      // 弹簧第二个端点选择
      handleSecondPivotSelection({ x, y }, imgRect);
      return;
    }

    // ========================================================================
    // segment 模式：正常的 SAM 分割逻辑
    // ========================================================================
    const start = dragStart;
    const end = { x, y };
    setDragEnd(end);
    setDragging(false);

    // 记录鼠标松开的位置用于弹窗定位
    setLastMousePos({ x, y });

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    const width = Math.floor(canvasRect.width);
    const height = Math.floor(canvasRect.height);
    const naturalW = imageNaturalSize.w || width;
    const naturalH = imageNaturalSize.h || height;

    setLoading(true);
    setError('');
    try {
      let resp;
      if (dist < 3) {
        // 近似单点点击
        const imgPt = toImagePoint(end, imgRect);
         // 使用原始图片尺寸传递给后端，避免按 Canvas 尺寸错误缩放
         resp = await segment({ image_path: imagePath, image_size: [naturalH, naturalW], points: [{ x: imgPt.x, y: imgPt.y }] });
      } else {
        // 框选
        const x1 = Math.min(start.x, end.x);
        const y1 = Math.min(start.y, end.y);
        const x2 = Math.max(start.x, end.x);
        const y2 = Math.max(start.y, end.y);
        const imgBox = toImageBox(x1, y1, x2, y2, imgRect);
         // 使用原始图片尺寸传递给后端，避免按 Canvas 尺寸错误缩放
         resp = await segment({ image_path: imagePath, image_size: [naturalH, naturalW], box: imgBox });
      }
      if (resp?.code !== 0) {
        throw new Error(resp?.message || 'segment failed');
      }
      console.log('segment resp', resp);
      const rawPts = resp?.data?.contour || [];
      const pts = toCanvasPoints(rawPts, imgRect);
      setContour(pts);
      setLastImageContour(rawPts.map((p) => ({ x: Number(p?.x ?? 0), y: Number(p?.y ?? 0) })));
      const ctx = canvasRef.current.getContext('2d');
      clear(ctx, width, height);
      drawContour(ctx, pts);
      if (!pts || pts.length === 0) {
        setError('未分割到轮廓，请调整框选或改用点选');
      }
    } catch (e) {
      console.error('segment error', e);
      setError(`分割失败：${e?.message || '请重试'}`);
    } finally {
      setLoading(false);
    }
  };

  const assignCurrentSelection = (elem, idx) => {
    if (!elem || !lastImageContour || lastImageContour.length === 0) return;

    // 创建分配对象，保存元素信息和轮廓
    const newAssignment = {
      label: elem.display_name || elem.name,
      name: elem.name,
      role: elem.role,
      parameters: elem.parameters || {},
      contour: lastImageContour,
      is_concave: elem.is_concave || false,  // 保存凹面体标识，用于显示和物理引擎
      element_type: elem.element_type || 'rigid_body',  // 元素类型
      constraints: elem.constraints || {},  // 约束信息
    };

    // 添加到已分配列表
    setAssignments((prev) => [...prev, newAssignment]);

    // 从待分配列表移除
    setPendingElements((prev) => prev.filter((_, i) => i !== idx));

    // 保存当前轮廓用于可能的支点选择
    const currentContour = [...lastImageContour];

    // 清除当前选择状态
    setContour([]);
    setLastImageContour([]);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      clear(ctx, canvasRef.current.width, canvasRef.current.height);
    }

    // ========================================================================
    // 检查该元素是否需要特殊交互（2025-11-25更新：支持弹簧的两次选择）
    // ========================================================================
    if (elementNeedsSpecialInteraction(elem)) {
      console.log(`[约束系统] 元素 "${elem.display_name || elem.name}" 需要选择端点`);

      // 获取提示文案
      const firstPrompt = getElementPivotPrompt(elem);
      const needsSecond = elementNeedsSecondPivot(elem);
      const secondPrompt = needsSecond ? getElementSecondPivotPrompt(elem) : null;

      // 设置等待端点选择的状态
      setPendingPivotSelection({
        element: { ...elem, ...newAssignment },
        contour: currentContour,
        firstPrompt: firstPrompt,
        secondPrompt: secondPrompt,
        needsSecondPoint: needsSecond,
        firstPoint: null  // 初始化为null
      });

      // 切换到对应的交互模式
      if (needsSecond) {
        // 弹簧系统：需要两个端点
        setInteractionMode('select_first_endpoint');
      } else {
        // 单摆系统：只需一个端点
        setInteractionMode('select_pivot');
      }

      setError('');
    }
  };

  // ============================================================================
  // 取消支点选择（用户可以跳过或取消）
  // ============================================================================
  const cancelPivotSelection = () => {
    console.log('[约束系统] 用户取消支点选择');
    setPendingPivotSelection(null);
    setInteractionMode('segment');
    setError('');
  };

  // 阶段三新增：处理下载/Fork 按钮点击
  const handleDownloadClick = async () => {
    const token = useAuthStore.getState().token;
    const isLoggedIn = useAuthStore.getState().isLoggedIn;

    if (!isLoggedIn || !token) {
      alert('请先登录后再保存动画');
      return;
    }

    // 判断是广场动画还是我的动画
    if (animationSource === 'plaza' && currentPlazaAnimationId) {
      // Fork 广场动画
      try {
        const response = await fetch(
          `http://localhost:8000/api/plaza/animations/${currentPlazaAnimationId}/fork`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        const data = await response.json();
        
        if (data.code === 0) {
          alert('✅ 已保存到我的动画！\n\n你可以在"我的动画"中查看和编辑。');
          // 清除广场动画标记
          setCurrentPlazaAnimationId(null);
        } else {
          alert(`保存失败：${data.message}`);
        }
      } catch (error) {
        console.error('Fork 动画失败:', error);
        alert(`保存失败：${error.message}`);
      }
    } else {
      // 保存/更新我的动画
      setShowSaveModal(true);
    }
  };

  const handleStartSimulate = async () => {
    setLoading(true);
    setError('');
    try {
      if (!imagePath) throw new Error('请先上传图片并完成元素选择');
      if (!assignments || assignments.length === 0) throw new Error('请至少选择一个元素');

      // 检查是否有未完成的支点选择
      if (interactionMode === 'select_pivot' && pendingPivotSelection) {
        throw new Error(`请先完成 "${pendingPivotSelection.element.label}" 的支点选择`);
      }

      const elements_simple = assignments.map((a) => a.label);
      const contours = assignments.map((a) => a.contour);
      const roles = assignments.map((a) => a.role);
      const parameters_list = assignments.map((a) => a.parameters || {});

      // ----------------------------------------------------------------------
      // 缓存机制：检查视觉相关属性是否变化（OpenCV处理只依赖这些）
      // ----------------------------------------------------------------------
      const currentVisualKey = JSON.stringify({
        path: imagePath,
        items: assignments.map(a => ({
          c: a.contour, // 轮廓坐标
          r: a.role,    // 角色（影响背景消除）
          ic: a.is_concave // 凹凸性
        }))
      });

      let serverObjects = [];
      let backgroundClean = null;
      let simId = '';

      if (simulationCache.current && simulationCache.current.key === currentVisualKey) {
        // 【缓存命中】直接使用上次的精灵图和背景，跳过后端调用
        console.log('[PhysicsInputBox] 命中缓存，跳过后端 OpenCV 处理');
        const cachedData = simulationCache.current.data;
        serverObjects = cachedData.objects || [];
        backgroundClean = cachedData.background_clean_data_url;
        simId = cachedData.simulation_id;
      } else {
        // 【缓存未命中】调用后端进行图像处理
        console.log('[PhysicsInputBox] 缓存未命中，调用后端处理');
        const resp = await simulate({ image_path: imagePath, elements_simple, contours, roles, parameters_list });
        
        serverObjects = Array.isArray(resp?.data?.objects) ? resp.data.objects : [];
        backgroundClean = resp?.data?.background_clean_data_url;
        simId = resp?.data?.simulation_id;

        // 更新缓存
        simulationCache.current = {
          key: currentVisualKey,
          data: resp.data
        };
      }

      // 提取前端已保存的 is_concave 标识，用于物理引擎判断凹凸性
      const is_concave_list = assignments.map((a) => a.is_concave || false);
      const objects = serverObjects.map((o, idx) => ({
        name: elements_simple[idx] || o?.name || `elem-${idx}`,
        role: o?.role ?? roles[idx] ?? 'unknown',
        // 关键修改：参数合并优先级翻转。
        // 优先使用前端当前的 parameters_list（用户可能修改了质量/摩擦力），
        // 只有当参数缺失时才回退到 serverObjects（后端返回的通常是旧值）。
        parameters: { ...(o?.parameters || {}), ...(parameters_list[idx] || {}) },
        contour: (o?.contour || contours[idx] || []),
        sprite_data_url: o?.sprite_data_url || null,
        is_concave: is_concave_list[idx] || false,  // 传递凹面体标识给物理引擎
      }));
      // 若后端提供"清理后的背景"，直接替换当前预览图为该背景
      if (backgroundClean) {
        setImagePreview(backgroundClean);
      }

      // ========================================================================
      // 将约束关系传递给物理引擎（2025-11-23 新增）
      // ========================================================================
      console.log('[约束系统] 传递约束关系给物理引擎:', constraintRelations);

      // 清理旧的模拟（如果存在）
      if (runningSimulation.current) {
        console.log('[PhysicsInputBox] 发现正在运行的模拟，正在清理...');
        runningSimulation.current.stop();
        runningSimulation.current = null;
      }

      const sim = runSimulation({
        container: simRef.current,
        objects,
        constraints: constraintRelations,  // 传递约束关系
        imageRect: imgRef.current?.getBoundingClientRect?.(),
        naturalSize: imageNaturalSize,
      });
      runningSimulation.current = sim; // 保存新的模拟实例

      // 阶段一新增：模拟成功后，将精灵图信息更新到 assignments 中
      console.log('[PhysicsInputBox] ========== 更新 assignments ==========');
      console.log('[PhysicsInputBox] 当前 assignments:', assignments);
      console.log('[PhysicsInputBox] objects（含精灵图）:', objects);
      
      const updatedAssignments = assignments.map((a, idx) => {
        const sprite = objects[idx]?.sprite_data_url;
        console.log(`[PhysicsInputBox] 元素 ${idx} (${a.label}):`, sprite ? '有精灵图' : '无精灵图');
        return {
          ...a,
          sprite_data_url: sprite || a.sprite_data_url
        };
      });
      
      console.log('[PhysicsInputBox] 更新后的 assignments:', updatedAssignments);
      console.log('[PhysicsInputBox] =====================================');
      
      setAssignments(updatedAssignments);
      
      // 显示下载按钮
      setCanDownload(true);

      alert(`${simId}\n${sim.summary}`);
    } catch (e) {
      setError(e?.message || '模拟创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div className="status-line">
        {serverStatus}
        {embedMs !== null && (
          <span style={{ marginLeft: 12 }}>embedding 预热：{embedMs} ms</span>
        )}
        {aiMs !== null && (
          <span style={{ marginLeft: 12 }}>多模态识别：{aiMs} ms</span>
        )}
      </div>

      {aiMs === -1 && (
        <div style={{ marginTop: 6, fontSize: 13, color: '#b45309', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '6px 10px' }}>
          多模态识别未启用或失败：{doubaoError || '请配置后端环境变量 ARK_API_KEY（豆包方舟平台）后重启后端'}
        </div>
      )}
      <div
        className="upload-area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        ref={uploadRef}
        onClick={!imagePreview ? handleClickUpload : undefined}
      >
        {imagePreview ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img
              ref={imgRef}
              src={imagePreview}
              alt="preview"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '100%',
                maxHeight: '100%',
                borderRadius: 24,
                pointerEvents: 'none',
              }}
              onLoad={handleImageLoad}
            />
            <canvas
              className="canvas-holder"
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, cursor: 'crosshair' }}
            />
            <div
              ref={simRef}
              style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
            />

            {/* 元素选择弹窗 (紧贴鼠标点击/松开位置右侧) */}
            {lastImageContour.length > 0 && pendingElements.length > 0 && canvasRef.current && lastMousePos && (() => {
               // 计算位置
               const rect = canvasRef.current.getBoundingClientRect();
               
               // 使用最后一次鼠标位置作为基准
               const { x: mouseX, y: mouseY } = lastMousePos;
               
               // 必须放在与 canvas 相同的坐标系容器中
               // 使用一个 overlay div 匹配 canvas 的位置和尺寸
               return (
                 <div style={{
                   position: 'absolute',
                   top: '50%',
                   left: '50%',
                   transform: 'translate(-50%, -50%)',
                   width: rect.width,
                   height: rect.height,
                   zIndex: 20,
                   pointerEvents: 'none', // 让点击穿透空白区域
                 }}>
                   <div style={{
                     position: 'absolute',
                     left: mouseX, // 定位到鼠标位置
                     top: mouseY,
                     marginLeft: 12, // 与鼠标指针的一点间距
                     pointerEvents: 'auto', // 恢复点击交互
                     
                     // 样式参考
                     backgroundColor: 'rgba(255, 255, 255, 0.95)',
                     border: '1px solid #e5e7eb',
                     borderRadius: 12,
                     padding: '8px 10px',
                     boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                     minWidth: 140,
                     display: 'flex',
                     flexDirection: 'column',
                     gap: 6,
                   }}>
                     <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>请选择元素：</div>
                     {pendingElements.map((e, i) => (
                        <button
                          key={(e.display_name || e.name) + i}
                          className="start-btn"
                          style={{
                            textAlign: 'left',
                            padding: '6px 10px',
                            fontSize: 13,
                            backgroundColor: e.is_concave ? '#fef3c7' : '#f8fafc',
                            borderColor: e.is_concave ? '#f59e0b' : '#e2e8f0',
                            width: '100%',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => assignCurrentSelection(e, i)}
                        >
                          {e.display_name || e.name}{e.is_concave ? '（凹面体）' : ''}
                        </button>
                      ))}
                   </div>
                 </div>
               );
            })()}

            {/* 阶段一/二新增：按钮放在画布右下角（内部） */}
            <div style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              zIndex: 30,
              pointerEvents: 'auto'
            }}>
              <button 
                className="start-btn" 
                onClick={handleStartSimulate} 
                disabled={loading || interactionMode === 'select_pivot'}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                }}
              >
                开始模拟 →
              </button>
              
              {canDownload && (
                <button 
                  className="start-btn"
                  onClick={handleDownloadClick}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                  }}
                >
                  {animationSource === 'plaza' ? '保存到我的' : '下载动画'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="upload-text">+ 请将图片上传到这里（点击或拖拽）</div>
        )}
      </div>

      {recognizedDetailed && recognizedDetailed.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <strong>识别到的元素：</strong>
          {recognizedDetailed.map((elem, idx) => (
            <span
              key={`${elem.name}-${idx}`}
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 12,
                backgroundColor: elem.is_concave ? '#fef3c7' : '#eef',  // 凹面体用黄色背景区分
                color: elem.is_concave ? '#92400e' : '#334',
                marginRight: 8,
              }}
            >
              {elem.display_name || elem.name}{elem.is_concave ? '（凹面体）' : ''}
            </span>
          ))}
          <span style={{ marginLeft: 8, color: '#666' }}>请在图中框选具体物体进行确认</span>
        </div>
      )}



      {/* 已分配的元素列表与完成进度 */}
      {assignments.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#334' }}>
          <strong>已选择：</strong>
          {assignments.map((a, i) => (
            <span
              key={a.label + i}
              style={{
                display: 'inline-block',
                marginRight: 8,
                padding: '2px 6px',
                borderRadius: 10,
                background: a.is_concave ? '#fef3c7' : (a.element_type === 'pendulum_bob' ? '#dbeafe' : '#e0f2fe'),  // 摆球用蓝色背景
                color: a.is_concave ? '#92400e' : '#0369a1',
              }}
            >
              {a.label}{a.is_concave ? '（凹面体）' : ''}{a.element_type === 'pendulum_bob' ? '🔗' : ''}
            </span>
          ))}
          <span style={{ marginLeft: 8, color: '#666' }}>完成 {assignments.length}/{recognizedDetailed.length}</span>
        </div>
      )}

      {/* ================================================================== */}
      {/* 端点选择提示面板（2025-11-25更新：支持弹簧的两次选择）               */}
      {/* ================================================================== */}
      {(interactionMode === 'select_pivot' ||
        interactionMode === 'select_first_endpoint' ||
        interactionMode === 'select_second_endpoint') &&
       pendingPivotSelection && (
        <div style={{
          marginTop: 8,
          padding: '10px 12px',
          border: '2px solid #3b82f6',
          borderRadius: 12,
          backgroundColor: '#eff6ff',
        }}>
          <div style={{ fontWeight: 'bold', color: '#1d4ed8', marginBottom: 6 }}>
            📍 {interactionMode === 'select_second_endpoint'
                  ? pendingPivotSelection.secondPrompt
                  : pendingPivotSelection.firstPrompt || pendingPivotSelection.pivotPrompt}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            {interactionMode === 'select_second_endpoint' ? (
              <>第一个端点已选择：{pendingPivotSelection.firstPoint?.bodyName}，现在选择第二个端点</>
            ) : (
              <>点击图片上的位置选择端点，或点击已分割的元素区域</>
            )}
            {pendingPivotSelection.element.constraints?.suggested_pivot && interactionMode !== 'select_second_endpoint' && (
              <span style={{ color: '#059669' }}>
                （建议：{pendingPivotSelection.element.constraints.suggested_pivot}）
              </span>
            )}
          </div>
          <button
            className="start-btn"
            style={{ backgroundColor: '#94a3b8', borderColor: '#64748b', fontSize: 12, padding: '4px 10px' }}
            onClick={cancelPivotSelection}
          >
            跳过选择
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* 约束关系显示（显示已建立的约束）                                     */}
      {/* ================================================================== */}
      {constraintRelations.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <strong>约束关系：</strong>
          {constraintRelations.map((c, i) => (
            <span
              key={`constraint-${i}`}
              style={{
                display: 'inline-block',
                marginRight: 8,
                padding: '2px 6px',
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #86efac',
              }}
            >
              {c.bodyName} → {c.pivotName}
            </span>
          ))}
        </div>
      )}


      {loading && <LoadingSpinner text="处理中..." />}
      <ErrorToast message={error} />
      
      {/* 阶段一新增：保存动画弹窗 */}
      <SaveAnimationModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        getSceneData={() => ({
          imagePreview,
          imageNaturalSize,
          imagePath,
          objects: assignments,  // 动态获取最新的 assignments（包含精灵图）
          constraints: constraintRelations
        })}
      />
    </div>
  );
});

export default PhysicsInputBox;
