/**
 * 我的动画面板组件
 * ---------------------------------
 * 功能：
 * - 显示用户保存的所有动画
 * - 卡片式布局展示
 * - 点击卡片加载动画到画布
 * 
 * 使用：
 * <MyAnimationsPanel onLoadAnimation={handleLoadAnimation} />
 */

import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import ShareLinkModal from './ShareLinkModal.jsx';

export default function MyAnimationsPanel({ onLoadAnimation }) {
  const [animations, setAnimations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null); // 当前打开菜单的动画ID
  const [shareAnimationId, setShareAnimationId] = useState(null); // 要分享的动画ID
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  // 加载我的动画列表
  const loadAnimations = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/animations/mine', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.code === 0) {
        setAnimations(data.data.animations || []);
      } else {
        console.error('获取动画列表失败:', data.message);
      }
    } catch (error) {
      console.error('加载动画列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnimations();
  }, [token]);

  // 点击卡片，加载动画详情
  const handleCardClick = async (animationId, e) => {
    // 如果点击的是菜单按钮，不触发加载
    if (e.target.closest('.menu-button')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/animations/${animationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.code === 0) {
        const animData = data.data;
        console.log('[MyAnimationsPanel] 加载动画:', animData.title);
        // 调用父组件传入的加载函数
        onLoadAnimation(animData.scene_data);
      } else {
        alert(`加载失败：${data.message}`);
      }
    } catch (error) {
      console.error('加载动画失败:', error);
      alert(`加载失败：${error.message}`);
    }
  };

  // 删除动画
  const handleDelete = async (animationId) => {
    if (!confirm('确定要删除这个动画吗？')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/animations/${animationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.code === 0) {
        alert('删除成功');
        loadAnimations(); // 刷新列表
        setMenuOpen(null); // 关闭菜单
      } else {
        alert(`删除失败：${data.message}`);
      }
    } catch (error) {
      console.error('删除动画失败:', error);
      alert(`删除失败：${error.message}`);
    }
  };

  // 上传到广场
  const handlePublish = async (animationId, showAuthor = true) => {
    try {
      const response = await fetch(`http://localhost:8000/api/animations/${animationId}/publish?show_author=${showAuthor}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.code === 0) {
        alert('✅ 已上传到动画广场！');
        loadAnimations(); // 刷新列表
        setMenuOpen(null); // 关闭菜单
      } else {
        alert(`上传失败：${data.message}`);
      }
    } catch (error) {
      console.error('上传动画失败:', error);
      alert(`上传失败：${error.message}`);
    }
  };

  // 未登录状态
  if (!isLoggedIn || !token) {
    return (
      <div style={{
        position: 'fixed',
        top: 80,
        right: 20,
        width: 280,
        background: 'white',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <p style={{ 
          textAlign: 'center', 
          color: '#6b7280',
          fontSize: 14,
          margin: 0
        }}>
          登录后查看我的动画
        </p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 20,
      width: 340,
      maxHeight: 'calc(100vh - 100px)',
      background: 'white',
      borderRadius: 16,
      padding: 16,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      overflowY: 'auto'
    }}>
      <h3 style={{
        margin: '0 0 16px 0',
        fontSize: 18,
        fontWeight: 600,
        color: '#111827'
      }}>
        我的动画 ({animations.length})
      </h3>

      {loading ? (
        <p style={{ 
          textAlign: 'center', 
          color: '#6b7280',
          fontSize: 14 
        }}>
          加载中...
        </p>
      ) : animations.length === 0 ? (
        <p style={{ 
          textAlign: 'center', 
          color: '#6b7280', 
          fontSize: 14,
          lineHeight: 1.6
        }}>
          还没有保存的动画<br/>
          运行模拟后点击"下载动画"即可保存
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10
        }}>
          {animations.map((anim) => (
            <div
              key={anim.id}
              style={{
                position: 'relative'
              }}
            >
              <div
                onClick={(e) => handleCardClick(anim.id, e)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  transition: 'all 0.2s',
                  backgroundColor: 'white',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
              {/* 封面图 */}
              <div style={{
                width: '100%',
                height: 80,
                background: anim.thumbnail_url 
                  ? '#f3f4f6'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 30,
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
                
                {/* 菜单按钮 - 右上角 */}
                <button
                  className="menu-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === anim.id ? null : anim.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    color: '#6b7280',
                    fontSize: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    zIndex: 10
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                  }}
                >
                  ⋯
                </button>
              </div>

              {/* 下拉菜单 - 移到外层，避免被遮挡 */}
              {menuOpen === anim.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 32,
                    right: 4,
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    padding: '4px 0',
                    minWidth: 120,
                    zIndex: 200
                  }}
                >
                    {/* 删除 */}
                    <button
                      onClick={() => handleDelete(anim.id)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      🗑️ 删除
                    </button>

                    {/* 上传到广场 / 从广场下架 */}
                    {anim.is_public ? (
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch(`http://localhost:8000/api/animations/${anim.id}/unpublish`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const data = await response.json();
                            if (data.code === 0) {
                              alert('已从广场下架');
                              loadAnimations();
                              setMenuOpen(null);
                            }
                          } catch (error) {
                            alert('下架失败');
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#6b7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        📥 从广场下架
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(anim.id)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        📤 上传到广场
                      </button>
                    )}

                    {/* 分享链接 */}
                    <button
                      onClick={() => {
                        setShareAnimationId(anim.id);
                        setMenuOpen(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdf4'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      🔗 分享链接
                    </button>
                  </div>
                )}

              {/* 标题和时间 */}
              <div style={{
                padding: 6,
                background: 'white'
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={anim.title}
                >
                  {anim.title}
                </div>
                <div style={{
                  fontSize: 10,
                  color: '#9ca3af',
                  marginTop: 2
                }}>
                  {new Date(anim.created_at).toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分享链接弹窗 */}
      <ShareLinkModal
        isOpen={shareAnimationId !== null}
        onClose={() => setShareAnimationId(null)}
        animationId={shareAnimationId}
      />
    </div>
  );
}

