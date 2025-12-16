/**
 * 登录/注册模态框
 * ---------------------------------
 * 功能：
 * - 登录和注册在同一个弹窗中
 * - 支持手机号格式校验
 * - 密码显示/隐藏切换
 * - 实时表单验证
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { register, login } from '../../api/authApi.js';
import useAuthStore from '../../store/authStore.js';
import toast from 'react-hot-toast';
import './styles.css';

export default function LoginModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loginUser = useAuthStore((state) => state.login);

  // 校验手机号
  const validatePhone = (phone) => /^1[3-9]\d{9}$/.test(phone);

  // 提交登录
  const handleLogin = async () => {
    setError('');
    
    if (!validatePhone(phoneNumber)) {
      setError('请输入正确的手机号');
      return;
    }
    
    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }

    setLoading(true);
    try {
      const res = await login(phoneNumber, password);
      if (res.code === 0) {
        const { access_token, user } = res.data;
        loginUser(access_token, user);
        toast.success('登录成功');
        onClose();
        resetForm();
      } else {
        setError(res.message || '登录失败');
      }
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 提交注册
  const handleRegister = async () => {
    setError('');
    
    if (!validatePhone(phoneNumber)) {
      setError('请输入正确的手机号');
      return;
    }
    
    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await register(phoneNumber, password);
      if (res.code === 0) {
        toast.success('注册成功，请登录');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(res.message || '注册失败');
      }
    } catch (err) {
      setError(err.response?.data?.detail || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPhoneNumber('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="auth-modal-overlay" />
        <Dialog.Content className="auth-modal-content">
          <Dialog.Close className="auth-modal-close">✕</Dialog.Close>

          {/* 标题 */}
          <Dialog.Title className="auth-title">
            {mode === 'login' ? '欢迎回来' : '加入我们'}
          </Dialog.Title>

          {/* 描述（用于可访问性） */}
          <Dialog.Description className="auth-description">
            {mode === 'login' ? '请输入您的手机号和密码登录' : '请填写信息创建新账号'}
          </Dialog.Description>

          {/* 错误提示 */}
          {error && (
            <div className="auth-error">
              ⚠️ {error}
            </div>
          )}

          {/* 表单 */}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>手机号</label>
            <input
              type="tel"
              placeholder="请输入手机号"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              autoComplete="tel"
            />

            <label>密码</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'login' ? '请输入密码' : '请输入密码（至少6位）'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="toggle-password"
                tabIndex={-1}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            {mode === 'register' && (
              <>
                <label>确认密码</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="toggle-password"
                    tabIndex={-1}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
              </button>
                </div>
              </>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? '处理中...' : mode === 'login' ? '登 录' : '注 册'}
            </button>

            <p className="auth-hint">
              {mode === 'login' ? (
                <>
                  还没有账号？
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => { setMode('register'); setError(''); }}
                  >
                    注册
                  </button>
                </>
              ) : (
                <>
                  已有账号？
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => { setMode('login'); setError(''); }}
                  >
                    登录
                  </button>
                </>
              )}
            </p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}




