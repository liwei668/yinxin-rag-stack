// 测试百度搜索API的股票数据功能
const fetch = require('node-fetch');

async function testStockSearch() {
  try {
    // 模拟百度搜索API的股票数据处理逻辑
    const symbol = 'sh000001';
    const indexName = '上证指数';
    
    // 调用finance API获取股票数据
    const stockResponse = await fetch(`http://localhost:3000/api/finance?symbol=${symbol}&market=sina`);
    const stockData = await stockResponse.json();
    
    console.log('Finance API response:', stockData);
    
    if (stockData.success && stockData.data && stockData.data[symbol]) {
      const indexData = stockData.data[symbol];
      const price = indexData.price;
      const change = (parseFloat(indexData.price) - parseFloat(indexData.lastClose)).toFixed(2);
      const changePercent = ((parseFloat(change) / parseFloat(indexData.lastClose)) * 100).toFixed(2);
      
      const summary = `${indexName}最新数据 (2026-04-15)：收盘价 ${price}点，${change > 0 ? '上涨' : '下跌'}${Math.abs(parseFloat(change))}点，${change > 0 ? '上涨' : '下跌'}${Math.abs(parseFloat(changePercent))}%。开盘价 ${indexData.open}点，最高价 ${indexData.high}点，最低价 ${indexData.low}点，昨收盘价 ${indexData.lastClose}点，成交量 ${(parseInt(indexData.volume) / 100000000).toFixed(2)}亿手，成交额 ${(parseInt(indexData.amount) / 100000000).toFixed(2)}亿元。`;
      
      console.log('Generated summary:', summary);
    } else {
      console.log('Error: No stock data found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testStockSearch();