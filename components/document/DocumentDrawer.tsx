'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import DocumentEditor from './DocumentEditor'

// 组件 Props 接口
interface DocumentDrawerProps {
  open: boolean // 是否打开
  content: string // Markdown 内容
  onClose: () => void // 关闭回调
}

// 移动端断点阈值
const MOBILE_BREAKPOINT = 768

export default function DocumentDrawer({ open, content, onClose }: DocumentDrawerProps) {
  // 是否为移动端视图
  const [isMobile, setIsMobile] = useState(false)
  // 是否已挂载（用于 Portal 渲染）
  const [mounted, setMounted] = useState(false)

  // 组件挂载后启用 Portal 渲染，避免 SSR 报错
  useEffect(() => {
    setMounted(true)
  }, [])

  // 监听窗口大小变化，动态判断是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // 初始化时检测一次
    checkMobile()

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 监听 Escape 键关闭抽屉
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 打开时禁止背景滚动，关闭时恢复
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // 点击遮罩层关闭抽屉
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // 仅在点击遮罩层本身时关闭，避免点击抽屉内部触发
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  // 未挂载或不打开时不渲染
  if (!mounted || !open) return null

  // 抽屉内容
  const drawerContent = (
    <div
      className="fixed inset-0 z-50"
      style={{ fontFamily: 'inherit' }}
    >
      {/* 遮罩层：桌面端显示半透明黑色遮罩，移动端也显示 */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* 抽屉面板 */}
      <div
        className={`
          absolute top-0 right-0 bottom-0
          bg-white shadow-2xl
          transition-transform duration-300 ease-in-out
          flex flex-col
          ${isMobile ? 'w-full h-full' : 'w-[50vw] max-w-[800px]'}
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="文档编辑器"
      >
        {/* 移动端顶部关闭按钮（桌面端由 DocumentEditor 内部的关闭按钮处理） */}
        {isMobile && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">文档编辑</span>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="关闭"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}

        {/* 文档编辑器：用 content 前50字符作为 key，确保每次新内容都重新创建编辑器 */}
        <div className="flex-1 overflow-hidden">
          <DocumentEditor key={content?.slice(0, 50) || '_empty'} content={content} onClose={onClose} />
        </div>
      </div>
    </div>
  )

  // 使用 React Portal 渲染到 document.body，避免被父元素 overflow 裁剪
  return createPortal(drawerContent, document.body)
}
