'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, User, FileText, Search, Eye, Phone } from 'lucide-react';

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

const CustomerArchiveManagement = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerProfile | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    customerId: '',
    companyName: '',
    contactName: '',
    contactEmail: '',
    industry: '',
    notes: '',
    tags: '',
    status: 'active' as 'active' | 'inactive',
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customer-archive?action=list');
      const data = await response.json();
      if (data.success) {
        // 确保customers总是数组
        const customerList = Array.isArray(data.customers) ? data.customers : [];
        setCustomers(customerList);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

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
    }
  };

  const saveCustomerFile = async () => {
    if (!currentCustomerId) return;
    try {
      await fetch('/api/customer-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveFile',
          customerId: currentCustomerId,
          content: fileContent,
        }),
      });
      setShowFileEditor(false);
    } catch (error) {
      console.error('保存客户档案失败:', error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = (customers || []).filter(c =>
    c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contactEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* 头部工具栏 */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">客户档案管理</h2>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="搜索客户..."
              className="pl-10 pr-4 py-2 border rounded"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              setEditingCustomer(null);
              setFormData({
                customerId: '',
                companyName: '',
                contactName: '',
                contactEmail: '',
                industry: '',
                notes: '',
                tags: '',
                status: 'active',
              });
              setShowModal(true);
            }}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded"
          >
            <Plus size={16} />
            新增客户
          </button>
        </div>
      </div>

      {/* 客户列表 */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 font-medium text-sm">
          <div className="col-span-2">客户ID</div>
          <div className="col-span-2">公司名称</div>
          <div className="col-span-2">联系人</div>
          <div className="col-span-2">邮箱</div>
          <div className="col-span-2">行业</div>
          <div className="col-span-2">操作</div>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无客户数据</div>
          ) : (
            filteredCustomers.map((customer) => (
              <div key={customer.id} className="grid grid-cols-12 gap-4 p-4 items-center">
                <div className="col-span-2 text-sm text-gray-500">{customer.customerId}</div>
                <div className="col-span-2 font-medium">{customer.companyName}</div>
                <div className="col-span-2">{customer.contactName}</div>
                <div className="col-span-2 text-gray-600">{customer.contactEmail}</div>
                <div className="col-span-2 text-gray-500">{customer.industry || '-'}</div>
                <div className="col-span-2 flex gap-2">
                  <button
                    onClick={() => {
                      setViewingCustomer(customer);
                      setShowDetailModal(true);
                    }}
                    className="text-blue-600 flex items-center gap-1 hover:text-blue-800"
                    title="查看详情"
                  >
                    <Eye size={16} />
                    详情
                  </button>
                  <button
                    onClick={() => loadCustomerFile(customer.customerId)}
                    className="text-gray-600 flex items-center gap-1 hover:text-gray-800"
                    title="编辑档案文件"
                  >
                    <FileText size={16} />
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      setEditingCustomer(customer);
                      setFormData({
                        customerId: customer.customerId,
                        companyName: customer.companyName,
                        contactName: customer.contactName,
                        contactEmail: customer.contactEmail,
                        industry: customer.industry || '',
                        notes: customer.notes || '',
                        tags: customer.tags?.join(', ') || '',
                        status: (customer.status as 'active' | 'inactive') || 'active',
                      });
                      setShowModal(true);
                    }}
                    className="text-green-600 flex items-center gap-1 hover:text-green-800"
                    title="编辑客户信息"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('确定删除此客户？')) {
                        await fetch('/api/customer-archive', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'delete', customerData: { id: customer.id } }),
                        });
                        fetchCustomers();
                      }
                    }}
                    className="text-red-500 hover:text-red-700"
                    title="删除客户"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 新增/编辑客户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">
              {editingCustomer ? '编辑客户' : '新增客户'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">客户ID</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  placeholder="例如：customer-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">公司名称</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">联系人</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">邮箱</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">行业</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const data = {
                    ...formData,
                    id: editingCustomer?.id,
                    tags: formData.tags.split(',').map((s) => s.trim()).filter(Boolean),
                  };
                  await fetch('/api/customer-archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: editingCustomer ? 'update' : 'create',
                      customerData: data,
                    }),
                  });
                  setShowModal(false);
                  fetchCustomers();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 客户档案文件编辑弹窗 */}
      {showFileEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-bold mb-4">
              编辑客户档案 - {currentCustomerId}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              档案内容格式说明：客户画像、对话记录、待办事项
            </p>
            <textarea
              className="flex-1 border rounded px-3 py-2 font-mono text-sm"
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder={`[客户画像]
公司名称：
行业：
关注：

[对话记录]

[待办事项]
`}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowFileEditor(false)}
                className="px-4 py-2 border rounded"
              >
                取消
              </button>
              <button
                onClick={saveCustomerFile}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                保存档案
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 客户详情查看弹窗 */}
      {showDetailModal && viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">客户详情</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <User size={18} />
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">客户ID：</span>
                    <span className="font-medium">{viewingCustomer.customerId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">档案ID：</span>
                    <span className="font-mono text-xs">{viewingCustomer.id}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">公司名称：</span>
                    <span className="font-medium text-lg">{viewingCustomer.companyName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">联系人：</span>
                    <span>{viewingCustomer.contactName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">邮箱：</span>
                    <span className="text-blue-600">{viewingCustomer.contactEmail || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">电话：</span>
                    <span className="text-blue-600">{viewingCustomer.contactPhone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">行业：</span>
                    <span>{viewingCustomer.industry || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">状态：</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      viewingCustomer.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {viewingCustomer.status === 'active' ? '活跃' : '非活跃'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 联系方式高亮卡片 */}
              {(viewingCustomer.contactPhone || viewingCustomer.contactEmail) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                    <Phone size={18} />
                    联系方式
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {viewingCustomer.contactPhone && (
                      <div>
                        <span className="text-sm text-green-600">联系电话</span>
                        <p className="text-lg font-semibold text-green-900">{viewingCustomer.contactPhone}</p>
                      </div>
                    )}
                    {viewingCustomer.contactEmail && (
                      <div>
                        <span className="text-sm text-green-600">联系邮箱</span>
                        <p className="text-lg font-semibold text-green-900">{viewingCustomer.contactEmail}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 标签 */}
              {viewingCustomer.tags && viewingCustomer.tags.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewingCustomer.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 天眼查信息（从 notes 解析） */}
              {viewingCustomer.notes && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText size={18} />
                    企业详细信息
                  </h4>
                  {(() => {
                    try {
                      const notesData = JSON.parse(viewingCustomer.notes);
                      const tyc = notesData.tianyancha;
                      if (tyc) {
                        return (
                          <div className="bg-blue-50 rounded-lg p-4 space-y-2 text-sm">
                            {tyc.socialStaffNum !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">参保人数：</span>
                                <span className="font-semibold text-blue-700">{tyc.socialStaffNum} 人</span>
                              </div>
                            )}
                            {tyc.staffNumRange && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">人员规模：</span>
                                <span>{tyc.staffNumRange}</span>
                              </div>
                            )}
                            {tyc.legalPersonName && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">法定代表人：</span>
                                <span>{tyc.legalPersonName}</span>
                              </div>
                            )}
                            {tyc.regCapital && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">注册资本：</span>
                                <span>{tyc.regCapital}</span>
                              </div>
                            )}
                            {tyc.establishTime && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">成立日期：</span>
                                <span>{tyc.establishTime}</span>
                              </div>
                            )}
                            {tyc.regStatus && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">经营状态：</span>
                                <span>{tyc.regStatus}</span>
                              </div>
                            )}
                            {tyc.creditCode && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">统一信用代码：</span>
                                <span className="font-mono text-xs">{tyc.creditCode}</span>
                              </div>
                            )}
                            {tyc.phoneNumber && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">联系电话：</span>
                                <span className="text-blue-700 font-medium">{tyc.phoneNumber}</span>
                              </div>
                            )}
                            {tyc.email && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">联系邮箱：</span>
                                <span className="text-blue-700 font-medium">{tyc.email}</span>
                              </div>
                            )}
                            {tyc.address && (
                              <div>
                                <span className="text-gray-600">注册地址：</span>
                                <p className="mt-1 text-gray-800">{tyc.address}</p>
                              </div>
                            )}
                            {tyc.businessScope && (
                              <div>
                                <span className="text-gray-600">经营范围：</span>
                                <p className="mt-1 text-gray-800 text-xs leading-relaxed">{tyc.businessScope}</p>
                              </div>
                            )}
                            {tyc.dataSource && (
                              <div className="pt-2 border-t mt-2">
                                <span className="text-xs text-gray-400">数据来源：{tyc.dataSource}</span>
                                {tyc.updatedAt && (
                                  <span className="text-xs text-gray-400 ml-4">
                                    更新时间：{new Date(tyc.updatedAt).toLocaleString('zh-CN')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                    } catch (e) {
                      // 不是 JSON 格式，直接显示文本
                    }
                    return (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap">{viewingCustomer.notes}</pre>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 时间信息 */}
              <div className="text-xs text-gray-400 border-t pt-4">
                <div>创建时间：{new Date(viewingCustomer.createdAt).toLocaleString('zh-CN')}</div>
                <div>更新时间：{new Date(viewingCustomer.updatedAt).toLocaleString('zh-CN')}</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border rounded"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  loadCustomerFile(viewingCustomer.customerId);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                编辑档案
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerArchiveManagement;
