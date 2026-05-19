// RAG服务主接口
import { retriever } from './retriever';
import { callAPIByName } from '../apiManager';

class RAGService {
  async generateWithKnowledge(query: string) {
    try {
      // 检索相关知识
      const results = await retriever.retrieve(query);

      // 如果没有检索结果，返回空
      if (!results || results.length === 0) {
        return { results: [], answer: '知识库中没有找到相关内容' };
      }

      // 构建增强提示
      const context = results
        .map(result => `[知识库] ${result.content}`)
        .join('\n\n');

      const enhancedPrompt = `${query}\n\n[知识库检索结果]\n${context}`;

      // 调用 DeepSeek API（传入正确的对象格式）
      try {
        return await callAPIByName('deepseek', 'chat', { message: enhancedPrompt });
      } catch (apiError) {
        // API 调用失败时返回检索结果
        console.error('RAG LLM 调用失败，返回检索结果:', apiError);
        return {
          results: results.map(r => ({ content: r.content, score: r.score })),
          answer: `根据知识库检索到以下相关内容：\n\n${results.map((r, i) => `${i + 1}. ${r.content}`).join('\n\n')}`
        };
      }
    } catch (error) {
      console.error('Error in RAG generation:', error);
      return { results: [], answer: 'RAG 处理失败' };
    }
  }

  async generateWithHybridRetrieval(query: string) {
    try {
      const results = await retriever.hybridRetrieve(query);
      if (!results || results.length === 0) {
        return { results: [], answer: '知识库中没有找到相关内容' };
      }

      const context = results.map(result => `[知识库] ${result.content}`).join('\n\n');
      const enhancedPrompt = `${query}\n\n[知识库检索结果]\n${context}`;

      try {
        return await callAPIByName('deepseek', 'chat', { message: enhancedPrompt });
      } catch (apiError) {
        console.error('RAG LLM 调用失败:', apiError);
        return {
          results: results.map(r => ({ content: r.content, score: r.score })),
          answer: `根据知识库检索到以下相关内容：\n\n${results.map((r, i) => `${i + 1}. ${r.content}`).join('\n\n')}`
        };
      }
    } catch (error) {
      console.error('Error in hybrid RAG generation:', error);
      return { results: [], answer: '混合检索处理失败' };
    }
  }

  async generateWithFilteredKnowledge(query: string, filter: any) {
    try {
      const results = await retriever.retrieveWithFilter(query, filter);
      if (!results || results.length === 0) {
        return { results: [], answer: '知识库中没有找到相关内容' };
      }

      const context = results.map(result => `[知识库] ${result.content}`).join('\n\n');
      const enhancedPrompt = `${query}\n\n[知识库检索结果]\n${context}`;

      try {
        return await callAPIByName('deepseek', 'chat', { message: enhancedPrompt });
      } catch (apiError) {
        console.error('RAG LLM 调用失败:', apiError);
        return {
          results: results.map(r => ({ content: r.content, score: r.score })),
          answer: `根据知识库检索到以下相关内容：\n\n${results.map((r, i) => `${i + 1}. ${r.content}`).join('\n\n')}`
        };
      }
    } catch (error) {
      console.error('Error in filtered RAG generation:', error);
      return { results: [], answer: '过滤检索处理失败' };
    }
  }
}

export const ragService = new RAGService();
