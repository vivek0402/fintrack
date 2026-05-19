'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CapacitorBridge() {
  const router = useRouter();

  useEffect(() => {
    const handleOpenAdd = () => {
      router.push('/?openAdd=1');
    };

    const handleOpenBudgets = () => {
      router.push('/budgets');
    };

    window.addEventListener('fintrack:openAdd', handleOpenAdd);
    window.addEventListener('fintrack:openBudgets', handleOpenBudgets);

    return () => {
      window.removeEventListener('fintrack:openAdd', handleOpenAdd);
      window.removeEventListener('fintrack:openBudgets', handleOpenBudgets);
    };
  }, [router]);

  return null;
}
