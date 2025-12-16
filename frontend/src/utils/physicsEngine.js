/**
 * =====================================================
 * 物理引擎模块 - physicsEngine.js
 * =====================================================
 *
 * 【文件概述】
 * 本文件是前端物理模拟的核心引擎，基于 Matter.js 库实现。
 * 负责将后端识别出的物体转换为物理刚体，并在画布上进行实时物理模拟。
 *
 * 【主要功能】
 * 1. 在原图上进行物理模拟：渲染画布与物体坐标严格按原图位置与比例对齐
 * 2. 将后端返回的物体数据（轮廓、物理属性）构造成 Matter.js 刚体
 * 3. 支持物体贴图（sprite）渲染
 * 4. 支持凹面体和凸面体的不同处理策略
 * 5. 自动添加边界墙防止物体飞出画布
 *
 * 【与其他文件的关系】
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        数据流向图                                │
 * └─────────────────────────────────────────────────────────────────┘
 *
 *  后端 (backend/app/)                    前端 (frontend/src/)
 *  ─────────────────                     ─────────────────────
 *
 *  routers/physics_router.py             api/physicsApi.js
 *         │                                     │
 *         │  返回 JSON 数据：                    │ 发起 HTTP 请求
 *         │  - objects 数组                     │
 *         │    - name: 物体名称                  │
 *         │    - role: 'static'/'dynamic'       │
 *         │    - contour: [{x,y}] 轮廓点         │
 *         │    - is_concave: 是否凹面体          │
 *         │    - parameters: 物理参数            │
 *         │    - sprite_data_url: 贴图          │
 *         │                                     │
 *         └─────────────────────────────────────┘
 *                          │
 *                          ▼
 *              components/PhysicsInputBox.jsx
 *                          │
 *                          │ 调用 runSimulation()
 *                          │ 传入参数：
 *                          │   - container: 画布容器 DOM
 *                          │   - objects: 物体数据数组
 *                          │   - imageRect: 图片位置信息
 *                          │   - naturalSize: 原图尺寸
 *                          │
 *                          ▼
 *              ┌───────────────────────┐
 *              │  physicsEngine.js     │  ← 当前文件
 *              │  (本文件)              │
 *              └───────────────────────┘
 *                          │
 *                          │ 使用
 *                          ▼
 *              ┌───────────────────────┐
 *              │    Matter.js 库        │
 *              │  (物理引擎核心)         │
 *              └───────────────────────┘
 *
 *
 * 【相关文件说明】
 *
 * 1. components/PhysicsInputBox.jsx
 *    - 调用方：用户上传图片后，获取后端分析结果，调用本文件的 runSimulation()
 *    - 提供 container（画布挂载点）、imageRect（图片位置）等参数
 *
 * 2. api/physicsApi.js
 *    - 负责与后端通信，获取物体识别结果
 *    - 返回的 objects 数组直接传递给本文件
 *
 * 3. backend/app/routers/physics_router.py
 *    - 后端入口，处理图片上传和物体识别
 *    - 返回的数据结构决定了本文件的输入格式
 *
 * 4. backend/app/services/opencv_service.py
 *    - 提取物体轮廓（contour）
 *    - 轮廓点格式：[{x: number, y: number}, ...]
 *
 * 5. backend/app/services/multimodal_service.py
 *    - 大模型分析物体属性（质量、速度、是否凹面体等）
 *    - 决定 is_concave 字段的值
 *
 * 6. utils/drawMask.js
 *    - 在 SAM 分割阶段绘制掩码
 *    - 与本文件配合，在同一画布区域工作
 *
 *
 * 【数据结构说明】
 *
 * 输入参数 objects 数组中每个元素的结构：
 * {
 *   name: string,              // 物体名称，如 "小球"、"斜坡"
 *   role: 'static' | 'dynamic', // 物体类型：静态（不动）或动态（受重力影响）
 *   contour: [{x, y}, ...],    // 轮廓点数组（原图坐标系）
 *   is_concave: boolean,       // 是否为凹面体（由大模型判断）
 *   sprite_data_url: string,   // Base64 贴图数据（可选）
 *   parameters: {              // 物理参数
 *     mass_kg: number,                    // 质量（千克）
 *     restitution: number,                // 弹性系数 (0-1)
 *     friction_coefficient: number,       // 摩擦系数
 *     air_drag: number,                   // 空气阻力
 *     initial_velocity_px_s: number,      // X方向初速度（像素/秒）
 *     initial_velocity_y_px_s: number,    // Y方向初速度（像素/秒）
 *     initial_angular_velocity_rad_s: number, // 角速度（弧度/秒）
 *   }
 * }
 *
 *
 * 【凹面体处理策略】
 *
 * Matter.js 原生不支持凹多边形碰撞检测，本文件采用以下策略：
 *
 * 1. 凹凸性判断：完全由后端大模型负责，通过 is_concave 字段传递
 *
 * 2. 静态凹面体：使用"三角形扇形分解法"
 *    - 计算多边形质心
 *    - 从质心向每条边创建三角形
 *    - 所有三角形组成一个 Composite（组合体）
 *    - 每个三角形都是静态刚体，整体模拟凹形碰撞
 *
 * 3. 动态凹面体：使用凸包近似
 *    - 因为多个独立三角形无法保持刚性运动（会散开）
 *    - 所以动态凹面体使用凸包近似，牺牲碰撞精度换取稳定性
 *
 *
 * 【后期扩展指南】
 *
 * 如需添加新功能，建议在以下位置添加代码：
 *
 * 1. 新的辅助函数 → 添加在 "==================== 辅助函数 ====================" 区域
 * 2. 新的物理属性处理 → 修改 applyPhysicsProperties() 函数
 * 3. 新的物体创建逻辑 → 在 runSimulation() 的 "物体创建逻辑" 区域添加
 * 4. 新的渲染效果 → 修改 Matter.Render 的 options 或物体的 render 属性
 * 5. 事件监听（如碰撞检测）→ 在 runSimulation() 返回前添加 Events.on() 监听
 *
 */

