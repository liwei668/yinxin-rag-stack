import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, Layers, CheckCircle2, AlertCircle } from 'lucide-react';

interface SkillCombination {
  id: string;
  name: string;
  description: string;
  skills: string[];
  defaultModelId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const SkillCombinationManagement = () => {
  const [combinations, setCombinations] = useState<SkillCombination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<SkillCombination | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<SkillCombination | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    skills: [] as string[],
    defaultModelId: 'deepseek-v4-flash',
    isActive: true,
  });

  const availableSkills = [
    { id: 'prompt_sales.txt', name: '销售话术', desc: '销售咨询场景' },
    { id: 'prompt_support.txt', name: '技术支持', desc: '技术支持场景' },
    { id: 'prompt_compliance.txt', name: '财税法分析', desc: '财税法规分析' },
  ];

  const fetchCombinations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/skill-combinations?action=list');
      const data = await response.json();
      if (data.success) {
        setCombinations(data.combinations || []);
      } else {
        setError(data.error || '获取技能组合失败');
      }
    } catch (e) {
      setError('获取技能组合失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCombinations();
  }, [fetchCombinations]);

  const previewCombination = async (combo: SkillCombination) => {
    setSelectedCombo(combo);
    try {
      const response = await fetch('/api/skill-combinations?action=preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: combo.id }),
      });
      const data = await response.json();
      if (data.success) {
        setPreviewContent(data.content);
      } else {
        setPreviewContent('预览失败：' + (data.error || '未知错误'));
      }
    } catch (e) {
      setPreviewContent('预览失败：网络错误');
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        action: editingCombo ? 'update' : 'create',
        comboData: {
          id: editingCombo?.id,
          name: formData.name,
          description: formData.description,
          skills: formData.skills,
          defaultModelId: formData.defaultModelId,
          isActive: formData.isActive,
        },
      };

      const response = await fetch('/api/skill-combinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess(editingCombo ? '组合更新成功' : '组合创建成功');
        setShowModal(false);
        fetchCombinations();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || '操作失败');
      }
    } catch (e) {
      setError('操作失败');
    }
  };

  const handleDelete = async (combo: SkillCombination) => {
    if (!confirm(`确定删除组合"${combo.name}"吗？`)) return;

    try {
      const response = await fetch('/api/skill-combinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: combo.id }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('组合删除成功');
        fetchCombinations();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || '删除失败');
      }
    } catch (e) {
      setError('删除失败');
    }
  };

  const openEditModal = (combo: SkillCombination) => {
    setEditingCombo(combo);
    setFormData({
      name: combo.name,
      description: combo.description,
      skills: combo.skills,
      defaultModelId: combo.defaultModelId,
      isActive: combo.isActive,
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingCombo(null);
    setFormData({
      name: '',
      description: '',
      skills: [],
      defaultModelId: 'deepseek-v4-flash',
      isActive: true,
    });
    setShowModal(true);
  };

  const toggleSkill = (skillId: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skillId)
        ? prev.skills.filter(s => s !== skillId)
        : [...prev.skills, skillId]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="text-purple-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">技能提词器组合</h3>
            <p className="text-sm text-gray-500">组合多个技能提词器，形成完整的工作流程</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus size={18} />
          添加组合
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
      ) : combinations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无技能组合，点击上方按钮添加
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {combinations.map((combo) => (
            <div
              key={combo.id}
              className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">{combo.name}</h4>
                  <p className="text-sm text-gray-500 mt-1">{combo.description}</p>
                </div>
                {combo.isActive ? (
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">启用</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">禁用</span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-xs text-gray-500">包含技能：</div>
                <div className="flex flex-wrap gap-1">
                  {combo.skills.map((skill) => {
                    const skillInfo = availableSkills.find(s => s.id === skill);
                    return (
                      <span
                        key={skill}
                        className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded"
                      >
                        {skillInfo?.name || skill}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-3">
                默认模型：{combo.defaultModelId}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => previewCombination(combo)}
                  className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                >
                  预览组合
                </button>
                <button
                  onClick={() => openEditModal(combo)}
                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(combo)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCombo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">组合预览：{selectedCombo.name}</h3>
                <p className="text-sm text-gray-500">{selectedCombo.description}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedCombo(null);
                  setPreviewContent('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg font-mono">
                {previewContent || '加载中...'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingCombo ? '编辑技能组合' : '添加技能组合'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">组合名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="例如：销售咨询组合"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                  placeholder="描述这个组合的用途"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择技能</label>
                <div className="space-y-2">
                  {availableSkills.map((skill) => (
                    <div
                      key={skill.id}
                      onClick={() => toggleSkill(skill.id)}
                      className={`p-3 border rounded cursor-pointer transition-colors ${
                        formData.skills.includes(skill.id)
                          ? 'bg-purple-50 border-purple-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.skills.includes(skill.id)}
                          onChange={() => toggleSkill(skill.id)}
                          className="h-4 w-4 text-purple-600"
                        />
                        <span className="font-medium">{skill.name}</span>
                        <span className="text-sm text-gray-500">- {skill.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认模型</label>
                <select
                  value={formData.defaultModelId}
                  onChange={(e) => setFormData({ ...formData, defaultModelId: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="deepseek-v4-flash">DeepSeek V4 Flash（快速）</option>
                  <option value="deepseek-v4-pro">DeepSeek V4 Pro（专业）</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 text-purple-600 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  激活此组合
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
                disabled={!formData.name || formData.skills.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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

export default SkillCombinationManagement;
