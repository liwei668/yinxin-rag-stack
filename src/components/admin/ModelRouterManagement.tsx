import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, Route, Search, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';

interface RouterRule {
  id: string;
  name: string;
  type: 'keyword' | 'fileType' | 'intent' | 'default';
  keywords?: string[];
  fileTypes?: string[];
  intent?: string;
  modelId: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ModelRouterManagement = () => {
  const [rules, setRules] = useState<RouterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RouterRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'keyword' as 'keyword' | 'fileType' | 'intent' | 'default',
    keywords: '',
    fileTypes: '',
    intent: '',
    modelId: 'deepseek-v4-flash',
    priority: 50,
    isActive: true,
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/model-router?action=list');
      const data = await response.json();
      if (data.success) {
        setRules(data.rules || []);
      } else {
        setError(data.error || '获取路由规则失败');
      }
    } catch (e) {
      setError('获取路由规则失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSubmit = async () => {
    try {
      const payload = {
        action: editingRule ? 'update' : 'create',
        ruleData: {
          id: editingRule?.id,
          name: formData.name,
          type: formData.type,
          keywords: formData.type === 'keyword' ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
          fileTypes: formData.type === 'fileType' ? formData.fileTypes.split(',').map(f => f.trim()).filter(Boolean) : [],
          intent: formData.type === 'intent' ? formData.intent : undefined,
          modelId: formData.modelId,
          priority: formData.priority,
          isActive: formData.isActive,
        },
      };

      const response = await fetch('/api/model-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess(editingRule ? '规则更新成功' : '规则创建成功');
        setShowModal(false);
        fetchRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || '操作失败');
      }
    } catch (e) {
      setError('操作失败');
    }
  };

  const handleDelete = async (rule: RouterRule) => {
    if (!confirm(`确定删除规则"${rule.name}"吗？`)) return;

    try {
      const response = await fetch('/api/model-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ruleData: { id: rule.id } }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('规则删除成功');
        fetchRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || '删除失败');
      }
    } catch (e) {
      setError('删除失败');
    }
  };

  const openEditModal = (rule: RouterRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      type: rule.type,
      keywords: rule.keywords?.join(', ') || '',
      fileTypes: rule.fileTypes?.join(', ') || '',
      intent: rule.intent || '',
      modelId: rule.modelId,
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      type: 'keyword',
      keywords: '',
      fileTypes: '',
      intent: '',
      modelId: 'deepseek-v4-flash',
      priority: 50,
      isActive: true,
    });
    setShowModal(true);
  };

  const getTypeColor = (type: string) => {
    const colors = {
      keyword: 'bg-blue-100 text-blue-700',
      fileType: 'bg-purple-100 text-purple-700',
      intent: 'bg-orange-100 text-orange-700',
      default: 'bg-gray-100 text-gray-700',
    };
    return colors[type as keyof typeof colors] || colors.keyword;
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      keyword: '关键词',
      fileType: '文件类型',
      intent: '意图',
      default: '默认',
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Route className="text-emerald-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">模型路由规则</h3>
            <p className="text-sm text-gray-500">配置自动路由规则，根据内容特征选择合适的AI模型</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={18} />
          添加规则
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无路由规则，点击上方按钮添加
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 font-medium text-sm">
            <div className="col-span-3">规则名称</div>
            <div className="col-span-2">类型</div>
            <div className="col-span-2">匹配条件</div>
            <div className="col-span-2">目标模型</div>
            <div className="col-span-1">优先级</div>
            <div className="col-span-2">操作</div>
          </div>
          <div className="divide-y">
            {rules.map((rule) => (
              <div key={rule.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 transition-colors">
                <div className="col-span-3">
                  <div className="font-medium text-gray-900">{rule.name}</div>
                  {rule.isActive ? (
                    <span className="text-xs text-green-600">● 激活</span>
                  ) : (
                    <span className="text-xs text-gray-400">○ 禁用</span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(rule.type)}`}>
                    {getTypeLabel(rule.type)}
                  </span>
                </div>
                <div className="col-span-2 text-sm text-gray-600">
                  {rule.type === 'keyword' && rule.keywords?.slice(0, 2).join(', ')}
                  {rule.type === 'fileType' && rule.fileTypes?.join(', ')}
                  {rule.type === 'intent' && rule.intent}
                  {rule.type === 'default' && '默认路由'}
                </div>
                <div className="col-span-2 text-sm text-gray-900">
                  <span className="font-mono">{rule.modelId}</span>
                </div>
                <div className="col-span-1 text-sm text-gray-500">
                  {rule.priority}
                </div>
                <div className="col-span-2 flex gap-2">
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="编辑"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingRule ? '编辑路由规则' : '添加路由规则'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="例如：财务分析规则"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="keyword">关键词匹配</option>
                  <option value="fileType">文件类型匹配</option>
                  <option value="intent">意图匹配</option>
                  <option value="default">默认规则</option>
                </select>
              </div>

              {formData.type === 'keyword' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    关键词（逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="例如：财务,报表,税务"
                  />
                </div>
              )}

              {formData.type === 'fileType' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    文件类型（逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={formData.fileTypes}
                    onChange={(e) => setFormData({ ...formData, fileTypes: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="例如：pdf,docx,xlsx"
                  />
                </div>
              )}

              {formData.type === 'intent' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">意图标识</label>
                  <input
                    type="text"
                    value={formData.intent}
                    onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="例如：complex_reasoning"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标模型</label>
                <select
                  value={formData.modelId}
                  onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="deepseek-v4-flash">DeepSeek V4 Flash（快速）</option>
                  <option value="deepseek-v4-pro">DeepSeek V4 Pro（专业）</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  优先级（数字越大优先级越高）
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                  max="100"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 text-emerald-600 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  激活此规则
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelRouterManagement;
