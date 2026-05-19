'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, BookOpen, List, BarChart3, Calculator, Settings } from 'lucide-react';
import VoucherList from './VoucherList';
import AccountManager from './AccountManager';
import ReportViewer from './ReportViewer';
import ClosingPanel from './ClosingPanel';
import AccountSetSettings from './AccountSetSettings';

interface AccountingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type MenuItem = 'voucher' | 'account' | 'report' | 'closing' | 'settings';

const menuItems: { key: MenuItem; label: string; icon: React.ReactNode }[] = [
  { key: 'voucher', label: '凭证管理', icon: <BookOpen size={20} /> },
  { key: 'account', label: '科目管理', icon: <List size={20} /> },
  { key: 'report', label: '财务报表', icon: <BarChart3 size={20} /> },
  { key: 'closing', label: '期末处理', icon: <Calculator size={20} /> },
  { key: 'settings', label: '账套设置', icon: <Settings size={20} /> },
];

export default function AccountingPanel({ isOpen, onClose }: AccountingPanelProps) {
  const [activeMenu, setActiveMenu] = useState<MenuItem>('voucher');
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // 窗口大小和位置状态
  const [size, setSize] = useState({ width: 1100, height: 700 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 初始化居中
  useEffect(() => {
    if (isOpen) {
      const w = Math.min(1100, window.innerWidth - 40);
      const h = Math.min(700, window.innerHeight - 40);
      setSize({ width: w, height: h });
      setPos({ x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2 });
      setIsMaximized(false);
    }
  }, [isOpen]);

  // 拖拽移动
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos, isMaximized]);

  // 缩放
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, [isMaximized]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({
          x: e.clientX - dragOffset.current.x,
          y: Math.max(0, e.clientY - dragOffset.current.y)
        });
      }
      if (isResizing) {
        setSize({
          width: Math.max(800, e.clientX - pos.x),
          height: Math.max(500, e.clientY - pos.y)
        });
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, pos]);

  // 双击标题栏最大化/还原
  const handleTitleBarDoubleClick = () => {
    if (isMaximized) {
      const w = 1100, h = 700;
      setSize({ width: w, height: h });
      setPos({ x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2 });
      setIsMaximized(false);
    } else {
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setPos({ x: 0, y: 0 });
      setIsMaximized(true);
    }
  };

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeMenu) {
      case 'voucher':
        return <VoucherList period={currentPeriod} />;
      case 'account':
        return <AccountManager period={currentPeriod} />;
      case 'report':
        return <ReportViewer period={currentPeriod} />;
      case 'closing':
        return <ClosingPanel period={currentPeriod} />;
      case 'settings':
        return <AccountSetSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30">
      {/* 窗口主体 */}
      <div
        ref={panelRef}
        className="bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden absolute"
        style={{
          left: pos.x,
          top: pos.y,
          width: size.width,
          height: size.height,
          ...(isMaximized ? { borderRadius: 0 } : {})
        }}
      >
        {/* 标题栏 - 可拖拽 */}
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white cursor-move select-none flex-shrink-0"
          onMouseDown={handleDragStart}
          onDoubleClick={handleTitleBarDoubleClick}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">📒 财务记账系统</span>
            <span className="text-xs text-gray-400">当前期间：{currentPeriod}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* 最大化/还原按钮 */}
            <button
              onClick={handleTitleBarDoubleClick}
              className="p-1 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
              title={isMaximized ? '还原' : '最大化'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                {isMaximized ? (
                  <path d="M2 4h6v6H2V4zm1 1v4h4V5H3zM4 2h6v6h-1V3H4V2z" />
                ) : (
                  <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                )}
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-600 rounded text-gray-300 hover:text-white transition-colors"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation */}
          <div className="w-[200px] bg-gray-800 flex-shrink-0 flex flex-col">
            <nav className="flex-1 py-4">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                    activeMenu === item.key
                      ? 'bg-green-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            {/* 期间选择器 */}
            <div className="p-3 border-t border-gray-700">
              <label className="text-xs text-gray-400 block mb-1">当前期间</label>
              <input
                type="month"
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value)}
                className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-y-auto bg-white">
            {renderContent()}
          </div>
        </div>

        {/* 缩放手柄 */}
        {!isMaximized && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeStart}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%, #9ca3af 60%, transparent 60%, transparent 75%, #9ca3af 75%, #9ca3af 85%, transparent 85%)'
            }}
          />
        )}
      </div>
    </div>
  );
}