import Matter from 'matter-js';


// ╔═══════════════════════════════════════════════════════════════════╗
// ║                         辅助函数区域                               ║
// ║  包含几何计算、轮廓处理等工具函数                                    ║
// ║  这些函数被主函数 runSimulation() 调用                             ║
// ╚═══════════════════════════════════════════════════════════════════╝


/**
 * 计算多边形面积
 * -------------
 * 【功能】使用 Shoelace 公式（鞋带公式）计算多边形面积
 * 【用途】用于计算物体密度（density = mass / area）
 * 【调用位置】applyPhysicsProperties() 函数中
 *
 * 【数学原理】
 * Shoelace 公式：Area = 0.5 * |Σ(x[i] * y[i+1] - x[i+1] * y[i])|
 * 这是计算简单多边形面积的经典算法
 *
 * @param {Array} points - 多边形顶点数组 [{x: number, y: number}, ...]
 * @returns {number} - 多边形面积（像素平方）
 */
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;  // 下一个顶点索引（循环）
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}


/**
 * 计算多边形质心（几何中心）
 * -------------------------
 * 【功能】计算多边形所有顶点的平均位置
 * 【用途】
 *   1. 三角形扇形分解时作为扇形中心点
 *   2. 物体定位参考点
 * 【调用位置】decomposeToTriangleFan() 函数中
 *
 * 【注意】这是简化的质心计算（顶点平均），不是精确的面积质心
 *        对于物理模拟来说足够精确
 *
 * @param {Array} points - 顶点数组 [{x: number, y: number}, ...]
 * @returns {{x: number, y: number}} - 质心坐标
 */
function calculateCentroid(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };

  // 累加所有顶点坐标
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );

  // 返回平均值作为质心
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}


/**
 * 生成凸包（Convex Hull）
 * ----------------------
 * 【功能】将任意多边形转换为其凸包（最小凸多边形）
 * 【用途】动态凹面体的近似处理
 * 【调用位置】createConvexHullBody() 函数中
 *
 * 【原理】
 * 凸包是包含所有给定点的最小凸多边形
 * 想象用橡皮筋包裹所有点，橡皮筋的形状就是凸包
 *
 * 【限制】
 * 使用凸包会丢失凹陷部分的碰撞精度
 * 但对于动态物体，这是保持物理稳定性的必要妥协
 *
 * @param {Array} points - 原始顶点数组
 * @returns {Array} - 凸包顶点数组（坐标取整）
 */
function toConvexHull(points) {
  // 使用 Matter.js 内置的凸包算法
  const verts = Matter.Vertices.create(points, Matter);
  const hull = Matter.Vertices.hull(verts);

  // 坐标取整，避免浮点误差
  return hull.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) }));
}


/**
 * 三角形扇形分解（处理凹多边形的核心算法）
 * ----------------------------------------
 * 【功能】将凹多边形分解为多个三角形
 * 【用途】静态凹面体的碰撞检测
 * 【调用位置】runSimulation() 中静态凹面体处理分支
 *
 * 【原理】
 *
 *         P1
 *        /  \
 *       / T1 \
 *      /      \
 *    P0---C----P2     C = 质心
 *      \      /       T1 = 三角形 (C, P0, P1)
 *       \ T2 /        T2 = 三角形 (C, P1, P2)
 *        \  /         ... 以此类推
 *         P3
 *
 * 步骤：
 * 1. 计算多边形的质心 C
 * 2. 对于每条边 (P[i], P[i+1])，创建三角形 (C, P[i], P[i+1])
 * 3. 所有三角形组合起来完整覆盖多边形区域
 *
 * 【优点】
 * - 三角形是最简单的凸多边形，Matter.js 处理非常稳定
 * - 不依赖复杂的凸分解算法（如 poly-decomp 库）
 * - 适用于任意形状的凹多边形
 *
 * 【限制】
 * - 只适用于静态物体（三角形组合不能作为刚性整体运动）
 *
 * @param {Array} points - 多边形顶点数组 [{x: number, y: number}, ...]
 * @returns {Array} - 三角形数组，每个元素是包含三个顶点的数组
 */
function decomposeToTriangleFan(points) {
  if (!points || points.length < 3) return [];

  // 步骤1：计算质心作为扇形中心
  const centroid = calculateCentroid(points);

  // 步骤2：从质心向每条边创建三角形
  const triangles = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];                         // 当前顶点
    const p2 = points[(i + 1) % points.length];   // 下一个顶点（循环）

    // 创建三角形：质心 -> 当前顶点 -> 下一个顶点
    // 顺序很重要，决定了三角形的朝向
    triangles.push([
      { x: centroid.x, y: centroid.y },
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
    ]);
  }

  return triangles;
}


