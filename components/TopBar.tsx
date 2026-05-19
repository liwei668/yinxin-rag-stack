'use client';
import React from 'react'
import { Menu } from 'lucide-react'

interface TopBarProps {
  onToggleSidebar: () => void
}

const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar }) => {
  return (
    <div className="bg-white border-b border-gray-200 py-2 md:py-3 px-4 md:px-6 flex items-center justify-between relative">
      <div className="flex items-center gap-2 md:gap-4">
        <button 
          className="p-2 hover:bg-gray-200 rounded-md flex items-center justify-center"
          onClick={onToggleSidebar}
          style={{ minWidth: '40px' }}
        >
          <Menu size={24} className="text-gray-800" />
        </button>
        <div className="flex items-center">
          <span className="text-green-500 font-bold text-sm md:text-lg">Yinxin.AGI</span>
        </div>
      </div>
    </div>
  )
}

export default TopBar
