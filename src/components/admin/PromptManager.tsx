'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, TestTube, Save, X, Eye, FileText, Tag, Layers } from 'lucide-react';
import SkillCombinationManagement from './SkillCombinationManagement';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
  categories: string[];
  associatedKnowledgeDocs: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDefault?: boolean;
  scenario?: string[];
  callCount?: number;
  lastUsedAt?: string;
}

const AVAILABLE_SCENARIOS = [
  '财务', '编程', '写作', '翻译', '分析', '客服', '教育', '法律', '医疗'
];

const PromptManager = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<PromptTemplate | null>(null);
  const [testTemplate, setTestTemplate] = useState<PromptTemplate | null>(null);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'templates' | 'combinations'>('templates');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
    variables: '' as string,
    categories: '' as string,
    associatedKnowledgeDocs: '' as string,
    isActive: true,
    scenario: [] as string[]
  });

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/prompts-v2?action=list');
      const result = await response.json();
      if (result.success) {
        // 转换 SQLite 数据格式为组件格式
        setTemplates(result.templates.map((t: any) => ({
          ...t,
          isActive: t.isActive === 1,
          isDefault: t.isDefault === 1,
          variables: JSON.parse(t.variables || '[]'),
          categories: JSON.parse(t.categories || '[]'),
          associatedKnowledgeDocs: JSON.parse(t.associatedKnowledgeDocs || '[]'),
          scenario: JSON.parse(t.scenario || '[]'),
        })));
      }
    } catch (error) {
      console.error('获取模板列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleScenarioToggle = (scenario: string) => {
    setFormData(prev => ({
      ...prev,
      scenario: prev.scenario.includes(scenario)
        ? prev.scenario.filter(s => s !== scenario)
        : [...prev.scenario, scenario]
    }));
  };

  const openCreateModal = () => {
    setCurrentTemplate(null);
    setFormData({
      name: '',
      description: '',
      content: '',
      variables: '',
      categories: '',
      associatedKnowledgeDocs: '',
      isActive: true,
      scenario: []
    });
    setShowModal(true);
  };

  const openEditModal = (template: PromptTemplate) => {
    setCurrentTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      content: template.content,
      variables: template.variables.join(', '),
      categories: template.categories.join(', '),
      associatedKnowledgeDocs: template.associatedKnowledgeDocs.join(', '),
      isActive: template.isActive,
      scenario: template.scenario || []
    });
    setShowModal(true);
  };

  const openTestModal = (template: PromptTemplate) => {
    setTestTemplate(template);
    const variables: Record<string, string> = {};
    template.variables.forEach(v => {
      variables[v] = '';
    });
    setTestVariables(variables);
    setTestResult('');
    setShowTestModal(true);
  };

  const handleTestVariableChange = (key: string, value: string) => {
    setTestVariables(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleTest = async () => {
    if (!testTemplate) return;
    setIsTesting(true);
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          id: testTemplate.id,
          variables: testVariables
        })
      });
      const result = await response.json();
      if (result.success) {
        setTestResult(result.result);
      } else {
        setMessage('测试失败');
        setSuccess(false);
      }
    } catch (error) {
      console.error('测试失败:', error);
      setMessage('测试失败');
      setSuccess(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const templateData = {
        name: formData.name,
        description: formData.description,
        content: formData.content,
        variables: formData.variables ? formData.variables.split(',').map(v => v.trim()).filter(v => v) : [],
        categories: formData.categories ? formData.categories.split(',').map(c => c.trim()).filter(c => c) : [],
        associatedKnowledgeDocs: formData.associatedKnowledgeDocs ? formData.associatedKnowledgeDocs.split(',').map(d => d.trim()).filter(d => d) : [],
        isActive: formData.isActive,
        scenario: formData.scenario
      };

      let response;
      if (currentTemplate) {
        response = await fetch('/api/prompts-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            id: currentTemplate.id,
            ...templateData
          })
        });
      } else {
        response = await fetch('/api/prompts-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            ...templateData
          })
        });
      }

      const result = await response.json();
      if (result.success) {
        setMessage(currentTemplate ? '模板已更新' : '模板已创建');
        setSuccess(true);
        setShowModal(false);
        fetchTemplates();
        setTimeout(() => {
          setMessage('');
          setSuccess(false);
        }, 3000);
      } else {
        setMessage(result.error || '操作失败');
        setSuccess(false);
      }
    } catch (error) {
      console.error('提交失败:', error);
      setMessage('操作失败');
      setSuccess(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模板吗？')) return;
    try {
      const response = await fetch('/api/prompts-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const result = await response.json();
      if (result.success) {
        setMessage('模板已删除');
        setSuccess(true);
        fetchTemplates();
        setTimeout(() => {
          setMessage('');
          setSuccess(false);
        }, 3000);
      } else {
        setMessage(result.error || '删除失败');
        setSuccess(false);
      }
    } catch (error) {
      console.error('删除失败:', error);
      setMessage('删除失败');
      setSuccess(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch('/api/prompts-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setDefault', id })
      });
      const result = await response.json();
      if (result.success) {
        setMessage('已设为默认模板');
        setSuccess(true);
        fetchTemplates();
        setTimeout(() => {
          setMessage('');
          setSuccess(false);
        }, 3000);
      } else {
        setMessage(result.error || '设置失败');
        setSuccess(false);
      }
    } catch (error) {
      console.error('设置失败:', error);
      setMessage('设置失败');
      setSuccess(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">提示词管理</h3>
            <p className="text-sm text-gray-500">管理和编辑AI提示词模板</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          创建模板
        </button>
      </div>

      {/* 子标签切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveSubTab('templates')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeSubTab === 'templates'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <FileText size={15} />
            提示词模板
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab('combinations')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeSubTab === 'combinations'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Layers size={15} />
            技能组合
          </div>
        </button>
      </div>

      {/* 内容区域 */}
      {activeSubTab === 'templates' && (
        <>
          {/* 使用说明 */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">场景智能匹配说明</h4>
            <p className="text-sm text-blue-700 mb-2">
              为提词器设置场景标签后，系统会根据用户消息中的关键词自动匹配最合适的提词器。
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SCENARIOS.map(scenario => (
                <span key={scenario} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                  {scenario}
                </span>
              ))}
            </div>
          </div>

          {message && (
            <div className={`p-3 rounded-lg ${success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}

          {loading ? (
            <div className="text-gray-500">加载中...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {templates.map(template => (
                <div key={template.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-base font-semibold text-gray-900">{template.name}</h4>
                        {template.isDefault && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">默认</span>
                        )}
                        {template.isActive ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">启用</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">禁用</span>
                        )}
                      </div>
                      <p className="text-gray-600 mb-3 text-sm">{template.description}</p>

                      {template.scenario && template.scenario.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <Tag size={14} className="text-orange-500" />
                          {template.scenario.map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-orange-50 text-orange-700 text-xs rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {template.categories.map(category => (
                          <span key={category} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                            {category}
                          </span>
                        ))}
                      </div>

                      {template.variables.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className="text-sm text-gray-500">变量：</span>
                          {template.variables.map(variable => (
                            <span key={variable} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs rounded font-mono">
                              {variable}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-gray-400">
                        创建于: {new Date(template.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => openTestModal(template)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="测试模板"
                      >
                        <TestTube size={16} />
                      </button>
                      <button
                        onClick={() => openEditModal(template)}
                        className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                        title="编辑模板"
                      >
                        <Edit size={16} />
                      </button>
                      {!template.isDefault && (
                        <button
                          onClick={() => handleSetDefault(template.id)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="设为默认"
                        >
                          <Tag size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除模板"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 技能组合管理 */}
      {activeSubTab === 'combinations' && (
        <SkillCombinationManagement />
      )}

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold">
                {currentTemplate ? '编辑模板' : '创建模板'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模板名称
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模板内容
                </label>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                  rows={8}
                  required
                  placeholder="使用 {变量名} 表示变量"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  变量（逗号分隔）
                </label>
                <input
                  type="text"
                  name="variables"
                  value={formData.variables}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  placeholder="例如：name, age, profession"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类（逗号分隔）
                </label>
                <input
                  type="text"
                  name="categories"
                  value={formData.categories}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  placeholder="例如：客服, 销售, 技术支持"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  场景标签
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SCENARIOS.map(scenario => (
                    <label key={scenario} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.scenario.includes(scenario)}
                        onChange={() => handleScenarioToggle(scenario)}
                        className="h-4 w-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-700">{scenario}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">启用此模板</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                >
                  <Save size={18} />
                  {currentTemplate ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 测试模态框 */}
      {showTestModal && testTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold">测试模板：{testTemplate.name}</h3>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">变量输入</h4>
                {testTemplate.variables.length === 0 ? (
                  <p className="text-gray-500">此模板没有变量</p>
                ) : (
                  <div className="space-y-3">
                    {testTemplate.variables.map(variable => (
                      <div key={variable}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {variable}
                        </label>
                        <textarea
                          value={testVariables[variable] || ''}
                          onChange={(e) => handleTestVariableChange(variable, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                          rows={3}
                          placeholder={`请输入 ${variable} 的值`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleTest}
                disabled={isTesting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                <TestTube size={18} />
                {isTesting ? '测试中...' : '运行测试'}
              </button>

              {testResult && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">测试结果</h4>
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm">{testResult}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptManager;
