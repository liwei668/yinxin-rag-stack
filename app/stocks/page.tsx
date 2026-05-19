'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2, AlertTriangle, TrendingUp, TrendingDown, Minus, Calendar, Clock, X, GitCompare } from 'lucide-react';

// ==================== 类型定义 ====================

type PositionLevel = '低位' | '中位' | '高位';
type TrendDirection = '多头排列' | '空头排列' | '震荡整理';

interface StockAnalysisData {
  code: string;
  name: string;
  price: number;
  position: PositionLevel;
  percentile: number;
  trend: TrendDirection;
  supportLow: number;
  supportHigh: number;
  resistanceLow: number;
  resistanceHigh: number;
  month: number;
  monthTip: string;
  monthTrend: string;
  aiAnalysis: string;
  dataSource: string;
  dataDelay: string;
}

interface ComparisonData {
  stock1: { code: string; name: string };
  stock2: { code: string; name: string };
  price: { stock1: number; stock2: number; unit: string };
  technical: {
    position: { stock1: string; stock2: string; percentile1: number; percentile2: number };
    trend: { stock1: string; stock2: string };
    support: { stock1: string; stock2: string };
    resistance: { stock1: string; stock2: string };
  };
  fundamentals: {
    pe: { stock1: number; stock2: number; diff: string; unit: string; label: string };
    pb: { stock1: number; stock2: number; diff: string; unit: string; label: string };
    roe: { stock1: number; stock2: number; diff: string; unit: string; label: string };
    grossMargin: { stock1: number; stock2: number; diff: string; unit: string; label: string };
    netMargin: { stock1: number; stock2: number; diff: string; unit: string; label: string };
  };
  moneyFlow: {
    mainNetInflow: { stock1: number; stock2: number; unit: string; label: string };
    superLargeNetInflow: { stock1: number; stock2: number; unit: string; label: string };
  };
  month: number;
  monthTip: string;
}

interface SearchHistoryItem {
  code: string;
  name: string;
  count: number;
  lastSearch: string;
}

// ==================== 意图识别 ====================

interface IntentResult {
  type: 'analyze' | 'compare';
  stocks: string[];
}

function detectIntent(input: string): IntentResult {
  const text = input.trim();

  // 对比关键词
  const compareKeywords = ['对比', '比较', 'PK', 'pk', 'VS', 'vs', 'Vs', 'vS', '对决', '较量'];

  // 连接词
  const connectors = ['和', '与', '跟', '同', '及', '以及', '、'];

  // 检测对比关键词
  for (const keyword of compareKeywords) {
    if (text.includes(keyword)) {
      // 尝试分割
      const parts = text.split(keyword).map(s => s.trim()).filter(s => s);
      if (parts.length >= 2) {
        return { type: 'compare', stocks: [parts[0], parts[1]] };
      }
      // 关键词在开头或结尾的情况
      const remaining = text.replace(keyword, '').trim();
      // 尝试用连接词分割
      for (const conn of connectors) {
        if (remaining.includes(conn)) {
          const stocks = remaining.split(conn).map(s => s.trim()).filter(s => s);
          if (stocks.length >= 2) {
            return { type: 'compare', stocks: [stocks[0], stocks[1]] };
          }
        }
      }
    }
  }

  // 检测连接词（没有对比关键词但有连接词）
  for (const conn of connectors) {
    if (text.includes(conn)) {
      const parts = text.split(conn).map(s => s.trim()).filter(s => s);
      if (parts.length >= 2) {
        // 检查是否像股票名称
        if (parts[0].length >= 2 && parts[1].length >= 2) {
          return { type: 'compare', stocks: [parts[0], parts[1]] };
        }
      }
    }
  }

  // 默认：单股分析
  // 移除常见的分析关键词
  const analyzeKeywords = ['分析', '看看', '怎么样', '如何', '查', '查询', '搜索'];
  let stockName = text;
  for (const keyword of analyzeKeywords) {
    stockName = stockName.replace(keyword, '');
  }
  stockName = stockName.trim();

  return { type: 'analyze', stocks: [stockName || text] };
}

// ==================== 搜索历史管理 ====================

const HISTORY_KEY = 'stock_search_history';
const MAX_HISTORY = 8;

