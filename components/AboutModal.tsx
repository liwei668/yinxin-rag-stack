'use client';
import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, RefreshCw, FileText, Shield, BookOpen, Mail, Clock, Camera, Plus, Trash2, Scale } from 'lucide-react';
import { useUser } from '../src/contexts/UserContext';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChangelogItem {
  version: string;
  date: string;
  product?: string;
  changes: string[];
}

interface OpensourceItem {
  name: string;
  license: string;
  copyright: string;
  url: string;
}

// 开源软件声明数据
const OPENSOURCE_DATA: { category: string; items: OpensourceItem[] }[] = [
  {
    category: '前端框架',
    items: [
      { name: 'React', license: 'MIT', copyright: 'Copyright (c) Meta Platforms, Inc.', url: 'https://github.com/facebook/react' },
      { name: 'Next.js', license: 'MIT', copyright: 'Copyright (c) Vercel, Inc.', url: 'https://github.com/vercel/next.js' },
      { name: 'Tailwind CSS', license: 'MIT', copyright: 'Copyright (c) Tailwind Labs, Inc.', url: 'https://github.com/tailwindlabs/tailwindcss' },
    ],
  },
  {
    category: 'UI 组件 / 图标',
    items: [
      { name: 'Lucide React', license: 'ISC', copyright: 'Copyright (c) Lucide Contributors', url: 'https://github.com/lucide-icons/lucide' },
    ],
  },
  {
    category: '后端 / 数据库',
    items: [
      { name: 'MongoDB', license: 'SSPL', copyright: 'Copyright (c) MongoDB, Inc.', url: 'https://www.mongodb.com/docs/manual/license/' },
      { name: 'Mongoose', license: 'MIT', copyright: 'Copyright (c) LearnBoost LLC', url: 'https://github.com/Automattic/mongoose' },
      { name: 'better-sqlite3', license: 'MIT', copyright: 'Copyright (c) Joshua C. Shepherd', url: 'https://github.com/JoshuaWise/better-sqlite3' },
    ],
  },
  {
    category: 'AI / 浏览器自动化',
    items: [
      { name: 'Playwright', license: 'Apache-2.0', copyright: 'Copyright (c) Microsoft Corporation', url: 'https://github.com/microsoft/playwright' },
      { name: 'DashScope SDK', license: 'Apache-2.0', copyright: 'Copyright (c) Alibaba Cloud', url: 'https://github.com/aliyun/alibabacloud-dashscope-sdk' },
    ],
  },
  {
    category: '工具库',
    items: [
      { name: 'pdf-parse', license: 'MIT', copyright: 'Copyright (c) Mozilla Foundation', url: 'https://github.com/nicbarker/pdf-parse' },
      { name: 'mammoth', license: 'BSD-2-Clause', copyright: 'Copyright (c) Michael Williamson', url: 'https://github.com/nicbarker/mammoth.js' },
      { name: 'xlsx (SheetJS)', license: 'Apache-2.0', copyright: 'Copyright (c) SheetJS LLC', url: 'https://github.com/nicbarker/sheetjs' },
      { name: 'marked', license: 'MIT', copyright: 'Copyright (c) Christopher Jeffrey', url: 'https://github.com/nicbarker/marked' },
    ],
  },
];

