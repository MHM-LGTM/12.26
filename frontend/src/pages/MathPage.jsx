/**
 * 数学讲解页面（骨架）
 * ---------------------------------
 * 功能：
 * - 顶部显示模式切换按钮；
 * - 中部区域承载 MathInputBox 组件（描述与图片上传、创建演示按钮）。
 */

import React from 'react';
import InputSelector from '../components/InputSelector.jsx';
import MathInputBox from '../components/MathInputBox.jsx';

export default function MathPage() {
  return (
    <div className="page-wrapper">
      <div className="topbar">
        <InputSelector />
      </div>
      <MathInputBox />
    </div>
  );
}