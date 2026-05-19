import React from 'react'

interface TaskCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick?: () => void
  hasNotification?: boolean
}

const TaskCard: React.FC<TaskCardProps> = ({ title, description, icon, onClick, hasNotification = false }) => {
  return (
    <div 
      className={`task-card bg-white border border-gray-200 rounded-md p-2 shadow-sm hover:shadow-md transition-all duration-300 relative ${onClick ? 'cursor-pointer hover:border-emerald-300' : ''}`}
      onClick={onClick}
    >
      {hasNotification && (
        <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
      )}
      <div className="mb-1">{icon}</div>
      <h3 className="text-xs font-semibold mb-0.5">{title}</h3>
      <p className="text-gray-400 text-[10px] leading-tight">{description}</p>
    </div>
  )
}

export default TaskCard
