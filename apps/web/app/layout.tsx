import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaInstallBanner from '@/components/PwaInstallBanner';

export const metadata: Metadata = {
  title: 'Kado — Le cadeau, digitalisé.',
  description: 'Plateforme de chèques cadeaux digitaux pour le Sénégal et l\'UEMOA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kado',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#534AB7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PwaInstallBanner />
      </body>
    </html>
  );
}
