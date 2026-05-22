/**
 * 日志管理页面
 * 功能：日志查看、筛选、搜索、导出、配置
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Download, RefreshCw, Pause, Play,
  AlertTriangle, HardDrive, ChevronDown, ChevronRight,
  Copy, Check, X, Settings, FileText
} from 'lucide-react';

// ==================== 类型定义 ====================

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
type LogModule = 'AI_API' | 'AGENT' | 'BROWSER' | 'RAG' | 'SYSTEM' | 'CHAT';

interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  module: LogModule;
  userId?: string;
  taskId?: string;
  message: string;
  count?: number;
  raw: string;
}

interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  retentionDays: number;
  maxFileSize: number;
  diskThreshold: number;
}

interface DiskStatus {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
  logSize: number;
}

// ==================== 级别颜色映射 ====================

const LEVEL_COLORS: Record<LogLevel, { bg: string; text: string; icon: string }> = {
  DEBUG: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '⚪' },
  INFO: { bg: 'bg-blue-50', text: 'text-blue-600', icon: '🔵' },
  WARN: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: '🟡' },
  ERROR: { bg: 'bg-red-50', text: 'text-red-600', icon: '🔴' },
  FATAL: { bg: 'bg-purple-50', text: 'text-purple-600', icon: '🟣' },
};

const MODULE_LABELS: Record<LogModule, string> = {
  AI_API: 'AI接口',
  AGENT: 'Agent',
  BROWSER: '浏览器',
  RAG: '知识库',
  SYSTEM: '系统',
  CHAT: '聊天',
};

// ==================== 主组件 ====================

export default function LogManagement() {
  // 权限校验状态
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  // 日志数据
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选条件（从 localStorage 恢复）
  const FILTER_KEY = 'log_management_filters';
  const getSavedFilters = () => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  };
  const savedFilters = getSavedFilters();

  // 日期始终使用当天，不从 localStorage 恢复
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [levels, setLevels] = useState<LogLevel[]>(savedFilters?.levels || ['ERROR', 'WARN', 'FATAL']);
  const [modules, setModules] = useState<LogModule[]>(savedFilters?.modules || []);
  const [search, setSearch] = useState(savedFilters?.search || '');
  const [taskId, setTaskId] = useState(savedFilters?.taskId || '');

  // 保存筛选条件到 localStorage（不保存日期，日期始终为当天）
  const saveFilters = (updates: Record<string, any>) => {
    if (typeof window === 'undefined') return;
    try {
      const current = getSavedFilters() || {};
      const filters = {
        levels: updates.levels ?? current.levels ?? ['ERROR', 'WARN', 'FATAL'],
        modules: updates.modules ?? current.modules ?? [],
        search: updates.search ?? current.search ?? '',
        taskId: updates.taskId ?? current.taskId ?? '',
        autoRefresh: updates.autoRefresh ?? current.autoRefresh ?? false,
        refreshInterval: updates.refreshInterval ?? current.refreshInterval ?? 60,
      };
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch { /* ignore */ }
  };

  // 自动刷新（从 localStorage 恢复）
  const [autoRefresh, setAutoRefresh] = useState(savedFilters?.autoRefresh ?? false);
  const [refreshInterval, setRefreshInterval] = useState(savedFilters?.refreshInterval ?? 60);
  // 折叠状态
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  // 选中状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 磁盘状态
  const [diskStatus, setDiskStatus] = useState<DiskStatus | null>(null);

  // 配置
  const [config, setConfig] = useState<LogConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // 展开的日志（使用日志唯一标识，刷新后保持展开状态）
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // 复制状态
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 生成日志唯一标识
  const getLogKey = (log: LogEntry): string => {
    return `${log.time}-${log.level}-${log.module}-${log.message.slice(0, 50)}`;
  };

  // ==================== 数据获取 ====================

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        date,
        level: levels.join(','),
        module: modules.join(','),
        search,
        taskId,
        page: String(page),
        pageSize: '100',
      });

      const response = await fetch(`/api/logs?${params}`);
      const data = await response.json();

      if (response.ok) {
        setLogs(data.logs);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setError('');
      } else {
        setError(data.error || '获取日志失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [date, levels, modules, search, taskId, page]);

  const fetchDiskStatus = async () => {
    try {
      const response = await fetch('/api/logs?action=disk');
      const data = await response.json();
      if (response.ok) {
        setDiskStatus(data);
      }
    } catch {
      // 静默失败
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/logs?action=config');
      const data = await response.json();
      if (response.ok) {
        setConfig(data.config);
      } else {
        setConfig(null);
        setError('加载配置失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      setConfig(null);
      setError('加载配置失败: 网络错误');
    }
  };

  // ==================== 初始化与自动刷新 ====================

  // 权限校验
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success && data.user?.role === 'admin') {
          setAuthChecked(true);
        } else {
          // 非管理员，跳转到首页
          window.location.replace('/');
        }
      } catch {
        setAuthError('权限校验失败');
        setTimeout(() => window.location.replace('/'), 2000);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    fetchLogs();
    fetchDiskStatus();
    fetchConfig();
  }, [fetchLogs, authChecked]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(fetchLogs, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, fetchLogs]);

  // ==================== 操作处理 ====================

  // 删除日志
  const handleDeleteLogs = async (raws: string[]) => {
    try {
      const response = await fetch('/api/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raws, date }),
      });
      const data = await response.json();
      if (data.success) {
        fetchLogs();
        fetchDiskStatus();
      } else {
        alert('删除失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('删除失败');
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export',
          startDate: date,
          endDate: date,
        }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${date}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('导出失败');
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleExpand = (logKey: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logKey)) {
        next.delete(logKey);
      } else {
        next.add(logKey);
      }
      return next;
    });
  };

  const toggleLevel = (level: LogLevel) => {
    setLevels(prev => {
      const next = prev.includes(level)
        ? prev.filter(l => l !== level)
        : [...prev, level];
      saveFilters({ levels: next });
      return next;
    });
    setPage(1);
  };

  const toggleModule = (module: LogModule) => {
    setModules(prev => {
      const next = prev.includes(module)
        ? prev.filter(m => m !== module)
        : [...prev, module];
      saveFilters({ modules: next });
      return next;
    });
    setPage(1);
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateConfig', ...config }),
      });
      setShowConfig(false);
    } catch {
      setError('保存配置失败');
    }
  };

  // ==================== 渲染 ====================

  // 权限校验中
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">
          {authError || '权限校验中...'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* 左侧筛选面板 */}
      <aside className="w-full lg:w-64 flex-shrink-0 bg-white rounded-lg border border-gray-200 p-4">
        {/* 筛选条件 - 级别 + 模块合并 */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setFilterExpanded(!filterExpanded)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-1 hover:text-gray-900"
          >
            <span>筛选条件 {(levels.length + modules.length) > 0 && <span className="ml-1 text-xs text-gray-400">已选 {levels.length + modules.length} 项</span>}</span>
            <ChevronDown size={14} className={`transition-transform ${filterExpanded ? 'rotate-180' : ''}`} />
          </button>
          {!filterExpanded && (levels.length > 0 || modules.length > 0) && (
            <div className="flex flex-wrap gap-1 mb-2">
              {levels.map(level => (
                <span key={level} className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_COLORS[level].bg} ${LEVEL_COLORS[level].text}`}>
                  {LEVEL_COLORS[level].icon} {level}
                </span>
              ))}
              {modules.map(m => (
                <span key={m} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {MODULE_LABELS[m]}
                </span>
              ))}
            </div>
          )}
          {filterExpanded && (
            <div className="space-y-2 pl-1 border-l-2 border-gray-200">
              <div>
                <span className="text-xs text-gray-400">日志级别</span>
                <div className="w-fit flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as LogLevel[]).map((level) => (
                    <label key={level} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={levels.includes(level)} onChange={() => toggleLevel(level)} className="rounded" />
                      <span className={`text-sm ${LEVEL_COLORS[level].text}`}>{LEVEL_COLORS[level].icon} {level}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100" />
              <div>
                <span className="text-xs text-gray-400">模块</span>
                <div className="w-fit flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {(['AI_API', 'AGENT', 'BROWSER', 'RAG', 'SYSTEM'] as LogModule[]).map((module) => (
                    <label key={module} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={modules.includes(module)} onChange={() => toggleModule(module)} className="rounded" />
                      <span className="text-sm text-gray-600">{MODULE_LABELS[module]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 任务ID + 关键词搜索 - 合并折叠 */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setSearchExpanded(!searchExpanded)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-1 hover:text-gray-900"
          >
            <span>搜索 {(taskId || search) && <span className="ml-1 text-xs text-gray-400">已启用</span>}</span>
            <ChevronDown size={14} className={`transition-transform ${searchExpanded ? 'rotate-180' : ''}`} />
          </button>
          {searchExpanded && (
            <div className="space-y-2 pl-1 border-l-2 border-gray-200">
              <div>
                <label className="block text-xs text-gray-500 mb-1">任务ID</label>
                <input
                  type="text"
                  value={taskId}
                  onChange={(e) => { const v = e.target.value; setTaskId(v); saveFilters({ taskId: v }); setPage(1); }}
                  placeholder="输入任务ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">关键词</label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { const v = e.target.value; setSearch(v); saveFilters({ search: v }); setPage(1); }}
                    placeholder="搜索日志内容"
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm"
                  />
                  <Search size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 右侧日志列表 */}
      <main className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {/* 顶部工具栏 */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
          {/* 日期选择 */}
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          />

          {/* 分隔符 */}
          <span className="text-gray-300">|</span>

          {/* 操作按钮 */}
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
          >
            <Download size={14} />
            导出
          </button>
          <button
            onClick={async () => {
              if (!config) await fetchConfig();
              setShowConfig(!showConfig);
            }}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            <Settings size={14} />
            配置
          </button>
          <button
            onClick={() => {
              if (selectedIds.size === logs.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(logs.map(l => l.raw)));
              }
            }}
            className={`flex items-center gap-1 px-2 py-1 text-sm rounded ${
              selectedIds.size > 0 ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'
            }`}
          >
            {selectedIds.size === logs.length && logs.length > 0 ? '取消全选' : '全选'}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedIds.size} 条日志？`)) return;
                await handleDeleteLogs(Array.from(selectedIds));
                setSelectedIds(new Set());
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              删除选中({selectedIds.size})
            </button>
          )}

          {/* 分隔符 */}
          <span className="text-gray-300">|</span>

          {/* 自动刷新 */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">自动刷新</span>
            <button
              onClick={() => { const v = !autoRefresh; setAutoRefresh(v); saveFilters({ autoRefresh: v }); }}
              className={`p-0.5 rounded ${autoRefresh ? 'text-blue-600' : 'text-gray-400'}`}
            >
              {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <select
              value={refreshInterval}
              onChange={(e) => { const v = Number(e.target.value); setRefreshInterval(v); saveFilters({ refreshInterval: v }); }}
              className="px-1 py-0.5 border border-gray-300 rounded text-xs"
            >
              <option value={30}>30秒</option>
              <option value={60}>1分钟</option>
              <option value={300}>5分钟</option>
              <option value={600}>10分钟</option>
              <option value={900}>15分钟</option>
            </select>
          </div>

          {/* 右侧统计信息 */}
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            {diskStatus && (
              <span className="flex items-center gap-1">
                <HardDrive size={12} />
                {diskStatus.logSize} MB
              </span>
            )}
            <span>日志：<span className="font-medium text-gray-700">{total}</span></span>
            <span>错误：<span className="font-medium text-red-600">{logs.filter(l => l.level === 'ERROR' || l.level === 'FATAL').length}</span></span>
          </div>
        </header>

        {/* 磁盘告警 */}
        {diskStatus && diskStatus.usedPercent > 90 && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            磁盘空间不足 {diskStatus.usedPercent}%，日志写入已暂停
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 日志列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              加载中...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <FileText size={32} className="mb-2" />
              <span>暂无日志记录</span>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => {
                const logKey = getLogKey(log);
                const isExpanded = expandedLogs.has(logKey);
                const levelColor = LEVEL_COLORS[log.level];

                return (
                  <div
                    key={logKey}
                    className={`rounded-lg border ${levelColor.bg} border-gray-200 overflow-hidden`}
                  >
                    {/* 日志头部 */}
                    <div
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => toggleExpand(logKey)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.raw)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const newSet = new Set(selectedIds);
                          if (newSet.has(log.raw)) {
                            newSet.delete(log.raw);
                          } else {
                            newSet.add(log.raw);
                          }
                          setSelectedIds(newSet);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 rounded"
                      />
                      <span className="text-lg flex-shrink-0">{levelColor.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${levelColor.text}`}>{log.level}</span>
                          <span className="text-xs text-gray-500">{log.module}</span>
                          <span className="text-xs text-gray-400">{log.time}</span>
                          {log.count && log.count > 1 && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                              ×{log.count}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                          {highlightSearch(log.message, search)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(log.raw, index); }}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="复制"
                        >
                          {copiedIndex === index ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        </button>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </div>

                    {/* 展开详情 */}
                    {isExpanded && (
                      <div className="px-4 pb-3 border-t border-gray-200 bg-white/50">
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          {log.userId && <div>用户ID: {log.userId}</div>}
                          {log.taskId && <div>任务ID: {log.taskId}</div>}
                        </div>
                        <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                          {log.raw}
                        </pre>
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={async () => {
                              if (!confirm('确定删除此条日志？')) return;
                              await handleDeleteLogs([log.raw]);
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            删除此条
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 分页 */}
        {hasMore && (
          <div className="px-4 py-3 border-t border-gray-200 text-center">
            <button
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded"
            >
              加载更多
            </button>
          </div>
        )}
      </main>

      {/* 配置弹窗 */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">日志配置</h3>
              <button onClick={() => setShowConfig(false)}>
                <X size={20} />
              </button>
            </div>
            {!config ? (
              <div className="py-8 text-center">
                {error ? (
                  <div className="text-red-500">{error}</div>
                ) : (
                  <div className="text-gray-500">加载中...</div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <span className="text-sm">启用日志</span>
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    />
                  </label>
                  <div>
                    <label className="block text-sm mb-1">日志级别</label>
                    <select
                      value={config.level}
                      onChange={(e) => setConfig({ ...config, level: e.target.value as LogLevel })}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="DEBUG">DEBUG - 全部</option>
                      <option value="INFO">INFO - 信息及以上</option>
                      <option value="WARN">WARN - 警告及以上</option>
                      <option value="ERROR">ERROR - 仅错误</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">保留天数</label>
                    <select
                      value={config.retentionDays}
                      onChange={(e) => setConfig({ ...config, retentionDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="1">1 天</option>
                      <option value="3">3 天</option>
                      <option value="5">5 天</option>
                      <option value="7">7 天</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setShowConfig(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    保存
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 辅助函数 ====================

// 高亮搜索关键词
function highlightSearch(text: string, search: string): React.ReactNode {
  if (!search) return text;

  const parts = text.split(new RegExp(`(${escapeRegex(search)})`, 'gi'));

  return parts.map((part, i) =>
    part.toLowerCase() === search.toLowerCase()
      ? <mark key={i} className="bg-yellow-200">{part}</mark>
      : part
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
