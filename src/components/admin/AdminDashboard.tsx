'use client';

import { useState, useEffect } from 'react';
import UserManagement from './UserManagement';
import StorageManagement from './StorageManagement';
import ModelApiManagement from './ModelApiManagement';
import ContentManagement from './ContentManagement';
import CustomerArchiveManagement from './CustomerArchiveManagement';
import { ArrowLeft, Menu, X, FileText, Database, Users, Cpu, Settings, ChevronLeft, ScrollText, UserCheck } from 'lucide-react';
import LogManagement from './LogManagement';

// 菜单配置
const MENU_ITEMS = [
  { key: 'content', label: 'RAG', icon: FileText },
  { key: 'storage', label: '存储', icon: Database },
  { key: 'users', label: '用户', icon: Users },
  { key: 'models', label: '模型', icon: Cpu },
  { key: 'customers', label: '客户', icon: UserCheck },
  { key: 'logs', label: '日志', icon: ScrollText },
] as const;

type MenuKey = typeof MENU_ITEMS[number]['key'];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<MenuKey>('content');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 侧边栏状态：桌面端展开/收起，移动端显示/隐藏
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 从 localStorage 恢复侧边栏状态
  useEffect(() => {
    const saved = localStorage.getItem('admin-sidebar-collapsed');
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true');
    }
  }, []);

  // 保存侧边栏状态到 localStorage
  const toggleSidebar = () => {
    const newVal = !sidebarCollapsed;
    setSidebarCollapsed(newVal);
    localStorage.setItem('admin-sidebar-collapsed', String(newVal));
  };

  // 监听屏幕宽度变化，自动适配
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setMobileMenuOpen(false);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success) {
          setUser(data.user);
          if (data.user.role !== 'admin') {
            window.location.replace('/');
          }
        } else {
          window.location.replace('/');
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
        window.location.replace('/');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  // 切换菜单时关闭移动端菜单
  const handleTabChange = (tab: MenuKey) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  if (loading) {
    return <div className="p-4">加载中...</div>;
  }

  if (!user || user.role !== 'admin') {
    return <div className="p-4">权限不足</div>;
  }

  const sidebarWidth = sidebarCollapsed ? 'w-16' : 'w-56';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 移动端遮罩 */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 左侧侧边栏 */}
      <aside
        className={`
          fixed md:static z-40 h-full bg-white border-r border-gray-200 flex flex-col
          transition-all duration-300 ease-in-out
          ${sidebarWidth}
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* 侧边栏头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 min-h-[60px]">
          {!sidebarCollapsed && (
            <h1 className="text-sm font-bold text-gray-900 truncate">设置</h1>
          )}
          {/* 移动端关闭按钮 */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
          {/* 桌面端收起按钮 */}
          <button
            onClick={toggleSidebar}
            className="hidden md:block p-1 hover:bg-gray-100 rounded"
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <ChevronLeft
              size={18}
              className={`text-gray-400 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* 菜单列表 */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                  ${sidebarCollapsed ? 'justify-center' : ''}
                  ${isActive
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* 返回按钮 - 侧边栏底部 */}
        <div className="border-t border-gray-200 p-3">
          <button
            onClick={() => window.location.replace('/')}
            className={`
              w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500
              hover:bg-gray-50 hover:text-gray-700 rounded-md transition-colors
              ${sidebarCollapsed ? 'justify-center' : ''}
            `}
            title={sidebarCollapsed ? '返回首页' : undefined}
          >
            <ArrowLeft size={16} />
            {!sidebarCollapsed && <span>返回首页</span>}
          </button>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部栏（移动端显示汉堡菜单 + 标题） */}
        <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 min-h-[60px] md:justify-end">
          {/* 移动端汉堡按钮 */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-1 hover:bg-gray-100 rounded"
          >
            <Menu size={22} className="text-gray-600" />
          </button>
          {/* 移动端标题 */}
          <h1 className="text-base font-bold text-gray-900 md:hidden">
            {MENU_ITEMS.find(m => m.key === activeTab)?.label || '设置'}
          </h1>

          {error && (
            <div className="p-2 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
        </header>

        {/* 内容区域 - 自适应填充剩余高度 */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6">
            {activeTab === 'content' && <ContentManagement />}
            {activeTab === 'storage' && <StorageManagement />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'models' && <ModelApiManagement />}
            {activeTab === 'customers' && <CustomerArchiveManagement />}
            {activeTab === 'logs' && <LogManagement />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
