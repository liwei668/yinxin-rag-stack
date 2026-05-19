'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Save, RotateCcw, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react';

/* ============================================================
   配置分组定义
   ============================================================ */

interface ConfigItem {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'text';
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

interface ConfigGroup {
  key: string;
  label: string;
  icon: string;
  description: string;
  items: ConfigItem[];
}

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    key: 'rag',
    label: 'RAG 参数',
    icon: 'R',
    description: '知识库检索增强生成相关配置',
    items: [
      {
        key: 'chunkSize',
        label: 'Chunk Size',
        type: 'number',
        description: '分块大小<br/>文档切分时每个块的最大字符数<br/>推荐：500~1000',
        min: 100,
        max: 10000,
        step: 100,
      },
      {
        key: 'chunkOverlap',
        label: 'Chunk Overlap',
        type: 'number',
        description: '分块重叠<br/>前后分块之间的重叠字符数<br/>默认：150，推荐分块大小的10%~20%',
        min: 0,
        max: 5000,
        step: 50,
      },
      {
        key: 'topKResults',
        label: 'Top K',
        type: 'number',
        description: '检索数量<br/>每次检索返回的最相关文档片段数<br/>推荐：3~5',
        min: 1,
        max: 20,
        step: 1,
      },
      {
        key: 'similarityThreshold',
        label: 'Similarity Threshold',
        type: 'number',
        description: '相似度阈值<br/>低于此阈值的结果将被过滤<br/>推荐：0.6~0.8',
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    key: 'features',
    label: '功能开关',
    icon: 'F',
    description: '系统级功能启用/禁用控制',
    items: [
      {
        key: 'enableInternetSearch',
        label: '联网搜索',
        type: 'boolean',
        description: '允许模型通过搜索引擎获取实时信息',
      },
      {
        key: 'enableRag',
        label: 'RAG 知识库',
        type: 'boolean',
        description: '启用检索增强生成功能',
      },
      {
        key: 'enableAgent',
        label: 'Agent 智能体',
        type: 'boolean',
        description: '启用 Agent 自主任务执行能力',
      },
      {
        key: 'enableMemory',
        label: '记忆功能',
        type: 'boolean',
        description: '启用跨会话记忆存储',
      },
    ],
  },
  {
    key: 'system',
    label: '系统设置',
    icon: 'S',
    description: '系统运行时参数和安全配置',
    items: [
      {
        key: 'enableUserRegistration',
        label: '允许用户注册',
        type: 'boolean',
        description: '开放新用户自助注册',
      },
      {
        key: 'sessionTimeout',
        label: '会话超时 (秒)',
        type: 'number',
        description: '用户无操作后自动登出的时间',
        min: 60,
        max: 86400,
        step: 60,
      },
      {
        key: 'maxUploadSize',
        label: '最大上传大小 (MB)',
        type: 'number',
        description: '文件上传的大小限制',
        min: 1,
        max: 500,
        step: 1,
      },
      {
        key: 'allowedFileTypes',
        label: '允许的文件类型',
        type: 'text',
        description: '逗号分隔，如 pdf,docx,txt',
        placeholder: 'pdf,docx,txt,csv',
      },
      {
        key: 'enableApiLogging',
        label: '启用 API 日志',
        type: 'boolean',
        description: '记录 API 调用日志用于调试和审计',
      },
      {
        key: 'cacheEnabled',
        label: '启用缓存',
        type: 'boolean',
        description: '启用响应缓存以提升性能',
      },
      {
        key: 'cacheTTL',
        label: '缓存过期时间 (秒)',
        type: 'number',
        description: '缓存数据的有效期',
        min: 0,
        max: 86400,
        step: 60,
      },
    ],
  },
];

/* ============================================================
   折叠面板组件
   ============================================================ */

interface CollapsiblePanelProps {
  group: ConfigGroup;
  values: Record<string, any>;
  expanded: boolean;
  onToggle: () => void;
  onValueChange: (key: string, value: any) => void;
  saving: boolean;
}

function CollapsiblePanel({
  group,
  values,
  expanded,
  onToggle,
  onValueChange,
  saving,
}: CollapsiblePanelProps) {
  const iconColors: Record<string, string> = {
    rag: 'bg-purple-100 text-purple-700',
    features: 'bg-emerald-100 text-emerald-700',
    system: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* 面板头部 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
              iconColors[group.key] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {group.icon}
          </span>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">{group.label}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin text-emerald-500" />}
          {expanded ? (
            <ChevronDown size={18} className="text-gray-400" />
          ) : (
            <ChevronRight size={18} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* 面板内容 */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100">
          <div className="pt-4 space-y-4">
            {/* 布尔类型 */}
            {group.items
              .filter((item) => item.type === 'boolean')
              .map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!values[item.key]}
                        onChange={(e) => onValueChange(item.key, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                      {item.description && (
                        <span className="relative ml-1 inline-flex items-center group">
                          <Info size={13} className="text-gray-400 cursor-help" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50" dangerouslySetInnerHTML={{ __html: item.description }} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

            {/* 数值/文本类型 */}
            {group.items
              .filter((item) => item.type !== 'boolean')
              .map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2">
                  <div className="flex-1 mr-4">
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    {item.description && (
                      <span className="relative ml-1 inline-flex items-center group">
                        <Info size={13} className="text-gray-400 cursor-help" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50" dangerouslySetInnerHTML={{ __html: item.description }} />
                      </span>
                    )}
                  </div>
                  <div className="w-36 flex-shrink-0">
                    {item.type === 'number' ? (
                      <input
                        type="number"
                        value={values[item.key] ?? ''}
                        onChange={(e) => onValueChange(item.key, Number(e.target.value))}
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm text-right"
                      />
                    ) : (
                      <input
                        type="text"
                        value={values[item.key] ?? ''}
                        onChange={(e) => onValueChange(item.key, e.target.value)}
                        placeholder={item.placeholder}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      />
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   主组件 SystemConfig
   ============================================================ */

const SystemConfig = () => {
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  // 折叠状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set()
  );

  // 获取系统配置
  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin?action=config');
      const data = await response.json();
      if (data.success) {
        setConfigs(data.configs || {});
      } else {
        setError(data.error || '获取系统配置失败');
      }
    } catch {
      setError('获取系统配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  // 消息自动清除
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

  // 切换折叠
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 获取配置值（兼容不同分组结构）
  const getConfigValue = (groupKey: string, itemKey: string): any => {
    // 尝试从 configs[groupKey] 中获取
    if (configs[groupKey] && configs[groupKey][itemKey] !== undefined) {
      return configs[groupKey][itemKey];
    }
    // 兼容：直接从 configs 顶层获取
    if (configs[itemKey] !== undefined) {
      return configs[itemKey];
    }
    return undefined;
  };

  // 更新配置
  const handleValueChange = async (groupKey: string, itemKey: string, value: any) => {
    // 乐观更新
    const updatedConfigs = { ...configs };
    if (updatedConfigs[groupKey]) {
      updatedConfigs[groupKey] = { ...updatedConfigs[groupKey], [itemKey]: value };
    } else {
      updatedConfigs[groupKey] = { [itemKey]: value };
    }
    setConfigs(updatedConfigs);
    setSaving(true);

    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateConfigGroup',
          data: { group: groupKey, key: itemKey, value },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setMessage('配置更新成功');
        setSuccess(true);
      } else {
        setError(data.error || '更新配置失败');
        // 回滚
        setConfigs(configs);
      }
    } catch {
      setError('更新配置失败');
      setConfigs(configs);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        <span>加载配置中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* 折叠面板列表 */}
      {CONFIG_GROUPS.map((group) => {
        // 合并该分组下的所有配置值
        const groupValues: Record<string, any> = {};
        group.items.forEach((item) => {
          groupValues[item.key] = getConfigValue(group.key, item.key);
        });

        return (
          <CollapsiblePanel
            key={group.key}
            group={group}
            values={groupValues}
            expanded={expandedGroups.has(group.key)}
            onToggle={() => toggleGroup(group.key)}
            onValueChange={(key, value) => handleValueChange(group.key, key, value)}
            saving={saving}
          />
        );
      })}

      {/* 底部提示 */}
    </div>
  );
};

export default SystemConfig;
