/**
 * 加载中指示器（极简）
 * ---------------------------------
 * 功能：显示一个简单的加载状态文本。
 * 后续可替换为更好的动效组件。
 */

import React from 'react';

export default function LoadingSpinner({ text = '加载中...' }) {
  return <div style={{ color: '#555' }}>{text}</div>;
}