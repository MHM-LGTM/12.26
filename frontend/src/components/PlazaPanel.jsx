/**
 * 动画广场面板组件
 * ---------------------------------
 * 功能：
 * - 显示所有公开的动画
 * - 横向滚动布局
 * - 每个卡片显示：封面图、名称、点赞数
 * 
 * 使用：
 * <PlazaPanel onLoadAnimation={handleLoadAnimation} />
 */

import React, { useState, useEffect } from 'react';
import LikeButton from './LikeButton.jsx';

export default function PlazaPanel({ onLoadAnimation, onPlazaAnimationLoad }) {
  const [animations, setAnimations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState(null); // 选中的卡片ID
  const [currentPage, setCurrentPage] = useState(0); // 当前页码
  
  // 分页配置：根据实际卡片宽度计算每行能放多少个，这里假设每行约6-7个卡片（140px宽度）
  // 两行的话大约是12-14个动画
  const ITEMS_PER_PAGE = 14; // 每页显示14个动画（2行）

  // 加载广场动画列表
  const loadPlazaAnimations = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/plaza/animations');
      const data = await response.json();
      
      if (data.code === 0) {
        setAnimations(data.data.animations || []);
      } else {
        console.error('获取广场动画失败:', data.message);
      }
    } catch (error) {
      console.error('加载广场动画失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlazaAnimations();
  }, []);

  // 重置页码当动画列表变化时
  useEffect(() => {
    setCurrentPage(0);
  }, [animations.length]);

  // 计算分页数据
  const totalPages = Math.max(1, Math.ceil(animations.length / ITEMS_PER_PAGE));
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentAnimations = animations.slice(startIndex, endIndex);

  // 点击卡片加载动画
  const handleCardClick = async (animationId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/plaza/animations/${animationId}`);
      const data = await response.json();
      
      if (data.code === 0) {
        const animData = data.data;
        console.log('[PlazaPanel] 加载广场动画:', animData.title);
        
        // 设置选中状态
        setSelectedCardId(animationId);
        
        // 调用父组件的加载函数（传递动画ID用于Fork）
        onLoadAnimation(animData.scene_data, animationId);
        
        // 通知父组件这是广场动画，需要显示信息区
        if (onPlazaAnimationLoad) {
          onPlazaAnimationLoad({
            id: animData.id,
            title: animData.title,
            description: animData.description,
            like_count: animData.like_count,
            author_name: animData.author_name,
            share_code: animData.share_code  // 传递分享码
          });
        }
      } else {
        alert(`加载失败：${data.message}`);
      }
    } catch (error) {
      console.error('加载广场动画失败:', error);
      alert(`加载失败：${error.message}`);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      top: 560,  // 从"我的动画"区域下方开始（80 + 440 + 20）
      left: 20,
      right: 400,  // 为右侧"我的动画"面板留空间
      background: 'white',
      borderRadius: 16,
      padding: 16,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden'
    }}>
      {/* 左侧内容区域 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden'
      }}>
        <h3 style={{
          margin: '0 0 12px 0',
          fontSize: 18,
          fontWeight: 600,
          color: '#111827',
          flexShrink: 0
        }}>
          动画广场 ({animations.length})
        </h3>

      {loading ? (
        <div style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <p style={{ 
            textAlign: 'center', 
            color: '#6b7280',
            fontSize: 14,
            margin: 0
          }}>
            加载中...
          </p>
        </div>
      ) : animations.length === 0 ? (
        <div style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <p style={{ 
            textAlign: 'center', 
            color: '#6b7280', 
            fontSize: 14,
            margin: 0,
            lineHeight: 1.6
          }}>
            广场还没有动画<br/>
            上传你的动画，成为第一个分享者吧！
          </p>
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          overflowY: 'hidden',
          overflowX: 'hidden',
          alignContent: 'flex-start',
          paddingRight: 4
        }}>
          {currentAnimations.map((anim) => {
            const isSelected = selectedCardId === anim.id;
            
            return (
              <div
                key={anim.id}
                onClick={() => handleCardClick(anim.id)}
                style={{
                  minWidth: 140,
                  maxWidth: 140,
                  cursor: 'pointer',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  transition: 'all 0.2s',
                  backgroundColor: 'white',
                  flexShrink: 0,
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isSelected ? '0 6px 20px rgba(59, 130, 246, 0.3)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
              {/* 封面图 */}
              <div style={{
                width: '100%',
                height:50,
                background: anim.thumbnail_url 
                  ? '#f3f4f6'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 40,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {anim.thumbnail_url ? (
                  <img 
                    src={anim.thumbnail_url} 
                    alt={anim.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  '🎬'
                )}
              </div>

              {/* 标题、点赞、作者 */}
              <div style={{
                padding: 8,
                background: 'white'
              }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: 4
                }}
                title={anim.title}
                >
                  {anim.title}
                </div>
                
                {/* 点赞和作者 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#6b7280'
                }}>
                  <LikeButton 
                    animationId={anim.id} 
                    initialLikeCount={anim.like_count || 0}
                    size="small"
                  />
                  {anim.author_name && (
                    <span style={{ fontSize: 10 }}>👤 {anim.author_name}</span>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
      </div>

      {/* 右侧分页控件 */}
      {!loading && animations.length > ITEMS_PER_PAGE && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingLeft: 16,
          borderLeft: '1px solid #e5e7eb',
          minWidth: 60
        }}>
          {/* 上一页按钮 */}
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: currentPage === 0 ? '#f9fafb' : 'white',
              color: currentPage === 0 ? '#d1d5db' : '#6b7280',
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontWeight: 'bold'
            }}
            onMouseEnter={(e) => {
              if (currentPage !== 0) {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage !== 0) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            ↑
          </button>
          
          {/* 页码显示 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#111827'
            }}>
              {currentPage + 1}
            </span>
            <div style={{
              width: 20,
              height: 1,
              background: '#d1d5db'
            }} />
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#9ca3af'
            }}>
              {totalPages}
            </span>
          </div>
          
          {/* 下一页按钮 */}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: currentPage >= totalPages - 1 ? '#f9fafb' : 'white',
              color: currentPage >= totalPages - 1 ? '#d1d5db' : '#6b7280',
              cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontWeight: 'bold'
            }}
            onMouseEnter={(e) => {
              if (currentPage < totalPages - 1) {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.transform = 'translateY(2px)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage < totalPages - 1) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}

