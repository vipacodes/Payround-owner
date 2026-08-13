'use client';

import { useEffect } from 'react';

// Visible immediately when the installed owner app launches (after the OS splash),
// while bundles load. Removed as soon as the panel is ready.
export default function BootLoader() {
  useEffect(() => {
    const el = document.getElementById('boot-loader');
    if (el) {
      const t1 = setTimeout(() => { el.style.opacity = '0'; }, 250);
      const t2 = setTimeout(() => { el.remove(); }, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []);

  return (
    <div id="boot-loader" aria-hidden="true">
      <div className="boot-logo"><img src="/images/logo-mark.png" alt="" /></div>
      <div className="boot-dots"><span /><span /><span /></div>
      <p className="boot-text">PayRound Owner</p>
    </div>
  );
}
