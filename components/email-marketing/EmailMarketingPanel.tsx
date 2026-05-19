// 完整的市场运营系统主组件 - 集成所有功能
'use client'

import { useState, useEffect } from 'react'
import InboxTab from './InboxTab'
import SentTab from './SentTab'
import ContactsTab from './ContactsTab'
import DraftsTab from './DraftsTab'
import PollingSettings from './PollingSettings'

interface EmailMarketingPanelProps {
  onClose?: () => void
}

type TabType = 'overview' | 'config' | 'templates' | 'tasks' | 'logs' | 'inbox' | 'sent' | 'contacts' | 'drafts'

interface EmailConfig {
  id: string
  email_address: string
  display_name?: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  use_ssl: number
  is_active: number
  auto_reply_enabled: number
  spam_filter_enabled: number
  poll_enabled?: number
  poll_interval?: number
  last_poll_at?: string
  created_at: string
  updated_at: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
  variables?: string
  is_active: number
  created_at: string
  updated_at: string
}

interface Stats {
  todaySent: number
  todayReceived: number
  unreadCount: number
  leadCount: number
  spamCount: number
}

const tabs = [
  { key: 'overview', label: '📊 总览' },
  { key: 'inbox', label: '📥 收件箱' },
  { key: 'sent', label: '📤 已发送' },
  { key: 'config', label: '⚙️ 配置' },
  { key: 'templates', label: '📝 模板' },
  { key: 'contacts', label: '👥 联系人' },
  { key: 'drafts', label: '🔍 审核' },
  { key: 'tasks', label: '🎯 任务' },
  { key: 'logs', label: '📈 日志' }
]

