import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, Code, ChevronLeft, ChevronRight, MessageSquare, Trash2, MoreHorizontal, Pin, PinOff, Edit3, Settings, Info, LogOut, Camera, ChevronDown } from 'lucide-react'
import { useChat } from '../app/page'
import { useUser } from '../src/contexts/UserContext'
import AboutModal from './AboutModal'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onConversationSelect?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onConversationSelect }) => {
  const { 
    createNewConversation, 
    conversations, 
    selectConversation, 
    deleteConversation, 
    currentConversationId,
    togglePinConversation,
    renameConversation
  } = useChat()
  const { user, isAdmin, logout } = useUser();

  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarInputKey, setAvatarInputKey] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 按置顶排序
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      const aTime = a.pinned ? a.pinnedAt : a.createdAt
      const bTime = b.pinned ? b.pinnedAt : b.createdAt
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }, [conversations])

  const handleRenameStart = (id: string, title: string) => {
    setEditingId(id)
    setEditValue(title)
    setActiveMenu(null)
  }

  const handleRenameSave = (id: string) => {
    renameConversation(id, editValue)
    setEditingId(null)
    setEditValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleRenameSave(id)
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditValue('')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed:', error);
    }
    logout();
    setShowUserMenu(false);
    window.location.href = '/login';
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!uploadResponse.ok) throw new Error('上传失败');
      const uploadData = await uploadResponse.json();
      const avatarUrl = uploadData.files[0].url;

      const updateResponse = await fetch('/api/auth/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: avatarUrl })
      });
      if (!updateResponse.ok) throw new Error('更新头像失败');

      window.dispatchEvent(new Event('refreshUser'));
    } catch (error) {
      console.error('上传头像失败:', error);
      alert('头像上传失败，请重试');
    } finally {
      setUploadingAvatar(false);
      setAvatarInputKey(prev => prev + 1);
    }
  }

  const renderConversationItem = useCallback((conv: typeof conversations[0]) => {
    const isEditing = editingId === conv.id
    const isMenuOpen = activeMenu === conv.id

    return (
      <div 
        key={conv.id}
        className={`relative flex items-center gap-2 px-4 py-2 hover:bg-gray-100 ${
          conv.id === currentConversationId ? 'bg-gray-100' : ''
        }`}
      >
        {conv.pinned && (
          <Pin size={14} className="text-yellow-500 flex-shrink-0" />
        )}
        <MessageSquare size={16} className="flex-shrink-0" />
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleRenameSave(conv.id)}
            onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
            className="flex-1 bg-white border border-gray-300 rounded px-2 py-0.5 text-sm outline-none focus:border-green-500"
            autoFocus
          />
        ) : (
          <div 
            className="flex-1 cursor-pointer truncate"
            onClick={() => {
              selectConversation(conv.id)
              onConversationSelect?.()
            }}
          >
            <span className="text-sm truncate">{conv.title}</span>
          </div>
        )}
        <div className="relative">
          <button
            className={`p-1 rounded opacity-0 hover:opacity-100 hover:bg-gray-200 transition-opacity ${
              isMenuOpen ? 'opacity-100' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation()
              setActiveMenu(isMenuOpen ? null : conv.id)
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {isMenuOpen && (
            <div 
              ref={menuRef}
              className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation()
                  togglePinConversation(conv.id)
                  setActiveMenu(null)
                }}
              >
                {conv.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                <span>{conv.pinned ? '取消置顶' : '置顶'}</span>
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRenameStart(conv.id, conv.title)
                }}
              >
                <Edit3 size={14} />
                <span>重命名</span>
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-red-50 text-red-500"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                  setActiveMenu(null)
                }}
              >
                <Trash2 size={14} />
                <span>删除</span>
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }, [editingId, editValue, activeMenu, currentConversationId, selectConversation, onConversationSelect, togglePinConversation, handleRenameStart, handleRenameSave, handleRenameKeyDown, deleteConversation])

  return (
    <>
      <div className={`h-full transition-all duration-300 flex-shrink-0 ${collapsed ? 'w-0 opacity-0' : 'w-[300px] opacity-100'}`} style={{ overflow: collapsed ? 'hidden' : 'auto' }}>
        <div className="h-full glass rounded-r-2xl border-r border-white/20 shadow-lg flex flex-col">
          
          {/* 用户信息区域 - 最顶端 */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <div className="relative">
              {/* 用户头像按钮 */}
              <div 
                className="flex items-center gap-3 px-2 py-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="relative flex-shrink-0">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt="用户头像"
                      className="w-9 h-9 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{(user?.username || 'U').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  {isAdmin && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{user?.username || '用户'}</p>
                </div>
                <ChevronDown 
                  size={16} 
                  className={`text-gray-400 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} 
                />
              </div>
              
              {/* 下拉菜单 - 向下展开 */}
              {showUserMenu && (
                <div 
                  ref={userMenuRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  {/* Logo 和品牌信息 */}
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                    <Code className="text-green-500" size={18} />
                    <span className="font-bold text-sm text-gray-900">Yinxin.AGI</span>
                  </div>
                  
                  {/* 更换头像 */}
                  <label className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2 cursor-pointer mt-1">
                    <Camera size={14} />
                    {uploadingAvatar ? '上传中...' : '更换头像'}
                    <input
                      key={avatarInputKey}
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                  {/* 关于 */}
                  <button
                    className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2"
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowAbout(true);
                    }}
                  >
                    <Info size={14} />
                    关于
                  </button>
                  {/* 系统设置（仅管理员） */}
                  {isAdmin && (
                    <button
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2"
                      onClick={() => {
                        setShowUserMenu(false);
                        window.location.href = '/admin';
                      }}
                    >
                      <Settings size={14} />
                      系统设置
                    </button>
                  )}
                  {/* 退出登录 */}
                  <div className="border-t border-gray-100 mt-1">
                    <button
                      className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut size={14} />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* 新建任务 */}
          <div className="px-4 py-2 flex-shrink-0">
            <div 
              className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer transition-colors"
              onClick={() => {
                createNewConversation()
                onConversationSelect?.()
              }}
            >
              <Plus size={18} />
              <span className="text-sm font-medium">新建任务</span>
              <span className="ml-auto text-xs text-emerald-500">⌘N</span>
            </div>
          </div>
          
          {/* 对话历史 - 可滚动区域 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 mb-2 pt-2 text-xs font-semibold text-gray-500">对话历史</div>
            <div className="pb-4">
              {sortedConversations.map(renderConversationItem)}
            </div>
          </div>
        </div>
      </div>

      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </>
  )
}

export default Sidebar
