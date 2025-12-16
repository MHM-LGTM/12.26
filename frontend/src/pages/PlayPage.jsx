/**
 * 动画播放页
 * ---------------------------------
 * 功能：
 * - 通过分享码加载并播放动画
 * - 精简 UI，专注于动画展示
 * - 提供 Fork 到我的动画功能（需登录）
 * 
 * 使用：
 * 路由：/physics/play/:shareCode
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { runSimulation } from '../utils/physicsEngine.js';
import useAuthStore from '../store/authStore';

export default function PlayPage() {
  const { shareCode } = useParams();
  const [animation, setAnimation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [simulating, setSimulating] = useState(false);
  
  const imgRef = useRef(null);
  const simRef = useRef(null);
  const runningSimulation = useRef(null);
  
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  // 加载动画数据
  useEffect(() => {
    const loadAnimation = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/play/${shareCode}`);
        const data = await response.json();
        
        if (data.code === 0) {
          setAnimation(data.data);
          // 自动开始模拟
          setTimeout(() => handleStartSimulate(data.data), 1000);
        } else {
          setError(data.message || '动画不存在或链接已失效');
        }
      } catch (err) {
        console.error('加载动画失败:', err);
        setError('加载失败，请检查网络连接');
      } finally {
        setLoading(false);
      }
    };

    if (shareCode) {
      loadAnimation();
    }
  }, [shareCode]);

  // 开始模拟
  const handleStartSimulate = (animData = animation) => {
    if (!animData || !animData.scene_data) return;

    setSimulating(true);
    
    try {
      const sceneData = animData.scene_data;
      
      // 从 scene_data 中提取物体数据
      // scene_data.objects 是 assignments 数组，需要转换为物理引擎需要的格式
      const assignments = sceneData.objects || [];
      
      console.log('[PlayPage] ========== 调试信息 ==========');
      console.log('[PlayPage] assignments 数量:', assignments.length);
      console.log('[PlayPage] assignments 详情:', assignments);
      console.log('[PlayPage] 第一个物体的 sprite_data_url:', assignments[0]?.sprite_data_url?.substring(0, 50));
      
      // 转换为物理引擎需要的格式
      const objects = assignments.map((a, idx) => ({
        name: a.label || a.name || `elem-${idx}`,
        role: a.role || 'dynamic',
        parameters: a.parameters || {},
        contour: a.contour || [],
        sprite_data_url: a.sprite_data_url || null,  // 关键：精灵图
        is_concave: a.is_concave || false
      }));
      
      console.log('[PlayPage] 转换后的 objects:', objects);
      console.log('[PlayPage] 第一个 object 的 sprite_data_url:', objects[0]?.sprite_data_url?.substring(0, 50));
      console.log('[PlayPage] ==============================');
      
      const constraints = sceneData.constraints || [];

      // 清理旧模拟
      if (runningSimulation.current) {
        runningSimulation.current.stop();
        runningSimulation.current = null;
      }

      // 运行模拟
      const sim = runSimulation({
        container: simRef.current,
        objects,
        constraints,
        imageRect: imgRef.current?.getBoundingClientRect?.(),
        naturalSize: sceneData.imageNaturalSize || { w: 800, h: 600 },
      });
      
      runningSimulation.current = sim;
    } catch (err) {
      console.error('模拟失败:', err);
      alert('模拟失败：' + err.message);
    }
  };

  // Fork 到我的动画
  const handleFork = async () => {
    if (!isLoggedIn || !token) {
      alert('请先登录后再保存');
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/api/plaza/animations/${animation.id}/fork`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      const data = await response.json();
      
      if (data.code === 0) {
        alert('✅ 已保存到我的动画！\n\n返回首页可以在"我的动画"中查看。');
      } else {
        alert(`保存失败：${data.message}`);
      }
    } catch (error) {
      console.error('Fork 失败:', error);
      alert(`保存失败：${error.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f9fafb'
      }}>
        <p style={{ fontSize: 18, color: '#6b7280' }}>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f9fafb',
        gap: 16
      }}>
        <p style={{ fontSize: 18, color: '#ef4444' }}>❌ {error}</p>
        <a 
          href="/physics" 
          style={{
            padding: '10px 20px',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            textDecoration: 'none',
            color: '#374151'
          }}
        >
          返回首页
        </a>
      </div>
    );
  }

  return (
    <div style={{
      padding: 24,
      background: '#f9fafb',
      minHeight: '100vh'
    }}>
      {/* 顶部信息 */}
      <div style={{
        marginBottom: 16,
        background: 'white',
        padding: 16,
        borderRadius: 12,
        border: '1px solid #e5e7eb'
      }}>
        <h1 style={{
          margin: '0 0 8px 0',
          fontSize: 24,
          fontWeight: 600,
          color: '#111827'
        }}>
          📝 {animation.title}
        </h1>
        
        {animation.description && (
          <p style={{
            margin: '0 0 12px 0',
            fontSize: 14,
            color: '#6b7280',
            lineHeight: 1.6
          }}>
            {animation.description}
          </p>
        )}
        
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          fontSize: 14,
          color: '#9ca3af'
        }}>
          <span>❤️ {animation.like_count || 0} 点赞</span>
          {animation.author_name && (
            <span>👤 作者：{animation.author_name}</span>
          )}
        </div>
      </div>

      {/* 画布区域 */}
      <div style={{
        position: 'relative',
        marginBottom: 16
      }}>
        <div
          style={{
            position: 'relative',
            height: 480,
            maxWidth: 800,
            margin: '0 auto',
            borderRadius: 16,
            border: '2px solid #e5e7eb',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          {animation.scene_data?.imagePreview && (
            <>
              <img
                ref={imgRef}
                src={animation.scene_data.imagePreview}
                alt="动画场景"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 16,
                  pointerEvents: 'none',
                }}
              />
              <div
                ref={simRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  pointerEvents: 'none'
                }}
              />
            </>
          )}

          {/* 按钮 - 画布内右下角 */}
          <div style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            display: 'flex',
            gap: 12,
            zIndex: 10
          }}>
            <button
              onClick={() => handleStartSimulate()}
              disabled={simulating}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: '2px solid #d1d5db',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                cursor: simulating ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
            >
              {simulating ? '运行中...' : '▶️ 播放'}
            </button>
            
            <button
              onClick={handleFork}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: '2px solid #d1d5db',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
            >
              💾 保存到我的
            </button>
          </div>
        </div>
      </div>

      {/* 底部操作 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 12
      }}>
        <a 
          href="/physics" 
          style={{
            padding: '10px 20px',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            textDecoration: 'none',
            color: '#374151',
            fontSize: 14,
            fontWeight: 500
          }}
        >
          ← 返回首页
        </a>
      </div>
    </div>
  );
}

