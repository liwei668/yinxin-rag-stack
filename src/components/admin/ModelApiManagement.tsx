'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save, X, Plus, Edit, Trash2, Settings, Code, RefreshCw, Sliders, Info,
  Zap, Search, Eye, EyeOff, ChevronDown, ChevronRight, Star,
  Loader2, AlertCircle, CheckCircle2, Globe, FileText, Brain,
  Cpu, Shield, ToggleLeft, ToggleRight, Volume2, MessageSquare, Image,
  Route
} from 'lucide-react';
import SystemConfig from './SystemConfig';
import SpeechSettings from './SpeechSettings';
import ModelRouterManagement from './ModelRouterManagement';

/* ============================================================
   类型定义
   ============================================================ */

interface ModelTestResult {
  success: boolean;
  responseTime: number;
  message: string;
  timestamp: Date;
}

interface ModelMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  averageResponseTime: number;
  lastCallTime: Date | null;
}

interface ModelData {
  id?: string;
  name: string;
  modelId: string;
  type: 'llm' | 'embedding' | 't2v' | 'multimodal';
  apiId: string;
  isEnabled: boolean;
  isDefault: boolean;
  remark: string;
  parameters?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    contextWindow?: number;
    dimensions?: number;
  };
  features?: {
    webSearch?: boolean;
    ragEnabled?: boolean;
    agentEnabled?: boolean;
    memoryEnabled?: boolean;
  };
  customPrompt?: string;
  lastTestResult?: ModelTestResult | null;
  metrics?: ModelMetrics | null;
}

interface ApiData {
  api_id: string;
  name: string;
  type: 'LLM' | 'Embedding' | '搜索' | '语音' | '其他';
  baseUrl: string;
  apiKey: string;
  timeout: number;
  isActive: boolean;
  remark: string;
  proxyEnabled?: boolean;
  proxyUrl?: string;
  headers?: Array<{ key: string; value: string }>;
  requestPrefix?: string;
  retryCount?: number;
  retryOnTimeout?: boolean;
  maxQPS?: number;
}

interface Column<T> {
  key: string;
  title: string;
  width?: string;
  render: (item: T) => React.ReactNode;
}

/* ============================================================
   通用 CRUDTable 组件
   ============================================================ */

interface CRUDTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading: boolean;
  emptyText: string;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  rowKey: (item: T) => string;
  extraActions?: (item: T) => React.ReactNode;
}

