/**
 * 错误提示组件（极简）
 * ---------------------------------
 * 功能：显示一条错误信息；真实项目可接入 toast 库。
 */

import React from 'react';

export default function ErrorToast({ message }) {
  if (!message) return null;
  return (
    <div style={{ color: '#b00020', marginTop: 8 }}>错误：{message}</div>
  );
}