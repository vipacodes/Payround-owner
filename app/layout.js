import './globals.css';
export const metadata = { 
  title: 'PayRound Owner - Admin Control', 
  description: 'Owner dashboard to control PayRound user site',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
};
export default function RootLayout({ children }) { return (<html lang="en"><body>{children}</body></html>); }