/**
 * 计算三角形的质心
 * ----------------
 * 【功能】计算三角形三个顶点的平均位置
 * 【用途】创建三角形刚体时确定中心点位置
 * 【调用位置】runSimulation() 中三角形刚体创建
 *
 * @param {Array} triangle - 三个顶点的数组 [{x, y}, {x, y}, {x, y}]
 * @returns {{x: number, y: number}} - 三角形质心
 */
function triangleCentroid(triangle) {
  return {
    x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3,
    y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3,
  };
}


/**
 * 预处理轮廓点
 * ------------
 * 【功能】清理和优化轮廓点数据
 * 【用途】确保轮廓数据质量，避免 Matter.js 创建刚体失败
 * 【调用位置】runSimulation() 中物体创建前
 *
 * 【处理内容】
 * 1. 移除重复点（距离小于1像素的点视为重复）
 * 2. 确保至少有3个顶点（形成有效多边形）
 *
 * 【为什么需要】
 * 后端 OpenCV 提取的轮廓可能包含：
 * - 过于密集的点（相邻点几乎重合）
 * - 由于图像处理产生的重复点
 * 这些问题会导致 Matter.js 创建刚体失败或物理模拟不稳定
 *
 * @param {Array} points - 原始轮廓点
 * @returns {Array} - 处理后的轮廓点
 */
function preprocessContour(points) {
  if (points.length < 3) return points;

  // 移除重复点（距离小于1像素的点视为重复）
  const unique = [points[0]];  // 保留第一个点
  for (let i = 1; i < points.length; i++) {
    const prev = unique[unique.length - 1];  // 上一个有效点
    const curr = points[i];                   // 当前点

    // 计算两点之间的欧几里得距离
    const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);

    // 只有距离大于1像素的点才保留
    if (dist > 1) {
      unique.push(curr);
    }
  }

  // 如果处理后顶点不足3个，返回原始数据（让后续逻辑处理）
  return unique.length >= 3 ? unique : points;
}


// ╔═══════════════════════════════════════════════════════════════════╗
// ║                         主函数区域                                 ║
// ║  runSimulation() 是本文件的唯一导出函数                             ║
// ║  由 PhysicsInputBox.jsx 调用                                      ║
// ╚═══════════════════════════════════════════════════════════════════╝


/**
 * 运行物理模拟（主入口函数）
 * =========================
 *
 * 【功能】创建 Matter.js 物理世界，添加物体和约束，启动模拟
 *
 * 【调用方式】
 * 在 PhysicsInputBox.jsx 中：
 * ```javascript
 * import { runSimulation } from '@/utils/physicsEngine';
 *
 * runSimulation({
 *   container: canvasContainerRef.current,
 *   objects: responseData.objects,
 *   constraints: constraintRelations,  // 约束关系数组（2025-11-23 新增）
 *   imageRect: imageElement.getBoundingClientRect(),
 *   naturalSize: { w: image.naturalWidth, h: image.naturalHeight }
 * });
 * ```
 *
 * 【参数说明】
 * @param {Object} options - 配置对象
 * @param {HTMLElement} options.container - 画布挂载容器
 *        - 应该是一个绝对定位的 div，与图片在同一父容器中
 *        - 画布会被添加为该容器的子元素
 *
 * @param {Array} options.objects - 物体数据数组
 *        - 来自后端 /physics/analyze 接口的响应
 *        - 每个物体包含轮廓、物理属性、贴图等信息
 *        - 详细结构见文件头部的"数据结构说明"
 *
 * @param {Array} options.constraints - 约束关系数组（2025-11-23 新增）
 *        - 每个约束包含：{ bodyName, pivotName, pivotPoint, constraintType, stiffness, length }
 *        - 用于创建 Matter.Constraint 实现单摆、弹簧等约束
 *
 * @param {DOMRect} options.imageRect - 图片在页面上的位置和尺寸
 *        - 通过 img.getBoundingClientRect() 获取
 *        - 用于将画布精确定位到图片上方
 *
 * @param {Object} options.naturalSize - 原图的原始尺寸
 *        - { w: 原图宽度, h: 原图高度 }
 *        - 用于计算坐标缩放比例（后端轮廓使用原图坐标）
 *
 * @returns {Object} - 返回模拟状态摘要 { summary: string }
 */
