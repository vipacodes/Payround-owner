'use client';

import { useEffect } from 'react';

// Registers the service worker so the panel can be installed as a phone app
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
