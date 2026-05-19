'use client';
import React from 'react'
import { X, FileText, Image as ImageIcon } from 'lucide-react'
import { UploadedFile, formatFileSize, isImageFile } from '../utils/fileUtils'

interface ImagePreviewProps {
  uploadedFiles: UploadedFile[]
  setUploadedFiles: (files: UploadedFile[]) => void
  screenshotHistory: UploadedFile[]
  setScreenshotHistory: (files: UploadedFile[]) => void
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  uploadedFiles,
  setUploadedFiles,
  screenshotHistory,
  setScreenshotHistory
}) => {
  // 过滤出图片文件
  const imageFiles = uploadedFiles.filter(f => isImageFile(f.name || ''))
  const nonImageFiles = uploadedFiles.filter(f => !isImageFile(f.name || ''))

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 如果没有任何文件，不显示
  if (uploadedFiles.length === 0) return null

  return (
    <div className="max-w-6xl mx-auto mb-4">
      {/* 主容器 - 圆角卡片样式 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        
        {/* 图片预览区域 */}
        {imageFiles.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2">
              <ImageIcon size={14} />
              已上传图片 ({imageFiles.length})
            </div>
            
            {/* 桌面端：横向滚动，移动端：网格布局 */}
            <div className="hidden md:flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {imageFiles.map((file, index) => {
                const originalIndex = uploadedFiles.findIndex(f => f.name === file.name && f.size === file.size)
                return (
                  <div
                    key={index}
                    className="flex-shrink-0 group relative"
                  >
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 relative">
                      {file.url ? (
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={24} className="text-gray-300" />
                        </div>
                      )}
                      
                      {/* 悬停遮罩 */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <button
                          className="w-8 h-8 flex items-center justify-center bg-white hover:bg-red-50 text-gray-600 hover:text-red-500 rounded-full shadow-lg transition-colors"
                          onClick={() => removeFile(originalIndex)}
                          title="删除"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    
                    {/* 文件名 */}
                    <div className="mt-1 text-xs text-gray-500 truncate max-w-[96px] text-center" title={file.name}>
                      {file.name.length > 12 ? file.name.slice(0, 12) + '...' : file.name}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 移动端：横向滚动，最多显示4张 */}
            <div className="md:hidden flex flex-row gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {imageFiles.map((file, index) => {
                const originalIndex = uploadedFiles.findIndex(f => f.name === file.name && f.size === file.size)
                return (
                  <div
                    key={index}
                    className="flex-shrink-0 group relative"
                  >
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 relative">
                      {file.url ? (
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={20} className="text-gray-300" />
                        </div>
                      )}
                      
                      {/* 删除按钮 - 移动端始终显示 */}
                      <button
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-red-50 text-gray-600 hover:text-red-500 rounded-full shadow-md transition-colors"
                        onClick={() => removeFile(originalIndex)}
                        title="删除"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    
                    {/* 文件名 */}
                    <div className="mt-1 text-xs text-gray-500 truncate max-w-[80px] text-center" title={file.name}>
                      {file.name.length > 10 ? file.name.slice(0, 10) + '...' : file.name}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 非图片文件列表 */}
        {nonImageFiles.length > 0 && (
          <div className="p-4">
            <div className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2">
              <FileText size={14} />
              已上传文件 ({nonImageFiles.length})
            </div>
            
            <div className="space-y-2">
              {nonImageFiles.map((file, index) => {
                const originalIndex = uploadedFiles.findIndex(f => f.name === file.name && f.size === file.size)
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText size={16} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      onClick={() => removeFile(originalIndex)}
                      title="删除"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 历史截图记录 - 保持独立 */}
      {screenshotHistory.length > 0 && (
        <div className="mt-4 max-w-6xl mx-auto">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2">
              <ImageIcon size={14} />
              历史截图 ({screenshotHistory.length})
            </div>
            
            <div className="hidden md:flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {screenshotHistory.map((file, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 group relative"
                >
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-gray-200 relative">
                    {file.url && (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    
                    {/* 悬停遮罩 */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <button
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-500 rounded-full shadow-lg transition-colors"
                        onClick={() => setUploadedFiles(prev => [...prev, file])}
                        title="重新发送"
                      >
                        <ImageIcon size={12} />
                      </button>
                      <button
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-red-50 text-gray-600 hover:text-red-500 rounded-full shadow-lg transition-colors"
                        onClick={() => setScreenshotHistory(prev => prev.filter((_, i) => i !== index))}
                        title="删除"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-1 text-xs text-gray-500 truncate max-w-[80px] text-center" title={file.name}>
                    {file.name.length > 10 ? file.name.slice(0, 10) + '...' : file.name}
                  </div>
                </div>
              ))}
            </div>

            {/* 移动端 */}
            <div className="md:hidden grid grid-cols-3 gap-3">
              {screenshotHistory.map((file, index) => (
                <div
                  key={index}
                  className="group relative"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-white border border-gray-200 relative">
                    {file.url && (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    
                    <button
                      className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-white/90 text-gray-500 hover:text-emerald-500 rounded-full shadow-sm transition-colors"
                      onClick={() => setUploadedFiles(prev => [...prev, file])}
                      title="重新发送"
                    >
                      <ImageIcon size={10} />
                    </button>
                    <button
                      className="absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center bg-white/90 text-gray-500 hover:text-red-500 rounded-full shadow-sm transition-colors"
                      onClick={() => setScreenshotHistory(prev => prev.filter((_, i) => i !== index))}
                      title="删除"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  
                  <div className="mt-1 text-xs text-gray-500 truncate text-center" title={file.name}>
                    {file.name.length > 10 ? file.name.slice(0, 10) + '...' : file.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImagePreview
