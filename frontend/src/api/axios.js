/**
 * Axios 统一配置（含认证拦截器）
 * ---------------------------------
 * 功能：
 * - 创建统一的 axios 实例
 * - 请求拦截器：自动添加 JWT Token
 * - 响应拦截器：处理 401 错误（Token 过期）
 *
 * 使用：
 * import axios from '@/api/axios';
 */

import axios from 'axios';
import useAuthStore from '../store/authStore.js';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const instance = axios.create({
  baseURL,
  timeout: 60000, // 60秒超时
});

// 请求拦截器：自动添加 Token
instance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理 401 错误
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除登录状态
      useAuthStore.getState().logout();
      // 可选：显示提示
      console.warn('Token 已过期，请重新登录');
    }
    return Promise.reject(error);
  }
);

export default instance;