export function runSimulation({ container, objects = [], constraints = [], imageRect, naturalSize = { w: 0, h: 0 } }) {

  // ────────────────────────────────────────────────────────────────
  // 第一部分：布局计算
  // 计算画布尺寸、位置偏移、坐标缩放比例
  // ────────────────────────────────────────────────────────────────

  // 获取容器的位置信息（用于计算画布相对于容器的偏移）
  const containerRect = container?.getBoundingClientRect?.() || {
    left: 0, top: 0, width: 640, height: 360
  };

  // 获取图片的位置信息（画布需要覆盖在图片上方）
  const imgRect = imageRect || containerRect;

  // 计算画布尺寸（与图片显示尺寸相同）
  // Math.floor 确保像素值为整数，Math.max(1, ...) 防止零尺寸
  const width = Math.max(1, Math.floor(imgRect.width || 640));
  const height = Math.max(1, Math.floor(imgRect.height || 360));

  // 计算画布相对于容器的偏移量
  // 这确保画布精确覆盖在图片上方
  const offX = Math.round((imgRect.left || 0) - (containerRect.left || 0));
  const offY = Math.round((imgRect.top || 0) - (containerRect.top || 0));

  // 计算坐标缩放比例
  // 后端轮廓坐标是基于原图尺寸的，需要缩放到当前显示尺寸
  // sx = 显示宽度 / 原图宽度
  // sy = 显示高度 / 原图高度
  const sx = naturalSize.w ? width / naturalSize.w : 1;
  const sy = naturalSize.h ? height / naturalSize.h : 1;


  // ────────────────────────────────────────────────────────────────
  // 第二部分：Matter.js 初始化
  // 创建物理引擎、渲染器、运行器
  // ────────────────────────────────────────────────────────────────

  // 从 Matter 解构需要的模块
  const Engine = Matter.Engine;       // 物理引擎核心
  const Render = Matter.Render;       // 渲染器（负责画布绑定）
  const Runner = Matter.Runner;       // 运行器（负责更新循环）
  const Composite = Matter.Composite; // 组合体管理（世界、物体组）
  const Bodies = Matter.Bodies;       // 刚体创建工厂
  const Vertices = Matter.Vertices;   // 顶点操作工具
  const Body = Matter.Body;           // 刚体属性操作
  const Events = Matter.Events;       // 事件系统（帧更新/碰撞）

  // 创建物理引擎实例
  // engine.world 是物理世界，所有物体都添加到这里
  const engine = Engine.create();

  // 创建渲染器实例
  // 渲染器会创建一个 canvas 元素并添加到 container 中
  const render = Render.create({
    element: container || document.body,  // 画布挂载点
    engine,                               // 关联的物理引擎
    options: {
      width,                    // 画布宽度
      height,                   // 画布高度
      wireframes: false,        // 关闭线框模式，使用填充/贴图渲染
      background: 'transparent' // 透明背景，让底下的图片可见
    },
  });

  // ────────────────────────────────────────────────────────────────
  // 第三部分：画布定位
  // 将渲染画布精确定位到图片区域
  // ────────────────────────────────────────────────────────────────

  if (render?.canvas?.style) {
    render.canvas.style.position = 'absolute';     // 绝对定位
    render.canvas.style.left = `${offX}px`;        // 水平偏移
    render.canvas.style.top = `${offY}px`;         // 垂直偏移
    render.canvas.style.pointerEvents = 'none';    // 不拦截鼠标事件（让用户可以操作底下的元素）
  }


  // ────────────────────────────────────────────────────────────────
  // 第四部分：物体创建逻辑
  // 遍历后端返回的物体数组，为每个物体创建对应的 Matter.js 刚体
  // ────────────────────────────────────────────────────────────────

  // 标记是否存在静态物体
  // 如果没有静态物体，后面会自动添加边界墙
  let hasStatic = false;

  // ============================================================================
  // 物体名称到刚体的映射表（2025-11-23 新增，用于约束创建）
  // 存储 { 物体名称: Matter.Body 实例 }
  // ============================================================================
  const bodiesMap = {};
  const conveyorParams = new Map(); // 记录传送带参数：name -> { speed }

  // 遍历所有物体
  objects.forEach((obj) => {
    // ──────────────────────────────────────────────────────────────
    // 跳过约束类型元素（如弹簧）：约束只创建 Constraint，不创建 Body
    // 弹簧的 role 为 "constraint"，不应被创建为物理刚体
    // ──────────────────────────────────────────────────────────────
    if (obj.role === 'constraint') {
      console.log(`[物理引擎] 跳过约束元素（不创建刚体）: ${obj.name || '未命名'}`);
      return;
    }

    // 获取原始轮廓点
    const raw = Array.isArray(obj.contour) ? obj.contour : [];

    // 轮廓点不足3个无法形成多边形，跳过
    if (raw.length < 3) return;

    // ──────────────────────────────────────────────────────────────
    // 步骤1：缩放轮廓点到画布坐标系
    // 后端轮廓是原图坐标，需要乘以缩放比例转换到显示坐标
    // ──────────────────────────────────────────────────────────────
    const scaled = raw.map((p) => ({
      x: Math.round(p.x * sx),  // 原图X坐标 * 缩放比例
      y: Math.round(p.y * sy)   // 原图Y坐标 * 缩放比例
    }));

    // ──────────────────────────────────────────────────────────────
    // 步骤2：预处理轮廓（移除重复点等）
    // ──────────────────────────────────────────────────────────────
    const processed = preprocessContour(scaled);
    if (processed.length < 3) return;  // 处理后顶点不足，跳过

    // ──────────────────────────────────────────────────────────────
    // 步骤3：获取物体属性
    // - is_concave: 是否凹面体（由后端大模型判断）
    // - isStatic: 是否静态物体（role === 'static'）
    // ──────────────────────────────────────────────────────────────
    const isConcave = obj.is_concave === true;
    const isStatic = obj.role === 'static';
    if (isStatic) hasStatic = true;

    // ──────────────────────────────────────────────────────────────
    // 步骤4：提取物理参数
    // 这些参数来自后端大模型对物体的分析
    // ──────────────────────────────────────────────────────────────
    const restitution = Number(obj?.parameters?.restitution ?? 0.0);           // 弹性系数 (0-1)
    const friction = Number(obj?.parameters?.friction_coefficient ?? 0.2);     // 摩擦系数
    const air = Number(obj?.parameters?.air_drag ?? 0.0);                      // 空气阻力

    // ──────────────────────────────────────────────────────────────
    // 步骤5：根据凹凸性和静态/动态选择不同的创建策略
    //
    // 决策树：
    //           是凹面体？
    //          /         \
    //        否           是
    //        |           /  \
    //     凸多边形   静态？  动态？
    //      直接创建     |       |
    //              三角形   凸包近似
    //              分解
    // ──────────────────────────────────────────────────────────────

    if (!isConcave) {
      // ═══════════════════════════════════════════════════════════
      // 情况A：凸多边形 - 直接创建单个刚体
      // Matter.js 原生支持凸多边形，直接使用 Bodies.fromVertices
      // ═══════════════════════════════════════════════════════════

      const verts = Vertices.create(processed, Matter);
      const center = Matter.Vertices.centre(verts);  // 计算顶点集的中心

      // 使用 Bodies.fromVertices 创建刚体
      const body = Bodies.fromVertices(center.x, center.y, verts, {
        isStatic,               // 是否静态
        friction,               // 摩擦系数
        frictionStatic: 0.5,    // 静摩擦系数
        frictionAir: air,       // 空气阻力
        restitution,            // 弹性系数
        render: obj.sprite_data_url
          // 如果有贴图，使用贴图渲染
          ? { sprite: { texture: obj.sprite_data_url, xScale: sx, yScale: sy } }
          // 否则使用纯色填充（静态灰色，动态蓝色）
          : { fillStyle: isStatic ? '#94a3b8' : '#60a5fa' },
      });

      if (body) {
        // 应用额外的物理属性（质量、初速度等）
        applyPhysicsProperties(body, obj, processed, isStatic, Body);
        // 将刚体添加到物理世界
        Composite.add(engine.world, body);
        // 添加到映射表，用于约束创建
        const bodyName = obj.name || `body-${Object.keys(bodiesMap).length}`;
        bodiesMap[bodyName] = body;
        // 识别并记录传送带参数（静态物体 + conveyor_speed）
        const speed = Number(obj?.parameters?.conveyor_speed ?? NaN);
        const isConveyor = !isNaN(speed) || String(obj?.element_type || '').toLowerCase() === 'conveyor_belt';
        if (isStatic && isConveyor) {
          body.label = 'conveyor';
          conveyorParams.set(bodyName, { speed: isNaN(speed) ? 0 : speed });
        }
        console.log(`[物理引擎] 凸多边形创建成功: ${bodyName}`);
      }

    } else if (isStatic) {
      // ═══════════════════════════════════════════════════════════
      // 情况B：静态凹面体 - 三角形扇形分解
      //
      // 原理：将凹多边形分解为多个三角形，每个三角形是独立的静态刚体
      //       这些三角形组成一个 Composite（组合体），共同模拟凹形碰撞
      //
      // 为什么可行：
      // - 静态物体不需要运动，所以多个三角形不需要保持相对位置
      // - 每个三角形独立处理碰撞，组合起来实现凹形碰撞检测
      // ═══════════════════════════════════════════════════════════

      const triangles = decomposeToTriangleFan(processed);

      // 分解失败时回退到凸包方案
      if (triangles.length === 0) {
        console.warn(`[物理引擎] 三角形分解失败，回退到凸包: ${obj.name || '未命名'}`);
        createConvexHullBody(processed, obj, isStatic, friction, air, restitution, sx, sy, Bodies, Vertices, Body, Composite, engine);
        return;
      }

      // 创建 Composite 容器，用于组织所有三角形
      // Composite 是 Matter.js 中组织多个物体的方式
      const concaveComposite = Composite.create({
        label: `凹面体-${obj.name || '未命名'}`
      });

      // 为每个三角形创建独立的刚体
      triangles.forEach((tri, idx) => {
        const triCenter = triangleCentroid(tri);           // 三角形质心
        const triVerts = Vertices.create(tri, Matter);     // 三角形顶点

        const triBody = Bodies.fromVertices(triCenter.x, triCenter.y, triVerts, {
          isStatic: true,       // 静态凹面体的所有三角形都是静态的
          friction,
          frictionStatic: 0.5,
          restitution,
          render: {
            // 三角形使用统一的填充色
            // 不使用 sprite 贴图，因为多个三角形会导致贴图重叠
            fillStyle: '#94a3b8',
            // 调试时可以取消注释下面两行，显示三角形边框
            // strokeStyle: '#64748b',
            // lineWidth: 1,
          },
        });

        if (triBody) {
          Composite.add(concaveComposite, triBody);
        }
      });

      // 将整个 Composite 添加到物理世界
      Composite.add(engine.world, concaveComposite);
      console.log(`[物理引擎] 静态凹面体创建成功: ${obj.name || '未命名'}, 分解为 ${triangles.length} 个三角形`);

    } else {
      // ═══════════════════════════════════════════════════════════
      // 情况C：动态凹面体 - 使用凸包近似
      //
      // 原理：多个独立的三角形刚体无法保持刚性运动（会散开）
      //       因此动态凹面体只能使用凸包近似
      //
      // 限制：凹陷部分不会参与碰撞（被凸包填充）
      //       这是 Matter.js 的限制，接受这个妥协
      // ═══════════════════════════════════════════════════════════

      console.log(`[物理引擎] 动态凹面体使用凸包近似: ${obj.name || '未命名'}`);
      // 注意：createConvexHullBody 内部也需要添加到 bodiesMap，但由于其是独立函数，
      // 这里采用在函数返回后手动查找的方式暂不实现（简化版）
      // 后续可以改造 createConvexHullBody 返回创建的 body
      createConvexHullBody(processed, obj, isStatic, friction, air, restitution, sx, sy, Bodies, Vertices, Body, Composite, engine);
    }
  });


  // ============================================================================
  // 第 4.5 部分：约束创建逻辑（2025-11-23新增，2025-11-25扩展：支持弹簧系统）
  // 根据 constraints 数组创建 Matter.Constraint，实现单摆、弹簧等约束
  //
  // 约束类型：
  // - 单摆（springType=null）：一个物体连接到固定点或另一个物体
  // - 约束型弹簧（springType='constraint'）：两个端点之间的弹性连接
  // - 弹射型弹簧（springType='launcher'）：固定点+削减刚体+被弹物体
  // ============================================================================

  // 解构 Matter.Constraint 模块
  const Constraint = Matter.Constraint;

  // 固定的削减刚体尺寸（弹射型弹簧专用）
  const REDUCED_BODY_SIZE = { width: 20, height: 20 };

  // 遍历约束关系数组
  if (constraints && constraints.length > 0) {
    console.log(`[约束系统] 开始创建 ${constraints.length} 个约束`);

    constraints.forEach((c, idx) => {
      // 判断是否是弹簧系统
      const isSpring = c.springType === 'constraint' || c.springType === 'launcher';

      if (isSpring && c.secondPivotPoint) {
        // ════════════════════════════════════════════════════════════════
        // 弹簧系统处理（2025-11-25新增）
        // ════════════════════════════════════════════════════════════════
        console.log(`[弹簧系统] 处理${c.springType}类型弹簧: ${c.bodyName}`);

        // 转换两个端点坐标
        const firstPoint = {
          x: Math.round((c.pivotPoint?.x || 0) * sx),
          y: Math.round((c.pivotPoint?.y || 0) * sy)
        };
        const secondPoint = {
          x: Math.round((c.secondPivotPoint?.x || 0) * sx),
          y: Math.round((c.secondPivotPoint?.y || 0) * sy)
        };

        // 获取两个端点的物体（可能是物体或固定点）
        const firstBody = bodiesMap[c.pivotName];
        const secondBody = bodiesMap[c.secondPivotName];

        if (c.springType === 'constraint') {
          // 约束型弹簧：直接连接两个端点
          const springConstraint = Constraint.create({
            bodyA: firstBody,
            pointA: firstBody ? undefined : firstPoint,
            bodyB: secondBody,
            pointB: secondBody ? undefined : secondPoint,
            length: c.springLength * Math.max(sx, sy),
            stiffness: (c.stiffness || 100) / 1000,  // 转换为Matter.js的stiffness范围
            damping: c.damping || 0.1,
            render: {
              visible: true,
              lineWidth: 2,
              strokeStyle: '#000000',  // 黑色
              type: 'spring'
            }
          });
          Composite.add(engine.world, springConstraint);
          console.log(`[弹簧系统] 创建约束型弹簧: ${c.pivotName} ↔ ${c.secondPivotName}`);

        } else if (c.springType === 'launcher') {
          // 弹射型弹簧：创建削减刚体
          const reducedBody = Bodies.rectangle(
            firstPoint.x + (secondPoint.x - firstPoint.x) * 0.9,
            firstPoint.y + (secondPoint.y - firstPoint.y) * 0.9,
            REDUCED_BODY_SIZE.width,
            REDUCED_BODY_SIZE.height,
            {
              mass: 0.5,
              restitution: 0.1,
              friction: 0.0,
              frictionAir: 0.0,
              label: 'spring_launcher_reduced',
              render: { fillStyle: '#94a3b8' }
            }
          );

          const springConstraint = Constraint.create({
            bodyA: firstBody,
            pointA: firstBody ? undefined : firstPoint,
            bodyB: reducedBody,
            length: c.springLength * Math.max(sx, sy) - REDUCED_BODY_SIZE.width,
            stiffness: (c.stiffness || 200) / 1000,
            damping: c.damping || 0.05,
            render: { visible: false }
          });

          Composite.add(engine.world, [reducedBody, springConstraint]);

          // 碰撞后删除削减刚体
          Matter.Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
              if ((pair.bodyA.label === 'spring_launcher_reduced' || pair.bodyB.label === 'spring_launcher_reduced') &&
                  (secondBody && (pair.bodyA === secondBody || pair.bodyB === secondBody))) {
                setTimeout(() => {
                  World.remove(engine.world, reducedBody);
                  World.remove(engine.world, springConstraint);
                }, 100);
              }
            });
          });

          console.log(`[弹簧系统] 创建弹射型弹簧: ${c.pivotName} → 削减刚体 → ${c.secondPivotName}`);
        }

        return;  // 弹簧系统处理完毕，跳过后续单摆逻辑
      }

      // ════════════════════════════════════════════════════════════════
      // 单摆系统处理（原有逻辑保留）
      // ════════════════════════════════════════════════════════════════
      const bodyB = bodiesMap[c.bodyName];
      if (!bodyB) {
        console.warn(`[约束系统] 未找到物体: ${c.bodyName}，跳过约束 ${idx}`);
        return;
      }

      // 将支点坐标从原图坐标转换到画布坐标
      const pivotPointScaled = {
        x: Math.round((c.pivotPoint?.x || 0) * sx),
        y: Math.round((c.pivotPoint?.y || 0) * sy),
      };

      // 根据约束类型设置刚度（stiffness）
      // pendulum: 1.0 (刚性杆) | rope: 0.9 | spring: 0.1-0.5
      let stiffness = c.stiffness ?? 1.0;
      if (c.constraintType === 'spring') {
        stiffness = c.stiffness ?? 0.3;
      } else if (c.constraintType === 'rope') {
        stiffness = c.stiffness ?? 0.9;
      }

      // 计算约束长度（从原图坐标转换）
      const length = c.length ? c.length * Math.max(sx, sy) : undefined;

      // 检查支点是否是另一个物体
      const pivotBody = bodiesMap[c.pivotName];

      let constraint;

      if (pivotBody) {
        // ════════════════════════════════════════════════════════════
        // 情况A：支点是另一个物体（如复合摆中的中间摆球）
        // 使用 bodyA 和 bodyB 连接两个物体
        // ════════════════════════════════════════════════════════════
        constraint = Constraint.create({
          bodyA: pivotBody,           // 支点物体
          bodyB: bodyB,               // 被约束物体
          length: length,             // 约束长度
          stiffness: stiffness,       // 刚度
          render: {
            visible: true,            // 显示约束线
            lineWidth: 2,
            strokeStyle: c.constraintType === 'spring' ? '#22c55e' : '#3b82f6',
            type: c.constraintType === 'spring' ? 'spring' : 'line',
          },
        });
        console.log(`[约束系统] 创建物体间约束: ${c.bodyName} → ${c.pivotName}`);

      } else {
        // ════════════════════════════════════════════════════════════
        // 情况B：支点是世界坐标（固定点/临时锚点）
        // 使用 pointA 固定在世界坐标
        // ════════════════════════════════════════════════════════════
        constraint = Constraint.create({
          pointA: pivotPointScaled,   // 世界坐标固定点
          bodyB: bodyB,               // 被约束物体
          length: length,             // 约束长度
          stiffness: stiffness,       // 刚度
          render: {
            visible: true,            // 显示约束线
            lineWidth: 2,
            strokeStyle: c.constraintType === 'spring' ? '#22c55e' : '#3b82f6',
            type: c.constraintType === 'spring' ? 'spring' : 'line',
          },
        });
        console.log(`[约束系统] 创建固定点约束: ${c.bodyName} → 世界坐标(${pivotPointScaled.x}, ${pivotPointScaled.y})`);
      }

      // 将约束添加到物理世界
      if (constraint) {
        Composite.add(engine.world, constraint);
      }
    });

    console.log(`[约束系统] 约束创建完成，共 ${constraints.length} 个`);
  }


  // ────────────────────────────────────────────────────────────────
  // 第五部分：边界墙创建
  // 如果场景中没有静态物体，自动添加四周边界墙
  // 防止动态物体飞出画布
  // ────────────────────────────────────────────────────────────────

  if (!hasStatic) {
    // 边界墙厚度：画布较小边的 2%，最小 10 像素
    const t = Math.max(10, Math.floor(Math.min(width, height) * 0.02));

    // 创建四面墙（上、下、左、右）
    const walls = [
      // 上边界（在画布上方）
      Bodies.rectangle(width / 2, -t / 2, width, t, {
        isStatic: true,
        render: { visible: false }  // 不可见
      }),
      // 下边界（在画布下方）
      Bodies.rectangle(width / 2, height + t / 2, width, t, {
        isStatic: true,
        render: { visible: false }
      }),
      // 左边界
      Bodies.rectangle(-t / 2, height / 2, t, height, {
        isStatic: true,
        render: { visible: false }
      }),
      // 右边界
      Bodies.rectangle(width + t / 2, height / 2, t, height, {
        isStatic: true,
        render: { visible: false }
      }),
    ];

    Composite.add(engine.world, walls);
  }


  // ────────────────────────────────────────────────────────────────
  // 第六部分：启动模拟
  // 运行渲染器和物理引擎更新循环
  // ────────────────────────────────────────────────────────────────

  // 启动渲染循环（约 60 FPS）
  Render.run(render);

  // 创建并启动物理引擎更新循环
  const runner = Runner.create();
  Runner.run(runner, engine);

  // 传送带推进逻辑：在每帧更新前对接触传送带的物体设置水平速度并锁定角速度
  const onBeforeUpdate = () => {
    const pairs = engine.pairs?.list || [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const { bodyA, bodyB } = pair;
      const aIsConv = bodyA?.label === 'conveyor';
      const bIsConv = bodyB?.label === 'conveyor';
      if (!aIsConv && !bIsConv) continue;

      const conveyorBody = aIsConv ? bodyA : bodyB;
      const otherBody = aIsConv ? bodyB : bodyA;
      if (!otherBody || otherBody.isStatic) continue;

      // 找到该传送带的速度
      let speed = 0;
      for (const [name, b] of Object.entries(bodiesMap)) {
        if (b === conveyorBody) {
          const cfg = conveyorParams.get(name);
          if (cfg) speed = Number(cfg.speed || 0);
          break;
        }
      }
      Body.setVelocity(otherBody, { x: speed, y: otherBody.velocity.y });
      Body.setAngularVelocity(otherBody, 0);
    }
  };
  Events.on(engine, 'beforeUpdate', onBeforeUpdate);

  // 返回模拟控制器与状态摘要
  const constraintCount = constraints?.length || 0;
  return {
    summary: `模拟运行中：对象数=${objects.length}${constraintCount > 0 ? `，约束数=${constraintCount}` : ''}`,
    stop: () => {
      console.log('[物理引擎] 停止模拟，清理资源...');
      // 停止循环
      Runner.stop(runner);
      Render.stop(render);
      // 取消事件监听
      Events.off(engine, 'beforeUpdate', onBeforeUpdate);
      // 清空物理世界
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      // 移除 Canvas
      if (render.canvas) {
        render.canvas.remove();
      }
      // 清理引用（辅助垃圾回收）
      render.canvas = null;
      render.context = null;
      render.textures = {};
    }
  };
}


