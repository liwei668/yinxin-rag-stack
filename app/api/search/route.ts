import { NextRequest, NextResponse } from 'next/server'
import { callAPI } from '../../../src/api/apiManager'
import { logger } from '../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { query, type = 'web' } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }
    
    // 使用API管理中心调用 Tavily 搜索API
    const result = await callAPI('tavily', 'search', query)
    
    return NextResponse.json(result)
  } catch (error) {
    logger.error('SYSTEM', 'Search error', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
