import './globals.css';
import PwaRegister from './PwaRegister';
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#7c3aed',
};
export const metadata = { 
  title: 'PayRound Owner - Admin Control', 
  description: 'Owner dashboard to control PayRound user site',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg', apple: '/images/apple-icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PR Owner' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/images/apple-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body><PwaRegister />{children}</body>
    </html>
  );
}
