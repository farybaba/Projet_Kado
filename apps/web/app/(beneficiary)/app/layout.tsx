'use client';

import { useCallback, useEffect, useState } from 'react';
import SplashScreen from '@/components/SplashScreen';

export default function BeneficiaryAppLayout({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // N'afficher le splash qu'une seule fois par session
    if (!sessionStorage.getItem('splash_shown')) {
      setShowSplash(true);
    }
  }, []);

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem('splash_shown', '1');
    setShowSplash(false);
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      {children}
    </>
  );
}