function CRUDTable<T>({
  columns,
  data,
  loading,
  emptyText,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
  rowKey,
  extraActions,
}: CRUDTableProps<T>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onRefresh}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="刷新列表"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            <span>加载中...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <AlertCircle size={32} className="mb-2" />
            <span>{emptyText}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => (
                  <tr key={rowKey(item)} className="hover:bg-gray-50 transition-colors">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 whitespace-nowrap text-sm"
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   通用 Modal 组件 (ESC 关闭 + 点击遮罩关闭)
   ============================================================ */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

function Modal({ open, onClose, title, children, width = 'max-w-2xl' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`bg-white rounded-xl shadow-2xl w-full ${width} max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-xl z-10">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   删除确认弹窗
   ============================================================ */

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认删除',
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-white rounded-lg transition-colors text-sm ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   API Key 脱敏
   ============================================================ */

function maskApiKey(key: string): string {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/* ============================================================
   默认值
   ============================================================ */

const defaultModelData = (): ModelData => ({
  name: '',
  modelId: '',
  type: 'llm',
  apiId: '',
  isEnabled: true,
  isDefault: false,
  remark: '',
  parameters: {
    temperature: 0.7,
    topP: 0.95,
    maxTokens: 4096,
    contextWindow: 65536,
    frequencyPenalty: 0,
    presencePenalty: 0,
    responseFormat: 'text',
  },
  features: {
    webSearch: false,
    ragEnabled: false,
    agentEnabled: false,
    memoryEnabled: false,
    streamOutput: true,
  },
  scenario: ['general'],
  customPrompt: '',
});

const defaultApiData = (): ApiData => ({
  api_id: '',
  name: '',
  type: 'LLM',
  baseUrl: '',
  apiKey: '',
  timeout: 30000,
  isActive: true,
  remark: '',
  proxyEnabled: false,
  proxyUrl: '',
  headers: [],
  requestPrefix: '',
  retryCount: 2,
  retryOnTimeout: true,
  maxQPS: 10,
});

/* ============================================================
   输入组件样式
   ============================================================ */

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm';
const selectClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm bg-white';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionTitleClass = 'text-sm font-semibold text-gray-800 border-b border-gray-100 pb-1 mb-3';

/* ============================================================
   主组件 ModelApiManagement
   ============================================================ */

const ModelApiManagement = () => {
  // ---- 主标签 ----
  const [activeTab, setActiveTab] = useState<'services' | 'global' | 'router'>('services');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  // ---- 子标签 ----
  const [activeSubTab, setActiveSubTab] = useState<'models' | 'apis'>('models');

  // ---- 数据 ----
  const [models, setModels] = useState<ModelData[]>([]);
  const [apis, setApis] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- 消息 ----
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // ---- 弹窗 ----
  const [showModelModal, setShowModelModal] = useState(false);
  const [showQuickApiModal, setShowQuickApiModal] = useState(false);
  const [quickApiForm, setQuickApiForm] = useState({ name: '', baseUrl: '', apiKey: '', api_id: '' });
  const [quickApiSaving, setQuickApiSaving] = useState(false);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState<ModelData>(defaultModelData());

  const [showApiModal, setShowApiModal] = useState(false);
  const [editingApiId, setEditingApiId] = useState<string | null>(null);
  const [apiForm, setApiForm] = useState<ApiData>(defaultApiData());

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'model' | 'api'; id: string; name: string } | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);

  // ---- 测试连接 ----
  const [testingApiId, setTestingApiId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // ---- 模型测试状态 ----
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<Record<string, { success: boolean; responseTime: number; message: string }>>({});

  // ---- API Key 显示切换 ----
  const [showApiKeyInForm, setShowApiKeyInForm] = useState(false);

  // ---- 数据获取 ----
  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin?action=models');
      const data = await res.json();
      if (data.success) {
        setModels(data.models || []);
      } else {
        setError(data.error || '获取模型列表失败');
      }
    } catch {
      setError('获取模型列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin?action=apis');
      const data = await res.json();
      if (data.success) {
        setApis(data.apis || []);
      } else {
        setError(data.error || '获取API列表失败');
      }
    } catch {
      setError('获取API列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'services') {
      fetchModels();
      fetchApis();
    }
  }, [activeTab, activeSubTab, fetchModels, fetchApis]);

  // ---- 消息自动清除 ----
  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
        setSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  // ---- 获取关联API名称 ----
  const getApiName = (apiId: string): string => {
    const api = apis.find((a) => a.api_id === apiId);
    return api ? api.name : apiId || '-';
  };

  // ---- 模型操作 ----
  const openAddModel = () => {
    setEditingModelId(null);
    setModelForm(defaultModelData());
    setShowModelModal(true);
  };

  const openEditModel = (model: ModelData) => {
    setEditingModelId(model.id || null);
    setModelForm({
      ...model,
      parameters: {
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 4096,
        contextWindow: 65536,
        ...model.parameters,
      },
      features: {
        webSearch: false,
        ragEnabled: false,
        agentEnabled: false,
        memoryEnabled: false,
        ...model.features,
      },
      scenario: model.scenario || ['general'],
    });
    setShowModelModal(true);
  };

  const handleSaveModel = async () => {
    try {
      const isEdit = !!editingModelId;
      const action = isEdit ? 'updateModel' : 'createModel';
      const body = isEdit
        ? { action, data: { ...modelForm, id: editingModelId } }
        : { action, data: modelForm };

      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowModelModal(false);
        fetchModels();
        setMessage(isEdit ? '模型更新成功' : '模型创建成功');
        setSuccess(true);
      } else {
        setError(data.error || '操作失败');
      }
    } catch {
      setError('操作失败');
    }
  };

  const handleSetDefault = async (model: ModelData) => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateModel',
          data: { ...model, isDefault: true },
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchModels();
        setMessage('已设为默认模型');
        setSuccess(true);
      } else {
        setError(data.error || '操作失败');
      }
    } catch {
      setError('操作失败');
    }
  };

  const confirmDeleteModel = (model: ModelData) => {
    setDeleteTarget({ type: 'model', id: model.id || '', name: model.name });
    setShowDeleteConfirm(true);
    setDeleteBlocked(false);
  };

  const handleDeleteModel = async () => {
    if (!deleteTarget || deleteTarget.type !== 'model') return;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteModel', data: { id: deleteTarget.id } }),
      });
      const data = await res.json();
      if (data.success) {
        fetchModels();
        setMessage('模型删除成功');
        setSuccess(true);
      } else {
        setError(data.error || '删除失败');
      }
    } catch {
      setError('删除失败');
    }
  };

  // ---- API 操作 ----
  const openAddApi = () => {
    setEditingApiId(null);
    setApiForm(defaultApiData());
    setShowApiKeyInForm(false);
    setShowApiModal(true);
  };

  const openEditApi = (api: ApiData) => {
    setEditingApiId(api.api_id);
    setApiForm({
      ...defaultApiData(),
      ...api,
      headers: api.headers || [],
    });
    setShowApiKeyInForm(false);
    setShowApiModal(true);
  };

  const handleSaveApi = async () => {
    try {
      const isEdit = !!editingApiId;
      const action = isEdit ? 'updateApi' : 'createApi';
      const body = { action, data: apiForm };

      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowApiModal(false);
        fetchApis();
        setMessage(isEdit ? 'API更新成功' : 'API创建成功');
        setSuccess(true);
      } else {
        setError(data.error || '操作失败');
      }
    } catch {
      setError('操作失败');
    }
  };

  const confirmDeleteApi = async (api: ApiData) => {
    // 检查依赖
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkApiDependency', data: { api_id: api.api_id } }),
      });
      const data = await res.json();
      if (data.success && data.hasDependency) {
        setDeleteTarget({ type: 'api', id: api.api_id, name: api.name });
        setDeleteBlocked(true);
        setShowDeleteConfirm(true);
        return;
      }
    } catch {
      // ignore check error, proceed with delete confirm
    }
    setDeleteTarget({ type: 'api', id: api.api_id, name: api.name });
    setDeleteBlocked(false);
    setShowDeleteConfirm(true);
  };

  const handleDeleteApi = async () => {
    if (!deleteTarget || deleteTarget.type !== 'api') return;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteApi', data: { api_id: deleteTarget.id } }),
      });
      const data = await res.json();
      if (data.success) {
        fetchApis();
        setMessage('API删除成功');
        setSuccess(true);
      } else {
        setError(data.error || '删除失败');
      }
    } catch {
      setError('删除失败');
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'model') handleDeleteModel();
    else handleDeleteApi();
  };

  // ---- 测试连接 ----
  const handleTestApi = async (apiId: string) => {
    setTestingApiId(apiId);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testApi', data: { api_id: apiId } }),
      });
      const data = await res.json();
      if (data.success) {
        const result = data.testResult;
        setTestResult({ success: result.success, message: result.message });
        setMessage(result.message);
        setSuccess(result.success);
      } else {
        setTestResult({ success: false, message: data.error || '测试失败' });
        setError(data.error || '测试失败');
      }
    } catch {
      setTestResult({ success: false, message: '测试连接失败' });
      setError('测试连接失败');
    } finally {
      setTestingApiId(null);
    }
  };

  // ---- 测试模型 ----
  const handleTestModel = async (modelId: string) => {
    setTestingModelId(modelId);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testModel', data: { id: modelId } }),
      });
      const data = await res.json();
      if (data.success) {
        const result = data.testResult;
        setModelTestResults(prev => ({
          ...prev,
          [modelId]: {
            success: result.success,
            responseTime: result.responseTime,
            message: result.message,
          },
        }));
        setMessage(result.message);
        setSuccess(result.success);
        fetchModels();
      } else {
        setError(data.error || '测试模型失败');
      }
    } catch {
      setError('测试模型失败');
    } finally {
      setTestingModelId(null);
    }
  };

  // ---- Headers 操作 ----
  const addHeader = () => {
    setApiForm((prev) => ({
      ...prev,
      headers: [...(prev.headers || []), { key: '', value: '' }],
    }));
  };

  const removeHeader = (index: number) => {
    setApiForm((prev) => ({
      ...prev,
      headers: (prev.headers || []).filter((_, i) => i !== index),
    }));
  };

  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    setApiForm((prev) => ({
      ...prev,
      headers: (prev.headers || []).map((h, i) =>
        i === index ? { ...h, [field]: val } : h
      ),
    }));
  };

  // ---- 模型列表列定义 ----
  const modelColumns: Column<ModelData>[] = [
    {
      key: 'name',
      title: '模型名称',
      render: (m) => <span className="font-medium text-gray-900">{m.name}</span>,
    },
    {
      key: 'modelId',
      title: 'Model ID',
      render: (m) => (
        <span className="text-gray-500 font-mono text-xs">{m.modelId}</span>
      ),
    },
    {
      key: 'type',
      title: '类型',
      render: (m) => {
        const typeMap: Record<string, { text: string; cls: string }> = {
          llm: { text: 'LLM', cls: 'bg-blue-100 text-blue-700' },
          embedding: { text: 'Embedding', cls: 'bg-purple-100 text-purple-700' },
          t2v: { text: '文生视频', cls: 'bg-red-100 text-red-700' },
          multimodal: { text: '多模态', cls: 'bg-orange-100 text-orange-700' },
        };
        const tag = typeMap[m.type] || { text: m.type, cls: 'bg-gray-100 text-gray-600' };
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${tag.cls}`}>
            {tag.text}
          </span>
        );
      },
    },
    {
      key: 'apiId',
      title: '关联API',
      render: (m) => (
        <span className="text-gray-500 text-xs">{getApiName(m.apiId)}</span>
      ),
    },
    {
      key: 'scenario',
      title: '场景',
      render: (m) => {
        if ((!m.scenario?.length)) return <span className="text-gray-400 text-xs">-</span>;
        const labelMap: Record<string, { text: string; cls: string }> = {
          general: { text: '通用', cls: 'bg-blue-100 text-blue-700' },
          analysis: { text: '分析', cls: 'bg-purple-100 text-purple-700' },
          multimodal: { text: '多模态', cls: 'bg-orange-100 text-orange-700' },
          vision: { text: '视觉', cls: 'bg-yellow-100 text-yellow-700' },
          chat: { text: '对话', cls: 'bg-green-100 text-green-700' },
          video_generation: { text: '视频生成', cls: 'bg-red-100 text-red-700' },
        };
        return (
          <div className="flex gap-1 flex-wrap">
            {m.scenario.map((s: string) => {
              const tag = labelMap[s] || { text: s, cls: 'bg-gray-100 text-gray-600' };
              return <span key={s} className={`px-1.5 py-0.5 text-xs rounded ${tag.cls}`}>{tag.text}</span>;
            })}
          </div>
        );
      },
    },
    {
      key: 'isEnabled',
      title: '状态',
      render: (m) => (
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            m.isEnabled
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {m.isEnabled ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      key: 'isDefault',
      title: '默认',
      render: (m) =>
        m.isDefault ? (
          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">
            默认
          </span>
        ) : (
          <span className="text-gray-300 text-xs">-</span>
        ),
    },
    {
      key: 'testStatus',
      title: '测试状态',
      width: '120px',
      render: (m) => {
        const testResult = m.lastTestResult;
        const isTesting = testingModelId === m.id;
        if (isTesting) {
          return <span className="flex items-center gap-1 text-blue-600 text-xs"><Loader2 size={12} className="animate-spin" />测试中</span>;
        }
        if (!testResult) {
          return <span className="text-gray-400 text-xs">未测试</span>;
        }
        return (
          <div className="flex flex-col">
            <span className={`text-xs font-medium ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.success ? '✓ 成功' : '✗ 失败'}
            </span>
            <span className="text-xs text-gray-400">
              {testResult.responseTime}ms
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: '180px',
      render: (m) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleTestModel(m.id!)}
            disabled={testingModelId === m.id}
            className={`p-1.5 rounded transition-colors ${
              testingModelId === m.id
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-green-600 hover:bg-green-50'
            }`}
            title="测试连接"
          >
            {testingModelId === m.id ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Zap size={15} />
            )}
          </button>
          <button
            onClick={() => openEditModel(m)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="编辑"
          >
            <Edit size={15} />
          </button>
          {!m.isDefault && (
            <button
              onClick={() => handleSetDefault(m)}
              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
              title="设为默认"
            >
              <Star size={15} />
            </button>
          )}
          <button
            onClick={() => confirmDeleteModel(m)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  // ---- API 列表列定义 ----
  const apiColumns: Column<ApiData>[] = [
    {
      key: 'name',
      title: 'API名称',
      render: (a) => <span className="font-medium text-gray-900">{a.name}</span>,
    },
    {
      key: 'type',
      title: '类型',
      render: (a) => (
        <span
          className={`px-2 py-0.5 text-xs rounded-full font-medium ${
            a.type === 'LLM'
              ? 'bg-blue-100 text-blue-700'
              : a.type === 'Embedding'
              ? 'bg-purple-100 text-purple-700'
              : a.type === '搜索'
              ? 'bg-cyan-100 text-cyan-700'
              : a.type === '语音'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {a.type}
        </span>
      ),
    },
    {
      key: 'baseUrl',
      title: 'BaseURL',
      render: (a) => (
        <span className="text-gray-500 text-xs max-w-[200px] truncate block" title={a.baseUrl}>
          {a.baseUrl || '-'}
        </span>
      ),
    },
    {
      key: 'apiKey',
      title: 'API Key',
      render: (a) => (
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs font-mono">
            {showApiKey ? a.apiKey : maskApiKey(a.apiKey)}
          </span>
          <button
            onClick={() => setShowApiKey((v) => !v)}
            className="p-0.5 text-gray-400 hover:text-gray-600"
          >
            {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      ),
    },
    {
      key: 'isActive',
      title: '状态',
      render: (a) => (
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            a.isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {a.isActive ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '180px',
      render: (a) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleTestApi(a.api_id)}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
            title="测试连接"
            disabled={testingApiId === a.api_id}
          >
            {testingApiId === a.api_id ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Zap size={15} />
            )}
          </button>
          <button
            onClick={() => openEditApi(a)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="编辑"
          >
            <Edit size={15} />
          </button>
          <button
            onClick={() => confirmDeleteApi(a)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 主标签页 */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-8">
          <button
            onClick={() => setActiveTab('services')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'services'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings size={18} />
              模型服务
            </div>
          </button>
          <button
            onClick={() => setActiveTab('router')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'router'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Route size={18} />
              路由规则
            </div>
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'global'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders size={18} />
              全局参数
            </div>
          </button>
        </nav>
      </div>

      {/* 消息提示 */}
      {(error || message) && (
        <div
          className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
            success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {error || message}
        </div>
      )}

      {/* 模型服务标签页 */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          {/* 子标签 */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveSubTab('models')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeSubTab === 'models'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Cpu size={15} />
                模型列表
              </div>
            </button>
            <button
              onClick={() => setActiveSubTab('apis')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeSubTab === 'apis'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Code size={15} />
                API服务
              </div>
            </button>
          </div>

          {/* 模型列表 */}
          {activeSubTab === 'models' && (
            <CRUDTable<ModelData>
              columns={modelColumns}
              data={models}
              loading={loading}
              emptyText="暂无模型，点击上方按钮添加"
              onRefresh={fetchModels}
              onAdd={openAddModel}
              onEdit={openEditModel}
              onDelete={confirmDeleteModel}
              rowKey={(m) => m.id || m.modelId}
            />
          )}

          {/* API列表 */}
          {activeSubTab === 'apis' && (
            <CRUDTable<ApiData>
              columns={apiColumns}
              data={apis}
              loading={loading}
              emptyText="暂无API服务，点击上方按钮添加"
              onRefresh={fetchApis}
              onAdd={openAddApi}
              onEdit={openEditApi}
              onDelete={confirmDeleteApi}
              rowKey={(a) => a.api_id}
            />
          )}
        </div>
      )}

      {/* 路由规则标签页 */}
      {activeTab === 'router' && <ModelRouterManagement />}

      {/* 全局参数标签页 */}
      {activeTab === 'global' && (
        <div className="space-y-6">
          <SystemConfig />
          {/* 语音设置折叠面板 */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={() => setVoicePanelOpen(!voicePanelOpen)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Volume2 className="text-blue-600" size={20} />
                <div className="text-left">
                  <h3 className="text-base font-semibold text-gray-900">语音设置</h3>
                  <p className="text-xs text-gray-500">TTS/ASR 引擎、音色、语速配置</p>
                </div>
              </div>
              <ChevronDown
                size={20}
                className={`text-gray-400 transition-transform duration-200 ${voicePanelOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {voicePanelOpen && (
              <div className="px-6 pb-6 border-t">
                <SpeechSettings />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 模型编辑弹窗 ===== */}
      <Modal
        open={showModelModal}
        onClose={() => setShowModelModal(false)}
        title={editingModelId ? '编辑模型' : '添加模型'}
        width="max-w-2xl"
      >
        <div className="space-y-5">
          {/* 基础信息 */}
          <div>
            <h4 className={sectionTitleClass}>基础信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>模型名称</label>
                <input
                  type="text"
                  value={modelForm.name}
                  onChange={(e) => setModelForm((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass}
                  placeholder="如 DeepSeek-V4"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Model ID</label>
                <input
                  type="text"
                  value={modelForm.modelId}
                  onChange={(e) => setModelForm((p) => ({ ...p, modelId: e.target.value }))}
                  className={inputClass}
                  placeholder="如 deepseek-v4-flash"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>类型</label>
                <select
                  value={modelForm.type}
                  onChange={(e) =>
                    setModelForm((p) => ({
                      ...p,
                      type: e.target.value as 'llm' | 'embedding' | 't2v' | 'multimodal',
                      parameters:
                        e.target.value === 'embedding'
                          ? { dimensions: 768 }
                          : e.target.value === 't2v'
                          ? { resolution: '720P', ratio: '16:9', duration: 5, watermark: false }
                          : e.target.value === 'multimodal'
                          ? { temperature: 0.7, maxTokens: 8192 }
                          : {
                              temperature: 0.7,
                              topP: 0.95,
                              maxTokens: 4096,
                              contextWindow: 65536,
                            },
                    }))
                  }
                  className={selectClass}
                >
                  <option value="llm">LLM (大语言模型)</option>
                  <option value="embedding">Embedding (嵌入模型)</option>
                  <option value="t2v">文生视频 (T2V)</option>
                  <option value="multimodal">多模态 (视觉)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>关联API</label>
                <div className="flex gap-2">
                  <select
                    value={modelForm.apiId}
                    onChange={(e) => setModelForm((p) => ({ ...p, apiId: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">请选择API</option>
                    {apis.map((api) => (
                      <option key={api.api_id} value={api.api_id}>
                        {api.name} ({api.api_id})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowQuickApiModal(true)}
                    className="flex-shrink-0 px-3 py-2 border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 transition-colors text-sm whitespace-nowrap"
                    title="快速新建 API"
                  >
                    + 新建
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>备注</label>
                <input
                  type="text"
                  value={modelForm.remark}
                  onChange={(e) => setModelForm((p) => ({ ...p, remark: e.target.value }))}
                  className={inputClass}
                  placeholder="可选备注"
                />
              </div>
            </div>
            <div className="flex items-center gap-6 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modelForm.isEnabled}
                  onChange={(e) => setModelForm((p) => ({ ...p, isEnabled: e.target.checked }))}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">启用模型</span>
              </label>
            </div>
          </div>

          {/* 生成参数 - LLM */}
          {modelForm.type === 'llm' && (
            <div>
              <h4 className={sectionTitleClass}>生成参数</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Temperature
                    <span className="relative ml-1 inline-flex items-center group">
                      <Info size={14} className="text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        温度<br/>范围：0~2 | 默认：0.7<br/>控制输出随机性，值越高越随机
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={modelForm.parameters?.temperature ?? 0.7}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        parameters: { ...p.parameters!, temperature: Number(e.target.value) },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Top P
                    <span className="relative ml-1 inline-flex items-center group">
                      <Info size={14} className="text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        核采样<br/>范围：0~1 | 默认：0.95<br/>控制候选词范围
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={modelForm.parameters?.topP ?? 0.95}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        parameters: { ...p.parameters!, topP: Number(e.target.value) },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Max Tokens
                    <span className="relative ml-1 inline-flex items-center group">
                      <Info size={14} className="text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        最大生成长度<br/>默认：4096<br/>单次请求最大生成 Token 数
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={modelForm.parameters?.maxTokens ?? 4096}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        parameters: { ...p.parameters!, maxTokens: Number(e.target.value) },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Context Window
                    <span className="relative ml-1 inline-flex items-center group">
                      <Info size={14} className="text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        上下文窗口<br/>默认：65536<br/>模型上下文窗口大小
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={modelForm.parameters?.contextWindow ?? 65536}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        parameters: { ...p.parameters!, contextWindow: Number(e.target.value) },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              {/* LLM 高级参数（折叠） */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ChevronDown size={14} className={`transition-transform ${showAdvancedParams ? 'rotate-180' : ''}`} />
                  高级参数
                </button>
                {showAdvancedParams && (
                  <div className="mt-3 grid grid-cols-2 gap-4 pl-2 border-l-2 border-gray-200">
                    <div>
                      <label className={labelClass}>
                        Frequency Penalty
                        <span className="relative ml-1 inline-flex items-center group">
                          <Info size={14} className="text-gray-400 cursor-help" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            频率惩罚<br/>范围：-2~2 | 默认：0<br/>减少重复词
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        value={modelForm.parameters?.frequencyPenalty ?? 0}
                        onChange={(e) => setModelForm((p) => ({
                          ...p,
                          parameters: { ...p.parameters!, frequencyPenalty: Number(e.target.value) },
                        }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Presence Penalty
                        <span className="relative ml-1 inline-flex items-center group">
                          <Info size={14} className="text-gray-400 cursor-help" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            存在惩罚<br/>范围：-2~2 | 默认：0<br/>鼓励新话题
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        value={modelForm.parameters?.presencePenalty ?? 0}
                        onChange={(e) => setModelForm((p) => ({
                          ...p,
                          parameters: { ...p.parameters!, presencePenalty: Number(e.target.value) },
                        }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Response Format
                        <span className="relative ml-1 inline-flex items-center group">
                          <Info size={14} className="text-gray-400 cursor-help" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            响应格式<br/>text：纯文本<br/>json_object：JSON 格式输出
                          </span>
                        </span>
                      </label>
                      <select
                        value={modelForm.parameters?.responseFormat ?? 'text'}
                        onChange={(e) => setModelForm((p) => ({
                          ...p,
                          parameters: { ...p.parameters!, responseFormat: e.target.value },
                        }))}
                        className={selectClass}
                      >
                        <option value="text">text（纯文本）</option>
                        <option value="json_object">json_object（JSON）</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Embedding 参数 */}
          {modelForm.type === 'embedding' && (
            <div>
              <h4 className={sectionTitleClass}>Embedding 参数</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Dimensions
                    <span className="relative ml-1 inline-flex items-center group">
                      <Info size={14} className="text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        向量维度<br/>常见值：768 / 1024 / 1536
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={modelForm.parameters?.dimensions ?? 768}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        parameters: { ...p.parameters!, dimensions: Number(e.target.value) },
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 功能开关 */}
          <div>
            <h4 className={sectionTitleClass}>功能开关</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'webSearch' as const, label: '联网搜索', icon: <Globe size={14} /> },
                { key: 'ragEnabled' as const, label: 'RAG', icon: <FileText size={14} /> },
                { key: 'agentEnabled' as const, label: 'Agent', icon: <Brain size={14} /> },
                { key: 'memoryEnabled' as const, label: '记忆', icon: <Shield size={14} /> },
                { key: 'streamOutput' as const, label: '流式输出', icon: <Zap size={14} /> },
              ].map(({ key, label, icon }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={modelForm.features?.[key] ?? false}
                    onChange={(e) =>
                      setModelForm((p) => ({
                        ...p,
                        features: { ...p.features!, [key]: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <span className="text-gray-400">{icon}</span>
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 适用场景（仅 LLM） */}
          {modelForm.type === 'llm' && (
            <div>
              <h4 className={sectionTitleClass}>适用场景</h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'general', label: '通用对话', icon: <MessageSquare size={14} /> },
                  { key: 'analysis', label: '深度分析', icon: <Brain size={14} /> },
                  { key: 'multimodal', label: '多模态', icon: <Image size={14} /> },
                ].map(({ key, label, icon }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={(modelForm.scenario || []).includes(key)}
                      onChange={(e) => {
                        const current = modelForm.scenario || [];
                        setModelForm((p) => ({
                          ...p,
                          scenario: e.target.checked
                            ? [...current, key]
                            : current.filter((s: string) => s !== key),
                        }));
                      }}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                    />
                    <span className="text-gray-400">{icon}</span>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 高级 */}
          <div>
            <h4 className={sectionTitleClass}>高级</h4>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>自定义系统提示词</label>
                <textarea
                  value={modelForm.customPrompt || ''}
                  onChange={(e) => setModelForm((p) => ({ ...p, customPrompt: e.target.value }))}
                  className={inputClass + ' h-20 resize-y'}
                  placeholder="可选，自定义系统提示词"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modelForm.isDefault}
                  onChange={(e) => setModelForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">设为默认模型</span>
              </label>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setShowModelModal(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSaveModel}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm flex items-center gap-2"
            >
              <Save size={16} />
              {editingModelId ? '更新' : '创建'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== 快速新建 API 弹窗 ===== */}
      <Modal
        open={showQuickApiModal}
        onClose={() => setShowQuickApiModal(false)}
        title="快速新建 API"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API 名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={quickApiForm.name}
              onChange={(e) => setQuickApiForm(p => ({ ...p, name: e.target.value }))}
              placeholder="如：DeepSeek API"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API 标识 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={quickApiForm.api_id}
              onChange={(e) => setQuickApiForm(p => ({ ...p, api_id: e.target.value.replace(/\s/g, '-') }))}
              placeholder="如：deepseek-api（自动用于关联）"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={quickApiForm.baseUrl}
              onChange={(e) => setQuickApiForm(p => ({ ...p, baseUrl: e.target.value }))}
              placeholder="如：https://api.deepseek.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={quickApiForm.apiKey}
              onChange={(e) => setQuickApiForm(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t">
            <button
              onClick={() => setShowQuickApiModal(false)}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
            >
              取消
            </button>
            <button
              onClick={async () => {
                if (!quickApiForm.name || !quickApiForm.baseUrl) return;
                setQuickApiSaving(true);
                try {
                  const res = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'createApi',
                      data: {
                        ...quickApiForm,
                        type: 'LLM',
                        timeout: 30000,
                        isActive: true,
                        headers: [],
                        requestPrefix: '',
                        retryCount: 2,
                        retryOnTimeout: true,
                        maxQPS: 10,
                        proxyEnabled: false,
                        proxyUrl: '',
                        remark: '通过模型表单快速创建',
                      },
                    }),
                  });
                  if (res.ok) {
                    const result = await res.json();
                    if (result.success) {
                      // 自动选中新创建的 API
                      const newApiId = quickApiForm.api_id || result.api?.api_id;
                      setModelForm(p => ({ ...p, apiId: newApiId }));
                      // 刷新 API 列表
                      fetchApis();
                      setShowQuickApiModal(false);
                      setQuickApiForm({ name: '', baseUrl: '', apiKey: '', api_id: '' });
                    }
                  }
                } catch (err) {
                  console.error('快速创建 API 失败:', err);
                } finally {
                  setQuickApiSaving(false);
                }
              }}
              disabled={quickApiSaving || !quickApiForm.name || !quickApiForm.baseUrl}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {quickApiSaving ? '创建中...' : '创建并选中'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== API 编辑弹窗 ===== */}
      <Modal
        open={showApiModal}
        onClose={() => setShowApiModal(false)}
        title={editingApiId ? '编辑API' : '添加API'}
        width="max-w-2xl"
      >
        <div className="space-y-5">
          {/* 基础信息 */}
          <div>
            <h4 className={sectionTitleClass}>基础信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>API ID</label>
                <input
                  type="text"
                  value={apiForm.api_id}
                  onChange={(e) => setApiForm((p) => ({ ...p, api_id: e.target.value }))}
                  className={inputClass}
                  placeholder="如 deepseek-api"
                  required
                  disabled={!!editingApiId}
                />
              </div>
              <div>
                <label className={labelClass}>名称</label>
                <input
                  type="text"
                  value={apiForm.name}
                  onChange={(e) => setApiForm((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass}
                  placeholder="API显示名称"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>类型</label>
                <select
                  value={apiForm.type}
                  onChange={(e) =>
                    setApiForm((p) => ({ ...p, type: e.target.value as ApiData['type'] }))
                  }
                  className={selectClass}
                >
                  <option value="LLM">LLM</option>
                  <option value="Embedding">Embedding</option>
                  <option value="搜索">搜索</option>
                  <option value="语音">语音</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apiForm.isActive}
                    onChange={(e) => setApiForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">启用API</span>
                </label>
              </div>
            </div>
          </div>

          {/* 连接配置 */}
          <div>
            <h4 className={sectionTitleClass}>连接配置</h4>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Base URL</label>
                <input
                  type="text"
                  value={apiForm.baseUrl}
                  onChange={(e) => setApiForm((p) => ({ ...p, baseUrl: e.target.value }))}
                  className={inputClass}
                  placeholder="https://api.example.com/v1"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>API Key</label>
                <div className="relative">
                  <input
                    type={showApiKeyInForm ? 'text' : 'password'}
                    value={apiForm.apiKey}
                    onChange={(e) => setApiForm((p) => ({ ...p, apiKey: e.target.value }))}
                    className={inputClass + ' pr-10'}
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInForm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeyInForm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>超时时间 (ms)</label>
                  <input
                    type="number"
                    value={apiForm.timeout}
                    onChange={(e) => setApiForm((p) => ({ ...p, timeout: Number(e.target.value) }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>代理</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={apiForm.proxyEnabled || false}
                        onChange={(e) =>
                          setApiForm((p) => ({ ...p, proxyEnabled: e.target.checked }))
                        }
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-500">启用</span>
                    </label>
                    {apiForm.proxyEnabled && (
                      <input
                        type="text"
                        value={apiForm.proxyUrl || ''}
                        onChange={(e) => setApiForm((p) => ({ ...p, proxyUrl: e.target.value }))}
                        className={inputClass}
                        placeholder="http://proxy:port"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 高级请求 */}
          <div>
            <h4 className={sectionTitleClass}>高级请求</h4>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>请求前缀</label>
                <input
                  type="text"
                  value={apiForm.requestPrefix || ''}
                  onChange={(e) => setApiForm((p) => ({ ...p, requestPrefix: e.target.value }))}
                  className={inputClass}
                  placeholder="可选，如 /v1/chat/completions"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClass + ' mb-0'}>Headers</label>
                  <button
                    type="button"
                    onClick={addHeader}
                    className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {(apiForm.headers || []).length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">暂无自定义 Headers</p>
                ) : (
                  <div className="space-y-2">
                    {(apiForm.headers || []).map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={h.key}
                          onChange={(e) => updateHeader(i, 'key', e.target.value)}
                          className={inputClass + ' flex-1'}
                          placeholder="Key"
                        />
                        <input
                          type="text"
                          value={h.value}
                          onChange={(e) => updateHeader(i, 'value', e.target.value)}
                          className={inputClass + ' flex-1'}
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeader(i)}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 容错限流 */}
          <div>
            <h4 className={sectionTitleClass}>容错限流</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>重试次数</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={apiForm.retryCount ?? 2}
                  onChange={(e) => setApiForm((p) => ({ ...p, retryCount: Number(e.target.value) }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>超时重试</label>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={apiForm.retryOnTimeout ?? true}
                    onChange={(e) => setApiForm((p) => ({ ...p, retryOnTimeout: e.target.checked }))}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">启用</span>
                </label>
              </div>
              <div>
                <label className={labelClass}>QPS 限制</label>
                <input
                  type="number"
                  min="1"
                  value={apiForm.maxQPS ?? 10}
                  onChange={(e) => setApiForm((p) => ({ ...p, maxQPS: Number(e.target.value) }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-between pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                if (apiForm.api_id) {
                  handleTestApi(apiForm.api_id);
                }
              }}
              className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm flex items-center gap-2"
            >
              <Zap size={16} />
              测试连接
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApiModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSaveApi}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm flex items-center gap-2"
              >
                <Save size={16} />
                {editingApiId ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ===== 删除确认弹窗 ===== */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
          setDeleteBlocked(false);
        }}
        onConfirm={handleDeleteConfirm}
        title={deleteBlocked ? '无法删除' : '确认删除'}
        message={
          deleteBlocked
            ? `API "${deleteTarget?.name}" 正在被模型关联使用，请先解除关联后再删除。`
            : `确定要删除 ${deleteTarget?.type === 'model' ? '模型' : 'API'} "${deleteTarget?.name}" 吗？此操作不可撤销。`
        }
        confirmText={deleteBlocked ? '知道了' : '确认删除'}
        danger={!deleteBlocked}
      />
    </div>
  );
};

export default ModelApiManagement;
