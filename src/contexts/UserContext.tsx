'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar: string;
  storagePreference: string;
  createdAt?: Date;
  lastLoginAt?: Date;
}

interface UserContextType {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  login: (userData: User) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAdmin(data.user.role === 'admin');
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    } catch (error) {
      console.log('Not logged in');
      setUser(null);
      setIsAdmin(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (userData: User) => {
    setUser(userData);
    setIsAdmin(userData.role === 'admin');
  };

  const logout = () => {
    setUser(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // 监听自定义 refreshUser 事件，重新获取用户信息
  useEffect(() => {
    const handleRefreshUserEvent = () => {
      refreshUser();
    };

    // 监听路由变化（popstate）
    const handlePopState = () => {
      refreshUser();
    };

    window.addEventListener('refreshUser', handleRefreshUserEvent);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('refreshUser', handleRefreshUserEvent);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [refreshUser]);

  return (
    <UserContext.Provider value={{ user, isAdmin, isLoading, refreshUser, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
