'use client';

import React, { useState, useMemo } from 'react';
import { useMemory, MemoryBranch } from '../../contexts/MemoryContext';
import { 
  Folder, 
  Star, 
  Clock, 
  Archive, 
  Plus, 
  Trash2, 
  Pin, 
  Tag,
  Search,
  Download,
  RotateCcw,
  X
} from 'lucide-react';

export default function MemoryDashboard() {
  const { 
    branches, 
    currentBranch, 
    isLoading, 
    error,
    loadBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    setCurrentBranch,
    clearError 
  } = useMemory();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchTitle, setNewBranchTitle] = useState('');
  const [newBranchDescription, setNewBranchDescription] = useState('');
  const [newBranchTags, setNewBranchTags] = useState('');
  const [newBranchKeywords, setNewBranchKeywords] = useState('');
  const [filterPriority, setFilterPriority] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [filterTime, setFilterTime] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [previewBranch, setPreviewBranch] = useState<MemoryBranch | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });

  const getTimeFilterMs = (filter: string): number => {
    const now = Date.now();
    switch (filter) {
      case 'today': return 24 * 60 * 60 * 1000;
      case 'week': return 7 * 24 * 60 * 60 * 1000;
      case 'month': return 30 * 24 * 60 * 60 * 1000;
      default: return Infinity;
    }
  };

  const filteredBranches = useMemo(() => {
    setSearching(false);
    
    const timeLimit = getTimeFilterMs(filterTime);
    const now = Date.now();
    
    let results = branches.filter(branch => {
      if (showOnlyFavorites && !branch.isImportant && !branch.isPinned) {
        return false;
      }
      
      if (filterPriority !== 'all' && branch.priority !== filterPriority) {
        return false;
      }
      
      if (timeLimit !== Infinity) {
        const branchTime = new Date(branch.lastAccessedAt).getTime();
        if (now - branchTime > timeLimit) {
          return false;
        }
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchTitle = branch.title.toLowerCase().includes(query);
        const matchDesc = branch.description?.toLowerCase().includes(query);
        const matchTags = branch.tags.some(tag => tag.toLowerCase().includes(query));
        
        if (!matchTitle && !matchDesc && !matchTags) {
          return false;
        }
      }
      
      return true;
    });
    
    return results;
  }, [branches, searchQuery, filterPriority, filterTime, showOnlyFavorites]);

  const hotBranches = filteredBranches.filter(b => b.priority === 'hot');
  const warmBranches = filteredBranches.filter(b => b.priority === 'warm');
  const coldBranches = filteredBranches.filter(b => b.priority === 'cold');

  const handleCreateBranch = async () => {
    if (!newBranchTitle.trim()) return;
    
    try {
      await createBranch({
        title: newBranchTitle.trim(),
        description: newBranchDescription.trim(),
        tags: newBranchTags.split(',').map(t => t.trim()).filter(t => t),
        keywords: newBranchKeywords.split(',').map(k => k.trim()).filter(k => k),
      });
      
      setShowCreateModal(false);
      setNewBranchTitle('');
      setNewBranchDescription('');
      setNewBranchTags('');
      setNewBranchKeywords('');
    } catch (err) {
      console.error('Failed to create branch:', err);
    }
  };

  const handleTogglePin = async (branch: MemoryBranch) => {
    try {
      await updateBranch(branch.id, { isPinned: !branch.isPinned });
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleToggleImportant = async (branch: MemoryBranch) => {
    try {
      await updateBranch(branch.id, { isImportant: !branch.isImportant });
    } catch (err) {
      console.error('Failed to toggle important:', err);
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!confirm('确定要归档这个分支吗？')) return;
    
    try {
      await deleteBranch(branchId);
    } catch (err) {
      console.error('Failed to delete branch:', err);
    }
  };

  const handleRestoreBranch = async (branch: MemoryBranch, targetPriority: 'hot' | 'warm') => {
    try {
      await updateBranch(branch.id, { priority: targetPriority });
    } catch (err) {
      console.error('Failed to restore branch:', err);
    }
  };

  const handleArchiveColdBranches = () => {
    const coldCount = branches.filter(b => b.priority === 'cold').length;
    setArchiveCount(coldCount);
    setShowArchiveConfirm(true);
  };

  const confirmArchiveCold = async () => {
    try {
      const coldBranches = branches.filter(b => b.priority === 'cold');
      for (const branch of coldBranches) {
        await updateBranch(branch.id, { status: 'archived' });
      }
      setShowArchiveConfirm(false);
      loadBranches();
    } catch (err) {
      console.error('Failed to archive cold branches:', err);
    }
  };

  const handleExportBranch = (branch: MemoryBranch) => {
    const exportData = {
      title: branch.title,
      description: branch.description,
      tags: branch.tags,
      keywords: branch.keywords,
      priority: branch.priority,
      lastAccessedAt: branch.lastAccessedAt,
      accessedCount: branch.accessedCount,
      createdAt: branch.createdAt,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${branch.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const handleMouseEnter = (e: React.MouseEvent, branch: MemoryBranch) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPreviewBranch(branch);
    setPreviewPosition({ 
      x: rect.right + 10, 
      y: rect.top 
    });
  };

  const handleMouseLeave = () => {
    setPreviewBranch(null);
  };

  const BranchCard = ({ branch }: { branch: MemoryBranch }) => (
    <div 
      className={`p-4 rounded-lg border transition-all cursor-pointer relative ${
        currentBranch?.id === branch.id 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      onClick={() => setCurrentBranch(branch)}
      onMouseEnter={(e) => handleMouseEnter(e, branch)}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 flex-1 truncate flex items-center gap-2">
          {branch.isImportant && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
          {branch.isPinned && <Pin size={14} className="text-blue-500" />}
          {branch.title}
        </h3>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleImportant(branch); }}
            className={`p-1 rounded hover:bg-gray-100 ${branch.isImportant ? 'text-yellow-500' : 'text-gray-400'}`}
            title="收藏"
          >
            <Star size={16} fill={branch.isImportant ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleTogglePin(branch); }}
            className={`p-1 rounded hover:bg-gray-100 ${branch.isPinned ? 'text-blue-500' : 'text-gray-400'}`}
            title="置顶"
          >
            <Pin size={16} fill={branch.isPinned ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleExportBranch(branch); }}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="导出"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      
      {branch.description && (
        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
          {branch.description}
        </p>
      )}
      
      {branch.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {branch.tags.map(tag => (
            <span 
              key={tag}
              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
            >
              <Tag size={10} className="inline mr-1" />
              {tag}
            </span>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatDate(branch.lastAccessedAt)}
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${
            branch.priority === 'hot' ? 'bg-red-500' :
            branch.priority === 'warm' ? 'bg-yellow-500' : 'bg-gray-300'
          }`} />
          {branch.accessedCount} 次访问
        </span>
      </div>
      
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
        {branch.priority === 'cold' && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); handleRestoreBranch(branch, 'hot'); }}
              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
            >
              <RotateCcw size={12} className="inline mr-1" />
              恢复到活跃
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleRestoreBranch(branch, 'warm'); }}
              className="px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-50 rounded"
            >
              恢复到温层
            </button>
          </>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch.id); }}
          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
          title="归档"
        >
          <Archive size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Folder size={24} />
            记忆看板
          </h1>
          <p className="text-gray-600 mt-1">管理你的对话记忆和分支</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          新建分支
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-red-700">{error}</span>
          <button onClick={clearError} className="text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="搜索分支标题、描述、标签..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearching(true);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
              搜索中...
            </span>
          )}
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">全部时间</option>
            <option value="today">今天</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>
          
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">全部优先级</option>
            <option value="hot">🔥 活跃</option>
            <option value="warm">🌡️ 温层</option>
            <option value="cold">❄️ 冷层</option>
          </select>
          
          <button
            onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
            className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
              showOnlyFavorites 
                ? 'bg-yellow-50 border-yellow-300 text-yellow-700' 
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Star size={16} className="inline mr-1" fill={showOnlyFavorites ? 'currentColor' : 'none'} />
            收藏
          </button>
          
          <button
            onClick={handleArchiveColdBranches}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Archive size={16} className="inline mr-1" />
            归档冷层
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-4">加载中...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {hotBranches.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                🔥 活跃分支 ({hotBranches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hotBranches.map(branch => (
                  <BranchCard key={branch.id} branch={branch} />
                ))}
              </div>
            </section>
          )}

          {warmBranches.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                🌡️ 温层分支 ({warmBranches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {warmBranches.map(branch => (
                  <BranchCard key={branch.id} branch={branch} />
                ))}
              </div>
            </section>
          )}

          {coldBranches.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
                ❄️ 冷层分支 ({coldBranches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coldBranches.map(branch => (
                  <BranchCard key={branch.id} branch={branch} />
                ))}
              </div>
            </section>
          )}

          {filteredBranches.length === 0 && (
            <div className="text-center py-12">
              <Folder size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                {searchQuery ? '没有找到匹配的分支' : '还没有记忆分支'}
              </h3>
              <p className="text-gray-500">
                {searchQuery ? '尝试修改搜索条件' : '创建你的第一个记忆分支开始吧'}
              </p>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                创建新分支
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    标题 *
                  </label>
                  <input
                    type="text"
                    value={newBranchTitle}
                    onChange={(e) => setNewBranchTitle(e.target.value)}
                    placeholder="输入分支标题..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    描述
                  </label>
                  <textarea
                    value={newBranchDescription}
                    onChange={(e) => setNewBranchDescription(e.target.value)}
                    placeholder="输入分支描述..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    标签（逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={newBranchTags}
                    onChange={(e) => setNewBranchTags(e.target.value)}
                    placeholder="工作, 学习, 项目..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    关键词（逗号分隔，用于智能匹配）
                  </label>
                  <input
                    type="text"
                    value={newBranchKeywords}
                    onChange={(e) => setNewBranchKeywords(e.target.value)}
                    placeholder="Python, 编程, AI..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchTitle.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认归档冷层分支</h3>
            <p className="text-gray-600 mb-4">
              将归档 <span className="font-bold text-blue-600">{archiveCount}</span> 个分支至冷层。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              归档后可手动恢复，不会删除数据。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={confirmArchiveCold}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}

      {previewBranch && (
        <div 
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72"
          style={{ 
            left: `${Math.min(previewPosition.x, window.innerWidth - 300)}px`, 
            top: `${Math.min(previewPosition.y, window.innerHeight - 200)}px` 
          }}
        >
          <h4 className="font-medium text-gray-900 mb-2 truncate">{previewBranch.title}</h4>
          {previewBranch.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-3">{previewBranch.description}</p>
          )}
          <div className="text-xs text-gray-400">
            <p>创建时间: {new Date(previewBranch.createdAt).toLocaleDateString('zh-CN')}</p>
            <p>最后访问: {formatDate(previewBranch.lastAccessedAt)}</p>
            <p>访问次数: {previewBranch.accessedCount} 次</p>
          </div>
        </div>
      )}
    </div>
  );
}
