'use client';
import { createContext, useContext } from 'react';

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  pinned?: boolean
  pinnedAt?: Date
}

export interface ChatContextType {
  conversations: Conversation[]
  currentConversationId: string | null
  createNewConversation: () => void
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  currentConversation: Conversation | null
  addMessageToCurrentConversation: (message: Message) => string | undefined
  togglePinConversation: (id: string) => void
  renameConversation: (id: string, newTitle: string) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  sendMessage: (conversationId: string, message: Omit<Message, 'createdAt'>) => Promise<void>
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined)

export const useChat = () => {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
