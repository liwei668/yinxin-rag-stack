// 金融服务 - 对接股票与金融信息 API

// 获取股票实时行情（新浪接口）
export async function getStockQuote(symbol: string, market: string = 'sina') {
  try {
    const response = await fetch(`/api/finance?symbol=${symbol}&market=${market}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '获取股票数据失败');
    }
    
    return data.data;
  } catch (error) {
    console.error('获取股票行情失败:', error);
    throw error;
  }
}

// 获取东方财富股票数据
export async function getEastMoneyStock(secid: string) {
  try {
    const response = await fetch(`/api/finance?market=eastmoney&secid=${secid}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '获取股票数据失败');
    }
    
    return data.data;
  } catch (error) {
    console.error('获取东方财富股票数据失败:', error);
    throw error;
  }
}

// 获取多个股票数据
export async function getMultipleStocks(symbols: string[]) {
  try {
    const symbolStr = symbols.join(',');
    const response = await fetch(`/api/finance?symbol=${symbolStr}&market=sina`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '获取股票数据失败');
    }
    
    return data.data;
  } catch (error) {
    console.error('获取多个股票数据失败:', error);
    throw error;
  }
}

// 获取同花顺财经数据
export async function get10jqkaStock(symbol: string) {
  try {
    const response = await fetch(`/api/finance?symbol=${symbol}&market=10jqka`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '获取同花顺财经数据失败');
    }
    
    return data.data;
  } catch (error) {
    console.error('获取同花顺财经数据失败:', error);
    throw error;
  }
}

// 获取证券时报网数据
export async function getSecTimesNews() {
  try {
    const response = await fetch(`/api/finance?market=sectimes`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '获取证券时报网数据失败');
    }
    
    return data.data;
  } catch (error) {
    console.error('获取证券时报网数据失败:', error);
    throw error;
  }
}

// 整合多数据源的股票数据
export async function getIntegratedStockData(symbol: string) {
  try {
    // 尝试从多个数据源获取数据
    const [sinaData, eastMoneyData, jqkaData] = await Promise.allSettled([
      getStockQuote(symbol),
      getEastMoneyStock(symbol.replace(/[a-z]/i, '')),
      get10jqkaStock(symbol)
    ]);
    
    // 整合数据
    const integratedData = {
      basic: null,
      eastMoney: null,
      jqka: null
    };
    
    if (sinaData.status === 'fulfilled' && sinaData.value[symbol]) {
      integratedData.basic = sinaData.value[symbol];
    }
    
    if (eastMoneyData.status === 'fulfilled') {
      integratedData.eastMoney = eastMoneyData.value;
    }
    
    if (jqkaData.status === 'fulfilled') {
      integratedData.jqka = jqkaData.value;
    }
    
    return integratedData;
  } catch (error) {
    console.error('获取整合股票数据失败:', error);
    throw error;
  }
}
