/**
 * 动画信息区组件
 * ---------------------------------
 * 功能：
 * - 显示广场动画的详细信息
 * - 位置：画布下方
 * - 显示：名称、描述、点赞数、作者
 * 
 * 使用：
 * <AnimationInfoBar 
 *   animationInfo={...}
 *   onClose={() => setAnimationInfo(null)}
 * />
 */

import React, { useState } from 'react';
import LikeButton from './LikeButton.jsx';
import ShareLinkModal from './ShareLinkModal.jsx';

export default function AnimationInfoBar({ animationInfo, onClose }) {
  const [showShareModal, setShowShareModal] = useState(false);
  if (!animationInfo) return null;

  return (
    <div style={{
      margin: '12px 0',
      padding: 16,
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      maxWidth: 'calc(100vw - 450px)'
    }}>
      {/* 顶部：标题和关闭按钮 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#111827'
          }}>
            📝 {animationInfo.title}
          </span>
          
          {/* 点赞按钮 */}
          <LikeButton 
            animationId={animationInfo.id} 
            initialLikeCount={animationInfo.like_count || 0}
            size="medium"
          />
          
          {/* 作者 */}
          {animationInfo.author_name && (
            <span style={{
              fontSize: 13,
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              👤 {animationInfo.author_name}
            </span>
          )}
          
          {/* 分享按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowShareModal(true);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: 'white',
              color: '#16a34a',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0fdf4';
              e.currentTarget.style.borderColor = '#16a34a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            🔗 分享
          </button>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            border: '1px solid #d1d5db',
            background: 'white',
            color: '#6b7280',
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
        >
          ×
        </button>
      </div>

      {/* 描述 */}
      {animationInfo.description && (
        <p style={{
          margin: 0,
          fontSize: 13,
          color: '#6b7280',
          lineHeight: 1.5
        }}>
          {animationInfo.description}
        </p>
      )}

      {/* 分享链接弹窗 */}
      <ShareLinkModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        animationId={animationInfo.id}
        existingShareCode={animationInfo.share_code}
      />
    </div>
  );
}

