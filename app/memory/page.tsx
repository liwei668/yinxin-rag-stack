'use client';

import React from 'react';
import MemoryDashboard from '../../src/components/memory/MemoryDashboard';
import { MemoryProvider } from '../../src/contexts/MemoryContext';

export default function MemoryPage() {
  return (
    <MemoryProvider>
      <MemoryDashboard />
    </MemoryProvider>
  );
}
