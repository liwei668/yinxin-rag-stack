import { apiManager } from './src/api/apiManager.js';

async function testSearch() {
  try {
    const result = await apiManager.call('baidu', 'search', '今天上证指数多少点');
    console.log('Search result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testSearch();