'use client';

import { useState, useEffect } from 'react';
import { Search, Upload, Filter, Folder, FileText, Edit, Trash2, Eye, X, Plus, ChevronRight, ChevronDown, ChevronUp, Grid, List, Pin, Minimize2, Maximize2, Settings, Users, Lock, Globe, Shield, CheckSquare, Square, Download, FileUp, History, RotateCcw, MoreVertical, Archive } from 'lucide-react';

interface KnowledgeStructureItem {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  isVirtual: boolean;
  visibility: 'private' | 'team' | 'public';
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  children?: KnowledgeStructureItem[];
}

interface Document {
  id: string;
  metadata: {
    fileName?: string;
    fileType?: string;
    uploadDate?: string;
    categories?: string[];
    description?: string;
    parentKnowledgeBaseId?: string;
  };
}

const KnowledgeBaseV3 = () => {
  const [knowledgeTree, setKnowledgeTree] = useState<KnowledgeStructureItem[]>([]);
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeStructureItem[]>([]);
  const [expandedKnowledgeBases, setExpandedKnowledgeBases] = useState<Set<string>>(new Set(['uncategorized']));
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string | null>(null);
  const [activeMenuKbId, setActiveMenuKbId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showCreateKbModal, setShowCreateKbModal] = useState(false);
  const [createKbFormData, setCreateKbFormData] = useState({ name: '', parentId: null as string | null, level: 0, isCategory: false });
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameFormData, setRenameFormData] = useState({ kbId: '', name: '', version: 0 });
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveFormData, setMoveFormData] = useState({ categoryId: '', targetParentId: '', version: 0 });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // 加载知识库
  const loadKnowledgeStructure = async () => {
    try {
      console.log('开始加载知识库...');
      const response = await fetch('/api/knowledge-structure');
      const result = await response.json();
      console.log('加载结果:', result);
      
      if (result.success) {
        setKnowledgeTree(result.tree);
        setKnowledgeList(result.list);
        
        // 默认展开第一个知识库
        if (result.list.length > 0) {
          const firstKb = result.list.find((item: KnowledgeStructureItem) => item.level === 0);
          if (firstKb) {
            setExpandedKnowledgeBases(new Set([firstKb.id]));
          }
        }
      } else {
        console.error('API错误:', result.error);
        setMessage('加载失败: ' + (result.error || '未知错误'));
        setMessageType('error');
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
      setMessage('加载失败: ' + (error instanceof Error ? error.message : '网络错误'));
      setMessageType('error');
    }
  };

  const loadDocumentsForSelected = async (itemId: string | null) => {
    if (!itemId) {
      setDocuments([]);
      return;
    }

    try {
      const item = knowledgeList.find(i => i.id === itemId);
      if (!item) return;

      const kbId = item.level === 0 ? item.id : item.parentId;
      const categoryId = item.level === 1 ? item.id : undefined;

      const response = await fetch(
        `/api/knowledge-structure?action=getDocuments&kbId=${kbId}${categoryId ? `&categoryId=${categoryId}` : ''}`
      );
      const result = await response.json();
      if (result.success) {
        setDocuments(result.documents || []);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    }
  };

  useEffect(() => {
    loadKnowledgeStructure();
  }, []);

  useEffect(() => {
    if (knowledgeList.length > 0) {
      loadDocumentsForSelected(selectedKnowledgeBase);
    }
  }, [selectedKnowledgeBase, knowledgeList]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !selectedKnowledgeBase) {
      showMessage('请先选择文件和目录', 'error');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const item = knowledgeList.find(i => i.id === selectedKnowledgeBase);
      if (!item) return;

      const kbId = item.level === 0 ? item.id : item.parentId;
      const categoryId = item.level === 1 ? item.id : null;

      // 逐个上传文件
      for (const file of selectedFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('kbId', kbId);
          if (categoryId) {
            formData.append('categoryId', categoryId);
          }

          const response = await fetch('/api/knowledge-structure', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`文件 ${file.name} 上传失败:`, result.error);
          }
        } catch (error) {
          failCount++;
          console.error(`文件 ${file.name} 上传失败:`, error);
        }
      }

      // 显示结果
      if (successCount > 0) {
        showMessage(
          failCount > 0
            ? `成功上传 ${successCount} 个文件，${failCount} 个失败`
            : `成功上传 ${successCount} 个文件！`
        );
      } else {
        showMessage('全部文件上传失败', 'error');
      }

      setSelectedFiles([]);
      await loadDocumentsForSelected(selectedKnowledgeBase);
    } catch (error) {
      console.error('上传失败:', error);
      showMessage('上传失败：网络错误', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;

    try {
      const response = await fetch(
        `/api/knowledge-structure?action=deleteDocument&docId=${docId}`,
        { method: 'DELETE' }
      );
      const result = await response.json();
      if (result.success) {
        showMessage('删除成功！');
        await loadDocumentsForSelected(selectedKnowledgeBase);
      } else {
        showMessage('删除失败：' + result.error, 'error');
      }
    } catch (error) {
      console.error('删除失败:', error);
      showMessage('删除失败：网络错误', 'error');
    }
  };

  const handlePreviewDocument = (docId: string) => {
    try {
      const doc = documents.find((d: any) => d.id === docId);
      if (doc) {
        setPreviewDocument(doc);
        setEditedContent(doc.content || '');
        setIsEditing(false);
      } else {
        showMessage('找不到该文档', 'error');
      }
    } catch (error) {
      console.error('获取文档失败:', error);
      showMessage('获取文档失败', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!previewDocument) return;

    try {
      const response = await fetch('/api/knowledge-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateDocument',
          docId: previewDocument.id,
          content: editedContent
        }),
      });

      const result = await response.json();
      if (result.success) {
        showMessage('文档保存成功！');
        setIsEditing(false);
        
        const updatedDoc = { ...previewDocument, content: editedContent };
        setPreviewDocument(updatedDoc);
        
        const updatedDocs = documents.map(d => 
          d.id === previewDocument.id ? updatedDoc : d
        );
        setDocuments(updatedDocs);
      } else {
        showMessage('保存失败：' + result.error, 'error');
      }
    } catch (error) {
      console.error('保存失败:', error);
      showMessage('保存失败：网络错误', 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(previewDocument?.content || '');
    setIsEditing(false);
  };

  // 显示消息提示
  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  // 创建知识库/分类
  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('创建请求:', createKbFormData);
      
      const response = await fetch('/api/knowledge-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createKbFormData.name,
          parentId: createKbFormData.parentId,
          level: createKbFormData.level
        }),
      });

      const result = await response.json();
      console.log('创建响应:', result);
      
      if (result.success) {
        showMessage(createKbFormData.isCategory ? '分类创建成功！' : '知识库创建成功！');
        setShowCreateKbModal(false);
        setCreateKbFormData({ name: '', parentId: null, level: 0, isCategory: false });
        await loadKnowledgeStructure();
        
        // 自动展开新创建的知识库
        if (result.knowledgeItem && result.knowledgeItem.level === 0) {
          setExpandedKnowledgeBases(prev => new Set([...prev, result.knowledgeItem.id]));
        }
      } else {
        showMessage('创建失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('创建失败:', error);
      showMessage('创建失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 重命名
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('重命名请求:', renameFormData);
      
      const response = await fetch('/api/knowledge-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          id: renameFormData.kbId,
          newName: renameFormData.name,
          currentVersion: renameFormData.version
        }),
      });

      const result = await response.json();
      console.log('重命名响应:', result);
      
      if (result.success) {
        showMessage('重命名成功！');
        setShowRenameModal(false);
        await loadKnowledgeStructure();
      } else {
        showMessage('重命名失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('重命名失败:', error);
      showMessage('重命名失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 删除
  const handleDelete = async (kbId: string) => {
    if (!confirm('确定要删除吗？删除后无法恢复！')) return;
    try {
      console.log('删除请求:', kbId);
      
      const response = await fetch(`/api/knowledge-structure?id=${encodeURIComponent(kbId)}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      console.log('删除响应:', result);
      
      if (result.success) {
        showMessage('删除成功！');
        setActiveMenuKbId(null);
        await loadKnowledgeStructure();
      } else {
        showMessage('删除失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('删除失败:', error);
      showMessage('删除失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 移动
  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('移动请求:', moveFormData);
      
      const response = await fetch('/api/knowledge-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          id: moveFormData.categoryId,
          newParentId: moveFormData.targetParentId,
          currentVersion: moveFormData.version
        }),
      });

      const result = await response.json();
      console.log('移动响应:', result);
      
      if (result.success) {
        showMessage('移动成功！');
        setShowMoveModal(false);
        await loadKnowledgeStructure();
      } else {
        showMessage('移动失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('移动失败:', error);
      showMessage('移动失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 切换可见性
  const handleToggleVisibility = async (kbId: string, visibility: 'private' | 'team' | 'public', version: number) => {
    try {
      console.log('切换可见性:', { kbId, visibility, version });
      
      const response = await fetch('/api/knowledge-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleVisibility',
          id: kbId,
          visibility,
          currentVersion: version
        }),
      });

      const result = await response.json();
      console.log('切换可见性响应:', result);
      
      if (result.success) {
        showMessage('可见性已更新！');
        setActiveMenuKbId(null);
        await loadKnowledgeStructure();
      } else {
        showMessage('更新失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('更新失败:', error);
      showMessage('更新失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 归档/取消归档
  const handleToggleArchive = async (kbId: string, isArchived: boolean, version: number) => {
    try {
      console.log('切换归档状态:', { kbId, isArchived, version });
      
      const response = await fetch('/api/knowledge-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleArchive',
          id: kbId,
          isArchived,
          currentVersion: version
        }),
      });

      const result = await response.json();
      console.log('切换归档状态响应:', result);
      
      if (result.success) {
        showMessage(isArchived ? '已归档！' : '已取消归档！');
        setActiveMenuKbId(null);
        await loadKnowledgeStructure();
      } else {
        showMessage('操作失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('操作失败:', error);
      showMessage('操作失败: ' + (error instanceof Error ? error.message : '网络错误'), 'error');
    }
  };

  // 获取可见性图标
  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'private':
        return <Lock size={14} className="text-gray-500" />;
      case 'team':
        return <Users size={14} className="text-blue-500" />;
      case 'public':
        return <Globe size={14} className="text-green-500" />;
      default:
        return <Lock size={14} className="text-gray-500" />;
    }
  };

  // 渲染树节点
  const renderTreeNode = (item: KnowledgeStructureItem) => {
    const children = knowledgeList.filter(i => i.parentId === item.id);
    const isExpanded = expandedKnowledgeBases.has(item.id);
    const isSelected = selectedKnowledgeBase === item.id;
    
    return (
      <div key={item.id} className="mb-1 relative">
        <div 
          className={`flex items-center px-2 py-1.5 rounded-lg cursor-pointer transition-colors group ${
            isSelected ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${item.level * 12 + 8}px` }}
          onClick={() => setSelectedKnowledgeBase(item.id)}
        >
          {children.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const newExpanded = new Set(expandedKnowledgeBases);
                if (isExpanded) {
                  newExpanded.delete(item.id);
                } else {
                  newExpanded.add(item.id);
                }
                setExpandedKnowledgeBases(newExpanded);
              }}
              className="p-0.5 mr-1 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {children.length === 0 && <div className="w-6 mr-1" />}
          
          <Folder 
            size={16} 
            className={`mr-2 ${
              item.isVirtual ? 'text-gray-400' : 
              item.isArchived ? 'text-orange-400' : 'text-emerald-600'
            }`} 
          />
          <span className="text-sm truncate flex-1">
            {item.name}
            {item.isArchived && <span className="text-xs text-orange-500 ml-1">(已归档)</span>}
          </span>
          
          {!item.isVirtual && getVisibilityIcon(item.visibility)}
          
          {item.level === 0 && !item.isVirtual && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCreateKbFormData({ name: '', parentId: item.id, level: 1, isCategory: true });
                setShowCreateKbModal(true);
              }}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-emerald-100 rounded transition-opacity ml-1"
              title="添加子分类"
            >
              <Plus size={14} className="text-emerald-600" />
            </button>
          )}
          
          {!item.isVirtual && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                setMenuPosition({ x: rect.right, y: rect.bottom });
                setActiveMenuKbId(activeMenuKbId === item.id ? null : item.id);
              }}
              className={`p-1 rounded transition-opacity ${
                activeMenuKbId === item.id ? 'opacity-100 bg-gray-200' : 'opacity-0 group-hover:opacity-100 hover:bg-gray-200'
              }`}
              title="更多操作"
            >
              <MoreVertical size={14} className="text-gray-500" />
            </button>
          )}
        </div>
        
        {children.length > 0 && isExpanded && (
          <div className="ml-2">
            {children.map(child => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  // 获取当前激活的菜单项
  const activeMenuItem = activeMenuKbId ? knowledgeList.find(item => item.id === activeMenuKbId) : null;

  // 获取根级知识库
  const rootKbs = knowledgeList.filter(item => item.parentId === null);

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden min-h-[500px] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50 shrink-0">
        <h3 className="text-lg font-semibold text-gray-900">知识库管理</h3>
        <button
          onClick={() => {
            setCreateKbFormData({ name: '', parentId: null, level: 0, isCategory: false });
            setShowCreateKbModal(true);
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={16} />
          <span className="text-sm">添加知识库</span>
        </button>
      </div>
      
      {message && (
        <div className={`px-4 py-3 mx-4 my-3 rounded-lg shrink-0 ${
          messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 border-r bg-gray-50 flex flex-col shrink-0">
          <div className="p-4 pb-2 border-b border-gray-100 shrink-0">
            <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Folder size={16} />
              知识库列表
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 pt-2">
            {rootKbs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Folder size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无知识库</p>
                <p className="text-xs mt-1">点击上方「添加知识库」开始</p>
              </div>
            ) : (
              <div className="relative">
                {rootKbs.map(kb => renderTreeNode(kb))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex-1 p-6 bg-white flex flex-col overflow-hidden">
          {selectedKnowledgeBase ? (
            <>
              {/* 标题 */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b">
                <h3 className="text-lg font-semibold text-gray-800">
                  {knowledgeList.find(i => i.id === selectedKnowledgeBase)?.name || '文档列表'}
                </h3>
              </div>

              {/* 上传区域 */}
              <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                {selectedFiles.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        已选择 {selectedFiles.length} 个文件
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedFiles([])}
                          className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded"
                        >
                          清空
                        </button>
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          className="px-4 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {uploading ? '上传中...' : '上传全部'}
                        </button>
                      </div>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-white rounded border"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={16} className="text-emerald-600 flex-shrink-0" />
                            <span className="text-sm text-gray-700 truncate">{file.name}</span>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center cursor-pointer py-4">
                    <Upload size={32} className="text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600 mb-2">点击或拖拽文件到这里上传</span>
                    <span className="text-xs text-gray-400">支持 TXT, MD, PDF, DOCX, XLSX, PPTX 等格式（支持多选）</span>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      onChange={handleFileSelect}
                      accept=".txt,.md,.json,.csv,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.pdf,.docx,.xlsx,.xls,.pptx"
                    />
                  </label>
                )}
              </div>

              {/* 文档列表 */}
              <div className="flex-1 overflow-auto">
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">暂无文档</p>
                    <p className="text-xs text-gray-400 mt-1">上传第一个文档开始使用</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText size={18} className="text-gray-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {doc.metadata?.fileName || '未命名文档'}
                            </p>
                            {doc.metadata?.uploadDate && (
                              <p className="text-xs text-gray-500">
                                {new Date(doc.metadata.uploadDate).toLocaleString('zh-CN')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePreviewDocument(doc.id)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="预览"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <Folder size={64} className="mb-4 text-gray-300" />
              <p className="text-base mb-2">文档管理区域</p>
              <p className="text-sm text-gray-400">点击左侧知识库查看文档</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 三点菜单 */}
      {activeMenuKbId && activeMenuItem && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setActiveMenuKbId(null)}
          />
          <div 
            className="fixed bg-white shadow-lg rounded-lg border py-1 z-50 min-w-[180px]"
            style={{ 
              left: `${Math.min(menuPosition.x, window.innerWidth - 190)}px`, 
              top: `${Math.min(menuPosition.y, window.innerHeight - 250)}px` 
            }}
          >
            <button
              onClick={() => {
                setRenameFormData({ 
                  kbId: activeMenuItem.id, 
                  name: activeMenuItem.name, 
                  version: activeMenuItem.version 
                });
                setShowRenameModal(true);
                setActiveMenuKbId(null);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <Edit size={14} className="text-gray-500" />
              <span>重命名</span>
            </button>
            
            <button
              onClick={() => handleDelete(activeMenuItem.id)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-red-600"
            >
              <Trash2 size={14} />
              <span>删除</span>
            </button>
            
            <div className="border-t my-1" />
            
            {activeMenuItem.level === 0 ? (
              <>
                <div className="px-4 py-1.5 text-xs text-gray-500">可见性</div>
                <button
                  onClick={() => handleToggleVisibility(activeMenuItem.id, 'private', activeMenuItem.version)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Lock size={14} className={activeMenuItem.visibility === 'private' ? 'text-emerald-600' : 'text-gray-400'} />
                  <span className={activeMenuItem.visibility === 'private' ? 'font-medium' : ''}>私有</span>
                  {activeMenuItem.visibility === 'private' && <CheckSquare size={12} className="ml-auto text-emerald-600" />}
                </button>
                <button
                  onClick={() => handleToggleVisibility(activeMenuItem.id, 'team', activeMenuItem.version)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Users size={14} className={activeMenuItem.visibility === 'team' ? 'text-emerald-600' : 'text-gray-400'} />
                  <span className={activeMenuItem.visibility === 'team' ? 'font-medium' : ''}>团队可见</span>
                  {activeMenuItem.visibility === 'team' && <CheckSquare size={12} className="ml-auto text-emerald-600" />}
                </button>
                <button
                  onClick={() => handleToggleVisibility(activeMenuItem.id, 'public', activeMenuItem.version)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Globe size={14} className={activeMenuItem.visibility === 'public' ? 'text-emerald-600' : 'text-gray-400'} />
                  <span className={activeMenuItem.visibility === 'public' ? 'font-medium' : ''}>公开</span>
                  {activeMenuItem.visibility === 'public' && <CheckSquare size={12} className="ml-auto text-emerald-600" />}
                </button>
                
                <div className="border-t my-1" />
                
                <button
                  onClick={() => handleToggleArchive(activeMenuItem.id, !activeMenuItem.isArchived, activeMenuItem.version)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Archive size={14} className="text-gray-500" />
                  <span>{activeMenuItem.isArchived ? '取消归档' : '归档'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMoveFormData({ 
                    categoryId: activeMenuItem.id, 
                    targetParentId: '', 
                    version: activeMenuItem.version 
                  });
                  setShowMoveModal(true);
                  setActiveMenuKbId(null);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              >
                <Folder size={14} className="text-gray-500" />
                <span>移动到...</span>
              </button>
            )}
          </div>
        </>
      )}
      
      {/* 创建模态框 */}
      {showCreateKbModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {createKbFormData.isCategory ? '创建子分类' : '创建知识库'}
            </h3>
            <form onSubmit={handleCreateKb}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={createKbFormData.name}
                  onChange={(e) => setCreateKbFormData({ ...createKbFormData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder={createKbFormData.isCategory ? "请输入分类名称" : "请输入知识库名称"}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateKbModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!createKbFormData.name.trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* 重命名模态框 */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">重命名</h3>
            <form onSubmit={handleRename}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">新名称</label>
                <input
                  type="text"
                  value={renameFormData.name}
                  onChange={(e) => setRenameFormData({ ...renameFormData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="请输入新名称"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!renameFormData.name.trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* 文档预览/编辑模态框 */}
      {previewDocument && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-[900px] max-h-[85vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                {previewDocument.metadata?.fileName || '文档'}
              </h3>
              <button
                onClick={() => {
                  setPreviewDocument(null);
                  setIsEditing(false);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>
            
            {isEditing ? (
              <div className="flex-1 flex flex-col overflow-hidden mb-4">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="flex-1 w-full border border-gray-300 rounded-lg p-4 text-sm font-mono resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="输入文档内容..."
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 overflow-auto mb-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border min-h-[300px]">
                  {previewDocument.content || '暂无内容'}
                </pre>
              </div>
            )}
            
            <div className="mt-4 pt-3 border-t flex justify-between">
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      保存修改
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    编辑文档
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setPreviewDocument(null);
                  setIsEditing(false);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 移动模态框 */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">移动分类</h3>
            <form onSubmit={handleMove}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">目标知识库</label>
                <select
                  value={moveFormData.targetParentId}
                  onChange={(e) => setMoveFormData({ ...moveFormData, targetParentId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  <option value="">请选择目标知识库</option>
                  {knowledgeList
                    .filter(item => item.level === 0 && !item.isVirtual && item.id !== moveFormData.categoryId)
                    .map(kb => (
                      <option key={kb.id} value={kb.id}>{kb.name}</option>
                    ))
                  }
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!moveFormData.targetParentId}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  移动
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseV3;
