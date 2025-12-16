/**
 * 物理模拟页面
 * ---------------------------------
 * 功能：
 * - 顶部显示模式切换按钮和登录状态；
 * - 中部区域承载 PhysicsInputBox 组件（上传与开始模拟）。
 * - 集成登录/注册功能
 */

import React, { useState, useRef } from 'react';
import InputSelector from '../components/InputSelector.jsx';
import PhysicsInputBox from '../components/PhysicsInputBox.jsx';
import MyAnimationsPanel from '../components/MyAnimationsPanel.jsx';
import PlazaPanel from '../components/PlazaPanel.jsx';
import AnimationInfoBar from '../components/AnimationInfoBar.jsx';
import LoginModal from '../components/Auth/LoginModal.jsx';
import UserMenu from '../components/Auth/UserMenu.jsx';
import useAuthStore from '../store/authStore.js';

export default function PhysicsPage() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [plazaAnimationInfo, setPlazaAnimationInfo] = useState(null); // 广场动画信息
  const [currentAnimationSource, setCurrentAnimationSource] = useState(null); // 'my' | 'plaza' | null
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  
  // 用于访问 PhysicsInputBox 的加载函数
  const physicsBoxRef = useRef(null);

  // 处理动画加载
  const handleLoadAnimation = (sceneData, plazaAnimationId = null) => {
    console.log('[PhysicsPage] 接收到加载请求，scene_data keys:', Object.keys(sceneData || {}));
    console.log('[PhysicsPage] plazaAnimationId:', plazaAnimationId);
    // 将 sceneData 传递给 PhysicsInputBox
    if (physicsBoxRef.current?.loadAnimation) {
      physicsBoxRef.current.loadAnimation(sceneData, plazaAnimationId);
    } else {
      console.error('[PhysicsPage] physicsBoxRef.current.loadAnimation 不存在');
    }
  };

  // 处理广场动画加载（显示信息区）
  const handlePlazaAnimationLoad = (animationInfo) => {
    console.log('[PhysicsPage] 广场动画信息:', animationInfo);
    setPlazaAnimationInfo(animationInfo);
    setCurrentAnimationSource('plaza'); // 标记为广场动画
  };

  return (
    <div className="page-wrapper">
      <div className="topbar">
        <InputSelector />
        
        {/* 右上角：登录状态 */}
        <div className="topbar-right">
          {isLoggedIn ? (
            <UserMenu />
          ) : (
            <button
              className="login-btn"
              onClick={() => setShowLoginModal(true)}
            >
              登录 / 注册
            </button>
          )}
        </div>
      </div>

      <PhysicsInputBox 
        ref={physicsBoxRef}
        animationSource={currentAnimationSource}
      />

      {/* 阶段三新增：广场动画信息区（画布下方） */}
      <AnimationInfoBar 
        animationInfo={plazaAnimationInfo}
        onClose={() => setPlazaAnimationInfo(null)}
      />

      {/* 阶段二新增：我的动画面板 */}
      <MyAnimationsPanel 
        onLoadAnimation={(sceneData) => {
          handleLoadAnimation(sceneData);
          setPlazaAnimationInfo(null); // 加载我的动画时，清除广场信息
          setCurrentAnimationSource('my'); // 标记为我的动画
        }}
      />

      {/* 阶段三新增：动画广场面板 */}
      <PlazaPanel 
        onLoadAnimation={handleLoadAnimation}
        onPlazaAnimationLoad={handlePlazaAnimationLoad}
      />

      {/* 登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}