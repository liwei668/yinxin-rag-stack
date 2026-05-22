// Prompts API V2 封装 - 基于 SQLite 存储
// 提供提示词模板管理、版本管理、调用日志、统计分析功能

const API_BASE = '/api/prompts-v2';

// ========== 类型定义 ==========

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string; // JSON array
  categories: string; // JSON array
  associatedKnowledgeDocs: string; // JSON array
  isActive: number;
  isDefault: number;
  type: string;
  scenario: string; // JSON array
  useCount?: number;
  successCount?: number;
  failCount?: number;
  successRate?: number | null;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptTemplateVersion {
  id: string;
  templateId: string;
  content: string;
  version: string;
  createdAt: string;
}

export interface PromptTemplateLog {
  id: string;
  templateId: string;
  userId: string | null;
  sessionId: string | null;
  callStatus: number;
  errorType: string | null;
  errorMsg: string | null;
  variables: string | null; // JSON
  responseTime: number | null;
  createdAt: string;
}

export interface PromptStats {
  id: string;
  name: string;
  useCount: number;
  successCount: number;
  failCount: number;
  successRate: number;
  lastUsedAt?: string;
}

export interface CreatePromptData {
  name: string;
  description?: string;
  content: string;
  variables?: string[];
  categories?: string[];
  type?: string;
  scenario?: string[];
}

export interface UpdatePromptData {
  name?: string;
  description?: string;
  content?: string;
  variables?: string[];
  categories?: string[];
  type?: string;
  scenario?: string[];
  isActive?: number;
}

export interface RecordLogData {
  templateId: string;
  userId?: string;
  sessionId?: string;
  callStatus: boolean;
  errorType?: string;
  errorMsg?: string;
  variables?: Record<string, any>;
  responseTime?: number;
}

// ========== 基础请求封装 ==========

async function get(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function post(body: any) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ========== 提示词模板管理 ==========

/**
 * 获取所有提示词模板
 * @param activeOnly 是否只获取启用的
 */
export async function getPromptsList(activeOnly = false): Promise<PromptTemplate[]> {
  const data = await get(`${API_BASE}?action=list&activeOnly=${activeOnly}`);
  return data.templates;
}

/**
 * 获取单个提示词模板详情
 */
export async function getPromptDetail(id: string): Promise<PromptTemplate> {
  const data = await get(`${API_BASE}?action=detail&id=${id}`);
  return data.template;
}

/**
 * 获取默认提示词模板
 */
export async function getDefaultPrompt(): Promise<PromptTemplate | undefined> {
  const data = await get(`${API_BASE}?action=default`);
  return data.template;
}

/**
 * 创建提示词模板
 */
export async function createPrompt(data: CreatePromptData): Promise<PromptTemplate> {
  const result = await post({
    action: 'create',
    ...data,
  });
  return result.template;
}

/**
 * 更新提示词模板
 * @param id 模板ID
 * @param data 更新数据
 */
export async function updatePrompt(id: string, data: UpdatePromptData): Promise<void> {
  await post({
    action: 'update',
    id,
    ...data,
  });
}

/**
 * 删除提示词模板
 */
export async function deletePrompt(id: string): Promise<void> {
  await post({
    action: 'delete',
    id,
  });
}

/**
 * 设置默认提示词模板
 */
export async function setDefaultPrompt(id: string): Promise<void> {
  await post({
    action: 'setDefault',
    id,
  });
}

// ========== 模板版本管理 ==========

/**
 * 获取模板的所有版本
 */
export async function getPromptVersions(templateId: string): Promise<PromptTemplateVersion[]> {
  const data = await get(`${API_BASE}?action=versions&id=${templateId}`);
  return data.versions;
}

/**
 * 恢复到指定版本
 * @param templateId 模板ID
 * @param versionId 版本ID
 */
export async function restorePromptVersion(templateId: string, versionId: string): Promise<void> {
  await post({
    action: 'restoreVersion',
    templateId,
    versionId,
  });
}

// ========== 调用日志记录 ==========

/**
 * 获取模板的调用日志
 * @param templateId 模板ID
 * @param limit 返回条数，默认100
 */
export async function getPromptLogs(templateId: string, limit = 100): Promise<PromptTemplateLog[]> {
  const data = await get(`${API_BASE}?action=logs&id=${templateId}&limit=${limit}`);
  return data.logs;
}

/**
 * 记录一次模板调用
 * 通常在调用 AI 后记录
 */
export async function recordPromptLog(data: RecordLogData): Promise<void> {
  await post({
    action: 'recordLog',
    ...data,
  });
}

// ========== 统计分析 ==========

/**
 * 获取单个模板的统计数据
 */
export async function getPromptStats(templateId: string): Promise<{
  useCount: number;
  successCount: number;
  failCount: number;
  successRate: number;
  lastUsedAt?: string;
}> {
  const data = await get(`${API_BASE}?action=stats&id=${templateId}`);
  return data.stats;
}

/**
 * 获取所有模板的统计数据
 */
export async function getAllPromptStats(): Promise<PromptStats[]> {
  const data = await get(`${API_BASE}?action=allStats`);
  return data.stats;
}

/**
 * 重新计算模板的统计数据
 * 从日志重新计算，用于修复统计错误
 */
export async function recalculatePromptStats(templateId: string): Promise<void> {
  await post({
    action: 'recalculateStats',
    id: templateId,
  });
}

// ========== 便捷组合方法 ==========

/**
 * 获取模板完整信息（详情 + 版本 + 日志 + 统计）
 */
export async function getPromptFullInfo(templateId: string) {
  const [template, versions, logs, stats] = await Promise.all([
    getPromptDetail(templateId),
    getPromptVersions(templateId),
    getPromptLogs(templateId, 50),
    getPromptStats(templateId),
  ]);

  return {
    template,
    versions,
    logs,
    stats,
  };
}

/**
 * 创建并自动设为默认（如果是第一个模板）
 */
export async function createPromptWithDefaultCheck(data: CreatePromptData): Promise<PromptTemplate> {
  const template = await createPrompt(data);
  
  // 检查是否已有默认模板
  const existing = await getPromptsList();
  const hasDefault = existing.some(t => t.isDefault);
  
  // 如果没有默认，设为新创建的
  if (!hasDefault && existing.length === 1) {
    await setDefaultPrompt(template.id);
  }
  
  return template;
}

// ========== 导出默认对象 ==========

export default {
  // 模板管理
  getList: getPromptsList,
  getDetail: getPromptDetail,
  getDefault: getDefaultPrompt,
  create: createPrompt,
  update: updatePrompt,
  delete: deletePrompt,
  setDefault: setDefaultPrompt,
  
  // 版本管理
  getVersions: getPromptVersions,
  restoreVersion: restorePromptVersion,
  
  // 日志
  getLogs: getPromptLogs,
  recordLog: recordPromptLog,
  
  // 统计
  getStats: getPromptStats,
  getAllStats: getAllPromptStats,
  recalculateStats: recalculatePromptStats,
  
  // 组合方法
  getFullInfo: getPromptFullInfo,
  createWithDefaultCheck: createPromptWithDefaultCheck,
};
