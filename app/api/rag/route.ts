// RAG API路由（简化版 - 旧版功能已移除）
import { NextRequest, NextResponse } from 'next/server';
import { ragService } from '../../../src/api/rag';
import { logger } from '../../../src/lib/logger';

// 初始化向量数据库
let initialized = false;
const initializeVectorDB = async () => {
  if (!initialized) {
    try {
      const { vectorDB } = await import('../../../src/lib/vectorDB');
      await vectorDB.init();
      initialized = true;
    } catch (error) {
      logger.error('SYSTEM', 'Error initializing vector DB', { extra: { error: String(error) } });
    }
  }
};

// 确保向量数据库已初始化
initializeVectorDB();

export async function POST(request: NextRequest) {
  try {
    // 处理查询请求
    const { query, type, filter } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 });
    }
    
    let result;
    switch (type) {
      case 'hybrid':
        result = await ragService.generateWithHybridRetrieval(query);
        break;
      case 'filtered':
        result = await ragService.generateWithFilteredKnowledge(query, filter);
        break;
      default:
        result = await ragService.generateWithKnowledge(query);
    }
    
    return NextResponse.json(result);
  } catch (error) {
    logger.error('SYSTEM', 'RAG API error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'RAG processing failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      // 旧版功能已移除
      default:
        return NextResponse.json({ error: 'API endpoint deprecated' }, { status: 410 });
    }
  } catch (error) {
    logger.error('SYSTEM', 'RAG API GET error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: 'RAG API failed' },
      { status: 500 }
    );
  }
}
