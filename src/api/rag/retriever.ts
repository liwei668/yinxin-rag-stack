// 检索器
import { vectorDB } from '../../lib/vectorDB';

interface FilterOptions {
  kbId?: string;
  categoryId?: string;
  fileName?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

class Retriever {
  async retrieve(query: string, k: number = 3) {
    try {
      // 语义搜索
      const results = await vectorDB.query(query, k);
      
      // 处理结果
      return this.formatResults(results);
    } catch (error) {
      console.error('Error retrieving documents:', error);
      return [];
    }
  }

  async hybridRetrieve(query: string, k: number = 3) {
    try {
      // 混合检索（关键词 + 语义）
      // 实际实现中可以结合关键词搜索
      return this.retrieve(query, k);
    } catch (error) {
      console.error('Error in hybrid retrieval:', error);
      return [];
    }
  }

  async retrieveWithFilter(query: string, filter: FilterOptions, k: number = 3) {
    try {
      // 带过滤条件的检索 - 使用 vectorDB 的高级过滤
      const results = await vectorDB.queryWithFilter(query, k, filter);
      
      return this.formatResults(results);
    } catch (error) {
      console.error('Error retrieving with filter:', error);
      return [];
    }
  }

  // 格式化检索结果
  private formatResults(results: any) {
    const docs = results.documents[0] || [];
    const distances = results.distances[0] || [];
    const metadatas = results.metadatas[0] || [];

    return docs.map((content: string, index: number) => ({
      content,
      score: distances[index] || 0,
      metadata: metadatas[index] || {}
    }));
  }
}

export const retriever = new Retriever();
