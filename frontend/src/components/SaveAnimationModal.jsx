/**
 * 保存动画弹窗组件
 * ---------------------------------
 * 功能：
 * - 显示封面预览
 * - 输入动画名称和描述
 * - 调用后端 API 保存动画到我的动画库
 * 
 * 使用：
 * <SaveAnimationModal
 *   isOpen={showSaveModal}
 *   onClose={() => setShowSaveModal(false)}
 *   sceneData={...}  // 包含 imagePreview, objects, constraints 等
 * />
 */

import React, { useState } from 'react';
import useAuthStore from '../store/authStore';

export default function SaveAnimationModal({ isOpen, onClose, sceneData, getSceneData }) {
  // 优先使用 getSceneData 函数（动态获取最新数据），否则用传入的 sceneData
  const getCurrentSceneData = () => {
    if (getSceneData) {
      return getSceneData();
    }
    return sceneData;
  };
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPublishPrompt, setShowPublishPrompt] = useState(false); // 是否显示上传询问
  const [savedAnimationId, setSavedAnimationId] = useState(null); // 保存后的动画ID
  const [showAuthor, setShowAuthor] = useState(true); // 是否显示作者
  const [dontAskAgain, setDontAskAgain] = useState(false); // 不再提醒
  const token = useAuthStore((state) => state.token);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  const handleSave = async () => {
    // 检查登录状态
    if (!isLoggedIn || !token) {
      alert('请先登录后再保存动画');
      return;
    }

    // 检查必填字段
    if (!title.trim()) {
      alert('请输入动画名称');
      return;
    }

    // 获取最新的场景数据
    const currentSceneData = getCurrentSceneData();
    
    // 检查场景数据
    if (!currentSceneData) {
      alert('场景数据不存在，请重新运行模拟');
      return;
    }

    setSaving(true);
    try {
      console.log('[SaveAnimationModal] 准备保存动画:', {
        title: title.trim(),
        hasSceneData: !!currentSceneData,
        sceneDataKeys: currentSceneData ? Object.keys(currentSceneData) : [],
        objectsCount: currentSceneData?.objects?.length || 0,
        hasSprites: currentSceneData?.objects?.[0]?.sprite_data_url ? '有精灵图' : '无精灵图'
      });
      
      // 使用 imagePreview（OpenCV 处理后的图片）作为封面
      // 注意：这可能是处理后的背景消除图，后期再优化为原图
      const thumbnailUrl = currentSceneData?.imagePreview || null;
      
      console.log('[SaveAnimationModal] 封面图URL（处理后的图片）:', thumbnailUrl ? '存在' : '不存在');
      
      const response = await fetch('http://localhost:8000/api/animations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl,
          scene_data: currentSceneData || {}
        })
      });
      
      console.log('[SaveAnimationModal] 响应状态:', response.status);

      const data = await response.json();
      
      if (data.code === 0) {
        const animId = data.data.id;
        setSavedAnimationId(animId);
        
        // 检查是否需要询问上传到广场
        const dontAsk = localStorage.getItem('dontAskPublish') === 'true';
        
        if (dontAsk) {
          // 用户选择了"不再提醒"，直接关闭
          alert('✅ 保存成功！');
          onClose();
          setTitle('');
          setDescription('');
        } else {
          // 显示上传到广场的询问
          setShowPublishPrompt(true);
        }
      } else {
        alert(`保存失败：${data.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('保存动画失败:', error);
      alert(`保存失败：${error.message || '网络错误'}`);
    } finally {
      setSaving(false);
    }
  };

  // 处理上传到广场
  const handlePublishToPlaza = async () => {
    if (!savedAnimationId) return;

    try {
      const response = await fetch(`http://localhost:8000/api/animations/${savedAnimationId}/publish?show_author=${showAuthor}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.code === 0) {
        // 保存"不再提醒"设置
        if (dontAskAgain) {
          localStorage.setItem('dontAskPublish', 'true');
        }
        
        alert('✅ 已保存到我的动画并上传到广场！');
        handleCloseAll();
      } else {
        alert(`上传失败：${data.message}`);
      }
    } catch (error) {
      alert(`上传失败：${error.message}`);
    }
  };

  // 跳过上传
  const handleSkipPublish = () => {
    // 保存"不再提醒"设置
    if (dontAskAgain) {
      localStorage.setItem('dontAskPublish', 'true');
    }
    
    alert('✅ 保存成功！');
    handleCloseAll();
  };

  // 关闭所有弹窗并重置
  const handleCloseAll = () => {
    onClose();
    setShowPublishPrompt(false);
    setSavedAnimationId(null);
    setTitle('');
    setDescription('');
    setShowAuthor(true);
    setDontAskAgain(false);
  };

  // 处理关闭
  const handleClose = () => {
    if (!saving) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // 如果显示上传询问弹窗
  if (showPublishPrompt) {
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
        onClick={handleCloseAll}
      >
        <div 
          style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            width: '90%',
            maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: 18, 
            fontWeight: 600,
            color: '#111827'
          }}>
            ✅ 保存成功！
          </h3>

          <p style={{ 
            margin: '0 0 20px 0',
            fontSize: 14,
            color: '#6b7280',
            lineHeight: 1.6
          }}>
            是否将动画分享到<strong>动画广场</strong>？<br/>
            分享后其他用户也能看到并使用
          </p>

          {/* 是否显示用户名 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ 
              fontSize: 14, 
              fontWeight: 500,
              color: '#374151',
              marginBottom: 8,
              display: 'block'
            }}>
              是否公开显示你的用户名？
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  checked={showAuthor}
                  onChange={() => setShowAuthor(true)}
                  style={{ marginRight: 6 }}
                />
                <span style={{ fontSize: 14 }}>显示用户名</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  checked={!showAuthor}
                  onChange={() => setShowAuthor(false)}
                  style={{ marginRight: 6 }}
                />
                <span style={{ fontSize: 14 }}>匿名</span>
              </label>
            </div>
          </div>

          {/* 不再提醒 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              <span style={{ fontSize: 13, color: '#6b7280' }}>不再提醒</span>
            </label>
          </div>

          {/* 按钮 */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            justifyContent: 'flex-end' 
          }}>
            <button
              onClick={handleSkipPublish}
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                background: 'white',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                color: '#374151'
              }}
            >
              暂不了
            </button>
            <button
              onClick={handlePublishToPlaza}
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                background: 'white',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                color: '#374151'
              }}
            >
              上传到广场
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 保存动画表单
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
      onClick={handleClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          width: '90%',
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ 
          margin: '0 0 20px 0', 
          fontSize: 20, 
          fontWeight: 600,
          color: '#111827'
        }}>
          保存动画到我的动画库
        </h3>

        {/* 封面预览 */}
        {getCurrentSceneData()?.imagePreview && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <img 
              src={getCurrentSceneData().imagePreview} 
              alt="封面预览"
              style={{
                maxWidth: '100%',
                maxHeight: 200,
                borderRadius: 8,
                border: '2px solid #e5e7eb',
                objectFit: 'contain'
              }}
            />
            <p style={{ 
              fontSize: 12, 
              color: '#6b7280', 
              marginTop: 8 
            }}>
              封面预览
            </p>
          </div>
        )}

        {/* 动画名称 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: 6, 
            fontSize: 14, 
            fontWeight: 500,
            color: '#374151'
          }}>
            动画名称 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：弹性碰撞演示"
            maxLength={100}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '2px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
          <p style={{ 
            fontSize: 12, 
            color: '#6b7280', 
            marginTop: 4 
          }}>
            {title.length}/100
          </p>
        </div>

        {/* 描述（可选） */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: 6, 
            fontSize: 14, 
            fontWeight: 500,
            color: '#374151'
          }}>
            描述（可选）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述这个动画的内容，例如：展示两个小球在光滑斜面上的弹性碰撞过程..."
            maxLength={500}
            rows={4}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '2px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
          <p style={{ 
            fontSize: 12, 
            color: '#6b7280', 
            marginTop: 4 
          }}>
            {description.length}/500
          </p>
        </div>

        {/* 按钮 - 简洁风格，与"取消"按钮一致 */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          justifyContent: 'flex-end' 
        }}>
          <button
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              background: 'white',
              borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: '#374151'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              background: saving || !title.trim() ? '#f3f4f6' : 'white',
              borderRadius: 8,
              cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: saving || !title.trim() ? '#9ca3af' : '#374151'
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

