'use client';
import React, { useState, useEffect } from 'react';
import { getStockQuote } from '../src/services/financeService';

interface StockWidgetProps {
  symbol: string;
}

const StockWidget: React.FC<StockWidgetProps> = ({ symbol }) => {
  const [stockData, setStockData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStockData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStockQuote(symbol);
        setStockData(data);
      } catch (err) {
        setError('获取股票数据失败');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStockData();
  }, [symbol]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="text-center text-red-500 py-8">
          {error}
        </div>
      </div>
    );
  }

  if (!stockData || Object.keys(stockData).length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="text-center text-gray-500 py-8">
          无数据
        </div>
      </div>
    );
  }

  // 新浪接口数据格式
  const stockKey = Object.keys(stockData)[0];
  const stock = stockData[stockKey];
  const price = parseFloat(stock.price);
  const lastClose = parseFloat(stock.lastClose);
  const change = price - lastClose;
  const changePercent = (change / lastClose) * 100;
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{stockKey}</h3>
          <p className="text-sm text-gray-500">{stock.name}</p>
          <p className="text-sm text-gray-500">{stock.open} (开盘)</p>
        </div>
        <div className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {price.toFixed(2)}
        </div>
      </div>
      <div className={`flex items-center gap-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        <span>{isPositive ? '↑' : '↓'}</span>
        <span>{change.toFixed(2)}</span>
        <span>({changePercent.toFixed(2)}%)</span>
      </div>
      <div className="mt-4 text-xs text-gray-500">
        <div>最高: {stock.high}</div>
        <div>最低: {stock.low}</div>
        <div>成交量: {stock.volume}</div>
        <div>成交额: {stock.amount}</div>
        <div>上次更新: {stock.time}</div>
      </div>
    </div>
  );
};

export default StockWidget;
