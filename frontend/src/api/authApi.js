/**
 * 认证相关 API
 * ---------------------------------
 * 功能：
 * - 用户注册
 * - 用户登录
 * - 获取当前用户信息
 */

import axios from './axios.js';

/**
 * 用户注册
 * @param {string} phoneNumber - 手机号
 * @param {string} password - 密码
 * @returns {Promise} 注册结果
 */
export async function register(phoneNumber, password) {
  const response = await axios.post('/auth/register', {
    phone_number: phoneNumber,
    password: password,
  });
  return response.data;
}

/**
 * 用户登录
 * @param {string} phoneNumber - 手机号
 * @param {string} password - 密码
 * @returns {Promise} 登录结果（包含 access_token 和 user）
 */
export async function login(phoneNumber, password) {
  // OAuth2 标准格式：使用 form-data
  const formData = new FormData();
  formData.append('username', phoneNumber); // 字段名必须是 username
  formData.append('password', password);

  const response = await axios.post('/auth/token', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
}

/**
 * 获取当前用户信息
 * @param {string} token - JWT Token
 * @returns {Promise} 用户信息
 */
export async function getCurrentUser(token) {
  const response = await axios.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