// ╔═══════════════════════════════════════════════════════════════════╗
// ║                       辅助创建函数区域                              ║
// ║  被主函数调用的物体创建和属性应用函数                                ║
// ╚═══════════════════════════════════════════════════════════════════╝


/**
 * 创建凸包刚体
 * ------------
 * 【功能】使用凸包算法创建刚体
 * 【用途】
 *   1. 动态凹面体的近似处理
 *   2. 三角形分解失败时的回退方案
 * 【调用位置】runSimulation() 中动态凹面体处理和分解失败回退
 *
 * @param {Array} processed - 处理后的轮廓点
 * @param {Object} obj - 原始物体数据
 * @param {boolean} isStatic - 是否静态
 * @param {number} friction - 摩擦系数
 * @param {number} air - 空气阻力
 * @param {number} restitution - 弹性系数
 * @param {number} sx - X方向缩放比例
 * @param {number} sy - Y方向缩放比例
 * @param {Object} Bodies - Matter.Bodies 模块
 * @param {Object} Vertices - Matter.Vertices 模块
 * @param {Object} Body - Matter.Body 模块
 * @param {Object} Composite - Matter.Composite 模块
 * @param {Object} engine - Matter.Engine 实例
 */
function createConvexHullBody(processed, obj, isStatic, friction, air, restitution, sx, sy, Bodies, Vertices, Body, Composite, engine) {
  // 生成凸包顶点
  const hullPoints = toConvexHull(processed);
  const hullVerts = Vertices.create(hullPoints, Matter);
  const hullCenter = Matter.Vertices.centre(hullVerts);

  // 创建刚体
  const body = Bodies.fromVertices(hullCenter.x, hullCenter.y, hullVerts, {
    isStatic,
    friction,
    frictionStatic: 0.5,
    frictionAir: air,
    restitution,
    render: obj.sprite_data_url
      ? { sprite: { texture: obj.sprite_data_url, xScale: sx, yScale: sy } }
      : { fillStyle: isStatic ? '#94a3b8' : '#60a5fa' },
  });

  if (body) {
    applyPhysicsProperties(body, obj, processed, isStatic, Body);
    Composite.add(engine.world, body);
  }
}


