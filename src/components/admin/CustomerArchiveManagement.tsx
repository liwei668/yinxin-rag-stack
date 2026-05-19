'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, User, FileText, Search } from 'lucide-react';

interface CustomerProfile {
  id: string;
  customerId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
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
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(null);
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
    status: 'active' as const,
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
                    onClick={() => loadCustomerFile(customer.customerId)}
                    className="text-blue-500 flex items-center gap-1"
                  >
                    <FileText size={16} />
                    编辑档案
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
                        status: customer.status || 'active',
                      });
                      setShowModal(true);
                    }}
                    className="text-green-500 flex items-center gap-1"
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
                    className="text-red-500"
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
    </div>
  );
};

export default CustomerArchiveManagement;
