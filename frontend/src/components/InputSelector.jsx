/**
 * 模式切换组件（物理模拟 / 数学解题）
 * ---------------------------------
 * 功能：
 * - 提供两个链接，分别跳转到 /physics 与 /math。
 * - 放置在页面顶部，充当全局导航。
 *
 * 后续扩展：
 * - 可根据当前路由高亮选中态；
 * - 可加入更多导航项（热门动画、登录等）。
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function InputSelector() {
  const { pathname } = useLocation();
  const enableMath = import.meta.env.VITE_ENABLE_MATH === 'true';
  return (
    <div className="selector">
      <Link to="/physics" style={{ fontWeight: pathname === '/physics' ? 700 : 400 }}>物理模拟</Link>
      {enableMath && (
        <Link to="/math" style={{ fontWeight: pathname === '/math' ? 700 : 400 }}>数学解题</Link>
      )}
    </div>
  );
}
