'use client';

import { useState, useEffect } from 'react';
import KnowledgeBaseV3 from '../rag/KnowledgeBaseV3';
import PromptManager from './PromptManager';
import MemoryDashboard from '../memory/MemoryDashboard';
import { Book, MessageSquare, Brain } from 'lucide-react';

const ContentManagement = () => {
  // 标签页状态
  const [activeTab, setActiveTab] = useState<'knowledgebase' | 'prompts' | 'memory'>('knowledgebase');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
      </div>

      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-8">
          <button
            onClick={() => setActiveTab('knowledgebase')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'knowledgebase' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            <div className="flex items-center gap-2">
              <Book size={18} />
              知识库
            </div>
          </button>
          <button
            onClick={() => setActiveTab('prompts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'prompts' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={18} />
              提词器
            </div>
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'memory' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            <div className="flex items-center gap-2">
              <Brain size={18} />
              记忆看板
            </div>
          </button>
        </nav>
      </div>

      {/* 知识库管理 */}
      {activeTab === 'knowledgebase' && (
        <div className="space-y-4">
          <KnowledgeBaseV3 />
        </div>
      )}

      {/* 提词器管理 */}
      {activeTab === 'prompts' && (
        <PromptManager />
      )}

      {/* 记忆看板 */}
      {activeTab === 'memory' && (
        <MemoryDashboard />
      )}
    </div>
  );
};

export default ContentManagement;