'use client';
import React from 'react';
import { UserProvider } from '../contexts/UserContext';
import { MemoryProvider } from '../contexts/MemoryContext';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <UserProvider>
      <MemoryProvider>{children}</MemoryProvider>
    </UserProvider>
  );
};