// 链接列表配置
const LINK_ITEMS = [
  { label: '用户协议', icon: FileText, url: '/terms' },
  { label: '隐私条款', icon: Shield, url: '/privacy' },
  { label: '帮助文档', icon: BookOpen, url: '/docs' },
  { label: '更新日志', icon: Clock, action: 'changelog' as const },
  { label: '开源声明', icon: Scale, action: 'opensource' as const },
  { label: '联系我们', icon: Mail, action: 'contact' as const },
];

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { user, isAdmin } = useUser();
  const [activeTab, setActiveTab] = useState<'about' | 'changelog' | 'opensource'>('about');
  const [showContact, setShowContact] = useState(false);
  const [changelogData, setChangelogData] = useState<ChangelogItem[]>([]);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  const [versionInfo, setVersionInfo] = useState({ version: 'v2.0429', date: '2026-04-29', productName: 'AGI.ai' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAddLog, setShowAddLog] = useState(false);
  const [newLogVersion, setNewLogVersion] = useState('');
  const [newLogDate, setNewLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLogChanges, setNewLogChanges] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // 动态读取版本号
      fetch('/api/version')
        .then(res => res.json())
        .then(data => {
          if (data.success) setVersionInfo({ version: data.version, date: data.date, productName: data.productName });
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'changelog') {
      fetchChangelog();
    }
  }, [isOpen, activeTab]);

  const fetchChangelog = async () => {
    setLoadingChangelog(true);
    try {
      const res = await fetch('/api/changelog');
      if (res.ok) {
        const data = await res.json();
        setChangelogData(data);
      }
    } catch (error) {
      console.error('加载更新日志失败:', error);
    } finally {
      setLoadingChangelog(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      // 1. 上传头像文件
      const formData = new FormData();
      formData.append('files', file);
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!uploadResponse.ok) throw new Error('上传失败');
      const uploadData = await uploadResponse.json();
      const avatarUrl = uploadData.files[0].url;

      // 2. 更新用户头像信息
      const updateResponse = await fetch('/api/auth/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: avatarUrl })
      });
      if (!updateResponse.ok) throw new Error('更新头像失败');

      // 3. 触发用户信息刷新
      window.dispatchEvent(new Event('refreshUser'));
    } catch (error) {
      console.error('上传头像失败:', error);
      alert('头像上传失败，请重试');
    } finally {
      setUploadingAvatar(false);
      // 重置 input 以便同一文件可以再次选择
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLog = async () => {
    console.log('handleAddLog called', { newLogVersion, newLogChanges, isAdmin });
    if (!newLogVersion.trim()) {
      alert('请填写版本号');
      return;
    }
    if (!newLogChanges.trim()) {
      alert('请填写更新内容');
      return;
    }
    try {
      const changes = newLogChanges.split('\n').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: newLogVersion.trim(), date: newLogDate, changes }),
      });
      if (!res.ok) throw new Error('添加失败');
      const data = await res.json();
      if (data.changelog) {
        setChangelogData(data.changelog);
      }
      setNewLogVersion('');
      setNewLogDate(new Date().toISOString().split('T')[0]);
      setNewLogChanges('');
      setShowAddLog(false);
    } catch (error) {
      console.error('添加日志失败:', error);
      alert('添加失败，请重试');
    }
  };

  const handleDeleteLog = async (index: number) => {
    if (!confirm('确定删除这条更新日志？')) return;
    try {
      const res = await fetch(`/api/changelog?index=${index}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      fetchChangelog();
    } catch (error) {
      console.error('删除日志失败:', error);
      alert('删除失败，请重试');
    }
  };

  if (!isOpen) return null;

  // 如果显示更新日志子页面
  if (activeTab === 'changelog') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setActiveTab('about')} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">更新日志</h2>
            <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowAddLog(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Plus size={14} />
                    新增
                  </button>
                )}
                <button onClick={() => setActiveTab('about')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={20} className="text-gray-600" />
                </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-0">
            {loadingChangelog ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw size={20} className="animate-spin text-green-500" />
                <span className="ml-2 text-sm text-gray-500">加载中...</span>
              </div>
            ) : changelogData.length > 0 ? (
              changelogData.map((log, index) => (
                <div key={index} className="py-4">
                  {/* 版本号 + 日期 + 产品名 */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="px-2.5 py-1 bg-green-50 text-green-600 text-xs font-bold rounded-md">{log.version}</span>
                    <span className="text-xs text-gray-400">{log.date}</span>
                    {log.product && (
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">{log.product}</span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteLog(index)}
                        className="ml-auto p-1 hover:bg-red-50 rounded transition-colors"
                        title="删除此日志"
                      >
                        <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                  {/* 更新内容 */}
                  <ul className="space-y-1.5">
                    {log.changes.map((change, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                        <span className="text-green-500 mt-1 flex-shrink-0">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                  {index < changelogData.length - 1 && <div className="border-t border-gray-100 mt-4" />}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-sm text-gray-400">暂无更新记录</div>
            )}
          </div>
        </div>
        {/* 新增日志弹窗（仅管理员） */}
        {isAdmin && showAddLog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAddLog(false); setNewLogVersion(''); setNewLogDate(new Date().toISOString().split('T')[0]); setNewLogChanges(''); }} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-4">新增更新日志</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newLogVersion}
                  onChange={(e) => setNewLogVersion(e.target.value)}
                  placeholder="版本号，如 v2.0501"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="date"
                  value={newLogDate}
                  onChange={(e) => setNewLogDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <textarea
                  value={newLogChanges}
                  onChange={(e) => setNewLogChanges(e.target.value)}
                  placeholder="更新内容（每行一条）"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddLog}
                    className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => { setShowAddLog(false); setNewLogVersion(''); setNewLogDate(new Date().toISOString().split('T')[0]); setNewLogChanges(''); }}
                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 开源软件声明页面
  if (activeTab === 'opensource') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setActiveTab('about')} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">开源软件声明</h2>
            <button onClick={() => setActiveTab('about')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={20} className="text-gray-600" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <p className="text-xs text-gray-400">
              本产品基于以下优秀的开源软件构建，感谢所有开源社区的贡献者。
            </p>
            {OPENSOURCE_DATA.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{group.category}</h3>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div key={item.name} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{item.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{item.license}</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{item.copyright}</p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                      >
                        <ExternalLink size={12} />
                        查看项目
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 联系我们弹窗
  if (showContact) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowContact(false)} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">联系我们</h2>
            <button onClick={() => setShowContact(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={20} className="text-gray-600" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">公司名称</p>
              <p className="text-sm font-medium text-gray-900">引信（中国）技术有限公司</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">联系邮箱</p>
              <a href="mailto:looxjs@163.com" className="text-sm font-medium text-blue-600 hover:underline">looxjs@163.com</a>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">工作时间</p>
              <p className="text-sm font-medium text-gray-900">周一至周五 9:00 - 18:00</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">关于 Yinxin.AGI.ai</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {/* 1. 用户头像+版本卡片 */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-4">
              {/* 左侧：用户头像（可点击更换） */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="relative flex-shrink-0 cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                  title="点击更换头像"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt="用户头像"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{(user?.username || 'U').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingAvatar ? (
                      <RefreshCw size={16} className="text-white animate-spin" />
                    ) : (
                      <Camera size={16} className="text-white" />
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{user?.username || '用户'}</h3>
                  <p className="text-xs text-gray-500">{user?.email || ''}</p>
                </div>
              </div>
              {/* 右侧：版本+更新按钮 */}
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-medium text-gray-800">{versionInfo.version}</p>
                <p className="text-xs text-gray-400">{versionInfo.date}</p>
                <button className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-md transition-colors">
                  <RefreshCw size={12} />
                  检查更新
                </button>
              </div>
            </div>
          </div>

          {/* 2. 产品核心信息 */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">开发团队</span>
                <span className="text-sm font-medium text-gray-800">引信（中国）技术有限公司</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">产品定位</span>
                <span className="text-sm font-medium text-gray-800">Yinxin Full-Stack Private AI Agent</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">技术架构</span>
                <span className="text-sm font-medium text-gray-800">Next.js + React + Playwright</span>
              </div>
            </div>
          </div>

          {/* 3. 高频功能链接列表 */}
          <div className="px-5 py-3 border-b border-gray-100">
            {LINK_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    if ('action' in item && item.action === 'changelog') {
                      setActiveTab('changelog');
                    } else if ('action' in item && item.action === 'opensource') {
                      setActiveTab('opensource');
                    } else if ('action' in item && item.action === 'contact') {
                      setShowContact(true);
                    } else if ('url' in item && item.url) {
                      if (item.url.startsWith('mailto:')) {
                        window.location.href = item.url;
                      } else {
                        window.open(item.url, '_blank');
                      }
                    }
                  }}
                  className="w-full flex items-center justify-between py-3 hover:bg-gray-50 rounded-md px-2 -mx-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </div>
                  <ExternalLink size={14} className="text-gray-300" />
                </button>
              );
            })}
          </div>

          {/* 底部版权 */}
          <div className="px-5 py-4">
            <p className="text-center text-xs text-gray-400">
              © 2026 引信（中国）技术有限公司 版权所有
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