function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(history: SearchHistoryItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addToHistory(code: string, name: string) {
  const history = getSearchHistory();
  const existing = history.find(item => item.code === code);

  if (existing) {
    existing.count += 1;
    existing.lastSearch = new Date().toISOString();
    existing.name = name;
  } else {
    history.unshift({
      code,
      name,
      count: 1,
      lastSearch: new Date().toISOString(),
    });
  }

  const sorted = history
    .sort((a, b) => b.count - a.count || new Date(b.lastSearch).getTime() - new Date(a.lastSearch).getTime())
    .slice(0, MAX_HISTORY);

  saveSearchHistory(sorted);
}

// ==================== 交易状态判断 ====================

function getMarketStatus(): { status: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;

  if (day === 0 || day === 6) {
    return { status: 'closed', label: '休市' };
  }

  if ((time >= 570 && time <= 690) || (time >= 780 && time <= 900)) {
    return { status: 'trading', label: '交易中' };
  }

  if (time >= 555 && time < 570) {
    return { status: 'pre', label: '盘前集合竞价' };
  }

  if (time > 900) {
    return { status: 'closed', label: '已收盘' };
  }

  return { status: 'before', label: '未开盘' };
}

// ==================== 主组件 ====================

export default function StockAnalysisPage() {
  const router = useRouter();

  // 状态
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<IntentResult | null>(null);

  // 结果
  const [analysisData, setAnalysisData] = useState<StockAnalysisData | null>(null);
  const [compareData, setCompareData] = useState<ComparisonData | null>(null);

  // 通用状态
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [marketStatus, setMarketStatus] = useState({ status: '', label: '' });

  // 初始化
  useEffect(() => {
    setSearchHistory(getSearchHistory());
    setMarketStatus(getMarketStatus());

    const timer = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // 单股分析
  const analyzeStock = async (stockKeyword: string) => {
    if (!stockKeyword.trim()) {
      setError('请输入股票名称或代码');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysisData(null);
    setCompareData(null);

    try {
      const response = await fetch('/api/stock/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: stockKeyword }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '分析失败');
        return;
      }

      setAnalysisData(result.data);

      if (result.data?.code && result.data?.name) {
        addToHistory(result.data.code, result.data.name);
        setSearchHistory(getSearchHistory());
      }

    } catch (e: any) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 股票对比
  const compareStocks = async (stock1Name: string, stock2Name: string) => {
    if (!stock1Name.trim() || !stock2Name.trim()) {
      setError('请输入两只股票进行对比');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysisData(null);
    setCompareData(null);

    try {
      const response = await fetch('/api/stock/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock1: stock1Name, stock2: stock2Name }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '对比失败');
        return;
      }

      setCompareData(result.data);

      // 添加到历史
      if (result.data?.stock1?.code && result.data?.stock1?.name) {
        addToHistory(result.data.stock1.code, result.data.stock1.name);
      }
      if (result.data?.stock2?.code && result.data?.stock2?.name) {
        addToHistory(result.data.stock2.code, result.data.stock2.name);
      }
      setSearchHistory(getSearchHistory());

    } catch (e: any) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 处理搜索
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!keyword.trim()) {
      setError('请输入股票名称或代码');
      return;
    }

    const detected = detectIntent(keyword);
    setIntent(detected);

    if (detected.type === 'compare') {
      compareStocks(detected.stocks[0], detected.stocks[1]);
    } else {
      analyzeStock(detected.stocks[0]);
    }
  };

  // 点击历史股票
  const handleHistoryStock = (name: string) => {
    setKeyword(name);
    analyzeStock(name);
  };

  // 清除单条历史
  const handleRemoveHistory = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    const updated = searchHistory.filter(item => item.code !== code);
    saveSearchHistory(updated);
    setSearchHistory(updated);
  };

  // 获取位置颜色
  const getPositionColor = (position: PositionLevel) => {
    switch (position) {
      case '低位': return { bg: 'bg-green-50', text: 'text-green-600', bar: 'bg-green-500' };
      case '高位': return { bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-500' };
      default: return { bg: 'bg-yellow-50', text: 'text-yellow-600', bar: 'bg-yellow-500' };
    }
  };

  // 获取趋势图标
  const getTrendIcon = (trend: TrendDirection) => {
    switch (trend) {
      case '多头排列': return <TrendingUp className="text-green-500" size={18} />;
      case '空头排列': return <TrendingDown className="text-red-500" size={18} />;
      default: return <Minus className="text-yellow-500" size={18} />;
    }
  };

  // 格式化数值
  const formatValue = (val: number, unit: string = '') => {
    if (val === 0 || val === null || val === undefined) return '-';
    if (Math.abs(val) >= 10000) {
      return `${(val / 10000).toFixed(2)}亿${unit}`;
    }
    return `${val.toFixed(2)}${unit}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">返回首页</span>
          </button>
          <h1 className="font-medium text-gray-900">股票数据分析</h1>
          <div className="flex items-center gap-1.5">
            {marketStatus.status === 'trading' ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                {marketStatus.label}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} />
                {marketStatus.label}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* 搜索区域 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入股票名称或对比需求（如：茅台、对比茅台和比亚迪）"
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={loading}
              />
              <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  分析中
                </>
              ) : (
                '开始分析'
              )}
            </button>
          </form>

          {/* 使用提示 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>示例：</span>
            <button
              type="button"
              onClick={() => { setKeyword('茅台'); analyzeStock('茅台'); }}
              className="text-emerald-600 hover:underline"
              disabled={loading}
            >
              分析茅台
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => { setKeyword('对比茅台和比亚迪'); compareStocks('茅台', '比亚迪'); }}
              className="text-emerald-600 hover:underline"
              disabled={loading}
            >
              对比茅台和比亚迪
            </button>
          </div>

          {/* 搜索历史 */}
          {searchHistory.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">最近搜索：</span>
              {searchHistory.map((stock) => (
                <div key={stock.code} className="relative group">
                  <button
                    onClick={() => handleHistoryStock(stock.name)}
                    className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                    disabled={loading}
                  >
                    {stock.name}
                  </button>
                  <button
                    onClick={(e) => handleRemoveHistory(e, stock.code)}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gray-300 hover:bg-gray-400 rounded-full items-center justify-center hidden group-hover:flex"
                    title="移除"
                  >
                    <X size={8} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* 空状态 */}
        {!loading && !analysisData && !compareData && !error && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📈</div>
            <p className="text-gray-500 mb-2">输入股票名称或对比需求</p>
            <p className="text-gray-400 text-sm">获取 AI 智能分析参考</p>
          </div>
        )}

        {/* 单股分析结果 */}
        {analysisData && (
          <div className="space-y-6">
            {/* 核心摘要卡片 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                📊 技术特征
                <span className="text-sm font-normal text-gray-500">
                  {analysisData.name} ({analysisData.code})
                </span>
              </h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">价格位置</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getPositionColor(analysisData.position).bar}`}
                        style={{ width: `${analysisData.percentile}%` }}
                      />
                    </div>
                    <span className={`font-medium ${getPositionColor(analysisData.position).text}`}>
                      {analysisData.position} ({analysisData.percentile}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <span className="text-gray-600">技术形态</span>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(analysisData.trend)}
                    <span className="font-medium text-gray-900">{analysisData.trend}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <span className="text-gray-600">支撑区间</span>
                  <span className="font-medium text-green-600">
                    {analysisData.supportLow} - {analysisData.supportHigh} 元
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <span className="text-gray-600">压力区间</span>
                  <span className="font-medium text-red-600">
                    {analysisData.resistanceLow} - {analysisData.resistanceHigh} 元
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <span className="text-gray-600">当月周期</span>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {analysisData.month}月：{analysisData.monthTip}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI分析 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                🤖 AI 数据解读
              </h2>

              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {analysisData.aiAnalysis}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                ⚠️ 以上仅为数据解读，不构成任何投资建议
              </div>
            </div>

            {/* 数据来源 */}
            <div className="text-center text-sm text-gray-400 pb-8">
              数据来源：{analysisData.dataSource} | 延迟：{analysisData.dataDelay} | 仅供参考
            </div>
          </div>
        )}

        {/* 对比结果 */}
        {compareData && (
          <div className="space-y-6">
            {/* 标题 */}
            <div className="text-center">
              <h2 className="text-lg font-medium text-gray-900 flex items-center justify-center gap-2">
                {compareData.stock1.name}
                <GitCompare size={18} className="text-gray-400" />
                {compareData.stock2.name}
              </h2>
            </div>

            {/* 技术面对比 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">📊 技术面</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-normal">指标</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock1.name}</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock2.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 text-gray-600">价格位置</td>
                      <td className="py-3 text-right font-medium">{compareData.technical.position.stock1} ({compareData.technical.position.percentile1}%)</td>
                      <td className="py-3 text-right font-medium">{compareData.technical.position.stock2} ({compareData.technical.position.percentile2}%)</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 text-gray-600">技术形态</td>
                      <td className="py-3 text-right font-medium">{compareData.technical.trend.stock1}</td>
                      <td className="py-3 text-right font-medium">{compareData.technical.trend.stock2}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 text-gray-600">支撑区间</td>
                      <td className="py-3 text-right text-green-600 font-medium">{compareData.technical.support.stock1} 元</td>
                      <td className="py-3 text-right text-green-600 font-medium">{compareData.technical.support.stock2} 元</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-gray-600">压力区间</td>
                      <td className="py-3 text-right text-red-600 font-medium">{compareData.technical.resistance.stock1} 元</td>
                      <td className="py-3 text-right text-red-600 font-medium">{compareData.technical.resistance.stock2} 元</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 基本面对比 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">📋 基本面</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-normal">指标</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock1.name}</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock2.name}</th>
                      <th className="text-right py-2 text-gray-500 font-normal">差异</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(compareData.fundamentals).map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 text-gray-600">{item.label}</td>
                        <td className="py-3 text-right font-medium">{item.stock1 || '-'} {item.unit}</td>
                        <td className="py-3 text-right font-medium">{item.stock2 || '-'} {item.unit}</td>
                        <td className="py-3 text-right text-gray-500">{item.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 资金面对比 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">📈 资金面</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-normal">指标</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock1.name}</th>
                      <th className="text-right py-2 text-gray-900">{compareData.stock2.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(compareData.moneyFlow).map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 text-gray-600">{item.label}</td>
                        <td className={`py-3 text-right font-medium ${item.stock1 > 0 ? 'text-green-600' : item.stock1 < 0 ? 'text-red-600' : ''}`}>
                          {formatValue(item.stock1, item.unit)}
                        </td>
                        <td className={`py-3 text-right font-medium ${item.stock2 > 0 ? 'text-green-600' : item.stock2 < 0 ? 'text-red-600' : ''}`}>
                          {formatValue(item.stock2, item.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 对比总结 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">📝 对比总结</h3>

              <div className="space-y-2 text-sm text-gray-600">
                <p>• <span className="font-medium text-gray-900">估值方面</span>：{
                  compareData.fundamentals.pe.stock1 < compareData.fundamentals.pe.stock2
                    ? `${compareData.stock1.name}市盈率更低`
                    : compareData.fundamentals.pe.stock1 > compareData.fundamentals.pe.stock2
                      ? `${compareData.stock2.name}市盈率更低`
                      : '两者估值相当'
                }</p>
                <p>• <span className="font-medium text-gray-900">盈利能力</span>：{
                  compareData.fundamentals.roe.stock1 > compareData.fundamentals.roe.stock2
                    ? `${compareData.stock1.name}ROE更高`
                    : compareData.fundamentals.roe.stock1 < compareData.fundamentals.roe.stock2
                      ? `${compareData.stock2.name}ROE更高`
                      : '两者ROE相当'
                }</p>
                <p>• <span className="font-medium text-gray-900">技术位置</span>：{
                  compareData.technical.position.percentile1 < compareData.technical.position.percentile2
                    ? `${compareData.stock1.name}处于更低位置`
                    : compareData.technical.position.percentile1 > compareData.technical.position.percentile2
                      ? `${compareData.stock2.name}处于更低位置`
                      : '两者位置相当'
                }</p>
                <p>• <span className="font-medium text-gray-900">资金面</span>：{
                  compareData.moneyFlow.mainNetInflow.stock1 > compareData.moneyFlow.mainNetInflow.stock2
                    ? `${compareData.stock1.name}主力资金流入更多`
                    : compareData.moneyFlow.mainNetInflow.stock1 < compareData.moneyFlow.mainNetInflow.stock2
                      ? `${compareData.stock2.name}主力资金流入更多`
                      : '两者资金面相当'
                }</p>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                ⚠️ 以上仅为数据对比，不构成任何投资建议
              </div>
            </div>

            {/* 数据来源 */}
            <div className="text-center text-sm text-gray-400 pb-8">
              数据来源：新浪财经、东方财富 | 延迟约15分钟 | 仅供参考
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
