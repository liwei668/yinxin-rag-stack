// 已发送邮件Tab组件
'use client'

import { useState, useEffect } from 'react'

interface SentEmail {
  id: string
  to_address: string
  to_name: string
  subject: string
  content_preview: string
  status: string
  error_message: string
  sent_at: string
  created_at: string
}

export default function SentTab({ configId }: { configId: string }) {
  const [emails, setEmails] = useState<SentEmail[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadEmails()
  }, [configId, page])

  const loadEmails = async () => {
    if (!configId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        config_id: configId,
        page: page.toString(),
        pageSize: '20'
      })
      if (search) params.append('search', search)

      const res = await fetch(`/api/email-marketing/emails/sent?${params}`)
      const data = await res.json()
      if (data.success) {
        setEmails(data.emails)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('加载已发送邮件失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCompose(true)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600"
        >
          ✏️ 撰写邮件
        </button>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜索已发送邮件..."
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
            <div className="text-3xl mb-2">📤</div>
            <p className="text-sm">暂无已发送邮件</p>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className="p-3 cursor-pointer hover:bg-gray-50"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      email.status === 'sent' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {email.status === 'sent' ? '已发送' : '发送失败'}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {email.to_name || email.to_address}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 truncate mt-1">
                    {email.subject || '(无主题)'}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {email.content_preview}
                  </div>
                  {email.status === 'failed' && email.error_message && (
                    <div className="text-xs text-red-500 mt-1">
                      错误: {email.error_message}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  {email.sent_at ? new Date(email.sent_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '待发送'}
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
              <h3 className="font-medium">已发送邮件详情</h3>
              <button onClick={() => setSelectedEmail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-gray-500">收件人</div>
                <div className="text-sm">{selectedEmail.to_name || selectedEmail.to_address}</div>
                <div className="text-xs text-gray-400">{selectedEmail.to_address}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">主题</div>
                <div className="text-sm font-medium">{selectedEmail.subject || '(无主题)'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">状态</div>
                <div className={`text-sm ${selectedEmail.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedEmail.status === 'sent' ? '✓ 已发送成功' : '✗ 发送失败'}
                </div>
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
