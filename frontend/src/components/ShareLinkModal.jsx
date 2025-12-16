/**
 * 分享链接弹窗组件
 * ---------------------------------
 * 功能：
 * - 生成并显示分享链接
 * - 一键复制链接
 * 
 * 使用：
 * <ShareLinkModal
 *   isOpen={showShareModal}
 *   onClose={() => setShowShareModal(false)}
 *   animationId={6}
 * />
 */

import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';

export default function ShareLinkModal({ isOpen, onClose, animationId, existingShareCode = null }) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  // 生成或获取分享链接
  useEffect(() => {
    if (!isOpen || !animationId) return;

    // 如果已有分享码，直接构建 URL
    if (existingShareCode) {
      const url = `http://localhost:5174/physics/play/${existingShareCode}`;
      setShareUrl(url);
      return;
    }

    // 否则需要生成新的分享链接（需要登录且是自己的动画）
    if (!isLoggedIn || !token) {
      alert('此动画还没有分享链接');
      onClose();
      return;
    }

    const generateLink = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/animations/${animationId}/share-link`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const data = await response.json();
        
        if (data.code === 0) {
          setShareUrl(data.data.share_url);
        } else {
          alert(`生成失败：${data.message}`);
          onClose();
        }
      } catch (error) {
        console.error('生成分享链接失败:', error);
        alert(`生成失败：${error.message}`);
        onClose();
      } finally {
        setLoading(false);
      }
    };

    generateLink();
  }, [isOpen, animationId, token, existingShareCode, isLoggedIn]);

  // 复制链接
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // 兼容性处理：使用传统方法
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          width: '90%',
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ 
          margin: '0 0 20px 0', 
          fontSize: 20, 
          fontWeight: 600,
          color: '#111827'
        }}>
          🔗 分享链接
        </h3>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '20px 0' }}>
            生成链接中...
          </p>
        ) : (
          <>
            {/* 链接显示 */}
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              color: '#374151',
              wordBreak: 'break-all'
            }}>
              {shareUrl}
            </div>

            {/* 复制按钮 */}
            <button
              onClick={handleCopy}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                background: copied ? '#10b981' : 'white',
                color: copied ? 'white' : '#374151',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 16,
                transition: 'all 0.2s'
              }}
            >
              {copied ? '✅ 已复制' : '📋 复制链接'}
            </button>

            {/* 说明文字 */}
            <p style={{
              margin: 0,
              fontSize: 13,
              color: '#6b7280',
              lineHeight: 1.6,
              textAlign: 'center'
            }}>
              分享给朋友，他们可以直接打开链接运行动画
            </p>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px',
                border: '1px solid #d1d5db',
                background: 'white',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                color: '#374151'
              }}
            >
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  );
}