export default function EmailMarketingPanel({ onClose }: EmailMarketingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [configs, setConfigs] = useState<EmailConfig[]>([])

  // 只加载配置，不做前端轮询（轮询由后台守护进程处理）
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const res = await fetch('/api/email-marketing/config')
        const data = await res.json()
        if (data.success) {
          setConfigs(data.configs)
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      }
    }
    loadConfigs()
  }, [])

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg border border-gray-200">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">📧 市场运营系统</h3>
          {configs.some(c => c.poll_enabled === 1) && (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full animate-pulse">
              ⏰ 自动收取中
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        )}
      </div>

      {/* 顶部导航标签 */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabType)}
            className={`px-4 py-3 text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-emerald-600 border-b-2 border-emerald-600 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' && <OverviewTab onSelectConfig={setSelectedConfigId} onNavigate={(tab) => setActiveTab(tab)} />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'inbox' && selectedConfigId && <InboxTab configId={selectedConfigId} onRefresh={() => {}} />}
        {activeTab === 'sent' && selectedConfigId && <SentTab configId={selectedConfigId} />}
        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'drafts' && <DraftsTab />}
      </div>
    </div>
  )
}

function OverviewTab({ onSelectConfig, onNavigate }: { onSelectConfig: (id: string) => void; onNavigate: (tab: TabType) => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [configs, setConfigs] = useState<EmailConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const configRes = await fetch('/api/email-marketing/config')
      const configData = await configRes.json()
      if (configData.success && configData.configs.length > 0) {
        setConfigs(configData.configs)
        const activeConfig = configData.configs.find((c: EmailConfig) => c.is_active === 1) || configData.configs[0]
        onSelectConfig(activeConfig.id)

        const statsRes = await fetch(`/api/email-marketing/stats?config_id=${activeConfig.id}`)
        const statsData = await statsRes.json()
        if (statsData.success) {
          setStats(statsData.stats)
        }
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DataCard title="今日发送" value={stats?.todaySent || 0} icon="📤" onClick={() => onNavigate('sent')} />
        <DataCard title="回复数" value={stats?.todayReceived || 0} icon="📥" onClick={() => onNavigate('inbox')} />
        <DataCard title="待处理" value={stats?.unreadCount || 0} icon="⏰" onClick={() => onNavigate('inbox')} />
        <DataCard title="拓客线索" value={stats?.leadCount || 0} icon="🎯" onClick={() => onNavigate('contacts')} />
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-800 mb-3">🔵 服务状态</h4>
        {configs.length === 0 ? (
          <div className="space-y-2 text-sm text-gray-600">
            <p>⚠️ 请先配置邮箱账号</p>
            <button onClick={() => onNavigate('config')} className="mt-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
              去配置
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {configs.map(config => (
              <div key={config.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${config.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                    <span className="font-medium">{config.email_address}</span>
                    <span className={`text-xs ${config.is_active ? 'text-green-600' : 'text-gray-500'}`}>
                      {config.is_active ? '运行中' : '已停止'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    IMAP: {config.imap_host} | SMTP: {config.smtp_host}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className={config.auto_reply_enabled ? 'text-green-600' : 'text-gray-400'}>
                    自动回复: {config.auto_reply_enabled ? '✓' : '✗'}
                  </span>
                  <span className={config.spam_filter_enabled ? 'text-green-600' : 'text-gray-400'}>
                    垃圾过滤: {config.spam_filter_enabled ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => onNavigate('inbox')} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
          <div className="text-2xl mb-2">📥</div>
          <div className="text-sm font-medium">收件箱</div>
          <div className="text-xs text-gray-500">{stats?.todayReceived || 0} 封新邮件</div>
        </button>
        <button onClick={() => onNavigate('sent')} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
          <div className="text-2xl mb-2">✏️</div>
          <div className="text-sm font-medium">写邮件</div>
          <div className="text-xs text-gray-500">发送新邮件</div>
        </button>
        <button onClick={() => onNavigate('contacts')} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
          <div className="text-2xl mb-2">👥</div>
          <div className="text-sm font-medium">联系人</div>
          <div className="text-xs text-gray-500">管理客户</div>
        </button>
        <button onClick={() => onNavigate('templates')} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm font-medium">模板</div>
          <div className="text-xs text-gray-500">邮件模板</div>
        </button>
      </div>
    </div>
  )
}

function ConfigTab() {
  const [configs, setConfigs] = useState<EmailConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email_address: '',
    display_name: '',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 465,
    password: '',
    use_ssl: true,
    auto_reply_enabled: false,
    spam_filter_enabled: false
  })

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email-marketing/config')
      const data = await res.json()
      if (data.success) {
        setConfigs(data.configs)
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = '/api/email-marketing/config'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { ...formData, id: editingId } : formData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        setEditingId(null)
        resetForm()
        loadConfigs()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('操作失败')
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch('/api/email-marketing/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: id })
      })
      const data = await res.json()
      if (data.success) {
        alert('✓ 连接成功！邮箱配置正确')
      } else {
        alert('✗ 连接失败: ' + (data.error || '未知错误'))
      }
    } catch (error) {
      alert('测试连接失败')
    } finally {
      setTestingId(null)
    }
  }

  const handleEdit = (config: EmailConfig) => {
    setEditingId(config.id)
    setFormData({
      email_address: config.email_address,
      display_name: config.display_name || '',
      imap_host: config.imap_host,
      imap_port: config.imap_port,
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      password: '',
      use_ssl: !!config.use_ssl,
      auto_reply_enabled: !!config.auto_reply_enabled,
      spam_filter_enabled: !!config.spam_filter_enabled
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此配置吗？')) return
    try {
      const res = await fetch(`/api/email-marketing/config?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        loadConfigs()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      email_address: '',
      display_name: '',
      imap_host: '',
      imap_port: 993,
      smtp_host: '',
      smtp_port: 465,
      password: '',
      use_ssl: true,
      auto_reply_enabled: false,
      spam_filter_enabled: false
    })
  }

  return (
    <div className="space-y-6">
      {/* 常见邮箱配置提示 */}
      <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
        <details className="cursor-pointer" open>
          <summary className="text-sm font-medium text-blue-800">💡 常见邮箱配置参考（必读）</summary>
          <div className="mt-3 space-y-3 text-xs">
            <div className="bg-white rounded p-3 border border-blue-100">
              <div className="font-medium text-blue-600 mb-2">📮 QQ邮箱 - 必须开启IMAP服务</div>
              <div className="space-y-1 text-gray-600">
                <div className="grid grid-cols-2 gap-x-4">
                  <div>IMAP服务器: <span className="font-mono">imap.qq.com</span></div>
                  <div>IMAP端口: <span className="font-mono">993</span></div>
                  <div>SMTP服务器: <span className="font-mono">smtp.qq.com</span></div>
                  <div>SMTP端口: <span className="font-mono">465</span></div>
                </div>
                <div className="mt-2 p-2 bg-yellow-50 rounded text-yellow-700">
                  ⚠️ <strong>授权码获取步骤：</strong><br/>
                  1. 登录 <span className="font-mono">mail.qq.com</span><br/>
                  2. 设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务<br/>
                  3. 开启 "IMAP/SMTP服务"<br/>
                  4. 点击"生成授权码" → 扫码或发送短信获取16位授权码<br/>
                  5. <strong>授权码≠登录密码</strong>，请填入授权码
                </div>
              </div>
            </div>
            <div className="bg-white rounded p-3 border border-blue-100">
              <div className="font-medium text-blue-600 mb-2">📮 网易163邮箱 - 必须开启IMAP服务</div>
              <div className="space-y-1 text-gray-600">
                <div className="grid grid-cols-2 gap-x-4">
                  <div>IMAP服务器: <span className="font-mono">imap.163.com</span></div>
                  <div>IMAP端口: <span className="font-mono">993</span></div>
                  <div>SMTP服务器: <span className="font-mono">smtp.163.com</span></div>
                  <div>SMTP端口: <span className="font-mono">465</span></div>
                </div>
                <div className="mt-2 p-2 bg-yellow-50 rounded text-yellow-700">
                  ⚠️ <strong>授权码获取步骤：</strong><br/>
                  1. 登录 <span className="font-mono">mail.163.com</span><br/>
                  2. 设置 → POP3/SMTP/IMAP<br/>
                  3. 开启 "IMAP/SMTP服务"<br/>
                  4. 设置客户端授权密码（不是登录密码）<br/>
                  5. 填入的密码必须是<strong>授权密码</strong>
                </div>
              </div>
            </div>
            <div className="p-2 bg-red-50 rounded text-red-700">
              ❌ <strong>常见错误：</strong> 使用邮箱登录密码会导致认证失败！<br/>
              必须使用各邮箱提供的<strong>授权码</strong>或<strong>客户端专用密码</strong>。
            </div>
          </div>
        </details>
      </div>

      {/* 配置表单 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-800 mb-3">
          {editingId ? '✏️ 编辑邮箱配置' : '➕ 添加邮箱配置'}
        </h4>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm text-gray-700 mb-1">邮箱地址 *</label>
            <input type="email" required value={formData.email_address}
              onChange={(e) => setFormData({ ...formData, email_address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">IMAP服务器 *</label>
              <input type="text" required value={formData.imap_host}
                onChange={(e) => setFormData({ ...formData, imap_host: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">IMAP端口</label>
              <input type="number" value={formData.imap_port}
                onChange={(e) => setFormData({ ...formData, imap_port: parseInt(e.target.value) || 993 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">SMTP服务器 *</label>
              <input type="text" required value={formData.smtp_host}
                onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">SMTP端口</label>
              <input type="number" value={formData.smtp_port}
                onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) || 465 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              {editingId ? '授权码/密码 (留空不修改)' : '授权码/密码 *'}
            </label>
            <input type="password" required={!editingId} value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.use_ssl}
                onChange={(e) => setFormData({ ...formData, use_ssl: e.target.checked })} />
              <span className="text-sm text-gray-700">使用SSL</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.auto_reply_enabled}
                onChange={(e) => setFormData({ ...formData, auto_reply_enabled: e.target.checked })} />
              <span className="text-sm text-gray-700">启用自动回复</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.spam_filter_enabled}
                onChange={(e) => setFormData({ ...formData, spam_filter_enabled: e.target.checked })} />
              <span className="text-sm text-gray-700">启用垃圾邮件过滤</span>
            </label>
          </div>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); resetForm(); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                取消
              </button>
            )}
            <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
              {editingId ? '更新配置' : '保存配置'}
            </button>
          </div>
        </form>
      </div>

      {/* 配置列表 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-800">📋 已配置的邮箱</h4>
          <button onClick={() => loadConfigs()} disabled={loading}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50">
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">暂无邮箱配置</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <div key={config.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{config.email_address}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        config.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {config.is_active ? '启用' : '禁用'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      IMAP: {config.imap_host}:{config.imap_port} | SMTP: {config.smtp_host}:{config.smtp_port}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">ID: {config.id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleTest(config.id)} disabled={testingId === config.id}
                      className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50">
                      {testingId === config.id ? '测试中...' : '测试连接'}
                    </button>
                    <button onClick={() => handleEdit(config)}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      编辑
                    </button>
                    <button onClick={() => handleDelete(config.id)}
                      className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">
                      删除
                    </button>
                  </div>
                </div>
                
                {/* 轮询设置 */}
                <PollingSettings config={config} onUpdate={loadConfigs} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: '',
    category: 'general'
  })

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email-marketing/templates')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error('加载模板失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = '/api/email-marketing/templates'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { ...formData, id: editingId } : formData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        setEditingId(null)
        setShowForm(false)
        setFormData({ name: '', subject: '', content: '', category: 'general' })
        loadTemplates()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('操作失败')
    }
  }

  const handleEdit = (template: EmailTemplate) => {
    setEditingId(template.id)
    setFormData({
      name: template.name,
      subject: template.subject,
      content: template.content,
      category: template.category
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此模板吗？')) return
    try {
      const res = await fetch(`/api/email-marketing/templates?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        loadTemplates()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-800">📝 邮件模板</h4>
        <button onClick={() => {
          setEditingId(null)
          setFormData({ name: '', subject: '', content: '', category: 'general' })
          setShowForm(!showForm)
        }} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
          + 新建模板
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            {editingId ? '编辑模板' : '创建新模板'}
          </h5>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">模板名称 *</label>
              <input type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">邮件主题 *</label>
              <input type="text" required value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">分类</label>
              <select value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="general">通用</option>
                <option value="sales">销售</option>
                <option value="support">客服</option>
                <option value="followup">跟进</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">邮件内容 *</label>
              <textarea required rows={6} value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                取消
              </button>
              <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
                {editingId ? '更新模板' : '创建模板'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-6 text-center text-gray-400">
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm">暂无模板，点击上方按钮创建</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((template) => (
            <div key={template.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{template.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{template.category}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">主题: {template.subject}</div>
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">{template.content}</div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => handleEdit(template)}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">编辑</button>
                  <button onClick={() => handleDelete(template.id)}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TasksTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-800">🎯 拓客任务</h4>
        <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600">
          + 新建任务
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg p-6 text-center text-gray-400">
        <div className="text-4xl mb-2">🎯</div>
        <p className="text-sm">拓客任务功能开发中...</p>
        <p className="text-xs mt-2">将支持批量邮件发送和自动化跟进</p>
      </div>
    </div>
  )
}

function LogsTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email-marketing/logs?pageSize=50')
      const data = await res.json()
      if (data.success) {
        setLogs(data.logs)
      }
    } catch (error) {
      console.error('加载日志失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-800">📈 执行日志</h4>
        <button onClick={loadLogs}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          🔄 刷新
        </button>
      </div>
      
      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : logs.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-6 text-center text-gray-400">
          <div className="text-4xl mb-2">📜</div>
          <p className="text-sm">暂无日志</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
          {logs.map((log) => (
            <div key={log.id} className="p-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  log.action === 'create' ? 'bg-green-500' : 
                  log.action === 'update' ? 'bg-blue-500' : 
                  log.action === 'delete' ? 'bg-red-500' : 'bg-gray-400'
                }`}></span>
                <span className="text-sm font-medium">{log.action}</span>
                <span className="text-sm text-gray-600">{log.target_type}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{log.detail || '无详情'}</div>
              <div className="text-xs text-gray-400 mt-1">{new Date(log.created_at).toLocaleString('zh-CN')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DataCard({ title, value, icon, onClick }: { title: string; value: number; icon: string; onClick?: () => void }) {
  return (
    <div className={`border border-gray-200 rounded-lg p-4 ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`} onClick={onClick}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-800 mb-1">{value}</div>
      <div className="text-xs text-gray-500">{title}</div>
    </div>
  )
}
