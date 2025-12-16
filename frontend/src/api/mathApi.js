/**
 * 数学讲解 API 封装
 * ---------------------------------
 * 功能：
 * - 上传题图与创建渲染任务（演示版），返回 `task_id`。
 * - 后端地址与 physicsApi 共用同一 axios 实例配置策略。
 */

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const client = axios.create({ baseURL, timeout: 10000 });

export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/math/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function renderDemo(payload) {
  const res = await client.post('/math/render', payload);
  return res.data;
}