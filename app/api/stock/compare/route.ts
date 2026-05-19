/**
 * 股票对比 API
 * 功能：对比两只股票的各项指标，展示数据差异
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchStock, fetchQuote, fetchKLineData, fetchFundamentals, fetchMoneyFlow } from '@/lib/stockData';
import { analyzeStock } from '@/lib/stockAnalyzer';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { stock1, stock2 } = await request.json();
    
    if (!stock1 || !stock2) {
      return NextResponse.json({ error: '请输入两只股票进行对比' }, { status: 400 });
    }
    
    // 搜索两只股票
    const [info1, info2] = await Promise.all([
      searchStock(stock1),
      searchStock(stock2),
    ]);
    
    if (!info1) {
      return NextResponse.json({ error: `未找到股票: ${stock1}` }, { status: 404 });
    }
    if (!info2) {
      return NextResponse.json({ error: `未找到股票: ${stock2}` }, { status: 404 });
    }
    
    // 并行获取两只股票的所有数据
    const [data1, data2] = await Promise.all([
      fetchAllData(info1.code),
      fetchAllData(info2.code),
    ]);
    
    // 构建对比结果
    const comparison = buildComparison(data1, data2);
    
    return NextResponse.json({
      success: true,
      data: comparison,
    });
    
  } catch (error: any) {
    logger.error('SYSTEM', '错误', { extra: { error: String(error) } });
    return NextResponse.json({ 
      error: error.message || '对比失败，请稍后重试' 
    }, { status: 500 });
  }
}

// 获取单只股票的所有数据
async function fetchAllData(code: string) {
  const [quote, klines, fundamentals, moneyFlow] = await Promise.all([
    fetchQuote(code),
    fetchKLineData(code),
    fetchFundamentals(code),
    fetchMoneyFlow(code),
  ]);
  
  // 计算技术分析
  let analysis = null;
  if (quote && klines.length > 0) {
    analysis = analyzeStock(code, quote.name, quote, klines);
  }
  
  return {
    code,
    name: quote?.name || '',
    quote,
    klines,
    fundamentals,
    moneyFlow,
    analysis,
  };
}

// 构建对比数据
function buildComparison(data1: any, data2: any) {
  const q1 = data1.quote;
  const q2 = data2.quote;
  const f1 = data1.fundamentals;
  const f2 = data2.fundamentals;
  const m1 = data1.moneyFlow;
  const m2 = data2.moneyFlow;
  const a1 = data1.analysis;
  const a2 = data2.analysis;
  
  return {
    stock1: {
      code: data1.code,
      name: data1.name,
    },
    stock2: {
      code: data2.code,
      name: data2.name,
    },
    
    // 价格对比
    price: {
      stock1: q1?.price || 0,
      stock2: q2?.price || 0,
      unit: '元',
    },
    
    // 技术面对比
    technical: {
      position: {
        stock1: a1?.position || '-',
        stock2: a2?.position || '-',
        percentile1: a1?.percentile || 0,
        percentile2: a2?.percentile || 0,
      },
      trend: {
        stock1: a1?.trend || '-',
        stock2: a2?.trend || '-',
      },
      support: {
        stock1: a1 ? `${a1.supportLow}-${a1.supportHigh}` : '-',
        stock2: a2 ? `${a2.supportLow}-${a2.supportHigh}` : '-',
      },
      resistance: {
        stock1: a1 ? `${a1.resistanceLow}-${a1.resistanceHigh}` : '-',
        stock2: a2 ? `${a2.resistanceLow}-${a2.resistanceHigh}` : '-',
      },
    },
    
    // 基本面对比
    fundamentals: {
      pe: {
        stock1: f1?.pe || 0,
        stock2: f2?.pe || 0,
        diff: calcDiff(f1?.pe, f2?.pe),
        unit: '倍',
        label: '市盈率',
      },
      pb: {
        stock1: f1?.pb || 0,
        stock2: f2?.pb || 0,
        diff: calcDiff(f1?.pb, f2?.pb),
        unit: '倍',
        label: '市净率',
      },
      roe: {
        stock1: f1?.roe || 0,
        stock2: f2?.roe || 0,
        diff: calcDiff(f1?.roe, f2?.roe),
        unit: '%',
        label: 'ROE',
      },
      grossMargin: {
        stock1: f1?.grossMargin || 0,
        stock2: f2?.grossMargin || 0,
        diff: calcDiff(f1?.grossMargin, f2?.grossMargin),
        unit: '%',
        label: '毛利率',
      },
      netMargin: {
        stock1: f1?.netMargin || 0,
        stock2: f2?.netMargin || 0,
        diff: calcDiff(f1?.netMargin, f2?.netMargin),
        unit: '%',
        label: '净利率',
      },
    },
    
    // 资金面对比
    moneyFlow: {
      mainNetInflow: {
        stock1: m1?.mainNetInflow || 0,
        stock2: m2?.mainNetInflow || 0,
        unit: '万',
        label: '主力净流入',
      },
      superLargeNetInflow: {
        stock1: m1?.superLargeNetInflow || 0,
        stock2: m2?.superLargeNetInflow || 0,
        unit: '万',
        label: '超大单净流入',
      },
    },
    
    // 当月周期（相同）
    month: a1?.month || new Date().getMonth() + 1,
    monthTip: a1?.monthTip || '',
  };
}

// 计算差异百分比
function calcDiff(val1?: number, val2?: number): string {
  if (!val1 || !val2 || val2 === 0) return '-';
  const diff = ((val1 - val2) / val2) * 100;
  if (Math.abs(diff) < 1) return '相当';
  return diff > 0 ? `高${Math.abs(diff).toFixed(0)}%` : `低${Math.abs(diff).toFixed(0)}%`;
}
