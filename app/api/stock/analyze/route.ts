/**
 * 股票分析 API
 * 功能：获取股票数据、执行分析算法、调用AI生成解读
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchStock, fetchQuote, fetchKLineData } from '@/lib/stockData';
import { analyzeStock, generateAIPrompt } from '@/lib/stockAnalyzer';
import { logger } from '../../../../src/lib/logger';

// ==================== 配置 ====================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// ==================== 主处理函数 ====================

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();
    
    console.log('[股票分析] 收到请求:', keyword);
    
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: '请输入股票名称或代码' }, { status: 400 });
    }
    
    // 1. 搜索股票
    let stockInfo = await searchStock(keyword);
    
    // 如果搜索失败，尝试直接用关键词作为代码获取行情
    if (!stockInfo) {
      console.log('[股票分析] 搜索失败，尝试直接获取行情...');
      const quote = await fetchQuote(keyword.trim());
      if (quote) {
        stockInfo = {
          code: keyword.trim(),
          name: quote.name,
          market: keyword.trim().startsWith('6') ? 'sh' : 'sz',
        };
        console.log('[股票分析] 直接获取行情成功:', stockInfo);
      }
    }
    
    if (!stockInfo) {
      console.log('[股票分析] 未找到股票');
      return NextResponse.json({ error: '未找到该股票，请检查名称或代码' }, { status: 404 });
    }
    
    console.log('[股票分析] 找到股票:', stockInfo);
    
    // 2. 获取实时行情
    const quote = await fetchQuote(stockInfo.code);
    if (!quote) {
      return NextResponse.json({ error: '获取行情数据失败，请稍后重试' }, { status: 500 });
    }
    
    // 3. 获取K线历史数据
    const klines = await fetchKLineData(stockInfo.code);
    if (klines.length === 0) {
      return NextResponse.json({ error: '获取历史数据失败，请稍后重试' }, { status: 500 });
    }
    
    // 4. 执行分析算法
    const analysis = analyzeStock(stockInfo.code, stockInfo.name, quote, klines);
    
    // 5. 生成AI解读
    const prompt = generateAIPrompt(analysis);
    const aiAnalysis = await callAI(prompt);
    
    // 6. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        // 基本信息
        code: analysis.code,
        name: analysis.name,
        price: analysis.price,
        
        // 技术特征
        position: analysis.position,
        percentile: analysis.percentile,
        trend: analysis.trend,
        
        // 支撑压力
        supportLow: analysis.supportLow,
        supportHigh: analysis.supportHigh,
        resistanceLow: analysis.resistanceLow,
        resistanceHigh: analysis.resistanceHigh,
        
        // 当月周期
        month: analysis.month,
        monthTip: analysis.monthTip,
        monthTrend: analysis.monthTrend,
        
        // AI解读
        aiAnalysis,
        
        // 数据来源说明
        dataSource: '新浪财经',
        dataDelay: '约15分钟',
      },
    });
    
  } catch (error: any) {
    logger.error('SYSTEM', '错误', { extra: { error: String(error) } });
    return NextResponse.json({ 
      error: error.message || '分析失败，请稍后重试' 
    }, { status: 500 });
  }
}

// ==================== AI调用 ====================

async function callAI(prompt: string): Promise<string> {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`AI调用失败: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'AI分析生成失败';
    
  } catch (error: any) {
    logger.error('SYSTEM', '错误', { extra: { error: String(error) } });
    // 降级：返回基础分析
    return 'AI分析暂时不可用，请稍后重试。以上仅为数据展示，不构成任何投资建议。';
  }
}
