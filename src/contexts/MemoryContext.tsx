'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser } from './UserContext';

export interface Preference {
  detailLevel: number;
  formality: number;
  examplePreference: number;
  structurePreference: 'list' | 'paragraph' | 'mixed';
  depthPreference: 'beginner' | 'practical' | 'professional';
  proactivity: number;
  learningStyle: 'visual' | 'textual' | 'mixed';
}

export interface MemoryBranch {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'active' | 'dormant' | 'archived' | 'closed';
  priority: 'hot' | 'warm' | 'cold';
  isImportant: boolean;
  isPinned: boolean;
  tags: string[];
  keywords: string[];
  preference: Preference;
  lastAccessedAt: string;
  accessedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MatchResult {
  branch: MemoryBranch;
  score: number;
  reason: string;
}

interface MemoryContextType {
  branches: MemoryBranch[];
  currentBranch: MemoryBranch | null;
  preference: Preference | null;
  isLoading: boolean;
  error: string | null;
  loadBranches: () => Promise<void>;
  loadBranch: (branchId: string) => Promise<void>;
  createBranch: (options: {
    title: string;
    description?: string;
    tags?: string[];
    keywords?: string[];
    isImportant?: boolean;
  }) => Promise<MemoryBranch>;
  updateBranch: (branchId: string, updates: Partial<MemoryBranch>) => Promise<void>;
  deleteBranch: (branchId: string) => Promise<void>;
  matchBranch: (input: string) => Promise<MatchResult | null>;
  handleCrossBranch: (input: string) => Promise<any>;
  detectDuplicateIntent: (input: string) => Promise<any>;
  setCurrentBranch: (branch: MemoryBranch | null) => void;
  loadPreference: () => Promise<void>;
  updatePreference: (updates: Partial<Preference>) => Promise<void>;
  learnFromSignal: (signalType: string, signalValue: any, confidence?: number) => Promise<void>;
  clearError: () => void;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<MemoryBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<MemoryBranch | null>(null);
  const [preference, setPreference] = useState<Preference | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();

  const clearError = () => setError(null);

  const handleApiError = (err: any, defaultMessage: string) => {
    console.error(defaultMessage, err);
    setError(err.message || defaultMessage);
  };

  const loadBranches = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    clearError();
    
    try {
      const response = await fetch(`/api/memory/branches?userId=${user.id}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load branches');
      }
      
      setBranches(data.branches || []);
    } catch (err) {
      console.log('Memory branches not available yet:', err);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBranch = async (branchId: string) => {
    if (!user?.id) return;
    
    setIsLoading(true);
    clearError();
    
    try {
      const response = await fetch(`/api/memory/branches/${branchId}?userId=${user.id}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load branch');
      }
      
      setCurrentBranch(data.branch);
    } catch (err) {
      handleApiError(err, 'Failed to load branch');
    } finally {
      setIsLoading(false);
    }
  };

  const createBranch = async (options: {
    title: string;
    description?: string;
    tags?: string[];
    keywords?: string[];
    isImportant?: boolean;
  }) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    
    setIsLoading(true);
    clearError();
    
    try {
      const response = await fetch('/api/memory/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...options }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create branch');
      }
      
      const newBranch = data.branch;
      setBranches(prev => [newBranch, ...prev]);
      setCurrentBranch(newBranch);
      
      return newBranch;
    } catch (err) {
      handleApiError(err, 'Failed to create branch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateBranch = async (branchId: string, updates: Partial<MemoryBranch>) => {
    if (!user?.id) return;
    
    setIsLoading(true);
    clearError();
    
    try {
      const response = await fetch(`/api/memory/branches/${branchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...updates }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update branch');
      }
      
      const updatedBranch = data.branch;
      setBranches(prev => 
        prev.map(b => b.id === branchId ? updatedBranch : b)
      );
      
      if (currentBranch?.id === branchId) {
        setCurrentBranch(updatedBranch);
      }
    } catch (err) {
      handleApiError(err, 'Failed to update branch');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBranch = async (branchId: string) => {
    if (!user?.id) return;
    
    setIsLoading(true);
    clearError();
    
    try {
      const response = await fetch(`/api/memory/branches/${branchId}?userId=${user.id}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete branch');
      }
      
      setBranches(prev => prev.filter(b => b.id !== branchId));
      
      if (currentBranch?.id === branchId) {
        setCurrentBranch(null);
      }
    } catch (err) {
      handleApiError(err, 'Failed to delete branch');
    } finally {
      setIsLoading(false);
    }
  };

  const matchBranch = async (input: string): Promise<MatchResult | null> => {
    if (!user?.id) return null;
    
    try {
      const response = await fetch('/api/memory/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, input }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to match branch');
      }
      
      return data.match;
    } catch (err) {
      handleApiError(err, 'Failed to match branch');
      return null;
    }
  };

  const handleCrossBranch = async (input: string) => {
    if (!user?.id) return null;
    
    try {
      const response = await fetch('/api/memory/cross-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, input }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to handle cross branch');
      }
      
      return data.association;
    } catch (err) {
      handleApiError(err, 'Failed to handle cross branch');
      return null;
    }
  };

  const detectDuplicateIntent = async (input: string) => {
    if (!user?.id) return null;
    
    try {
      const response = await fetch('/api/memory/duplicate-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, input }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to detect duplicate intent');
      }
      
      return data.result;
    } catch (err) {
      handleApiError(err, 'Failed to detect duplicate intent');
      return null;
    }
  };

  const loadPreference = async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`/api/memory/preference?userId=${user.id}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load preference');
      }
      
      setPreference(data.preference);
    } catch (err) {
      console.log('User preference not available yet:', err);
      setPreference(null);
    }
  };

  const updatePreference = async (updates: Partial<Preference>) => {
    if (!user?.id) return;
    
    try {
      const response = await fetch('/api/memory/preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...updates }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update preference');
      }
      
      setPreference(data.preference);
    } catch (err) {
      handleApiError(err, 'Failed to update preference');
    }
  };

  const learnFromSignal = async (signalType: string, signalValue: any, confidence = 0.5) => {
    if (!user?.id) return;
    
    try {
      const response = await fetch('/api/memory/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, signalType, signalValue, confidence }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to learn from signal');
      }
      
      if (data.updates && Object.keys(data.updates).length > 0) {
        setPreference(prev => prev ? { ...prev, ...data.updates } : null);
      }
    } catch (err) {
      handleApiError(err, 'Failed to learn from signal');
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadBranches();
      loadPreference();
    }
  }, [user?.id]);

  return (
    <MemoryContext.Provider
      value={{
        branches,
        currentBranch,
        preference,
        isLoading,
        error,
        loadBranches,
        loadBranch,
        createBranch,
        updateBranch,
        deleteBranch,
        matchBranch,
        handleCrossBranch,
        detectDuplicateIntent,
        setCurrentBranch,
        loadPreference,
        updatePreference,
        learnFromSignal,
        clearError,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemory() {
  const context = useContext(MemoryContext);
  if (context === undefined) {
    throw new Error('useMemory must be used within a MemoryProvider');
  }
  return context;
}
