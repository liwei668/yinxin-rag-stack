/**
 * 对话沉淀服务
 *
 * 在每次聊天完成后，自动判断对话质量，将高质量对话沉淀到知识库。
 * 三道过滤：敏感词过滤 → 质量过滤 → 去重过滤。
 */

import * as fs from 'fs';
import * as path from 'path';

// ========== 配置常量 ==========

/** 沉淀文件路径（JSONL 格式，每行一条 JSON 记录） */
const LEARNING_FILE_PATH = path.join(process.cwd(), 'data', 'conversation-learning.jsonl');

/** 用户消息最低字数 */
const MIN_USER_LENGTH = 10;

/** AI 回复最低字数 */
const MIN_AI_LENGTH = 50;

/** 用户消息 + AI 回复总最低字数 */
const MIN_TOTAL_LENGTH = 100;

/** 去重相似度阈值，超过此值视为重复 */
const DUPLICATE_THRESHOLD = 0.85;

// ========== 敏感词正则 ==========

const SENSITIVE_PATTERNS: RegExp[] = [
  /\d{4,}[\.\d]*\s*元(?!税)/,       // 精确金额（4位以上数字+元，排除"税率"等）
  /1[3-9]\d{9}/,                     // 手机号
  /\d{17}[\dXx]/,                    // 身份证号
  /\w+@\w+\.\w+/,                    // 邮箱
  /密码|password|secret/i,            // 密码相关
];

// ========== 纯闲聊正则 ==========

const CHITCHAT_PATTERN = /^(你好|嗨|hi|hello|谢谢|好的|嗯|哦|知道了|再见|拜拜|ok|OK)$/i;

// ========== 类型定义 ==========

/** 沉淀记录结构 */
interface LearningRecord {
  timestamp: string;
  userMessage: string;
  aiResponse: string;
  learnedAt: string;
}

/** 函数返回值 */
interface LearnResult {
  learned: boolean;
  reason?: string;
}

// ========== 内部工具函数 ==========

/**
 * 敏感词过滤
 * 检测用户消息和 AI 回复中是否包含敏感信息
 */
function containsSensitiveContent(userMessage: string, aiResponse: string): boolean {
  const combined = userMessage + aiResponse;
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(combined));
}

/**
 * 质量过滤
 * 检查对话是否满足最低质量要求
 */
function meetsQualityThreshold(userMessage: string, aiResponse: string): boolean {
  // 用户消息 + AI 回复总长度不足
  const totalLength = userMessage.length + aiResponse.length;
  if (totalLength < MIN_TOTAL_LENGTH) {
    return false;
  }

  // 用户消息过短（纯闲聊）
  if (userMessage.length < MIN_USER_LENGTH) {
    return false;
  }

  // AI 回复过短
  if (aiResponse.length < MIN_AI_LENGTH) {
    return false;
  }

  // 用户消息是纯闲聊
  if (CHITCHAT_PATTERN.test(userMessage.trim())) {
    return false;
  }

  return true;
}

/**
 * 计算两个字符串的字符级 Jaccard 相似度
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a);
  const setB = new Set(b);

  // 计算交集大小
  let intersection = 0;
  for (const char of setA) {
    if (setB.has(char)) {
      intersection++;
    }
  }

  // 计算并集大小
  const union = setA.size + setB.size - intersection;

  // 避免除以零
  if (union === 0) {
    return 0;
  }

  return intersection / union;
}

/**
 * 去重过滤
 * 读取已有沉淀记录，判断新对话是否与已有内容高度重复
 */
function isDuplicate(userMessage: string, aiResponse: string, existingRecords: LearningRecord[]): boolean {
  const newCombined = userMessage + aiResponse;

  for (const record of existingRecords) {
    const existingCombined = record.userMessage + record.aiResponse;
    const similarity = jaccardSimilarity(newCombined, existingCombined);

    if (similarity > DUPLICATE_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/**
 * 读取已有的沉淀记录
 * 文件不存在时返回空数组
 */
function readExistingRecords(): LearningRecord[] {
  try {
    if (!fs.existsSync(LEARNING_FILE_PATH)) {
      return [];
    }

    const content = fs.readFileSync(LEARNING_FILE_PATH, 'utf-8').trim();
    if (!content) {
      return [];
    }

    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as LearningRecord);
  } catch (error) {
    // 文件读取异常时返回空数组，不影响主流程
    return [];
  }
}

/**
 * 追加一条沉淀记录到 JSONL 文件
 * 文件不存在时自动创建
 */
function appendRecord(record: LearningRecord): void {
  // 确保目录存在
  const dir = path.dirname(LEARNING_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(record, null, 0) + '\n';
  fs.appendFileSync(LEARNING_FILE_PATH, line, 'utf-8');
}

// ========== 导出接口 ==========

/**
 * 从对话中学习（沉淀）
 *
 * 三道过滤流程：
 *   1. 敏感词过滤 —— 包含金额、手机号、身份证、邮箱、密码等敏感信息则跳过
 *   2. 质量过滤   —— 对话长度不足或纯闲聊则跳过
 *   3. 去重过滤   —— 与已有沉淀内容相似度超过 85% 则跳过
 *
 * @param userMessage 用户消息
 * @param aiResponse  AI 回复
 * @returns { learned: boolean, reason?: string } 是否沉淀成功及原因
 */
export async function learnFromConversation(
  userMessage: string,
  aiResponse: string,
): Promise<LearnResult> {
  // ---------- 第一道：敏感词过滤 ----------
  if (containsSensitiveContent(userMessage, aiResponse)) {
    return {
      learned: false,
      reason: '包含敏感信息（金额/手机号/身份证/邮箱/密码），跳过沉淀',
    };
  }

  // ---------- 第二道：质量过滤 ----------
  if (!meetsQualityThreshold(userMessage, aiResponse)) {
    return {
      learned: false,
      reason: '对话质量不满足最低要求（长度不足或纯闲聊），跳过沉淀',
    };
  }

  // ---------- 第三道：去重过滤 ----------
  const existingRecords = readExistingRecords();
  if (isDuplicate(userMessage, aiResponse, existingRecords)) {
    return {
      learned: false,
      reason: '与已有知识库内容相似度超过 85%，跳过重复沉淀',
    };
  }

  // ---------- 通过所有过滤，执行沉淀 ----------
  const now = new Date().toISOString();
  const record: LearningRecord = {
    timestamp: now,
    userMessage,
    aiResponse,
    learnedAt: now,
  };

  appendRecord(record);

  return {
    learned: true,
  };
}
