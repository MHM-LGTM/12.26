/**
 * 绘制掩码轮廓工具
 * ---------------------------------
 * 功能：
 * - 将后端返回的轮廓坐标数组在 Canvas 上连接为亮线；
 * - 支持清空与重绘。
 *
 * 使用：
 * - drawContour(ctx, points) 传入 形如 [{x,y}, ...] 的列表。
 * - clear(ctx, width, height) 清空画布。
 */

export function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

export function drawContour(ctx, points) {
  if (!ctx || !points || points.length === 0) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2b6ef2'; // 高亮蓝色
  ctx.shadowColor = '#7aa2ff';
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawDragRect(ctx, x1, y1, x2, y2) {
  if (!ctx) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = '#ff9900';
  ctx.shadowColor = '#ff9900';
  ctx.shadowBlur = 8;
  const w = x2 - x1;
  const h = y2 - y1;
  ctx.strokeRect(x1, y1, w, h);
  ctx.restore();
}