'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /app → redirige vers le portefeuille si connecté, sinon vers la connexion
export default function AppRootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    router.replace(token ? '/app/wallet' : '/app/login');
  }, [router]);

  return null;
}