/**
 * 应用物理属性
 * ------------
 * 【功能】为刚体设置质量、初速度、角速度等物理属性
 * 【用途】统一的物理属性应用逻辑
 * 【调用位置】createConvexHullBody() 和凸多边形创建后
 *
 * 【处理的属性】
 * 1. 质量/密度：根据轮廓面积和给定质量计算密度
 * 2. 初始线速度：X和Y方向的初始速度
 * 3. 初始角速度：旋转的初始速度
 *
 * @param {Object} body - Matter.js 刚体实例
 * @param {Object} obj - 原始物体数据
 * @param {Array} processed - 处理后的轮廓点（用于计算面积）
 * @param {boolean} isStatic - 是否静态物体
 * @param {Object} Body - Matter.Body 模块
 */
function applyPhysicsProperties(body, obj, processed, isStatic, Body) {

  // ────────────────────────────────────────────────────────────────
  // 质量/密度设置
  // Matter.js 使用密度（density）而不是直接设置质量
  // 密度 = 质量 / 面积
  // ────────────────────────────────────────────────────────────────
  try {
    const area = polygonArea(processed);                              // 计算轮廓面积
    const massKg = Number(obj?.parameters?.mass_kg ?? 0);             // 获取质量参数
    if (!isNaN(massKg) && massKg > 0 && area > 1) {
      const density = Math.max(0.0001, massKg / area);                // 计算密度（设置下限防止过小）
      Body.setDensity(body, density);
    }
  } catch (_) {
    // 计算失败时忽略，使用默认密度
  }

  // ────────────────────────────────────────────────────────────────
  // 初始线速度设置
  // 只对动态物体有效
  // ────────────────────────────────────────────────────────────────
  const vx = Number(obj?.parameters?.initial_velocity_px_s ?? obj?.parameters?.initial_velocity_m_s ?? 0);
  const vy = Number(obj?.parameters?.initial_velocity_y_px_s ?? 0);
  if (!isStatic && (vx || vy)) {
    Body.setVelocity(body, { x: vx, y: vy });
  }

  // ────────────────────────────────────────────────────────────────
  // 初始角速度设置
  // 只对动态物体有效
  // ────────────────────────────────────────────────────────────────
  const w0 = Number(obj?.parameters?.initial_angular_velocity_rad_s ?? 0);
  if (!isStatic && w0) {
    Body.setAngularVelocity(body, w0);
  }
}
// 传送带推进逻辑在 runSimulation 内部注册（依赖 engine/bodiesMap/conveyorParams）
