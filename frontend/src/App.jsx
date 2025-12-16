/**
 * 应用根组件（路由控制）
 * ---------------------------------
 * 功能：
 * - 定义路由：/physics 与 /math，两者对应页面分别在 pages 目录内。
 * - 默认重定向到 /physics 页面。
 *
 * 后续扩展：
 * - 可在此处注入顶部导航、全局消息组件、鉴权逻辑等。
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PhysicsPage from './pages/PhysicsPage.jsx';
import PlayPage from './pages/PlayPage.jsx';

export default function App() {
  const enableMath = import.meta.env.VITE_ENABLE_MATH === 'true';
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/physics" replace />} />
      <Route path="/physics" element={<PhysicsPage />} />
      <Route path="/physics/play/:shareCode" element={<PlayPage />} />
      {enableMath && <Route path="/math" element={<MathPage />} />}
    </Routes>
  );
}
