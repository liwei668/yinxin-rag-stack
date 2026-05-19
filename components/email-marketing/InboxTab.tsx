// 收件箱Tab组件
'use client'

import { useState, useEffect } from 'react'

interface InboxEmail {
  id: string
  from_address: string
  from_name: string
  subject: string
  content_preview: string
  is_read: number
  is_spam: number
  has_attachment: number
  received_at: string
}

export default function InboxTab({ configId, onRefresh }: { configId: string; onRefresh: () => void }) {
  const [emails, setEmails] = useState<InboxEmail[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread' | 'spam'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadEmails()
  }, [configId, page, filter])

  const loadEmails = async () => {
    if (!configId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        config_id: configId,
        page: page.toString(),
        pageSize: '20'
      })

      if (filter === 'unread') params.append('is_read', 'false')
      if (filter === 'spam') params.append('is_spam', 'true')
      if (search) params.append('search', search)

      const res = await fetch(`/api/email-marketing/emails/inbox?${params}`)
      const data = await res.json()
      if (data.success) {
        setEmails(data.emails)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('加载邮件失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReceive = async () => {
    if (!configId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/email-marketing/receive?config_id=${configId}&limit=20`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert(`成功接收 ${data.count} 封新邮件`)
        loadEmails()
        onRefresh()
      } else {
        alert(data.error || '接收失败')
      }
    } catch (error) {
      console.error('接收邮件失败:', error)
      alert('接收失败')
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (email: InboxEmail) => {
    try {
      await fetch('/api/email-marketing/emails/inbox', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: email.id, is_read: true })
      })
      loadEmails()
      onRefresh()
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleReceive}
          disabled={loading}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? '接收中...' : '📥 收取新邮件'}
        </button>
        
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs ${filter === 'all' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded text-xs ${filter === 'unread' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}
          >
            未读
          </button>
          <button
            onClick={() => setFilter('spam')}
            className={`px-3 py-1 rounded text-xs ${filter === 'spam' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}
          >
            垃圾邮件
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜索邮件..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadEmails()}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* 邮件列表 */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : emails.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">暂无邮件</p>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              onClick={() => {
                setSelectedEmail(email)
                if (!email.is_read) markAsRead(email)
              }}
              className={`p-3 cursor-pointer hover:bg-gray-50 ${!email.is_read ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!email.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
                    <span className="text-sm font-medium truncate">
                      {email.from_name || email.from_address}
                    </span>
                    {email.has_attachment && <span className="text-gray-400">📎</span>}
                    {email.is_spam && <span className="text-xs bg-red-100 text-red-600 px-1 rounded">垃圾</span>}
                  </div>
                  <div className="text-sm text-gray-600 truncate mt-1">
                    {email.subject || '(无主题)'}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {email.content_preview}
                  </div>
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(email.received_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      {/* 邮件详情弹窗 */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEmail(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-medium">邮件详情</h3>
              <button onClick={() => setSelectedEmail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-gray-500">发件人</div>
                <div className="text-sm">{selectedEmail.from_name || selectedEmail.from_address}</div>
                <div className="text-xs text-gray-400">{selectedEmail.from_address}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">主题</div>
                <div className="text-sm font-medium">{selectedEmail.subject || '(无主题)'}</div>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs text-gray-500 mb-2">内容</div>
                <div className="text-sm whitespace-pre-wrap">{selectedEmail.content_preview}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
