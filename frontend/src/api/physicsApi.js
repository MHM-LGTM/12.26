/**
 * 物理模拟 API 封装
 * ---------------------------------
 * 功能：
 * - 提供上传图片、分割、生成模拟三类接口的封装。
 * - 统一 axios 实例，默认后端地址为 `http://localhost:8000`，可通过环境变量 `VITE_API_BASE_URL` 覆盖。
 * - 模拟接口支持扩展字段：`image_path`（用于后端裁剪精灵）、`elements`、`contours`、`roles`、`parameters_list`（刚体参数）。
 *
 * 后续扩展：
 * - 若路由前缀调整（如 /api/physics），只需修改这里的路径即可。
 *
 * 本次修改（刚体碰撞参数透传）：
 * - simulate 请求体允许传入 `roles` 与 `parameters_list`，与 elements/contours 索引对齐；
 * - 后端将透传这些参数用于前端物理引擎的刚体初始化。
 */

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
// CPU 上首次分割可能较慢（embedding 计算），提高超时以避免误报
export const client = axios.create({ baseURL, timeout: 60000 });

export async function health() {
  const res = await client.get('/healthz');
  return res.data;
}

export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  // 不手动设置 Content-Type，浏览器会自动带上正确的 boundary
  // 首次同步预热 embedding 在 CPU 上可能较慢，提高该请求的超时阈值
  const res = await client.post('/physics/upload', form, {
    timeout: 120000,
  });
  return res.data;
}

export async function segment(payload) {
  try {
    const res = await client.post('/physics/segment', payload);
    return res.data;
  } catch (e) {
    console.error('segment api error', {
      status: e?.response?.status,
      data: e?.response?.data,
      message: e?.message,
    });
    throw new Error(e?.response?.data?.message || e?.message || 'segment request failed');
  }
}

export async function simulate(payload) {
  const res = await client.post('/physics/simulate', payload);
  return res.data;
}