'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Edit, Trash2, X, User, FileText, Search, Eye, Phone,
  Download, ChevronLeft, ChevronRight, Loader2, Check, AlertCircle
} from 'lucide-react';

// ==================== 类型定义 ====================

interface CustomerProfile {
  id: string;
  customerId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  industry?: string;
  notes?: string;
  tags?: string[];
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

// ==================== 主组件 ====================

const CustomerArchiveManagement = () => {
  // 数据状态
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  
  // 弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerProfile | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerProfile | null>(null);
  
  // 文件编辑
  const [fileContent, setFileContent] = useState('');
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(null);
  
  // 筛选
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  // 表单
  const [formData, setFormData] = useState({
    customerId: '',
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    industry: '',
    notes: '',
    tags: '',
    status: 'active' as 'active' | 'inactive',
  });
  
  // Toast 提示
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ==================== 数据获取 ====================
  
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'list',
        page: String(page),
        pageSize: String(pageSize),
        search: searchQuery,
        status: statusFilter,
      });
      const response = await fetch(`/api/customer-archive?${params}`);
      const data = await response.json();
      if (data.success) {
        setCustomers(Array.isArray(data.customers) ? data.customers : []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
      showToast('获取客户列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // ==================== 操作处理 ====================

  const loadCustomerFile = async (customerId: string) => {
    try {
      const response = await fetch(`/api/customer-archive?action=loadFile&customerId=${customerId}`);
      const data = await response.json();
      if (data.success) {
        setFileContent(data.content);
        setCurrentCustomerId(customerId);
        setShowFileEditor(true);
      }
    } catch (error) {
      console.error('加载客户档案失败:', error);
      showToast('加载客户档案失败', 'error');
    }
  };

  const saveCustomerFile = async () => {
    if (!currentCustomerId) return;
    try {
      const response = await fetch('/api/customer-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveFile',
          customerId: currentCustomerId,
          content: fileContent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('档案保存成功');
        setShowFileEditor(false);
      }
    } catch (error) {
      console.error('保存客户档案失败:', error);
      showToast('保存客户档案失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    try {
      const response = await fetch('/api/customer-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', customerData: { id: deletingCustomer.id } }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('删除成功');
        fetchCustomers();
      }
    } catch (error) {
      showToast('删除失败', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setDeletingCustomer(null);
    }
  };

  const handleSaveCustomer = async () => {
    const data = {
      ...formData,
      id: editingCustomer?.id,
      tags: formData.tags.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const response = await fetch('/api/customer-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingCustomer ? 'update' : 'create',
          customerData: data,
        }),
      });
      const result = await response.json();
      if (result.success) {
        showToast(editingCustomer ? '更新成功' : '创建成功');
        setShowModal(false);
        fetchCustomers();
      }
    } catch (error) {
      showToast('保存失败', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/customer-archive?action=export');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出成功');
    } catch (error) {
      showToast('导出失败', 'error');
    }
  };

  const openEditModal = (customer: CustomerProfile) => {
    setEditingCustomer(customer);
    setFormData({
      customerId: customer.customerId,
      companyName: customer.companyName,
      contactName: customer.contactName,
      contactEmail: customer.contactEmail,
      contactPhone: customer.contactPhone || '',
      industry: customer.industry || '',
      notes: customer.notes || '',
      tags: customer.tags?.join(', ') || '',
      status: (customer.status as 'active' | 'inactive') || 'active',
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData({
      customerId: `C${Date.now().toString(36).toUpperCase()}`,
      companyName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      industry: '',
      notes: '',
      tags: '',
      status: 'active',
    });
    setShowModal(true);
  };

  // ==================== 计算属性 ====================

  const totalPages = Math.ceil(total / pageSize);

  // ==================== 渲染 ====================

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Toast 提示 */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {toast.message}
        </div>
      )}

      {/* 头部工具栏 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">客户档案管理</h2>
          <div className="flex flex-wrap gap-3 items-center">
            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="搜索公司名称、联系人、邮箱..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>
            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="active">活跃</option>
              <option value="inactive">非活跃</option>
            </select>
            {/* 操作按钮 */}
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={18} />
              新增客户
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              <Download size={18} />
              导出
            </button>
          </div>
        </div>
      </div>

      {/* 客户列表 - 卡片式布局 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          // 骨架屏
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          // 空状态
          <div className="px-4 py-16 text-center">
            <User size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">暂无客户数据</p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 text-blue-500 hover:text-blue-600"
            >
              <Plus size={18} />
              新增第一个客户
            </button>
          </div>
        ) : (
          // 客户卡片列表
          <div className="divide-y divide-gray-100">
            {customers.map((customer) => (
              <div 
                key={customer.id} 
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => { setViewingCustomer(customer); setShowDetailModal(true); }}
              >
                {/* 公司头像 */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-semibold text-sm">
                    {customer.companyName?.charAt(0) || '?'}
                  </span>
                </div>
                
                {/* 主要信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{customer.companyName}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      customer.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        customer.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                      }`}></span>
                      {customer.status === 'active' ? '活跃' : '非活跃'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <span>{customer.contactName || '未设置联系人'}</span>
                    {customer.industry && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{customer.industry}</span>
                      </>
                    )}
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-400">
                      {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('zh-CN') : '-'}
                    </span>
                  </div>
                </div>
                
                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => loadCustomerFile(customer.customerId)}
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="编辑档案"
                  >
                    <FileText size={18} />
                  </button>
                  <button
                    onClick={() => openEditModal(customer)}
                    className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="编辑信息"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => { setDeletingCustomer(customer); setShowDeleteConfirm(true); }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              共 <span className="font-medium">{total}</span> 条记录
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新增/编辑客户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingCustomer ? '编辑客户' : '新增客户'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">客户ID</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
                    value={formData.customerId}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司名称 <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="请输入公司名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="请输入联系人姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="请输入联系电话"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                  <input
                    type="email"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="请输入邮箱地址"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">行业</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="请输入所属行业"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="active">活跃</option>
                    <option value="inactive">非活跃</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="多个标签用逗号分隔"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="请输入备注信息"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveCustomer}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 客户档案文件编辑弹窗 */}
      {showFileEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowFileEditor(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">编辑客户档案</h3>
                <p className="text-sm text-gray-500 mt-1">客户ID: {currentCustomerId}</p>
              </div>
              <button onClick={() => setShowFileEditor(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <textarea
                className="w-full h-[60vh] border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                placeholder={`[客户画像]
公司名称：
行业：
关注点：

[对话记录]

[待办事项]
`}
              />
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowFileEditor(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveCustomerFile}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                保存档案
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 客户详情查看弹窗 */}
      {showDetailModal && viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* 头部：公司名称 + 操作按钮 */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-gray-900 truncate">{viewingCustomer.companyName}</h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                  <span className="font-mono">{viewingCustomer.customerId}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    viewingCustomer.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      viewingCustomer.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                    }`}></span>
                    {viewingCustomer.status === 'active' ? '活跃' : '非活跃'}
                  </span>
                  <span>·</span>
                  <span>{viewingCustomer.createdAt ? new Date(viewingCustomer.createdAt).toLocaleDateString('zh-CN') + '录入' : '-'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => { setShowDetailModal(false); openEditModal(viewingCustomer); }}
                  className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  编辑
                </button>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            {/* 主体：左右分栏 */}
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左侧：联系信息 */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-lg">📇</span>
                    联系信息
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16">联系人</span>
                      <span className="text-gray-800">{viewingCustomer.contactName || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16">📞 电话</span>
                      {viewingCustomer.contactPhone ? (
                        <a href={`tel:${viewingCustomer.contactPhone}`} className="text-blue-600 hover:underline">
                          {viewingCustomer.contactPhone}
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16">📧 邮箱</span>
                      {viewingCustomer.contactEmail ? (
                        <a href={`mailto:${viewingCustomer.contactEmail}`} className="text-blue-600 hover:underline truncate">
                          {viewingCustomer.contactEmail}
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16">行业</span>
                      <span className="text-gray-800">{viewingCustomer.industry || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* 右侧：工商信息 */}
                {viewingCustomer.notes && (() => {
                  try {
                    const notesData = JSON.parse(viewingCustomer.notes);
                    const tyc = notesData.tianyancha;
                    if (tyc) {
                      return (
                        <div className="bg-blue-50 rounded-xl p-5">
                          <h4 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
                            <span className="text-lg">🏢</span>
                            工商信息
                          </h4>
                          <div className="space-y-3 text-sm">
                            {tyc.legalPersonName && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 w-20">法人</span>
                                <span className="text-gray-800">{tyc.legalPersonName}</span>
                              </div>
                            )}
                            {tyc.regCapital && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 w-20">注册资本</span>
                                <span className="text-gray-800">{tyc.regCapital}</span>
                              </div>
                            )}
                            {tyc.establishTime && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 w-20">成立日期</span>
                                <span className="text-gray-800">{tyc.establishTime}</span>
                              </div>
                            )}
                            {tyc.regStatus && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 w-20">经营状态</span>
                                <span className="text-gray-800">{tyc.regStatus}</span>
                              </div>
                            )}
                            {tyc.socialStaffNum !== undefined && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 w-20">参保人数</span>
                                <span className="text-gray-800">{tyc.socialStaffNum} 人</span>
                              </div>
                            )}
                            {tyc.creditCode && (
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 w-20 flex-shrink-0">信用代码</span>
                                <span className="text-gray-800 font-mono text-xs break-all">{tyc.creditCode}</span>
                              </div>
                            )}
                            {tyc.businessScope && (
                              <div className="pt-2 border-t border-blue-100">
                                <span className="text-blue-600">经营范围</span>
                                <p className="text-gray-700 text-xs mt-1 leading-relaxed">{tyc.businessScope}</p>
                              </div>
                            )}
                          </div>
                          {tyc.dataSource && (
                            <div className="mt-4 pt-3 border-t border-blue-100 text-xs text-blue-400">
                              来源：{tyc.dataSource}
                              {tyc.updatedAt && ` · ${new Date(tyc.updatedAt).toLocaleDateString('zh-CN')}`}
                            </div>
                          )}
                        </div>
                      );
                    }
                  } catch (e) {
                    // 不是 JSON 格式，显示备注
                    return (
                      <div className="bg-gray-50 rounded-xl p-5">
                        <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          <span className="text-lg">📝</span>
                          备注
                        </h4>
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap">{viewingCustomer.notes}</pre>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* 如果没有工商信息，显示占位 */}
                {(!viewingCustomer.notes || (() => {
                  try {
                    const notesData = JSON.parse(viewingCustomer.notes);
                    return !notesData.tianyancha;
                  } catch {
                    return false;
                  }
                })()) && (
                  <div className="bg-gray-50 rounded-xl p-5 flex items-center justify-center text-gray-400 text-sm">
                    暂无工商信息
                  </div>
                )}
              </div>

              {/* 标签 */}
              {viewingCustomer.tags && viewingCustomer.tags.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏷️</span>
                    <span className="text-sm text-gray-500">标签</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {viewingCustomer.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 地址信息 */}
              {viewingCustomer.notes && (() => {
                try {
                  const notesData = JSON.parse(viewingCustomer.notes);
                  const tyc = notesData.tianyancha;
                  if (tyc?.address) {
                    return (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📍</span>
                          <span className="text-sm text-gray-500">注册地址</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{tyc.address}</p>
                      </div>
                    );
                  }
                } catch {}
                return null;
              })()}
            </div>

            {/* 底部操作 */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  loadCustomerFile(viewingCustomer.customerId);
                }}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                编辑档案
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && deletingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">确认删除</h3>
                <p className="text-sm text-gray-500 mt-1">
                  确定要删除客户「<span className="font-medium text-gray-700">{deletingCustomer.companyName}</span>」吗？
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">此操作不可撤销，客户档案将被永久删除。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletingCustomer(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerArchiveManagement;
