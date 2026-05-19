'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  User, Plus, Edit, Trash2, Search, Key, UserCheck, UserX,
  ChevronLeft, ChevronRight, Copy, Check, X, AlertTriangle
} from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  avatar: string;
  storagePreference: 'local' | 'cloud' | 'hybrid';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'user'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserData | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserData | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    isActive: true,
    storagePreference: 'hybrid' as 'local' | 'cloud' | 'hybrid',
    password: '',
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin?action=users');
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.error || '获取用户列表失败');
      }
    } catch (err) {
      console.error('获取用户列表失败:', err);
      setError('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = searchQuery === '' || 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && user.isActive) ||
        (filterStatus === 'inactive' && !user.isActive);
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, filterRole, filterStatus]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedUsers.map(u => u.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchEnable = async () => {
    if (selectedIds.size === 0) {
      setError('请先选择用户');
      return;
    }
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchUpdateUsers',
          data: { ids: Array.from(selectedIds), updates: { isActive: true } }
        })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedIds(new Set());
        fetchUsers();
      } else {
        setError(data.error || '批量启用失败');
      }
    } catch (err) {
      setError('批量启用失败');
    }
  };

  const handleBatchDisable = async () => {
    if (selectedIds.size === 0) {
      setError('请先选择用户');
      return;
    }
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchUpdateUsers',
          data: { ids: Array.from(selectedIds), updates: { isActive: false } }
        })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedIds(new Set());
        fetchUsers();
      } else {
        setError(data.error || '批量禁用失败');
      }
    } catch (err) {
      setError('批量禁用失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchDeleteUsers',
          data: { ids: Array.from(selectedIds) }
        })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedIds(new Set());
        setShowBatchDeleteConfirm(false);
        fetchUsers();
      } else {
        setError(data.error || '批量删除失败');
      }
    } catch (err) {
      setError('批量删除失败');
    }
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      storagePreference: user.storagePreference,
      password: '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const submitData: any = { 
        id: editingUser.id, 
        username: editForm.username, 
        email: editForm.email, 
        role: editForm.role, 
        isActive: editForm.isActive, 
        storagePreference: editForm.storagePreference 
      };
      if (editForm.password) {
        submitData.password = editForm.password;
      }
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateUser',
          data: submitData
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowEditModal(false);
        fetchUsers();
      } else {
        setError(data.error || '更新用户失败');
      }
    } catch (err) {
      setError('更新用户失败');
    }
  };

  const openResetPasswordModal = (user: UserData) => {
    setResetPasswordUser(user);
    const temp = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4);
    setTempPassword(temp);
    setCopied(false);
    setShowResetPasswordModal(true);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resetPassword',
          data: { id: resetPasswordUser.id, tempPassword }
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowResetPasswordModal(false);
      } else {
        setError(data.error || '重置密码失败');
      }
    } catch (err) {
      setError('重置密码失败');
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = async (user: UserData) => {
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateUser',
          data: { id: user.id, isActive: !user.isActive }
        })
      });
      const data = await response.json();
      if (data.success) {
        fetchUsers();
      } else {
        setError(data.error || '更新状态失败');
      }
    } catch (err) {
      setError('更新状态失败');
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteUser',
          data: { id: deletingUser.id }
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowDeleteConfirm(false);
        fetchUsers();
      } else {
        setError(data.error || '删除用户失败');
      }
    } catch (err) {
      setError('删除用户失败');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex flex-wrap gap-2 w-full lg:w-auto overflow-x-auto">
          <button
            onClick={() => {
              setEditingUser(null);
              setEditForm({ 
                username: '', 
                email: '', 
                role: 'user', 
                isActive: true, 
                storagePreference: 'hybrid',
                password: '',
              });
              setShowEditModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus size={16} />
            新增用户
          </button>
          <button
            onClick={handleBatchEnable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 whitespace-nowrap"
            disabled={selectedIds.size === 0}
          >
            <UserCheck size={16} />
            批量启用
          </button>
          <button
            onClick={handleBatchDisable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 whitespace-nowrap"
            disabled={selectedIds.size === 0}
          >
            <UserX size={16} />
            批量禁用
          </button>
          <button
            onClick={() => selectedIds.size > 0 && setShowBatchDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-red-600 text-sm rounded-md hover:bg-red-50 transition-colors disabled:opacity-50 whitespace-nowrap"
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={16} />
            批量删除
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="搜索用户名/邮箱"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 whitespace-nowrap"
          >
            <option value="all">全部角色</option>
            <option value="admin">管理员</option>
            <option value="user">用户</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 whitespace-nowrap"
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="inactive">禁用</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={paginatedUsers.length > 0 && selectedIds.size === paginatedUsers.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[100px]">用户</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[150px]">邮箱</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[80px]">角色</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[70px]">状态</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[140px]">创建时间</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[140px]">最后登录</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[120px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500 text-sm">
                    加载中...
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <User size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">
                      {searchQuery || filterRole !== 'all' || filterStatus !== 'all'
                        ? '没有找到匹配的用户'
                        : '还没有用户，点击「新增用户」开始'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => handleSelectOne(user.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                            <User size={14} className="text-gray-500" />
                          </div>
                        )}
                        <span className="font-medium text-gray-900 whitespace-nowrap">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 truncate max-w-[150px]">{user.email}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                        user.isActive 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.isActive ? '活跃' : '禁用'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="编辑"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => openResetPasswordModal(user)}
                          className="p-1 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                          title="重置密码"
                        >
                          <Key size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`p-1 rounded ${
                            user.isActive 
                              ? 'text-gray-500 hover:text-red-600 hover:bg-red-50' 
                              : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={user.isActive ? '禁用' : '启用'}
                        >
                          {user.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                        <button
                          onClick={() => { setDeletingUser(user); setShowDeleteConfirm(true); }}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredUsers.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">每页</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="border border-gray-300 rounded px-2 py-1"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="text-gray-500">条，共 {filteredUsers.length} 条</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-3 py-1">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                {editingUser ? '编辑用户' : '新增用户'}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (editingUser) {
                await handleEditSubmit(e);
              } else {
                try {
                  const response = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'createUser',
                      data: { ...editForm }
                    })
                  });
                  const data = await response.json();
                  if (data.success) {
                    setShowEditModal(false);
                    fetchUsers();
                  } else {
                    setError(data.error || '创建用户失败');
                  }
                } catch (err) {
                  setError('创建用户失败');
                }
              }
            }} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用户名 *</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱 *</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">存储偏好</label>
                <select
                  value={editForm.storagePreference}
                  onChange={(e) => setEditForm(prev => ({ ...prev, storagePreference: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="hybrid">混合存储</option>
                  <option value="local">本地存储</option>
                  <option value="cloud">云端存储</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? '密码 (留空则不修改)' : '密码 *'}
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required={!editingUser}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">启用用户</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {editingUser ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetPasswordModal && resetPasswordUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">重置密码</h3>
              <button onClick={() => setShowResetPasswordModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-gray-600">
                确定要重置用户 <span className="font-medium text-gray-900">{resetPasswordUser.username}</span> 的密码吗？
              </p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">临时密码：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded font-mono text-lg">
                    {tempPassword}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  >
                    {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
                  </button>
                </div>
              </div>
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                请将临时密码发送给用户，首次登录后请修改密码。
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowResetPasswordModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleResetPassword}
                  className="px-4 py-2 text-sm text-white bg-amber-600 rounded-md hover:bg-amber-700"
                >
                  确认重置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && deletingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">确认删除</h3>
                  <p className="text-sm text-gray-500">此操作不可恢复</p>
                </div>
              </div>
              <p className="text-gray-600">
                确定要删除用户 <span className="font-medium text-gray-900">{deletingUser.username}</span> 吗？
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">批量删除确认</h3>
                  <p className="text-sm text-gray-500">此操作不可恢复</p>
                </div>
              </div>
              <p className="text-gray-600">
                确定要删除选中的 <span className="font-medium text-red-600">{selectedIds.size}</span> 个用户吗？
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
