/**
 * 点赞按钮组件
 * ---------------------------------
 * 功能：
 * - 显示点赞数
 * - 点击切换点赞状态
 * - 已点赞显示红色❤️，未点赞显示灰色🤍
 * 
 * 使用：
 * <LikeButton
 *   animationId={6}
 *   initialLikeCount={128}
 *   size="small"  // "small" | "medium"
 * />
 */

import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';

export default function LikeButton({ animationId, initialLikeCount = 0, size = 'medium' }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  // 样式配置
  const sizeConfig = {
    small: { fontSize: 12, iconSize: 14 },
    medium: { fontSize: 14, iconSize: 16 }
  };
  const config = sizeConfig[size] || sizeConfig.medium;

  // 查询点赞状态
  useEffect(() => {
    if (!isLoggedIn || !token) return;

    const checkLikeStatus = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/plaza/animations/${animationId}/like-status`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        const data = await response.json();
        if (data.code === 0) {
          setLiked(data.data.liked);
        }
      } catch (error) {
        console.error('查询点赞状态失败:', error);
      }
    };

    checkLikeStatus();
  }, [animationId, token, isLoggedIn]);

  // 处理点赞
  const handleLike = async (e) => {
    e.stopPropagation(); // 阻止事件冒泡

    if (!isLoggedIn || !token) {
      alert('请先登录后再点赞');
      return;
    }

    if (loading) return;

    setLoading(true);
    try {
      if (liked) {
        // 取消点赞
        const response = await fetch(
          `http://localhost:8000/api/plaza/animations/${animationId}/like`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        const data = await response.json();
        
        if (data.code === 0) {
          setLiked(false);
          setLikeCount(data.data.like_count);
        } else {
          alert(data.message);
        }
      } else {
        // 点赞
        const response = await fetch(
          `http://localhost:8000/api/plaza/animations/${animationId}/like`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        const data = await response.json();
        
        if (data.code === 0) {
          setLiked(true);
          setLikeCount(data.data.like_count);
        } else {
          alert(data.message);
        }
      }
    } catch (error) {
      console.error('点赞操作失败:', error);
      alert('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLike}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        border: 'none',
        background: 'transparent',
        cursor: loading ? 'not-allowed' : 'pointer',
        padding: '4px 8px',
        borderRadius: 8,
        fontSize: config.fontSize,
        color: liked ? '#ef4444' : '#9ca3af',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.transform = 'scale(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <span style={{ fontSize: config.iconSize }}>
        {liked ? '❤️' : '🤍'}
      </span>
      <span>{likeCount}</span>
    </button>
  );
}

