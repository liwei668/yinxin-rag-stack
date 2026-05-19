import { NextResponse } from 'next/server';
import { modelStore } from '../../../src/lib/modelStore';
import { logger } from '../../../src/lib/logger';

/**
 * 公开的模型列表接口（不需要管理员权限）
 * 只返回已启用的大语言模型，供聊天界面模型选择使用
 */
export async function GET() {
  try {
    const allModels = modelStore.getAll();

    // 只返回已启用的聊天模型（LLM 和多模态），隐藏敏感信息（apiKey 等）
    const chatModels = allModels
      .filter(m => (m.type === 'llm' || m.type === 'multimodal') && m.isEnabled)
      .map(m => ({
        id: m.id,
        name: m.name,
        modelId: m.modelId,
        provider: m.provider,
        isDefault: m.isDefault,
        type: m.type,
      }));

    return NextResponse.json({
      success: true,
      models: chatModels,
    });
  } catch (error) {
    logger.error('SYSTEM', '获取模型列表失败', { extra: { error: String(error) } });
    return NextResponse.json(
      { success: false, error: '获取模型列表失败' },
      { status: 500 }
    );
  }
}
