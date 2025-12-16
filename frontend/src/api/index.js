/**
 * API 统一导出
 * ---------------------------------
 * 功能：
 * - 将 physicsApi 与 mathApi 的方法统一导出，便于页面/组件按需导入。
 *
 * 后续扩展：
 * - 若增加其它域（用户鉴权、热门动画等），在此添加新的导出。
 */

export * as physicsApi from './physicsApi.js';
export * as mathApi from './mathApi.js';