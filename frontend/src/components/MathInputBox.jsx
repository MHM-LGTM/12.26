/**
 * 数学解题输入框组件（最小可用）
 * ---------------------------------
 * 功能：
 * - 输入文本描述，支持上传题图（可选）；
 * - 调用后端 `/math/upload` 与 `/math/render` 创建演示渲染任务；
 * - 显示返回的 `task_id`。
 *
 * 后续扩展：
 * - 接入 TTS 与 Manim 渲染状态轮询；
 * - 页面展示渲染结果视频预览。
 */

import React, { useState, useRef } from 'react';
import { uploadImage, renderDemo } from '../api/mathApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ErrorToast from './ErrorToast.jsx';

export default function MathInputBox() {
  const [prompt, setPrompt] = useState('演示：请展示抛物线 y = x^2');
  const [imagePreview, setImagePreview] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [taskId, setTaskId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      setImagePreview(URL.createObjectURL(file));
      setLoading(true);
      setError('');
      try {
        const resp = await uploadImage(file);
        setImagePath(resp?.data?.path || '');
      } catch (e) {
        setError('图片上传失败');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const createRender = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await renderDemo({ prompt, image_path: imagePath || null });
      setTaskId(resp?.data?.task_id || '');
    } catch (e) {
      setError('创建渲染任务失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="textarea-wrap" style={{ position: 'relative', marginBottom: 12 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          style={{ width: '100%', padding: '12px 12px 48px', borderRadius: 12, border: '2px solid #d0d0d0' }}
          placeholder="输入你的数学问题或演示描述"
        />
        {/* 左下角：上传题图按钮 */}
        <button
          className="start-btn"
          onClick={pickFile}
          style={{ position: 'absolute', left: 10, bottom: 8 }}
        >
          上传题图
        </button>
        {/* 右下角：创建讲解视频按钮 */}
        <button
          className="start-btn"
          onClick={createRender}
          disabled={loading}
          style={{ position: 'absolute', right: 10, bottom: 8 }}
        >
          创建讲解视频 →
        </button>
      </div>
      {/* 隐藏文件输入（由“上传题图”按钮触发） */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* 预览（可选） */}
      {imagePreview && (
        <div style={{ marginTop: 8 }}>
          <img src={imagePreview} alt="preview" style={{ maxWidth: '240px', borderRadius: 12, border: '2px solid #d0d0d0' }} />
        </div>
      )}

      {taskId && <div className="status-line">任务创建成功，task_id：{taskId}</div>}
      {loading && <LoadingSpinner text="处理中..." />}
      <ErrorToast message={error} />
    </div>
  );
}
  const pickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      setError('');
      setImagePreview(URL.createObjectURL(file));
      await uploadImage(file);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '上传题图失败');
    }
  };