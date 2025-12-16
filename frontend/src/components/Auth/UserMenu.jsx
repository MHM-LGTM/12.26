/**
 * 用户菜单组件
 * ---------------------------------
 * 功能：
 * - 显示用户手机号（脱敏）
 * - 点击展开下拉菜单
 * - 提供退出登录选项
 */

import React, { useState, useRef, useEffect } from 'react';
import useAuthStore from '../../store/authStore.js';
import toast from 'react-hot-toast';
import './styles.css';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { user, logout } = useAuthStore();

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    if (confirm('确认退出登录？')) {
      logout();
      toast.success('已退出登录');
      setIsOpen(false);
    }
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button 
        className="user-menu-trigger" 
        onClick={() => setIsOpen(!isOpen)}
      >
        👤 {user?.phone_number} ▼
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-item" onClick={handleLogout}>
            🚪 退出登录
          </div>
        </div>
      )}
    </div>
  );
}




