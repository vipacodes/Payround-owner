'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase, OWNER_EMAILS, DEFAULT_OWNER_SETTINGS, OWNER_PASSWORD_HASH_FALLBACK, ownerRest } from '@/lib/supabase';

// 🖼 Ad media helpers — items can be plain strings OR priced objects { src, name, price }
const isVidSrc = (m) => typeof m === 'string'
  && (m.startsWith('data:video') || /\.(mp4|webm|mov|m4v|3gp|3gpp|ogg)(\?|#|$)/i.test(m));
function adsMediaOf(a) {
  try {
    const m = JSON.parse(a?.media_urls || '[]');
    return Array.isArray(m) ? m.map(x => (typeof x === 'string' ? x : x?.src)).filter(Boolean) : [];
  } catch { return []; }
}
const fmtODay = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; }; };
const fmtODayShort = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch { return d; }; };

// 📊 Protected ad-event RPC rows → privacy-safe placement stats.
// New viewers are pseudonymous a:<hash> accounts or g:<hash> guest devices; legacy null identities never become people.
function aggAdEvents(rows) {
  const views = (rows || []).filter(r => r.kind === 'view');
  const clicks = (rows || []).filter(r => r.kind === 'click');
  const people = (rs) => new Set(rs.map(r => r.viewer).filter(Boolean));
  const accounts = (rs) => new Set(rs.map(r => r.viewer).filter(v => v && !v.startsWith('g:')));
  const guestDevices = (rs) => new Set(rs.map(r => r.viewer).filter(v => v && v.startsWith('g:')));
  const legacyGuests = (rs) => rs.filter(r => !r.viewer).length;
  const byMedia = new Map();
  for (const v of views) {
    const k = v.media_index === null || v.media_index === undefined ? 0 : Number(v.media_index) || 0;
    if (!byMedia.has(k)) byMedia.set(k, { views: 0, viewers: new Set(), guests: 0 });
    const b = byMedia.get(k);
    b.views += 1;
    if (v.viewer) b.viewers.add(v.viewer); else b.guests += 1;
  }
  const byDay = new Map();
  for (const v of views) {
    const d = (v.created_at || '').slice(0, 10);
    if (!d) continue;
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  // A click is itself proof of placement reach. Union it with observed views so a
  // very fast tap cannot yield an impossible tap rate above 100%.
  const reached = [...views, ...clicks];
  const peopleReached = people(reached).size;
  const uniqueClickers = people(clicks).size;
  return {
    totalViews: views.length,
    peopleReached,
    accountsReached: accounts(reached).size,
    guestDevices: guestDevices(reached).size,
    legacyGuests: legacyGuests(views),
    totalClicks: clicks.length,
    uniqueClickers,
    legacyClickGuests: legacyGuests(clicks),
    tapRate: peopleReached > 0 ? Math.round((uniqueClickers / peopleReached) * 100) : 0,
    perMedia: [...byMedia.entries()].sort((a, b) => a[0] - b[0])
      .map(([idx, b]) => ({ idx, views: b.views, people: b.viewers.size, guests: b.guests })),
    perDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

// 🔍 FULL-SCREEN ad media preview — closing it ALWAYS unmounts the video, so playback + sound stop
// dead. We ALSO explicitly pause+clear the element (belt & braces: no ghost audio, ever).
function MediaLightbox({ view, onClose, onNav }) {
  const vidRef = useRef(null);
  const cur = view.list[view.idx];
  const vid = isVidSrc(String(cur || ''));
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);
  useEffect(() => () => {
    const v = vidRef.current;
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} }
  }, [cur]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 p-3" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="font-bold text-sm text-white truncate">{view.name || 'Ad media'}</div>
          <div className="text-[11px] text-white/60">{view.idx + 1} of {view.list.length} · {vid ? 'Video' : 'Photo'}</div>
        </div>
        <button onClick={onClose} className="shrink-0 bg-white/15 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-full">✕ Close — video stops 🔇</button>
      </div>
      <div className="flex-1 relative flex items-center justify-center px-12 pb-5" onClick={e => e.stopPropagation()}>
        {vid
          ? <video key={view.idx} ref={vidRef} src={cur} controls autoPlay muted playsInline className="max-w-full max-h-full rounded-xl" />
          : <img key={view.idx} src={cur} alt="" className="max-w-full max-h-full object-contain rounded-xl" />}
        {view.list.length > 1 && (
          <>
            <button onClick={() => onNav(-1)} aria-label="Previous media" className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/30 text-white rounded-full w-10 h-10 text-xl">‹</button>
            <button onClick={() => onNav(1)} aria-label="Next media" className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/30 text-white rounded-full w-10 h-10 text-xl">›</button>
          </>
        )}
      </div>
    </div>
  );
}

// Thumbnails of an ad's slideshow — tap to preview full screen
function AdThumbs({ ad, onOpen }) {
  const media = adsMediaOf(ad);
  if (!media.length) return null;
  return (
    <div className="flex gap-1.5 mt-2 flex-wrap items-center">
      {media.slice(0, 6).map((src, i) => {
        const v = isVidSrc(String(src || ''));
        return (
          <button key={i} type="button" onClick={() => onOpen(media, i)} title="Tap for FULL-SCREEN preview"
            className="relative w-14 h-14 rounded-lg overflow-hidden border bg-black">
            {v
              ? <video src={src} muted playsInline preload="metadata" className="w-full h-full object-cover" />
              : <img src={src} alt="" className="w-full h-full object-cover" />}
            <span className="absolute bottom-0.5 right-1 text-[10px] text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{v ? '▶' : '🔍'}</span>
          </button>
        );
      })}
      <span className="text-[10px] text-gray-400">{media.length} item{media.length > 1 ? 's' : ''} — tap one to preview full screen</span>
    </div>
  );
}

// 📊 Owner analytics modal for one ad (visible to owner any time; advertisers see it after the run ends)
function OwnerAdStats({ ad, onClose }) {
  const [state, setState] = useState('loading'); // loading | ok | empty | error
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_ad_analytics', { p_ad_id: String(ad.id) });
        if (!alive) return;
        if (error) { setState('error'); return; }
        if (!data || !data.length) { setState('empty'); return; }
        setStats(aggAdEvents(data)); setState('ok');
      } catch { if (alive) setState('error'); }
    })();
    return () => { alive = false; };
  }, [ad?.id]);
  const media = adsMediaOf(ad);
  const maxPerDay = state === 'ok' ? Math.max(1, ...stats.perDay.map(d => d[1])) : 1;
  const bestDay = state === 'ok' && stats.perDay.length ? stats.perDay.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  const expired = ad?.expires_at && new Date(ad.expires_at).getTime() < Date.now();
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="rounded-t-3xl px-5 pt-5 pb-4" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#334155 100%)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold tracking-widest mb-1" style={{ color: '#94a3b8' }}>📊 AD ANALYTICS (OWNER)</p>
              <h3 className="text-lg font-extrabold text-white leading-tight truncate">{ad?.business_name || 'Ad'}</h3>
              <p className="text-[11px] mt-1" style={{ color: '#cbd5e1' }}>
                {expired ? '⌛ EXPIRED' : '🟢 LIVE'} · ₦{Number(ad?.price || 0).toLocaleString()} · {Number(ad?.duration_days) || '?'}-day plan
                {ad?.approved_at ? ` · ran ${fmtODay(ad.approved_at)}` : ''}{ad?.expires_at ? ` → ${fmtODay(ad.expires_at)}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✕ Close</button>
          </div>
        </div>
        <div className="p-5 space-y-5">
          {state === 'loading' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
              <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
            </div>
          )}
          {state === 'error' && (
            <div className="text-center py-8">
              <p className="font-bold text-sm text-gray-900">Analytics could not load just now</p>
              <p className="text-xs mt-1 text-gray-500">Close and re-open — or check the connection.</p>
            </div>
          )}
          {state === 'empty' && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📭</div>
              <p className="font-bold text-sm text-gray-900">No views counted for this ad yet</p>
              <p className="text-xs mt-1 text-gray-500 max-w-xs mx-auto">View counting started with the analytics update — older runs may show zero. Every impression from now on is counted (even without taps).</p>
            </div>
          )}
          {state === 'ok' && stats && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl p-3.5" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <p className="text-xl mb-0.5">👥</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#047857' }}>{stats.peopleReached.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#065f46' }}>PEOPLE REACHED</p>
                  <p className="text-[10px]" style={{ color: '#047857' }}>
                    {stats.accountsReached > 0 ? `${stats.accountsReached} account${stats.accountsReached === 1 ? '' : 's'}` : 'no logged-in accounts yet'}{stats.guestDevices > 0 ? ` · ${stats.guestDevices} guest device${stats.guestDevices === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <p className="text-xl mb-0.5">👀</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#1d4ed8' }}>{stats.totalViews.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#1e40af' }}>TOTAL VIEWS</p>
                  <p className="text-[10px]" style={{ color: '#1d4ed8' }}>every on-screen appearance (each photo/video counts separately)</p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p className="text-xl mb-0.5">👆</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#b45309' }}>{stats.uniqueClickers.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#92400e' }}>SPONSORED CLICKS</p>
                  <p className="text-[10px]" style={{ color: '#b45309' }}>distinct people who tapped an ad action</p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                  <p className="text-xl mb-0.5">⚡</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#6d28d9' }}>{stats.tapRate}%</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#5b21b6' }}>TAP RATE</p>
                  <p className="text-[10px]" style={{ color: '#6d28d9' }}>known viewers who tapped a sponsored action</p>
                </div>
              </div>
              {stats.perMedia.length > 0 && (
                <div>
                  <p className="text-xs font-extrabold mb-2 text-gray-900">🖼 EACH PHOTO & VIDEO</p>
                  <div className="space-y-2">
                    {stats.perMedia.map(m => {
                      const src = media[m.idx];
                      const isVid = src ? isVidSrc(String(src)) : false;
                      return (
                        <div key={m.idx} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ background: '#0f172a' }}>
                            {src ? (isVid
                              ? <video src={src} muted playsInline preload="metadata" className="w-full h-full object-contain" />
                              : <img src={src} alt="" className="w-full h-full object-contain" />)
                              : <div className="w-full h-full flex items-center justify-center text-white text-xs">🖼</div>}
                            {isVid && <span className="absolute bottom-0 right-0 text-[8px] text-white px-1 rounded-tl" style={{ background: 'rgba(0,0,0,0.65)' }}>▶</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-extrabold" style={{ color: '#0f172a' }}>{isVid ? 'Video' : 'Photo'} {m.idx + 1}</p>
                            <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((m.views / Math.max(1, stats.totalViews)) * 100))}%`, background: 'linear-gradient(90deg,#94a3b8,#0f172a)' }} />
                            </div>
                            <p className="text-[10px] mt-1 font-semibold" style={{ color: '#334155' }}>
                              {m.views.toLocaleString()} view{m.views === 1 ? '' : 's'} · {m.people.toLocaleString()} {m.people === 1 ? 'person' : 'people'}{m.guests ? ` · +${m.guests} guest view${m.guests === 1 ? '' : 's'}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {stats.perDay.length > 0 && (
                <div>
                  <p className="text-xs font-extrabold mb-1 text-gray-900">📅 VIEWS PER DAY</p>
                  {bestDay && <p className="text-[10px] font-semibold mb-2" style={{ color: '#047857' }}>🏆 Best day: {fmtODayShort(bestDay[0])} — {bestDay[1].toLocaleString()} view{bestDay[1] === 1 ? '' : 's'}</p>}
                  <div className="rounded-2xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="flex items-end gap-1 h-24">
                      {stats.perDay.slice(-31).map(([d, v]) => (
                        <div key={d} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmtODayShort(d)} — ${v} views`}>
                          <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, Math.round((v / maxPerDay) * 100))}%`, background: v === maxPerDay ? 'linear-gradient(180deg,#fbbf24,#f59e0b)' : 'linear-gradient(180deg,#94a3b8,#334155)' }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{fmtODayShort(stats.perDay[0][0])}</span>
                      <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{fmtODayShort(stats.perDay[stats.perDay.length - 1][0])}</span>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-gray-500">👀 Views are confirmed on-screen sponsored appearances. Reach uses distinct pseudonymous accounts and guest devices; legacy identity-less rows remain views, not guessed people. Clicks come only from sponsored placements, never ordinary business-profile visits. The advertiser unlocks this report after the run ends.</p>
              <button onClick={onClose} className="w-full text-sm font-extrabold py-3 rounded-xl text-white" style={{ background: '#0f172a' }}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Tap-to-load: shows a user's profile selfie for ID comparison in the Verification tab
function CompareSelfie({ email, onZoom }) {
  const [pic, setPic] = useState(undefined);
  const load = async () => {
    setPic(null);
    try {
      const { data } = await supabase.from('users').select('profile_pic').eq('email', (email || '').toLowerCase()).single();
      setPic(data?.profile_pic || '');
    } catch { setPic(''); }
  };
  if (pic) return (
    <button onClick={() => onZoom && onZoom(pic)} className="block text-center" title="Tap to expand">
      <img src={pic} alt="profile selfie" className="w-24 h-24 object-cover rounded-lg border-2 border-blue-400 hover:opacity-80" />
      <span className="block text-[10px] font-bold text-blue-700 mt-0.5">PROFILE SELFIE</span>
    </button>
  );
  if (pic === '') return <span className="text-[11px] text-gray-400">No selfie on file</span>;
  return (
    <button onClick={load} className="text-xs bg-blue-600 text-white rounded-full px-3 py-1.5 hover:bg-blue-700">
      {pic === null ? 'Loading…' : '👤 Show profile selfie'}
    </button>
  );
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function currentWeekRange() {
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return start.getMonth() === end.getMonth()
    ? `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`;
}

const USER_REF = 'payround-omega.vercel.app/signup?ref=';
// Privacy-safe owner projection. Referral accounting and DOB privacy stay behind
// dedicated owner/user RPCs instead of weakening column-level protections.
const OWNER_USER_SELECT = 'id,email,name,phone,trial_used,role,created_at,is_verified,is_approved,approval_status,decline_reason,profile_pic,pending_profile_pic,id_front_url,id_back_url,gender,address,occupation,bio,bank_name,account_number,account_name,payment_remark,is_frozen';
const EMPTY_REFERRAL_DASHBOARD = {
  stats: { relationship_count: 0, unqualified_count: 0, pending_count: 0, awarded_count: 0, available_balance: 0, lifetime_earned: 0, paid_out: 0 },
  referrers: [],
  payouts: [],
};
const newRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
};

/* ================= OVERALL ANALYTICS — pure-SVG charts (no chart library) ================= */
const PERIOD_OPTIONS = [
  { id: 'month', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

const compactNum = (v) => {
  const n = Math.abs(Number(v || 0));
  if (n >= 1e6) { const x = Math.round(n / 1e5) / 10; return `${x % 1 === 0 ? Math.round(x) : x}M`; }
  if (n >= 1e3) { const x = Math.round(n / 1e2) / 10; return `${x % 1 === 0 ? Math.round(x) : x}K`; }
  return String(Math.round(n));
};

// Buckets per period — month views chunk into 5-day spans (like the design), year/all use months.
function analyticsBuckets(periodKey, earliestTs) {
  const now = new Date();
  const day = 86400000;
  const buckets = [];
  if (periodKey === 'month' || periodKey === 'lastMonth') {
    const first = periodKey === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endAll = (periodKey === 'month' ? now : new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)).getTime();
    const cur = new Date(first); cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= endAll) {
      const end = Math.min(cur.getTime() + 5 * day - 1, endAll);
      buckets.push({ label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start: cur.getTime(), end });
      cur.setTime(end + 1);
    }
    return buckets;
  }
  const start = periodKey === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(earliestTs || new Date(now.getFullYear(), 0, 1).getTime());
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur.getTime() <= now.getTime()) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const yr = ` ’${String(cur.getFullYear()).slice(2)}`;
    buckets.push({ label: cur.toLocaleDateString('en-US', { month: 'short' }) + (periodKey === 'all' || cur.getFullYear() !== now.getFullYear() ? yr : ''), start: cur.getTime(), end: Math.min(next.getTime() - 1, now.getTime()) });
    cur = next;
  }
  return buckets;
}

function PeriodSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 font-medium shadow-sm focus:outline-none">
      {PERIOD_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

// Purple growth line with soft area fill + hover tooltip
function GrowthLineChart({ data }) {
  const [hover, setHover] = useState(null);
  const W = 620, H = 210, PL = 42, PR = 14, PT = 18, PB = 28;
  const maxV = Math.max(1, ...data.map(d => d.value));
  const niceMax = Math.max(1, Math.ceil(maxV * 1.2));
  const X = (i) => (data.length <= 1 ? PL + (W - PL - PR) / 2 : PL + (i / (data.length - 1)) * (W - PL - PR));
  const Y = (v) => PT + (1 - v / niceMax) * (H - PT - PB);
  const line = data.map((d, i) => `${X(i)},${Y(d.value)}`).join(' ');
  const area = `${PL},${Y(0)} ${line} ${X(data.length - 1)},${Y(0)}`;
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const zoneW = (W - PL - PR) / Math.max(1, data.length);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={Y(niceMax * f)} y2={Y(niceMax * f)} stroke="#eef0f4" strokeWidth="1" />
            <text x={PL - 6} y={Y(niceMax * f) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{compactNum(niceMax * f)}</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={Y(0)} y2={Y(0)} stroke="#e5e7eb" strokeWidth="1" />
        <text x={PL - 6} y={Y(0) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">0</text>
        {data.length > 0 && <polygon points={area} fill="url(#growthFill)" />}
        {data.length > 0 && <polyline points={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {data.map((d, i) => (
          <circle key={i} cx={X(i)} cy={Y(d.value)} r={hover === i ? 5 : 3.5} fill="#fff" stroke="#7c3aed" strokeWidth="2" />
        ))}
        {data.map((d, i) => (
          <text key={`l${i}`} x={X(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#9ca3af">{i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}</text>
        ))}
        {data.map((d, i) => (
          <rect key={`h${i}`} x={X(i) - zoneW / 2} y={PT} width={zoneW} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-1.5 text-xs z-10"
          style={{ left: `${(X(hover) / W) * 100}%`, top: `${(Y(data[hover].value) / H) * 100}%`, transform: 'translate(-50%, -118%)' }}>
          <div className="text-gray-400 text-[10px] whitespace-nowrap">{data[hover].hint}</div>
          <div className="font-bold text-gray-900 text-base leading-tight whitespace-nowrap">{data[hover].value.toLocaleString()} <span className="text-[11px] font-semibold text-gray-500">Users</span></div>
        </div>
      )}
    </div>
  );
}

// Donut — Active (green) / Pending (orange) / Frozen (red) with counts + percentages
function GroupsDonut({ segments }) {
  const total = segments.reduce((a, x) => a + x.value, 0);
  const R = 62, CIRC = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0 mx-auto">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#f1f2f6" strokeWidth="26" />
        {total > 0 && segments.map(seg => {
          const frac = seg.value / total;
          const el = (
            <circle key={seg.label} cx="80" cy="80" r={R} fill="none" stroke={seg.color} strokeWidth="26"
              strokeDasharray={`${frac * CIRC} ${CIRC}`} strokeDashoffset={-acc * CIRC} transform="rotate(-90 80 80)" />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="space-y-3.5 min-w-[150px]">
        {segments.map(seg => {
          const pct = total ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div key={seg.label} className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-sm mt-0.5 shrink-0" style={{ background: seg.color }} />
              <div>
                <div className="text-xs font-semibold text-gray-600">{seg.label}</div>
                <div className="text-sm font-bold text-gray-900">{seg.value.toLocaleString()} <span className="text-[11px] font-semibold text-gray-400">({pct}%)</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Contributions (purple) vs Payouts (green) — grouped bars
function MoneyBars({ data }) {
  const W = 620, H = 210, PL = 44, PR = 10, PT = 16, PB = 28;
  const maxV = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));
  const niceMax = Math.ceil(maxV * 1.15);
  const Y = (v) => PT + (1 - v / niceMax) * (H - PT - PB);
  const groupW = (W - PL - PR) / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(18, groupW / 2 - 4));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Contributions</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Payouts</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={Y(niceMax * f)} y2={Y(niceMax * f)} stroke="#eef0f4" strokeWidth="1" />
            <text x={PL - 6} y={Y(niceMax * f) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{compactNum(niceMax * f)}</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={Y(0)} y2={Y(0)} stroke="#e5e7eb" strokeWidth="1" />
        <text x={PL - 6} y={Y(0) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">0</text>
        {data.map((d, i) => {
          const cx = PL + groupW * i + groupW / 2;
          return (
            <g key={i}>
              <rect x={cx - barW - 1.5} y={Y(d.a)} width={barW} height={Math.max(0.5, Y(0) - Y(d.a))} rx="3" fill="#7c3aed"><title>{`${d.label} — Contributions ₦${d.a.toLocaleString()}`}</title></rect>
              <rect x={cx + 1.5} y={Y(d.b)} width={barW} height={Math.max(0.5, Y(0) - Y(d.b))} rx="3" fill="#22c55e"><title>{`${d.label} — Payouts ₦${d.b.toLocaleString()}`}</title></rect>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill="#9ca3af">{i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


const MENU = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'groups', icon: '👥', label: 'Groups' },
  { id: 'users', icon: '👤', label: 'Users' },
  { id: 'verification', icon: '✅', label: 'Verification' },
  { id: 'photo_requests', icon: '📷', label: 'Photo Requests' },
  { id: 'ads', icon: '📣', label: 'Ads' },
  { id: 'businesses', icon: '🏪', label: 'Businesses' },
  { id: 'transactions', icon: '💳', label: 'Transactions' },
  { id: 'support', icon: '💬', label: 'Support Chats' },
  { id: 'bank', icon: '🏦', label: 'Bank Details' },
  { id: 'referral', icon: '🎁', label: 'Referral Activity' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'announcements', icon: '📢', label: 'Announcements' },
];

function Stars({ n }) {
  return <span className="text-yellow-500 tracking-tight">{'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}</span>;
}
function BlueBadge() {
  return <span className="inline-block w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] text-center leading-4 align-middle" title="Blue verified">✓</span>;
}
const badgeEmoji = (t) => ({ bronze: '🥉', silver: '🥈', gold: '🥇' }[t || 'bronze'] || '🥉');

export default function OwnerPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');

  const [groupsSub, setGroupsSub] = useState('active');
  const [usersSub, setUsersSub] = useState('active');
  const [verifySub, setVerifySub] = useState('group_requests');

  const [groups, setGroups] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [presenceIssue, setPresenceIssue] = useState('');
  const [members, setMembers] = useState([]);
  const [groupReviews, setGroupReviews] = useState([]);
  const [memberReviews, setMemberReviews] = useState([]);
  const [verifyRequests, setVerifyRequests] = useState([]);
  const [ads, setAds] = useState([]);
  const [editRequests, setEditRequests] = useState([]);  // group edits sent by group admins — need your approval
  const [editDeclineReasons, setEditDeclineReasons] = useState({}); // per-request decline reason text

  const [profileView, setProfileView] = useState(null); // { type:'user'|'group', data:{...}, request? }
  const [photoPendingUsers, setPhotoPendingUsers] = useState([]); // full rows of users awaiting photo approval
  const [zoomImg, setZoomImg] = useState(null); // click-to-expand profile photo lightbox
  const [loadIssue, setLoadIssue] = useState(''); // visible if a data load ever fails (never silent)
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [receiptView, setReceiptView] = useState(null);
  const [mediaView, setMediaView] = useState(null);   // 🔍 full-screen ad media preview { list, idx, name }
  const [adStatsFor, setAdStatsFor] = useState(null); // 📊 analytics modal ad
  const [adsTab, setAdsTab] = useState('pending');    // 📣 pending | live | expired
  const [bizTab, setBizTab] = useState('pending');    // 🏪 pending | approved | hidden

  const [bankDetails, setBankDetails] = useState({ bankName: DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: DEFAULT_OWNER_SETTINGS.account_number, accountName: DEFAULT_OWNER_SETTINGS.account_name });
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementMedia, setAnnouncementMedia] = useState(null);
  const [announcementFile, setAnnouncementFile] = useState(null);
  const [pwHash, setPwHash] = useState(OWNER_PASSWORD_HASH_FALLBACK);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [siteControls, setSiteControls] = useState({ plan1m: DEFAULT_OWNER_SETTINGS.plan_1m, plan6m: DEFAULT_OWNER_SETTINGS.plan_6m, plan12m: DEFAULT_OWNER_SETTINGS.plan_12m, ad1day: 500, ad1week: 3325, ad1month: 13500, statsUsers: '', statsGroups: '', statsSaved: '', statsSatisfaction: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paymentsAll, setPaymentsAll] = useState([]);   // approved receipts → Contributions chart
  const [payoutsAll, setPayoutsAll] = useState([]);     // collected payouts → Payouts chart
  const [referralDashboard, setReferralDashboard] = useState(EMPTY_REFERRAL_DASHBOARD);
  const [referralPayoutForms, setReferralPayoutForms] = useState({});
  const [referralBusyId, setReferralBusyId] = useState(null);
  const [growthPeriod, setGrowthPeriod] = useState('month');
  const [moneyPeriod, setMoneyPeriod] = useState('month');
  // 💬 Support chats with users (+ the bot holds the fort while you're offline)
  const [supportThreads, setSupportThreads] = useState([]);
  const [activeSupport, setActiveSupport] = useState(null);
  const [supportMsgs, setSupportMsgs] = useState([]);
  const [supReply, setSupReply] = useState('');
  const [supBusy, setSupBusy] = useState(false);
  // 👤 user profile shown WHILE chatting (peek card + full profile button)
  const [supProfile, setSupProfile] = useState(null);
  const [supProfileLoading, setSupProfileLoading] = useState(false);
  const [showSupProfile, setShowSupProfile] = useState(true);
  const [ownerIsOnline, setOwnerIsOnline] = useState(false);

  const handleMenuClick = (menu) => {
    setActiveMenu(menu);
    setProfileView(null); setReceiptView(null);
    setMsg(''); setErr('');
    setSidebarOpen(false);
  };

  async function loadOnlineUsers() {
    try {
      const { data, error } = await supabase.rpc('get_owner_online_users');
      if (error) throw error;
      setOnlineUsers(Array.isArray(data) ? data : []);
      setPresenceIssue('');
    } catch (e) {
      setPresenceIssue(e?.message || 'Online users could not load.');
    }
  }

  // Supabase already persists/refreshes its session. Restore the owner UI only
  // after validating that the authenticated email is one of the owner accounts.
  useEffect(() => {
    let alive = true;
    const applySession = (session) => {
      if (!alive) return;
      const em = String(session?.user?.email || '').toLowerCase();
      const valid = !!session && OWNER_EMAILS.includes(em);
      setUser(valid ? { email: em, name: 'PayRound Owner' } : null);
      setIsOwner(valid);
      if (valid) setEmail(em);
      setAuthReady(true);
    };
    supabase.auth.getSession()
      .then(({ data }) => applySession(data?.session || null))
      .catch(() => applySession(null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.from('owner_settings').select('*').eq('id', 1).single();
        if (s) {
          setBankDetails({ bankName: s.bank_name ?? DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: s.account_number ?? DEFAULT_OWNER_SETTINGS.account_number, accountName: s.account_name ?? DEFAULT_OWNER_SETTINGS.account_name });
          if (s.owner_password_hash) setPwHash(s.owner_password_hash);
          if (s.announcement_text) setAnnouncementText(s.announcement_text);
          if (s.announcement_media_url) setAnnouncementMedia(s.announcement_media_url);
          setOwnerIsOnline(!!s.is_online);
          setSiteControls({
            plan1m: s.plan_1m ?? DEFAULT_OWNER_SETTINGS.plan_1m,
            plan6m: s.plan_6m ?? DEFAULT_OWNER_SETTINGS.plan_6m,
            plan12m: s.plan_12m ?? DEFAULT_OWNER_SETTINGS.plan_12m,
            ad1day: s.ad_1day ?? 500,
            ad1week: s.ad_1week ?? 3325,
            ad1month: s.ad_1month ?? 13500,
            statsUsers: s.stats_users_override ?? '',
            statsGroups: s.stats_groups_override ?? '',
            statsSaved: s.stats_saved_override ?? '',
            statsSatisfaction: s.stats_satisfaction_override ?? '',
          });
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!isOwner) return undefined;
    loadData();
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadData();
    };
    const t = setInterval(tick, 12000);
    const onVis = () => { if (!document.hidden) loadData(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [isOwner]);

  // Presence uses both a short fallback poll and Realtime invalidation. The RPC
  // applies the 75-second online threshold and reveals rows to owners only.
  useEffect(() => {
    if (!isOwner) return undefined;
    loadOnlineUsers();
    const t = setInterval(() => {
      if (!document.hidden) loadOnlineUsers();
    }, 15000);
    const channel = supabase
      .channel('owner-user-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => loadOnlineUsers())
      .subscribe();
    const onVis = () => { if (!document.hidden) loadOnlineUsers(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      supabase.removeChannel(channel);
    };
  }, [isOwner]);

  // 📛 App icon badge — the installed owner app shows how many items need a decision
  useEffect(() => {
    try {
      const total =
        groups.filter(g => g.status === 'pending_owner').length +
        usersList.filter(u => !(u.is_approved === true || u.approval_status === 'approved')).length +
        verifyRequests.filter(r => r.status === 'pending').length +
        photoPendingUsers.length +
        editRequests.filter(r => r.status === 'pending').length +
        supportThreads.filter(t => !t.owner_read).length;
      if ('setAppBadge' in navigator) {
        if (total > 0) navigator.setAppBadge(total).catch(() => {});
        else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
      }
    } catch {}
  }, [groups, usersList, verifyRequests, photoPendingUsers, editRequests, supportThreads]);

  const loadData = async () => {
    let session = null;
    try {
      const got = await supabase.auth.getSession();
      session = got?.data?.session || null;
    } catch {}
    if (!session?.access_token) {
      setLoadIssue('Users failed to load: not signed in to the database. Log out, then log in again with your owner email and the same password as the user site.');
      return;
    }
    const issues = [];
    const safe = async (q, label = 'Data') => {
      try {
        const { data, error } = await q;
        if (error) { issues.push(`${label} failed to load: ${error.message}`); return []; }
        return data || [];
      } catch (e) {
        issues.push(`${label} failed to load: ${e.message || 'connection error'}`);
        return [];
      }
    };
    setGroups(await safe(supabase.from('groups').select('*').order('created_at', { ascending: false }), 'Groups'));
    // Users list — only non-sensitive columns. Referral/DOB data comes from protected RPCs.
    {
      const rq = await ownerRest(`users?select=${OWNER_USER_SELECT}&order=created_at.desc`, { session });
      if (rq.error) issues.push(`Users failed to load: ${rq.error.message}`);
      else setUsersList(Array.isArray(rq.data) ? rq.data : []);
    }
    // Full privacy-safe rows for users who have a pending photo change.
    {
      const pend = await safe(supabase.from('users').select(OWNER_USER_SELECT).not('pending_profile_pic', 'is', null).order('created_at', { ascending: false }), 'Photo requests');
      setPhotoPendingUsers(pend);
    }
    // Auto-cleanup: purge notifications older than 60 days (keeps the database tidy)
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('notifications').delete().lt('created_at', cutoff);
      // Also purge READ direct messages older than 60 days
      await supabase.from('messages').delete().eq('read', true).lt('created_at', cutoff);
    } catch {}
    setMembers(await safe(supabase.from('members').select('*')));
    setGroupReviews(await safe(supabase.from('group_reviews').select('*').order('created_at', { ascending: false })));
    setMemberReviews(await safe(supabase.from('member_reviews').select('*').order('created_at', { ascending: false })));
    setVerifyRequests(await safe(supabase.from('verification_requests').select('*').order('created_at', { ascending: false })));
    // ⌛ AUTO-CLEAR: ads whose paid run ended 24h+ ago drop off this panel (archived — the advertiser
    // keeps the ad + its analytics in My Ads; the site feed already hides it the moment it expires)
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('ads').update({ status: 'archived' }).eq('status', 'approved').lt('expires_at', cutoff);
    } catch {}
    setAds(await safe(supabase.from('ads').select('*')));
    setEditRequests(await safe(supabase.from('group_edit_requests').select('*').order('created_at', { ascending: false })));
    setSupportThreads(await safe(supabase.from('support_threads').select('*').order('last_at', { ascending: false })));
    // Analytics feeds — light selects only (receipt/blob columns deliberately skipped so the panel stays fast)
    setPaymentsAll(await safe(supabase.from('payments').select('amount, status, created_at, reviewed_at').order('created_at', { ascending: false }), 'Payments'));
    setPayoutsAll(await safe(supabase.from('payouts').select('amount, status, created_at').order('created_at', { ascending: false }), 'Group payouts'));
    // Owner-only RPC provides every relationship, qualification, award and cash payout
    // without granting broad SELECT access to private user columns.
    {
      const rq = await ownerRest('rpc/get_owner_referral_dashboard', { method: 'POST', body: {}, session });
      if (rq.error) issues.push(`Referral activity failed to load: ${rq.error.message}`);
      else setReferralDashboard(rq.data || EMPTY_REFERRAL_DASHBOARD);
    }
    setLoadIssue(issues.join(' • '));
  };

  const payReferralBonus = async (referrer) => {
    const form = referralPayoutForms[referrer.user_id] || {};
    const amount = Number(form.amount);
    const note = String(form.note || '').trim();
    if (!Number.isInteger(amount) || amount <= 0) {
      setErr('Enter a positive whole-naira payout amount.');
      return;
    }
    if (amount > Number(referrer.available_balance || 0)) {
      setErr(`Payout cannot exceed the available referral balance of ₦${Number(referrer.available_balance || 0).toLocaleString()}.`);
      return;
    }
    if (!window.confirm(`Pay ₦${amount.toLocaleString()} from ${referrer.name || referrer.email}'s referral balance?\n\nThis creates a permanent audit record and leaves ₦${(Number(referrer.available_balance || 0) - amount).toLocaleString()} available.`)) return;

    const requestId = form.requestId || newRequestId();
    // Keep the same request ID after a network failure. An exact retry is then
    // returned from the audit ledger without deducting or notifying twice.
    setReferralPayoutForms(prev => ({ ...prev, [referrer.user_id]: { ...form, requestId } }));
    setReferralBusyId(referrer.user_id); setErr(''); setMsg('');
    try {
      const got = await supabase.auth.getSession();
      const session = got?.data?.session;
      const { data, error } = await ownerRest('rpc/owner_pay_referral_bonus', {
        method: 'POST',
        body: { p_user_id: referrer.user_id, p_amount: amount, p_note: note || null, p_request_id: requestId },
        session,
      });
      if (error) throw error;
      setReferralPayoutForms(prev => ({ ...prev, [referrer.user_id]: { amount: '', note: '' } }));
      setMsg(data?.idempotent_replay
        ? `This payout had already completed. No second deduction or notification was created. ${referrer.name || referrer.email}'s remaining referral balance is ₦${Number(data?.balance_after || 0).toLocaleString()}.`
        : `Paid ₦${amount.toLocaleString()} to ${referrer.name || referrer.email}. Remaining referral balance: ₦${Number(data?.balance_after || 0).toLocaleString()}. Audit record saved and user notified.`);
      await loadData();
    } catch (e) {
      setErr(`Referral payout failed: ${e.message}`);
    }
    setReferralBusyId(null);
  };

  const notify = async (type, groupId, message, userEmail) => {
    try { await supabase.from('notifications').insert({ id: `${type}-${Date.now()}`, type, group_id: groupId || null, message, user_email: userEmail || null }); } catch {}
  };

  /* ---------- USER PROFILE OPEN (fetches the full row incl. photos, keeps list fast) ---------- */
  const openUserProfile = async (u, request) => {
    if (!u) return;
    setErr(''); setMsg('');
    setProfileView({ type: 'user', data: u, request, loadingFull: true });
    try {
      const { data, error } = await supabase.from('users').select(OWNER_USER_SELECT).eq('id', u.id).single();
      if (error) throw error;
      if (data) setProfileView({ type: 'user', data, request });
    } catch (e) {
      setErr(`Could not load full profile: ${e.message}`);
    }
  };

  /* ---------- PROFILE PHOTO REVIEW (owner approval required for photo changes) ---------- */
  const reviewUserPhoto = async (u, approve) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      if (approve) {
        const { error } = await supabase.from('users').update({ profile_pic: u.pending_profile_pic, pending_profile_pic: null }).eq('id', u.id);
        if (error) throw error;
        await notify('photo_approved', null, '🎉 Your new profile photo has been approved — it is now visible on your profile.', u.email);
        setMsg(`✔ Photo approved for ${u.name || u.email}.`);
      } else {
        const { error } = await supabase.from('users').update({ pending_profile_pic: null }).eq('id', u.id);
        if (error) throw error;
        await notify('photo_declined', null, '❌ Your new profile photo was declined. Please upload a clear, appropriate photo of yourself from Settings.', u.email);
        setMsg(`✖ Photo declined for ${u.name || u.email}.`);
      }
      setProfileView(null);
      await loadData();
    } catch (e) {
      setErr(`Photo review failed: ${e.message}`);
    }
    setBusy(false);
  };

  /* ---------- AUTH (Supabase session persists across refreshes) ---------- */
  const handleLogin = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setErr('Access denied — owner accounts only.'); return; }
    setBusy(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: em, password });
      if (authErr) {
        setErr('Invalid owner login. Use the same password as the main Payround site (vipadarapper / payroundsupport).');
        return;
      }
      setUser({ email: em, name: 'PayRound Owner' });
      setIsOwner(true);
    } catch { setErr('Login failed in this browser. Use HTTPS.'); }
    finally { setBusy(false); }
  };

  const ownerDeleteUser = async (u) => {
    if (!u?.email) return;
    const em = String(u.email).toLowerCase();
    if (['vipadarapper@gmail.com', 'payroundsupport@gmail.com'].includes(em)) {
      setErr('Owner logins cannot be deleted from here.');
      return;
    }
    const reason = window.prompt(
      `Delete ${u.name || em} forever?\n\nThey are logged out immediately. If they try this email again they will see YOUR reason.\nThey can still create a new free account, or email payroundsupport@gmail.com.\n\nType the reason they will see:`,
      'This account broke PayRound rules.'
    );
    if (reason === null) return;
    const why = reason.trim();
    if (!why) { setErr('A reason is required so the person knows why the account was taken down.'); return; }
    if (!window.confirm(`Take down ${u.name || em}?\n\nThey will see: “${why}”`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const got = await supabase.auth.getSession();
      const session = got?.data?.session;
      const { data, error } = await ownerRest('rpc/owner_delete_user', { method: 'POST', body: { p_email: em, p_reason: why }, session });
      if (error) throw error;
      setMsg(`Taken down ${em}. They are signed out and will see your reason if they try to log in.`);
      setProfileView(null);
      await loadData();
    } catch (e) { setErr(`Delete user failed: ${e.message}`); }
    setBusy(false);
  };

  const ownerDeleteGroup = async (g) => {
    if (!g?.id) return;
    if (!window.confirm(`Delete group "${g.name || g.id}" forever?\n\nMembers, chat, payments and the group page all go. This cannot be undone.`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const got = await supabase.auth.getSession();
      const session = got?.data?.session;
      const { error } = await ownerRest('rpc/owner_delete_group', { method: 'POST', body: { p_group_id: String(g.id) }, session });
      if (error) throw error;
      setMsg(`Deleted group "${g.name || g.id}".`);
      setProfileView(null);
      await loadData();
    } catch (e) { setErr(`Delete group failed: ${e.message}`); }
    setBusy(false);
  };

  const handleLogout = async () => {
    try { await supabase.auth?.signOut?.(); } catch {}
    setIsOwner(false); setUser(null); setPassword(''); setEmail('');
    setMsg(''); setErr(''); setProfileView(null); setSidebarOpen(false); setActiveMenu('dashboard');
  };

  /* ---------- GROUP appprove/decline ---------- */
  const approveGroup = async (g) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'active' }).eq('id', g.id);
      if (error) throw error;
      await notify('group_approved', g.id, `Group "${g.name}" approved and is now live.`, g.admin_email);
      setMsg(`"${g.name}" approved — now live on the user site. (⭐ verification badge is separate — set it in the Verification tab.)`);
      setProfileView(null); loadData();
    } catch (e) { setErr(`Approve failed: ${e.message}`); }
    setBusy(false);
  };

  const declineGroup = async (g) => {
    const reason = window.prompt(`Reason for declining "${g.name}" (shown to the group admin):`, 'Requirements not met');
    if (reason === null) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'rejected', rejection_reason: reason }).eq('id', g.id);
      if (error) throw error;
      await notify('group_rejected', g.id, `Group "${g.name}" was declined: ${reason}`, g.admin_email);
      setMsg(`"${g.name}" declined.`); setProfileView(null); loadData();
    } catch (e) { setErr(`Decline failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- USER approve/decline (approval only — blue badge comes from Verification tab) ---------- */
  const approveUser = async (u) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('users').update({ is_approved: true, approval_status: 'approved' }).eq('id', u.id);
      if (error) throw error;
      await notify('user_approved', null, `Welcome! Your PayRound account has been approved.`, u.email);
      setMsg(`${u.name || u.email} approved (active user). 🔵 Blue badge is only granted from the Verification tab.`);
      setProfileView(null); loadData();
    } catch (e) { setErr(`Approve failed: ${e.message}. If it mentions "is_approved", run the v1.3 migration SQL.`); }
    setBusy(false);
  };

  const declineUser = async (u) => {
    const reason = window.prompt(`Reason for declining ${u.name || u.email}:`, 'Could not verify your account details');
    if (reason === null) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('users').update({ is_approved: false, approval_status: 'declined', decline_reason: reason }).eq('id', u.id);
      if (error) throw error;
      await notify('user_declined', null, `Your account approval was declined: ${reason}. You may contact support.`, u.email);
      setMsg(`${u.name || u.email} declined.`);
      setProfileView(null); loadData();
    } catch (e) { setErr(`Decline failed: ${e.message}. If it mentions "approval_status", run the v1.3 migration SQL.`); }
    setBusy(false);
  };

  /* ---------- ❄️ FREEZE / 🔥 UNFREEZE (users & groups) — frozen things pause instantly on the user site ---------- */
  const freezeUser = async (u, freeze) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const { error } = await supabase.from('users').update({ is_frozen: freeze }).eq('id', u.id);
      if (error) throw error;
      await notify(freeze ? 'account_frozen' : 'account_unfrozen', null,
        freeze
          ? '❄️ Your PayRound account has been frozen — the app is paused for you. Contact support on WhatsApp (+234 915 1723 199) if this seems wrong.'
          : '🔥 Your PayRound account is active again — welcome back! You can use the app normally.',
        u.email);
      setMsg(freeze ? `❄️ ${u.name || u.email} is now FROZEN — their app is blocked.` : `🔥 ${u.name || u.email} is unfrozen.`);
      setProfileView({ ...profileView, data: { ...profileView.data, is_frozen: freeze } });
      loadData();
    } catch (e) { setErr(`Freeze failed: ${e.message}`); }
    setBusy(false);
  };

  const freezeGroup = async (g, freeze) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const { error } = await supabase.from('groups').update({ is_frozen: freeze }).eq('id', g.id);
      if (error) throw error;
      await notify(freeze ? 'group_frozen' : 'group_unfrozen', g.id,
        freeze
          ? `❄️ Your group "${g.name}" was frozen by PayRound — joining, payments and chat are paused. Contact support if this seems wrong.`
          : `🔥 Your group "${g.name}" is unfrozen — everything works again.`,
        g.admin_email);
      setMsg(freeze ? `❄️ "${g.name}" is FROZEN — hidden from search, members see a frozen notice.` : `🔥 "${g.name}" is unfrozen.`);
      setProfileView({ ...profileView, data: { ...profileView.data, is_frozen: freeze } });
      loadData();
    } catch (e) { setErr(`Freeze failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- ✏️ GROUP EDIT REQUESTS — approve applies the changes live; decline asks for a reason ---------- */
  const reviewGroupEdit = async (r, approve, reason = '') => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const g = groups.find(x => x.id === r.group_id) || {};
      if (approve) {
        const all = JSON.parse(r.changes || '{}');
        // Safety: only these fields may ever be applied
        const allowed = ['name', 'description', 'amount', 'frequency', 'max_members', 'payout_amount', 'frequency_days'];
        const clean = {};
        allowed.forEach(k => { if (all[k] !== undefined) clean[k] = all[k]; });
        if (clean.amount !== undefined) clean.amount = Number(clean.amount) || 0;
        if (clean.max_members !== undefined) clean.max_members = parseInt(clean.max_members, 10) || null;
        if (clean.payout_amount !== undefined) clean.payout_amount = Number(clean.payout_amount) > 0 ? Number(clean.payout_amount) : null;
        if (clean.frequency_days !== undefined) clean.frequency_days = parseInt(clean.frequency_days, 10) > 0 ? parseInt(clean.frequency_days, 10) : null;
        const { error } = await supabase.from('groups').update(clean).eq('id', r.group_id);
        if (error) throw error;
      }
      const { error: e2 } = await supabase.from('group_edit_requests').update({
        status: approve ? 'approved' : 'declined',
        decline_reason: approve ? null : (reason.trim() || null),
        reviewed_at: new Date().toISOString(),
      }).eq('id', r.id);
      if (e2) throw e2;
      await notify(approve ? 'group_edit_approved' : 'group_edit_declined', r.group_id,
        approve
          ? `✅ Great news — your change request for "${g.name || r.group_id}" was APPROVED and is now live: ${r.summary}`
          : `❌ Your change request for "${g.name || r.group_id}" was declined${reason.trim() ? ` — reason: ${reason.trim()}` : ''}. You can adjust and send a new request.`,
        r.admin_email);
      setMsg(approve ? `Edit applied to "${g.name}" — the admin was notified.` : `Edit declined — the admin was notified with your reason.`);
      setEditDeclineReasons(prev => ({ ...prev, [r.id]: '' }));
      loadData();
    } catch (e) { setErr(`Review failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- VERIFY / UNVERIFY USER (blue badge) straight from their profile ---------- */
  const verifyUserBadge = async (u, verify) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const { error } = await supabase.from('users').update({ is_verified: verify }).eq('id', u.id);
      if (error) throw error;
      await notify(
        verify ? 'verification_approved' : 'verification_declined', null,
        verify
          ? '🎉 Your account has been verified — the 🔵 blue badge is now on your profile.'
          : 'Your blue verification badge was removed after a review. You can contact support if this seems wrong.',
        u.email
      );
      setMsg(verify ? `🔵 ${u.name || u.email} is now verified — blue badge granted.` : `Blue badge removed from ${u.name || u.email}.`);
      setProfileView({ ...profileView, data: { ...u, is_verified: verify } });
      loadData();
    } catch (e) { setErr(`Verify failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- VERIFICATION requests (groups & users) ---------- */
  const reviewVerification = async (req, verify) => {
    setBusy(true);
    const subjectName = req.subject_type === 'user' ? (req.user_name || req.user_email) : (req.group_name || req.group_id);
    const reason = verify ? '' : (window.prompt('Reason for declining (shown to them):', 'Not eligible for verification') ?? '');
    if (!verify && reason === null) { setBusy(false); return; }
    try {
      const { error } = await supabase.from('verification_requests').update({
        status: verify ? 'approved' : 'declined',
        reviewed_at: new Date().toISOString(),
        decline_reason: verify ? null : (reason || null),
      }).eq('id', req.id);
      if (error) throw error;
      if (verify) {
        if (req.subject_type === 'user' && req.user_email) {
          await supabase.from('users').update({ is_verified: true }).eq('email', req.user_email);
        } else if (req.group_id) {
          await supabase.from('groups').update({ is_verified: true }).eq('id', req.group_id);
        }
      }
      const targetEmail = req.subject_type === 'user' ? req.user_email : (req.admin_email || (groups.find(x => x.id === req.group_id)?.admin_email) || null);
      await notify(verify ? 'verification_approved' : 'verification_declined', req.group_id || null,
        verify
          ? `✅ Verification approved for ${subjectName}.`
          : `Verification for ${subjectName} was denied${reason ? `: ${reason}` : ' because you are not eligible for verification'}. You can re-apply after 7 days.`,
        targetEmail);
      setMsg(`${subjectName} ${verify ? 'verified 🔵' : 'declined'} — they get a notification on the user site.`);
      setProfileView(null); loadData();
    } catch (e) { setErr(`Review failed: ${e.message}. If it mentions a column, run the v1.3 migration SQL.`); }
    setBusy(false);
  };

  const verifyGroupBadge = async (g, tier) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ badge_tier: tier }).eq('id', g.id);
      if (error) throw error;
      setMsg(`Tier badge for "${g.name}" updated to ${tier} ${badgeEmoji(tier)} — it shows as a ${tier} check mark on the user site.`);
      setProfileView({ ...profileView, data: { ...profileView.data, badge_tier: tier } });
      loadData();
    } catch (e) { setErr(`Badge update failed: ${e.message}`); }
    setBusy(false);
  };

  /* Blue check on a GROUP — only you can give/remove it (tier badges do NOT grant it) */
  const verifyGroupCheck = async (g, verify) => {
    if (!window.confirm(`${verify ? 'Add the 🔵 Blue Check to' : 'Remove the 🔵 Blue Check from'} "${g.name}"?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ is_verified: verify }).eq('id', g.id);
      if (error) throw error;
      setMsg(verify ? `🔵 Blue Check added to "${g.name}".` : `🔵 Blue Check removed from "${g.name}".`);
      setProfileView({ ...profileView, data: { ...profileView.data, is_verified: verify } });
      loadData();
    } catch (e) { setErr(`Blue check failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- SETTINGS / BANK / ANNOUNCEMENTS ---------- */
  const saveBankDetails = async () => {
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.from('owner_settings').update({
        bank_name: bankDetails.bankName.trim(), account_number: bankDetails.accountNumber.trim(), account_name: bankDetails.accountName.trim(), updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setMsg('Bank details saved — visible on the user site immediately.');
    } catch (e) { setErr(`Save failed: ${e.message}`); }
    setBusy(false);
  };

  const saveSiteControls = async () => {
    setBusy(true); setErr('');
    const num = (v) => (v === '' || v === null ? null : Number(v));
    const txt = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; }; // stats keep what you type — "+" and "%" allowed
    try {
      const { error } = await supabase.from('owner_settings').update({
        plan_1m: Number(siteControls.plan1m) || DEFAULT_OWNER_SETTINGS.plan_1m,
        plan_6m: Number(siteControls.plan6m) || DEFAULT_OWNER_SETTINGS.plan_6m,
        plan_12m: Number(siteControls.plan12m) || DEFAULT_OWNER_SETTINGS.plan_12m,
        ad_1day: Number(siteControls.ad1day) || 500,
        ad_1week: Number(siteControls.ad1week) || 3325,
        ad_1month: Number(siteControls.ad1month) || 13500,
        stats_users_override: txt(siteControls.statsUsers), stats_groups_override: txt(siteControls.statsGroups),
        stats_saved_override: txt(siteControls.statsSaved), stats_satisfaction_override: txt(siteControls.statsSatisfaction),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setMsg('Site controls saved — the user site picks these up on next load.');
    } catch (e) { setErr(`Save failed: ${e.message}`); }
    setBusy(false);
  };

  const publishAnnouncement = async () => {
    if (!announcementText.trim() && !announcementFile) { setErr('Type an announcement or attach media first.'); return; }
    setBusy(true); setErr('');
    let mediaUrl = announcementMedia;
    try {
      if (announcementFile && supabase.storage) {
        try {
          // Uploads ride the same PUBLIC bucket the ads use (posted to Storage on 5 Aug — verified working)
          const path = `announcements/${Date.now()}-${announcementFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
          const { error: upErr } = await supabase.storage.from('ads-media').upload(path, announcementFile, { upsert: true, contentType: announcementFile.type || undefined });
          if (!upErr) mediaUrl = supabase.storage.from('ads-media').getPublicUrl(path).data.publicUrl;
          else setErr(`Media upload skipped (${upErr.message}) — text still published.`);
        } catch {}
      }
      const { error } = await supabase.from('owner_settings').update({
        announcement_text: announcementText.trim(), announcement_media_url: mediaUrl,
        announcement_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setAnnouncementMedia(mediaUrl); setAnnouncementFile(null);
      setMsg('Announcement published — pops up at the top of the user site until you clear it.');
    } catch (e) { setErr(`Publish failed: ${e.message}`); }
    setBusy(false);
  };

  // Approve/decline submitted ads — approving starts the paid clock: live for the purchased number of days.
  // Declining (or taking down) REQUIRES a reason — the advertiser sees it and can edit & resubmit.
  const reviewAd = async (ad, approve) => {
    setBusy(true);
    try {
      let rejectReason = null;
      if (!approve) {
        const r = window.prompt(`Why is "${ad.business_name || 'this ad'}" being declined/taken down?\n\nThe advertiser sees this exact text (required):`, '');
        if (r === null) { setBusy(false); return; }
        rejectReason = r.trim();
        if (!rejectReason) { setErr('A reason is required when declining an ad — the advertiser uses it to fix and resubmit.'); setBusy(false); return; }
        if (!window.confirm(`Decline "${ad.business_name}" with reason:\n\n"${rejectReason}"\n\nProceed?`)) { setBusy(false); return; }
      }
      const patch = { status: approve ? 'approved' : 'declined', reject_reason: rejectReason };
      if (approve) {
        const days = Number(ad.duration_days) || 7;
        const now = Date.now();
        patch.approved_at = new Date(now).toISOString();
        patch.expires_at = new Date(now + days * 86400000).toISOString();
      }
      const { error } = await supabase.from('ads').update(patch).eq('id', ad.id);
      if (error) throw error;
      try {
        await notify('ad_review', null, approve
          ? `📢 Your ad "${ad.business_name || 'Business'}" is now LIVE on PayRound for ${Number(ad.duration_days) || 7} day(s) — shown to visitors and on every user dashboard. 🎉`
          : `Your ad "${ad.business_name || 'Business'}" was declined. Reason: "${rejectReason}". Open the Advertise page → My Ads to read it, edit your ad and resubmit. ✏️`,
          (ad.submitter_email || '').toLowerCase() || null);
      } catch {}
      setMsg(approve ? `Ad "${ad.business_name}" approved — LIVE now for ${Number(ad.duration_days) || 7} day(s), then it comes down automatically.` : `Ad "${ad.business_name}" declined — the submitter has been notified.`);
      loadData();
    } catch (e) { setErr(`Ad review failed: ${e.message}`); }
    setBusy(false);
  };

  // 🔍 Full-screen media preview — pause EVERY inline video first so nothing keeps sounding underneath
  const openMedia = (list, idx, name) => {
    try { document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} }); } catch {}
    setMediaView({ list, idx, name });
  };
  const navMedia = (d) => setMediaView(v => (v ? { ...v, idx: (v.idx + d + v.list.length) % v.list.length } : v));

  // 🗑 Manually clear an expired ad from this panel now (same thing the 24h auto-clear does)
  const archiveAd = async (ad) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('ads').update({ status: 'archived' }).eq('id', ad.id);
      if (error) throw error;
      setMsg(`"${ad.business_name || 'Ad'}" cleared from this list — the advertiser keeps their analytics in My Ads.`);
      loadData();
    } catch (e) { setErr(`Could not clear the ad: ${e.message}`); }
    setBusy(false);
  };

  // 🏪 Business visibility gate — approve → public everywhere; hide → only the advertiser sees it
  const reviewBiz = async (ad, status) => {
    const name = ad.business_name || 'this business';
    if (status === 'hidden' && !window.confirm(`Hide "${name}" from the public?\n\nThe advertiser still sees their own page (marked "under review") and keeps their items. Re-show anytime.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('ads').update({ biz_status: status }).eq('id', ad.id);
      if (error) throw error;
      setMsg(status === 'approved'
        ? `✅ "${name}" is now PUBLIC — search, profile links and its business page are live for everyone.`
        : `🙈 "${name}" is hidden — only the advertiser can see it now (re-show anytime).`);
      loadData();
    } catch (e) { setErr(`Business review failed: ${e.message}`); }
    setBusy(false);
  };

  // 💬 Support inbox — presence toggle + thread handling
  const toggleOnline = async () => {
    const nv = !ownerIsOnline;
    setOwnerIsOnline(nv);
    try {
      const { error } = await supabase.from('owner_settings').update({ is_online: nv, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      setMsg(nv ? '🟢 You are ONLINE — users now chat with you directly (the bot stays quiet).' : '💤 Offline mode — the chatbot 🤖 answers users instantly and points them to WhatsApp.');
    } catch (e) { setErr(`Could not update presence: ${e.message}`); setOwnerIsOnline(!nv); }
  };

  const openSupportThread = async (th) => {
    setActiveSupport(th);
    setSupportMsgs([]);
    setSupProfile(null); setSupProfileLoading(true); setShowSupProfile(true);
    try {
      await supabase.from('support_threads').update({ owner_read: true }).eq('id', th.id);
      setSupportThreads(prev => prev.map(x => x.id === th.id ? { ...x, owner_read: true } : x));
    } catch {}
    // 👤 load this chatter's profile so you can see WHO you're helping, mid-chat
    try {
      const em = (th.user_email || '').toLowerCase();
      const { data: urow } = await supabase.from('users').select(OWNER_USER_SELECT).ilike('email', em).maybeSingle();
      let memberOf = 0, adminOf = 0;
      try {
        const { count: mc } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('member_email', em).eq('status', 'approved');
        memberOf = mc || 0;
      } catch {}
      try {
        const { count: ac } = await supabase.from('groups').select('id', { count: 'exact', head: true }).eq('admin_email', em);
        adminOf = ac || 0;
      } catch {}
      setSupProfile({ user: urow || null, memberOf, adminOf });
    } catch { setSupProfile({ user: null, memberOf: 0, adminOf: 0 }); }
    setSupProfileLoading(false);
  };

  // open the FULL profile modal (same one as the Users tab) for the user you're chatting with
  const viewSupportProfileFull = async () => {
    if (!activeSupport) return;
    if (supProfile?.user) { openUserProfile(supProfile.user); return; }
    const em = (activeSupport.user_email || '').toLowerCase();
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data, error } = await supabase.from('users').select(OWNER_USER_SELECT).ilike('email', em).maybeSingle();
      if (error) throw error;
      if (data) openUserProfile(data);
      else setErr('No registered account profile found for this email yet.');
    } catch (e) { setErr(`Could not load profile: ${e.message}`); }
    setBusy(false);
  };

  // live-messages poll while a thread is open
  useEffect(() => {
    if (!activeSupport) return;
    let alive = true;
    const load = async () => {
      try {
        const { data } = await supabase.from('support_messages').select('*').eq('thread_id', activeSupport.id).order('created_at');
        if (alive) setSupportMsgs(data || []);
      } catch {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSupport?.id]);

  const sendSupportReply = async () => {
    const text = supReply.trim();
    if (!text || !activeSupport || supBusy) return;
    setSupBusy(false); setSupBusy(true);
    try {
      const now = new Date().toISOString();
      const row = { id: `sm-${Date.now()}-own`, thread_id: activeSupport.id, sender_type: 'owner', body: text, read: false };
      const { error } = await supabase.from('support_messages').insert(row);
      if (error) throw error;
      await supabase.from('support_threads').update({ last_message: text, last_at: now, user_read: false, owner_read: true }).eq('id', activeSupport.id);
      setSupportMsgs(prev => [...prev, { ...row, created_at: now }]);
      setSupReply('');
      try { await notify('support_reply', null, `💬 PayRound Support replied: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}" — open Messages → PayRound Support to read & reply.`, (activeSupport.user_email || '').toLowerCase() || null); } catch {}
      setMsg(`Reply sent to ${activeSupport.user_name || activeSupport.user_email}.`);
    } catch (e) { setErr(`Reply failed: ${e.message}`); }
    setSupBusy(false);
  };

  const clearAnnouncement = async () => {
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.from('owner_settings').update({ announcement_text: null, announcement_media_url: null, announcement_updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      setAnnouncementText(''); setAnnouncementMedia(null); setAnnouncementFile(null);
      setMsg('Announcement cleared from the user site.');
    } catch (e) { setErr(`Clear failed: ${e.message}`); }
    setBusy(false);
  };

  const changePassword = async () => {
    setErr(''); setMsg('');
    const { current, next, confirm } = pwForm;
    if (!current || !next) { setErr('Fill in the current and new password.'); return; }
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      if (await sha256Hex(current) !== pwHash) { setErr('Current password is incorrect.'); setBusy(false); return; }
      const newHash = await sha256Hex(next);
      const { error } = await supabase.from('owner_settings').update({ owner_password_hash: newHash, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      setPwHash(newHash);
      setPwForm({ current: '', next: '', confirm: '' });
      setMsg('Password changed — applies to both owner emails.');
    } catch (e) { setErr(`Change failed: ${e.message}`); }
    setBusy(false);
  };

  /* ---------- LOGIN ---------- */
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-4 text-white">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-white/25 border-t-white animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold">Restoring your secure owner session…</p>
        </div>
      </div>
    );
  }
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <img src="/images/logo-mark.png" alt="Payround" className="w-14 h-14 rounded-xl mx-auto mb-3 object-cover shadow" />
            <h1 className="text-xl font-bold">PayRound Owner</h1>
            <p className="text-xs text-gray-500 mt-1">Admin control panel — secure owner session</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Owner Email" type="email" required className="w-full border rounded-xl px-4 py-3 text-sm" />
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required className="w-full border rounded-xl px-4 py-3 text-sm" />
            <button disabled={busy} className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors">{busy ? 'Checking…' : 'Login as Owner'}</button>
          </form>
          {err && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">{err}</div>}
        </div>
      </div>
    );
  }

  /* ---------- DERIVED DATA ---------- */
  const activeGroups = groups.filter(g => g.status === 'active');
  const pendingGroups = groups.filter(g => g.status === 'pending_owner');
  const frozenGroups = groups.filter(g => ['frozen', 'trial_frozen'].includes(g.status));
  const verifiedGroups = groups.filter(g => g.is_verified);
  const isUserApproved = (u) => u.is_approved === true || u.approval_status === 'approved';
  const isUserDeclined = (u) => u.approval_status === 'declined';
  const activeUsers = usersList.filter(isUserApproved);
  const pendingUsers = usersList.filter(u => !isUserApproved(u));
  const pendingAdsCount = ads.filter(a => a.status === 'pending').length;
  // 📣 Ads tabs — expired ads hold status 'approved' for 24h after ending, then auto-archive (clears here)
  const adIsExpired = (a) => a.status === 'approved' && a.expires_at && new Date(a.expires_at).getTime() < Date.now();
  const pendingAds = ads.filter(a => a.status === 'pending');
  const liveAds = ads.filter(a => a.status === 'approved' && !adIsExpired(a));
  const expiredAds = ads.filter(adIsExpired);
  // 🏪 Business gate — a business profile is PUBLIC only when biz_status === 'approved'.
  // Queue = every non-declined ad row still 'pending' business review.
  const bizState = (a) => a.biz_status || 'pending';
  const bizQueue = ads.filter(a => a.status !== 'declined');
  const bizPendingCount = bizQueue.filter(a => bizState(a) === 'pending').length;
  const bizApproved = bizQueue.filter(a => bizState(a) === 'approved');
  const bizHidden = bizQueue.filter(a => bizState(a) === 'hidden');
  const bizPending = bizQueue.filter(a => bizState(a) === 'pending');
  // Owner search helpers — users by name/email/ID, groups by name/ID/admin
  const matchUser = (u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || String(u.id || '').toLowerCase().startsWith(q);
  };
  const matchGroup = (g) => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return true;
    return (g.name || '').toLowerCase().includes(q)
      || String(g.id || '').toLowerCase() === q
      || (g.admin_name || '').toLowerCase().includes(q)
      || (g.admin_email || '').toLowerCase().includes(q);
  };
  const pendingEditRequests = editRequests.filter(r => r.status === 'pending');
  const verifiedUsers = usersList.filter(u => u.is_verified);
  const groupRequests = verifyRequests.filter(r => (r.subject_type || 'group') === 'group' && r.status === 'pending');
  const userRequests = verifyRequests.filter(r => r.subject_type === 'user' && r.status === 'pending');
  const groupMembers = (gid) => members.filter(m => m.group_id === gid && m.status === 'approved');
  const groupRatings = (gid) => groupReviews.filter(r => r.group_id === gid);
  const avgRating = (gid) => { const rs = groupRatings(gid); return rs.length ? (rs.reduce((a, r) => a + (r.rating || 0), 0) / rs.length) : 0; };
  const refId = (u) => (u.id || '').slice(0, 8);
  const referralAccountFor = (u) => (referralDashboard.referrers || []).find(r => r.user_id === u.id);
  const referredUsers = (u) => referralAccountFor(u)?.referrals || [];
  const userAdminGroups = (u) => groups.filter(g => g.admin_email === u.email);
  const userMemberGroups = (u) => members.filter(m => m.member_email === u.email && m.status === 'approved');
  const userReviews = (u) => memberReviews.filter(r => r.member_email === u.email);
  const transactions = [
    ...groups.filter(g => g.creation_receipt_url).map(g => ({ id: `c-${g.id}`, type: `Creation fee (${g.plan_months || '?'}mo plan)`, from: g.admin_email, name: g.name, amount: g.plan_price || 5000, date: g.first_payment_at || g.created_at, receipt: g.creation_receipt_url })),
    ...groups.filter(g => g.renewal_receipt_url).map(g => ({ id: `r-${g.id}`, type: 'Group renewal', from: g.admin_email, name: g.name, amount: g.plan_price || 5000, date: g.expiry_at || g.created_at, receipt: g.renewal_receipt_url })),
    ...ads.map(a => ({ id: `a-${a.id}`, type: 'Ad placement', from: a.submitter_email, name: a.business_name, amount: a.price, date: a.submitted_at, receipt: a.payment_receipt_url })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  /* ---------- OVERALL ANALYTICS derived data (live from Supabase) ---------- */
  const datedTs = [...usersList.map(u => u.created_at), ...groups.map(g => g.created_at)].filter(Boolean).map(t => new Date(t).getTime());
  const earliestTs = datedTs.length ? Math.min(...datedTs) : Date.now();
  const analyticFrozen = groups.filter(g => g.is_frozen || ['frozen', 'trial_frozen'].includes(g.status));
  const donutSegments = [
    { label: 'Active Groups', value: groups.filter(g => g.status === 'active' && !g.is_frozen).length, color: '#22c55e' },
    { label: 'Pending Groups', value: pendingGroups.length, color: '#f59e0b' },
    { label: 'Frozen Groups', value: analyticFrozen.length, color: '#ef4444' },
  ];
  const growthData = analyticsBuckets(growthPeriod, earliestTs).map(b => ({
    label: b.label,
    hint: new Date(b.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    value: usersList.filter(u => u.created_at && new Date(u.created_at).getTime() <= b.end).length,
  }));
  const inBucket = (ts, b) => ts && new Date(ts).getTime() >= b.start && new Date(ts).getTime() <= b.end;
  const moneyData = analyticsBuckets(moneyPeriod, earliestTs).map(b => ({
    label: b.label,
    a: paymentsAll.filter(x => x.status === 'approved' && inBucket(x.reviewed_at || x.created_at, b)).reduce((sum, x) => sum + (Number(x.amount) || 0), 0),
    b: payoutsAll.filter(x => inBucket(x.created_at, b)).reduce((sum, x) => sum + (Number(x.amount) || 0), 0),
  }));

  const title = activeMenu === 'dashboard' ? 'Dashboard Overview' : (MENU.find(m => m.id === activeMenu)?.label || 'Dashboard');

  const menuBtn = (m, badge) => (
    <button key={m.id} onClick={() => handleMenuClick(m.id)}
      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-150 border-b-2 ${activeMenu === m.id
        ? 'bg-purple-600 text-white border-purple-900 shadow-[0_4px_0_rgba(0,0,0,0.4)]'
        : 'text-white/70 border-black/30 bg-white/5 hover:bg-white/10 shadow-[0_4px_0_rgba(0,0,0,0.35)] active:shadow-none active:translate-y-[3px]'}`}>
      <span className="flex items-center gap-3">{m.icon} {m.label}</span>
      {badge > 0 ? (
        <span className="relative inline-flex items-center justify-center min-w-[1.4rem] h-5 bg-green-500 text-[10px] font-extrabold px-1.5 rounded-full shadow">
          {badge}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-300 rounded-full animate-pulse" />
        </span>
      ) : <span>›</span>}
    </button>
  );

  const sidebar = (
    <aside className="bg-gradient-to-b from-[#26224f] via-[#1e1b4b] to-[#141138] text-white flex flex-col h-full overflow-y-auto border-r-4 border-purple-500/40 shadow-[10px_0_30px_rgba(20,17,56,0.55)]">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo-mark.png" alt="" className="w-9 h-9 rounded-xl object-cover shadow-[0_3px_0_rgba(0,0,0,0.4)]" />
            <div><div className="font-bold">PayRound</div><div className="text-[10px] text-white/50 tracking-widest">OWNER PANEL</div></div>
          </div>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
        </div>
        <div className="mt-5 flex items-center gap-3 bg-white/5 rounded-xl p-3 border-b-2 border-black/20 shadow-[0_4px_0_rgba(0,0,0,0.25)]">
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold shadow">{(user.email[0] || 'O').toUpperCase()}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate max-w-[150px]">{user.email}</div>
            <div className="text-[10px] bg-purple-600 px-2 py-0.5 rounded-full inline-block mt-1 shadow">Super Admin</div>
            <div className="text-[10px] text-green-400 mt-1">● Online</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-2 text-sm">
        <div className="text-[10px] text-white/40 px-3 mb-1 tracking-widest">MENU</div>
        {menuBtn(MENU[0])}
        {menuBtn(MENU[1], pendingGroups.length)}
        {menuBtn(MENU[2], pendingUsers.length)}
        {menuBtn(MENU[3], groupRequests.length + userRequests.length)}
        {menuBtn(MENU[4], photoPendingUsers.length)}
        {menuBtn(MENU[5], pendingAdsCount)}
        {menuBtn(MENU[6], bizPendingCount)}
        {menuBtn(MENU[7])}
        {menuBtn(MENU[8], supportThreads.filter(t => !t.owner_read).length)}
        {MENU.slice(9).map(m => menuBtn(m))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2">
        <div className="bg-purple-900/40 rounded-xl p-3 border-b-2 border-black/20 shadow-[0_4px_0_rgba(0,0,0,0.25)]">
          <div className="text-xs">{bankDetails.bankName} {bankDetails.accountNumber}</div>
          <div className="text-[10px] text-white/50 mt-1">{bankDetails.accountName} — shown to users at payment.</div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center justify-between px-3 py-3 text-sm rounded-xl text-white/80 bg-red-900/40 hover:bg-red-900/60 border-b-2 border-red-950 shadow-[0_4px_0_rgba(0,0,0,0.4)] active:shadow-none active:translate-y-[3px] transition-all">
          <span className="flex items-center gap-3">↩️ Log Out</span><span>›</span>
        </button>
        <div className="text-[9px] text-white/20 px-3 pt-1">Owner Dashboard v1.3</div>
      </div>
    </aside>
  );

  const subPills = (options, value, set) => (
    <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-2xl border w-fit shadow-sm">
      {options.map(o => (
        <button key={o.id} onClick={() => set(o.id)} className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${value === o.id ? 'bg-purple-700 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  );

  const infoRow = (label, value) => (
    <div className="flex justify-between gap-3 text-xs border-b last:border-0 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right break-all">{value ?? '—'}</span>
    </div>
  );

  const sub = verifySub;

  /* ---------- RENDER ---------- */
  return (
    <div className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-[minmax(250px,20%)_1fr]">
      <div className="hidden lg:block sticky top-0 h-screen">{sidebar}</div>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 lg:hidden" />}
      <div className={`fixed inset-y-0 left-0 z-40 w-[80%] max-w-[320px] transform transition-transform duration-300 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>{sidebar}</div>

      <main className="min-h-screen min-w-0">
        <div className="bg-white border-b px-4 md:px-6 h-16 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle menu" className="lg:hidden w-10 h-10 shrink-0 bg-[#1a1b3a] text-white rounded-xl flex items-center justify-center">☰</button>
            <div className="min-w-0">
              <h1 className="font-bold text-base md:text-lg truncate">{title}</h1>
              <p className="text-[10px] md:text-xs text-gray-500 hidden md:block">Live data from Supabase — changes reflect on the user site.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <span className="hidden md:block text-xs border rounded-lg px-3 py-1">{currentWeekRange()}</span>
            {/* 💬 Support chat shortcut (replaces the old "users • name" chip) — one tap opens Support Chats; green dot = a user is waiting for a reply */}
            <button
              onClick={() => handleMenuClick('support')}
              aria-label="Open support chats"
              title={supportThreads.some(t => !t.owner_read) ? 'Support chats — NEW messages waiting 💬' : 'Support chats'}
              className="relative w-11 h-11 shrink-0 bg-[#1a1b3a] text-white rounded-xl flex items-center justify-center text-xl hover:bg-[#252653] transition-colors"
            >
              💬
              {supportThreads.some(t => !t.owner_read) && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm">{msg}</div>}
          {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{err}</div>}
          {loadIssue && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl p-3 text-sm flex items-center justify-between gap-3">
              <span>⚠️ {loadIssue} — data may be incomplete.</span>
              <button onClick={loadData} className="shrink-0 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">🔁 Retry</button>
            </div>
          )}

          {/* 1. DASHBOARD — Overall Analytics */}
          {activeMenu === 'dashboard' && (
            <>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Overall Analytics</h2>
                <p className="text-xs text-gray-400 mt-0.5">Live from Supabase — the real numbers behind everything happening on the user site.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="font-bold text-gray-800">User Growth</h3>
                    <PeriodSelect value={growthPeriod} onChange={setGrowthPeriod} />
                  </div>
                  <GrowthLineChart data={growthData} />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="font-bold text-gray-800 mb-4">Groups Overview</h3>
                  <div className="min-h-[190px] flex items-center">
                    <GroupsDonut segments={donutSegments} />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="font-bold text-gray-800">Contributions vs Payouts</h3>
                    <PeriodSelect value={moneyPeriod} onChange={setMoneyPeriod} />
                  </div>
                  <MoneyBars data={moneyData} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Users Registered</div>
                  <div className="font-bold text-3xl mt-1">{usersList.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">{activeUsers.length} approved • {verifiedUsers.length} blue-verified • {pendingUsers.length} pending</div>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Active Groups</div>
                  <div className="font-bold text-3xl mt-1">{activeGroups.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">{verifiedGroups.length} verified • {pendingGroups.length} pending • {analyticFrozen.length} frozen</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold mb-3">Active Groups</h3>
                {activeGroups.length > 0 ? activeGroups.map(g => (
                  <div key={g.id} className="flex justify-between items-center gap-3 border-b last:border-0 py-3 text-sm">
                    <div className="min-w-0"><span className="font-medium">{g.name}</span> {g.is_verified && <BlueBadge />} <span className="text-xs text-gray-500 block sm:inline">ID: {g.id} • ₦{Number(g.amount).toLocaleString()} {g.frequency} • {groupMembers(g.id).length || g.max_members} members • <Stars n={Math.round(avgRating(g.id))} /> • Badge: {badgeEmoji(g.badge_tier)} {g.badge_tier || 'Bronze'}</span></div>
                    <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No active groups yet — groups appear here after you approve them in the Groups tab.</div>}
              </div>

              <p className="text-center text-xs text-gray-400 pt-5 mt-1 border-t border-gray-100">© {new Date().getFullYear()} PayRound Technologies. All rights reserved.</p>
            </>
          )}

          {/* 2. GROUPS */}
          {activeMenu === 'groups' && (
            <div className="space-y-4">
              {subPills([{ id: 'active', label: '✅ Active Groups', count: activeGroups.length }, { id: 'pending', label: '🕓 Pending Approval', count: pendingGroups.length }, { id: 'edits', label: '✏️ Edit Requests', count: pendingEditRequests.length }], groupsSub, setGroupsSub)}

              {/* Search groups (name, ID, or admin) */}
              <input
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="🔎 Search groups by name, ID, or admin…"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />

              {groupsSub === 'active' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">Active Groups</h3>
                  <p className="text-xs text-gray-500 mb-3">Approved and visible on the user site. Click one to see its full profile, admin, members, rating and reviews.</p>
                  {activeGroups.filter(matchGroup).map(g => (
                    <div key={g.id} className="border-b last:border-0 py-3 text-sm flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{g.name} {g.is_verified && <BlueBadge />} {g.is_frozen && <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-1">❄️ frozen</span>} <span className="text-xs text-gray-500">• ID: {g.id}</span></div>
                        <div className="text-xs text-gray-500">Admin: {g.admin_name || g.admin_email} • <Stars n={Math.round(avgRating(g.id))} /> ({groupRatings(g.id).length} reviews) • Badge: {badgeEmoji(g.badge_tier)} {g.badge_tier || 'Bronze'}</div>
                      </div>
                      <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                    </div>
                  ))}
                  {activeGroups.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">{groupSearch ? `No groups match "${groupSearch}".` : 'No active groups yet.'}</div>}
                </div>
              )}

              {groupsSub === 'pending' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">Pending Groups</h3>
                  <p className="text-xs text-gray-500 mb-3">View the full profile (KYC, details) before deciding. Approved groups go live immediately.</p>
                  {pendingGroups.filter(matchGroup).map(g => (
                    <div key={g.id} className="border rounded-xl p-3 mb-3">
                      <div className="font-medium text-sm">{g.name} <span className="text-xs text-gray-500">• {g.admin_email}</span></div>
                      <div className="text-xs text-gray-500 mt-1">₦{Number(g.amount).toLocaleString()} {g.frequency} • {g.max_members} members • Color: <span className="inline-block w-3 h-3 rounded-full align-middle" style={{ background: g.color }} /></div>
                      {g.plan_months && <div className="text-[11px] mt-1 font-medium text-purple-700">Plan: {g.plan_months} month{g.plan_months > 1 ? 's' : ''} — receipt should be ₦{Number(g.plan_price || 0).toLocaleString()}</div>}
                      {!g.plan_months && <div className="text-[11px] mt-1 text-gray-400">Plan: legacy — check receipt amount</div>}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">👁 View Profile</button>
                        <button disabled={busy} onClick={() => approveGroup(g)} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✔ Approve → Go Live</button>
                        <button disabled={busy} onClick={() => declineGroup(g)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline</button>
                      </div>
                    </div>
                  ))}
                  {pendingGroups.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">{groupSearch ? `No groups match "${groupSearch}".` : 'No groups waiting for review.'}</div>}
                </div>
              )}

              {groupsSub === 'edits' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">✏️ Group Edit Requests</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Group admins can request changes to core details (name, contribution, frequency, number of spots, payout per spot).
                    <b>Approve</b> applies the change instantly and notifies the admin; <b>decline</b> asks for a reason the admin sees on their side.
                  </p>
                  {pendingEditRequests.length === 0 && editRequests.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">No edit requests yet.</div>}
                  {editRequests.slice(0, 30).map(r => {
                    const g = groups.find(x => x.id === r.group_id) || {};
                    let changes = {};
                    try { changes = JSON.parse(r.changes || '{}'); } catch {}
                    const pretty = (k, v) => {
                      if (v === undefined || v === null || v === '' || v === '—') return k === 'payout_amount' ? 'full pot' : '—';
                      if (k === 'amount' || k === 'payout_amount') return Number(v) > 0 ? `₦${Number(v).toLocaleString()}` : (k === 'payout_amount' ? 'full pot' : '—');
                      if (k === 'frequency_days') return `every ${v} days`;
                      if (k === 'max_members') return `${v} spots`;
                      return String(v);
                    };
                    const cur = (k) => g[k];
                    return (
                      <div key={r.id} className={`border rounded-xl p-3 mb-3 ${r.status === 'pending' ? 'border-amber-300 bg-amber-50/40' : 'opacity-70'}`}>
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          {g.name || r.group_id} <span className="text-xs text-gray-500 font-normal">• {r.admin_email}</span>
                          {r.status === 'approved' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">approved</span>}
                          {r.status === 'declined' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">declined</span>}
                          {r.status === 'pending' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">waiting for you</span>}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</div>
                        <div className="mt-2 space-y-1">
                          {Object.entries(changes).map(([k, v]) => (
                            <div key={k} className="text-xs bg-white border rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                              <span className="font-semibold capitalize text-gray-700">{k === 'max_members' ? 'number of spots' : k === 'payout_amount' ? 'payout per spot' : k === 'frequency_days' ? 'custom days' : k}</span>
                              <span className="text-gray-400 line-through truncate">{pretty(k, cur(k))}</span>
                              <span className="text-gray-400">→</span>
                              <span className="font-bold text-purple-700 truncate">{pretty(k, v)}</span>
                            </div>
                          ))}
                        </div>
                        {r.status === 'pending' && (
                          <>
                            <input
                              value={editDeclineReasons[r.id] || ''}
                              onChange={e => setEditDeclineReasons(prev => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Reason if you decline (shown to the group admin)…"
                              className="w-full mt-3 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                              <button disabled={busy} onClick={() => { if (window.confirm(`APPLY these changes to "${g.name || r.group_id}"? They go live immediately.`)) reviewGroupEdit(r, true); }} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✔ Approve & Apply</button>
                              <button disabled={busy} onClick={() => reviewGroupEdit(r, false, editDeclineReasons[r.id] || '')} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline with reason</button>
                              {g.id && <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50">👁 Group Profile</button>}
                            </div>
                          </>
                        )}
                        {r.status === 'declined' && r.decline_reason && <div className="text-[11px] text-red-600 mt-2">Decline reason sent: {r.decline_reason}</div>}
                        {r.status === 'approved' && <div className="text-[11px] text-green-700 mt-2">✅ Applied live on the user site.</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. USERS */}
          {activeMenu === 'users' && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold mb-1">Users <span className="text-xs font-normal text-gray-400">({usersList.length} registered)</span></h3>
                  <p className="text-xs text-gray-500">View a user's full profile before approving. Approving activates their account — the 🔵 blue verification badge is granted only from the Verification tab.</p>
                </div>
                <button onClick={loadData} className="shrink-0 text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">🔁 Refresh</button>
              </div>

              {/* Private live presence: heartbeat is JWT-bound; only owner RPC/RLS can read it. */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-950">🟢 Online now <span className="text-xs font-normal text-emerald-700">({onlineUsers.length})</span></h4>
                    <p className="text-[10px] text-emerald-700">Live heartbeats · users disappear after about 75 seconds without activity</p>
                  </div>
                  <button onClick={loadOnlineUsers} className="shrink-0 text-[11px] font-bold border border-emerald-300 bg-white text-emerald-800 rounded-full px-3 py-1.5">Refresh</button>
                </div>
                {presenceIssue && <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl p-2 mb-2">Presence could not refresh: {presenceIssue}</div>}
                {onlineUsers.length === 0 ? (
                  <div className="text-xs text-emerald-800/70 border border-dashed border-emerald-200 bg-white/60 rounded-xl p-4 text-center">No user heartbeat is active right now.</div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {onlineUsers.map((online) => {
                      const profile = usersList.find(u => String(u.id) === String(online.user_id));
                      const seconds = Math.max(0, Math.floor((Date.now() - new Date(online.last_seen_at).getTime()) / 1000));
                      return (
                        <button key={online.user_id} type="button" onClick={() => profile && openUserProfile(profile)} disabled={!profile}
                          className="text-left flex items-center gap-2.5 bg-white border border-emerald-100 rounded-xl p-2.5 hover:border-emerald-300 disabled:cursor-default">
                          {online.profile_pic
                            ? <img src={online.profile_pic} alt="" className="w-9 h-9 rounded-full object-cover border" />
                            : <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">{(online.name || online.email || 'U')[0].toUpperCase()}</span>}
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-gray-900 truncate">{online.name || 'PayRound user'} {online.is_verified && <BlueBadge />}</span>
                            <span className="block text-[10px] text-gray-500 truncate">{online.email}</span>
                            <span className="block text-[9px] font-semibold text-emerald-700">active {seconds < 5 ? 'just now' : `${seconds}s ago`}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Search users (name, email, or unique ID) */}
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="🔎 Search users by name, email, or ID…"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />

              {/* Profile photo change requests banner */}
              {usersList.filter(u => u.pending_profile_pic).length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-purple-900">📷 <b>{usersList.filter(u => u.pending_profile_pic).length}</b> profile photo change{usersList.filter(u => u.pending_profile_pic).length > 1 ? 's' : ''} awaiting your approval — open the user's profile to review the new photo.</p>
                  <span className="text-lg shrink-0">👁</span>
                </div>
              )}

              {subPills([{ id: 'active', label: '✅ Active Users', count: activeUsers.length }, { id: 'pending', label: '🕓 Pending Approval', count: pendingUsers.length }], usersSub, setUsersSub)}

              <div className="grid md:grid-cols-2 gap-4">
                {usersSub === 'active' ? (
                  activeUsers.filter(matchUser).length > 0 ? activeUsers.filter(matchUser).map(u => (
                    <div key={u.id} className="border rounded-xl p-4">
                      <div className="font-medium text-sm">{u.name || '—'} {u.is_verified && <BlueBadge />} {u.is_frozen && <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-1">❄️ frozen</span>} {u.pending_profile_pic && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">📷 photo pending</span>}</div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                      <button onClick={() => openUserProfile(u)} className="mt-2 text-xs border rounded-full px-3 py-1 hover:bg-gray-50 font-medium">👁 View Profile</button>
                    </div>
                  )) : <div className="md:col-span-2 text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">{userSearch ? `No users match "${userSearch}".` : 'No approved users yet — approve users from the pending list.'}</div>
                ) : (
                  pendingUsers.filter(matchUser).length > 0 ? pendingUsers.filter(matchUser).map(u => (
                    <div key={u.id} className={`border rounded-xl p-4 ${isUserDeclined(u) ? 'border-red-200 bg-red-50/40' : ''}`}>
                      <div className="font-medium text-sm">{u.name || '—'} {isUserDeclined(u) && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-1">Declined</span>} {u.is_frozen && <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-1">❄️ frozen</span>} {u.pending_profile_pic && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">📷 photo pending</span>}</div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email} • Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</div>
                      {u.decline_reason && <div className="text-[11px] text-red-600 mt-1">Reason: {u.decline_reason}</div>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => openUserProfile(u)} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">👁 View Profile</button>
                        <button disabled={busy} onClick={() => approveUser(u)} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✔ Approve</button>
                        {!isUserDeclined(u) && <button disabled={busy} onClick={() => declineUser(u)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline</button>}
                      </div>
                    </div>
                  )) : <div className="md:col-span-2 text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">{userSearch ? `No users match "${userSearch}".` : 'No users waiting for approval.'}</div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                Referral links are available to every user. A referred person earns the referrer ₦500 only after PayRound approves that person's first qualifying group; if the referrer is not yet in an approved group, the reward stays pending. Open Referral Activity for balances and payouts.
              </div>
            </div>
          )}

          {/* 4. VERIFICATION — 4 categories */}
          {activeMenu === 'verification' && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <div>
                <h3 className="font-bold mb-1">Verification</h3>
                <p className="text-xs text-gray-500">Review the profile and evidence first, then Verify or Decline. Verified groups get the badge — Bronze 🥉 / Silver 🥈 / Gold 🥇 (set from their profile). Verified users get the 🔵 blue badge. Declined requests can re-apply after 7 days. Everyone is notified on the user site.</p>
              </div>
              {subPills([
                { id: 'group_requests', label: '👥 Group Requests', count: groupRequests.length },
                { id: 'user_requests', label: '👤 User Requests', count: userRequests.length },
                { id: 'verified_groups', label: '🏅 Verified Groups', count: verifiedGroups.length },
                { id: 'verified_users', label: '🔵 Verified Users', count: verifiedUsers.length },
              ], verifySub, setVerifySub)}

              {/* Group verification requests */}
              {sub === 'group_requests' && (
                groupRequests.length > 0 ? groupRequests.map(r => {
                  const g = groups.find(x => x.id === r.group_id);
                  return (
                    <div key={r.id} className="border rounded-xl p-4 mb-3">
                      <div className="font-medium text-sm">{r.group_name || g?.name || r.group_id} <span className="text-xs text-gray-500">• {r.admin_email || g?.admin_email}</span></div>
                      <div className="text-xs text-gray-500 mt-1">Submitted {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</div>
                      {r.reason && <p className="text-sm mt-2 bg-gray-50 rounded-lg p-3">{r.reason}</p>}
                      {r.images && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {String(r.images).split(',').filter(Boolean).map((img, i) => (
                            <img key={i} src={img.trim()} alt={`evidence ${i + 1}`} onClick={() => setZoomImg(img.trim())} title="Tap to expand" className="w-16 h-16 object-cover rounded-lg border hover:opacity-80 cursor-zoom-in" />
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {g && <button onClick={() => setProfileView({ type: 'group', data: g, request: r })} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">👁 View Profile First</button>}
                        <button disabled={busy} onClick={() => reviewVerification(r, true)} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✔ Verify</button>
                        <button disabled={busy} onClick={() => reviewVerification(r, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline</button>
                      </div>
                    </div>
                  );
                }) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No group verification requests waiting.</div>
              )}

              {/* User verification requests */}
              {sub === 'user_requests' && (
                userRequests.length > 0 ? userRequests.map(r => {
                  const u = usersList.find(x => x.email === r.user_email);
                  return (
                    <div key={r.id} className="border rounded-xl p-4 mb-3">
                      <div className="font-medium text-sm">{r.user_name || u?.name || r.user_email} <span className="text-xs text-gray-500">• {r.user_email}</span></div>
                      <div className="text-xs text-gray-500 mt-1">Submitted {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</div>
                      {r.reason && <p className="text-sm mt-2 bg-gray-50 rounded-lg p-3">{r.reason}</p>}
                      {(r.id_front_url || r.id_back_url) ? (
                        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-blue-800 mb-2">🪪 ID check — compare the ID photo with the profile selfie. Grant the 🔵 badge only if the faces match.</p>
                          <div className="flex flex-wrap items-start gap-3">
                            <CompareSelfie email={r.user_email} onZoom={setZoomImg} />
                            {r.id_front_url && (
                              <button onClick={() => setZoomImg(r.id_front_url)} className="block text-center" title="Tap to expand">
                                <img src={r.id_front_url} alt="ID front" className="w-32 h-24 object-contain rounded-lg border-2 border-blue-400 bg-white hover:opacity-80" />
                                <span className="block text-[10px] font-bold text-blue-700 mt-0.5">ID FRONT</span>
                              </button>
                            )}
                            {r.id_back_url && (
                              <button onClick={() => setZoomImg(r.id_back_url)} className="block text-center" title="Tap to expand">
                                <img src={r.id_back_url} alt="ID back" className="w-32 h-24 object-contain rounded-lg border-2 border-blue-400 bg-white hover:opacity-80" />
                                <span className="block text-[10px] font-bold text-blue-700 mt-0.5">ID BACK</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {r.images && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {String(r.images).split(',').filter(Boolean).map((img, i) => (
                            <img key={i} src={img.trim()} alt={`evidence ${i + 1}`} onClick={() => setZoomImg(img.trim())} title="Tap to expand" className="w-16 h-16 object-cover rounded-lg border hover:opacity-80 cursor-zoom-in" />
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {u && <button onClick={() => openUserProfile(u, r)} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">👁 View Profile First</button>}
                        <button disabled={busy} onClick={() => reviewVerification(r, true)} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✔ Verify → 🔵 Blue Badge</button>
                        <button disabled={busy} onClick={() => reviewVerification(r, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline</button>
                      </div>
                    </div>
                  );
                }) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No user verification requests waiting.</div>
              )}

              {/* Verified groups */}
              {sub === 'verified_groups' && (
                verifiedGroups.length > 0 ? verifiedGroups.map(g => (
                  <div key={g.id} className="border rounded-xl p-4 mb-2 flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <div className="font-medium text-sm">{g.name} {g.is_verified && <BlueBadge />}</div>
                      <div className="text-xs text-gray-500">Admin: {g.admin_name || g.admin_email} • Badge: {badgeEmoji(g.badge_tier)} {g.badge_tier || 'Bronze'} • <Stars n={Math.round(avgRating(g.id))} /></div>
                    </div>
                    <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No verified groups yet — verify from Group Requests.</div>
              )}

              {/* Verified users */}
              {sub === 'verified_users' && (
                verifiedUsers.length > 0 ? verifiedUsers.map(u => (
                  <div key={u.id} className="border rounded-xl p-4 mb-2 flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <div className="font-medium text-sm">{u.name || '—'} <BlueBadge /></div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </div>
                    <button onClick={() => openUserProfile(u)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No verified users yet — verify from User Requests.</div>
              )}
            </div>
          )}

          {/* 5. PHOTO REQUESTS — approve / decline profile photo changes */}
          {activeMenu === 'photo_requests' && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <div>
                <h3 className="font-bold mb-1">📷 Photo Requests</h3>
                <p className="text-xs text-gray-500">Users must get your approval before a new profile photo goes live. Compare the current photo with the new one, then Approve or Decline. The user is notified either way. Click any photo to expand it.</p>
              </div>

              {photoPendingUsers.length > 0 ? photoPendingUsers.map(u => (
                <div key={u.id} className="border border-purple-200 rounded-xl p-4 bg-purple-50/40">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <div className="font-medium text-sm">{u.name || '—'} {u.is_verified && <BlueBadge />}</div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </div>
                    <button onClick={() => openUserProfile(u)} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium bg-white">👁 View Full Profile</button>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 mt-4">
                    <div className="text-center">
                      {u.profile_pic
                        ? <img src={u.profile_pic} alt="current" onClick={() => setZoomImg(u.profile_pic)} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
                        : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-2xl shadow-sm">{(u.name || u.email || 'U')[0].toUpperCase()}</div>}
                      <div className="text-[10px] text-gray-500 mt-1">Current photo</div>
                    </div>
                    <div className="text-purple-500 font-bold text-2xl">→</div>
                    <div className="text-center">
                      <img src={u.pending_profile_pic} alt="new" onClick={() => setZoomImg(u.pending_profile_pic)} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-purple-400 shadow-sm cursor-zoom-in hover:opacity-90" />
                      <div className="text-[10px] text-purple-700 font-bold mt-1">New photo</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button disabled={busy} onClick={() => reviewUserPhoto(u, true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve Photo</button>
                    <button disabled={busy} onClick={() => reviewUserPhoto(u, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline Photo</button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">
                  <div className="text-3xl mb-2">📷</div>
                  No profile photo changes waiting for approval.
                  <div className="text-[11px] text-gray-400 mt-1">When a user uploads a new profile photo, it appears here for your review first.</div>
                </div>
              )}
            </div>
          )}

          {/* 6. TRANSACTIONS */}
          {activeMenu === 'transactions' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Transactions</h3>
              <p className="text-xs text-gray-500 mb-4">Every payment between users and you — group creation fees, renewals, ads. Click a row to view its receipt.</p>
              {transactions.length > 0 ? transactions.map(t => (
                <button key={t.id} onClick={() => setReceiptView(t)} className="w-full flex flex-wrap justify-between items-center gap-2 border-b last:border-0 py-3 text-sm hover:bg-gray-50 text-left px-2 rounded-lg">
                  <div>
                    <div className="font-medium">{t.type} — {t.name}</div>
                    <div className="text-xs text-gray-500">{t.from} • {t.date ? new Date(t.date).toLocaleString() : 'No date'}</div>
                  </div>
                  <div className="font-bold">₦{Number(t.amount || 0).toLocaleString()}</div>
                </button>
              )) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No transactions yet. Payments to {bankDetails.bankName} {bankDetails.accountNumber} will show here automatically.</div>}
            </div>
          )}

          {activeMenu === 'ads' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">📢 Ads</h3>
              <p className="text-xs text-gray-500 mb-1">Approving puts an ad LIVE on the home page (visitors too) and every user dashboard.</p>
              <p className="text-xs text-gray-500 mb-4">🖼 Tap any photo or video below to preview it <b>full screen</b> — closing the preview always stops the video (no ghost sound 🔇). ⌛ Expired ads stay listed <b>24 hours</b>, then clear themselves automatically (the advertiser keeps their analytics).</p>

              {/* sub-tabs: pending approval / live / expired */}
              <div className="flex flex-wrap gap-2 mb-5">
                {[['pending', '⏳ Pending approval', pendingAds.length], ['live', '🟢 Live', liveAds.length], ['expired', `⌛ Expired`, expiredAds.length]].map(([k, label, n]) => (
                  <button key={k} onClick={() => setAdsTab(k)}
                    className={`text-[11px] font-extrabold px-3.5 py-2 rounded-full border transition-all ${adsTab === k ? 'bg-black text-white border-black shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {label} <span className={adsTab === k ? 'text-white/70' : 'text-gray-400'}>· {n}</span>
                  </button>
                ))}
              </div>

              {/* ===== ⏳ PENDING APPROVAL ===== */}
              {adsTab === 'pending' && (
                pendingAds.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No pending ad requests right now. 🎉</div>
                ) : pendingAds.map(a => (
                  <div key={a.id} className="border rounded-xl p-4 mb-3">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{a.business_name || 'Business'} <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-1">PENDING</span> <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">⏱ {Number(a.duration_days) || '?'} day(s) · ₦{Number(a.price || 0).toLocaleString()}</span></div>
                        <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">{a.description || '—'}</div>
                        <div className="text-[11px] text-gray-400 mt-1">{[a.contact || a.phone, a.whatsapp ? `WhatsApp: ${a.whatsapp}` : '', a.website, a.submitter_email].filter(Boolean).join(' • ')}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">📅 Submitted: {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</div>
                        {a.payment_receipt_url ? (
                          <button onClick={() => setReceiptView({ type: 'Ad payment', name: a.business_name, from: a.submitter_email, date: a.receipt_uploaded_at || a.submitted_at, amount: a.price, receipt: a.payment_receipt_url })} className="mt-2 flex items-center gap-2" title="Tap to view the full receipt">
                            <img src={a.payment_receipt_url} alt="payment receipt" className="w-14 h-14 rounded-lg object-cover border-2 border-emerald-300" />
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">🧾 Receipt uploaded{a.receipt_uploaded_at ? ` — ${new Date(a.receipt_uploaded_at).toLocaleDateString()}` : ''} · tap to view</span>
                          </button>
                        ) : (
                          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2 inline-block">⚠ No payment receipt yet — they may still be about to pay. Approving early is free-for-them.</p>
                        )}
                        <AdThumbs ad={a} onOpen={(media, i) => openMedia(media, i, a.business_name || 'Ad media')} />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button disabled={busy} onClick={() => reviewAd(a, true)} className="bg-black hover:bg-gray-800 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve → Go Live</button>
                        <button disabled={busy} onClick={() => reviewAd(a, false)} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">Decline</button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* ===== 🟢 LIVE ===== */}
              {adsTab === 'live' && (
                liveAds.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No live ads right now.</div>
                ) : liveAds.map(a => {
                  const left = a.expires_at ? Math.max(0, Math.ceil((new Date(a.expires_at).getTime() - Date.now()) / 86400000)) : null;
                  return (
                    <div key={a.id} className="border rounded-xl p-4 mb-3">
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{a.business_name || 'Business'} <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-1">🟢 LIVE</span> <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">₦{Number(a.price || 0).toLocaleString()} · {a.duration_days || '?'}d plan</span></div>
                          <div className="text-[11px] text-gray-400 mt-1">{[a.contact || a.phone, a.website, a.submitter_email].filter(Boolean).join(' • ')}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {a.approved_at ? `Went live ${new Date(a.approved_at).toLocaleDateString()}` : ''}
                            {a.expires_at ? ` · Ends ${new Date(a.expires_at).toLocaleDateString()}${left !== null ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}` : ''}
                          </div>
                          <AdThumbs ad={a} onOpen={(media, i) => openMedia(media, i, a.business_name || 'Ad media')} />
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button onClick={() => setAdStatsFor(a)} className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full hover:bg-violet-100">📊 Analytics</button>
                          <button disabled={busy} onClick={() => reviewAd(a, false)} className="text-[11px] text-red-500 border border-red-200 px-3 py-1.5 rounded-full disabled:opacity-60">Take Down</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* ===== ⌛ EXPIRED (visible 24h, then auto-clears) ===== */}
              {adsTab === 'expired' && (
                expiredAds.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No recently-expired ads. When a live ad's paid days finish it shows here for 24 hours, then clears itself automatically.</div>
                ) : expiredAds.map(a => {
                  const sinceEnd = Date.now() - new Date(a.expires_at).getTime();
                  const hoursLeft = Math.max(0, Math.ceil((86400000 - sinceEnd) / 3600000));
                  return (
                    <div key={a.id} className="border rounded-xl p-4 mb-3 bg-gray-50/60">
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{a.business_name || 'Business'} <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full ml-1">⌛ EXPIRED — off the site</span> <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">₦{Number(a.price || 0).toLocaleString()} · {a.duration_days || '?'}d plan</span></div>
                          <div className="text-[11px] text-gray-400 mt-1">{[a.contact || a.phone, a.website, a.submitter_email].filter(Boolean).join(' • ')}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">Ended {a.expires_at ? new Date(a.expires_at).toLocaleString() : '—'} · 🧹 clears from this list in ~{hoursLeft}h</div>
                          <AdThumbs ad={a} onOpen={(media, i) => openMedia(media, i, a.business_name || 'Ad media')} />
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button onClick={() => setAdStatsFor(a)} className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full hover:bg-violet-100">📊 Analytics</button>
                          <button disabled={busy} onClick={() => archiveAd(a)} className="text-[11px] text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full disabled:opacity-60" title="Remove from this list now (the advertiser keeps their analytics)">🗑 Clear now</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 🏪 BUSINESSES — a business goes PUBLIC only after you approve it here */}
          {activeMenu === 'businesses' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">🏪 Businesses</h3>
              <p className="text-xs text-gray-500 mb-4">A business profile is <b>visible to the public only after you approve it here</b> — until then its page, search result and profile links show &quot;under review&quot; to everyone except the advertiser (they can still post items). Hiding pulls it back instantly; the advertiser keeps everything.</p>

              <div className="flex flex-wrap gap-2 mb-5">
                {[['pending', '⏳ Pending review', bizPending.length], ['approved', '🟢 Public', bizApproved.length], ['hidden', '🙈 Hidden', bizHidden.length]].map(([k, label, n]) => (
                  <button key={k} onClick={() => setBizTab(k)}
                    className={`text-[11px] font-extrabold px-3.5 py-2 rounded-full border transition-all ${bizTab === k ? 'bg-black text-white border-black shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {label} <span className={bizTab === k ? 'text-white/70' : 'text-gray-400'}>· {n}</span>
                  </button>
                ))}
              </div>

              {(() => {
                const list = bizTab === 'pending' ? bizPending : bizTab === 'approved' ? bizApproved : bizHidden;
                if (!list.length) return (
                  <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">
                    {bizTab === 'pending' ? 'No businesses waiting for review. 🎉' : bizTab === 'approved' ? 'No public businesses yet — approve one from Pending review.' : 'Nothing hidden right now.'}
                  </div>
                );
                return list.map(a => {
                  const adChip = a.status === 'approved'
                    ? (adIsExpired(a) ? ['⌛ ad expired', 'bg-gray-100 text-gray-500'] : ['🟢 ad live', 'bg-emerald-100 text-emerald-700'])
                    : a.status === 'pending'
                      ? (a.payment_receipt_url ? ['⏳ ad payment in review', 'bg-blue-100 text-blue-700'] : ['💾 ad awaiting payment', 'bg-amber-100 text-amber-700'])
                      : a.status === 'archived' ? ['⌛ ad ended', 'bg-gray-100 text-gray-500'] : [a.status, 'bg-gray-100 text-gray-500'];
                  return (
                    <div key={a.id} className="border rounded-xl p-4 mb-3">
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {a.business_name || 'Business'}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ml-1 ${bizTab === 'approved' ? 'bg-emerald-100 text-emerald-700' : bizTab === 'hidden' ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                              {bizTab === 'approved' ? '🟢 PUBLIC' : bizTab === 'hidden' ? '🙈 HIDDEN' : '⏳ BUSINESS REVIEW'}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ml-1 ${adChip[1]}`}>{adChip[0]}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">{(a.description || '—').slice(0, 220)}{(a.description || '').length > 220 ? '…' : ''}</div>
                          <div className="text-[11px] text-gray-400 mt-1">{[a.submitter_email, a.contact || a.phone, a.website].filter(Boolean).join(' • ')}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">📅 {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'} · 📸 {adsMediaOf(a).length} media item(s)</div>
                          <AdThumbs ad={a} onOpen={(media, i) => openMedia(media, i, a.business_name || 'Business media')} />
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {bizTab !== 'approved' && (
                            <button disabled={busy} onClick={() => reviewBiz(a, 'approved')} className="bg-black hover:bg-gray-800 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve → Public</button>
                          )}
                          {bizTab === 'approved' && (
                            <button disabled={busy} onClick={() => reviewBiz(a, 'hidden')} className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">🙈 Hide from public</button>
                          )}
                          {bizTab === 'pending' && (
                            <button disabled={busy} onClick={() => reviewBiz(a, 'hidden')} className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">🙈 Hide</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* 💬 SUPPORT CHATS — users message you here; the bot replies whenever you're offline */}
          {activeMenu === 'support' && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h3 className="font-bold">💬 Support Chats {supportThreads.filter(t => !t.owner_read).length > 0 && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full align-middle">{supportThreads.filter(t => !t.owner_read).length} new</span>}</h3>
                <button disabled={busy} onClick={toggleOnline} className={`text-xs font-bold px-4 py-2 rounded-full border transition-colors disabled:opacity-60 ${ownerIsOnline ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                  {ownerIsOnline ? '🟢 You are ONLINE (tap to go offline)' : '💤 You are OFFLINE (tap to go online)'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Users tap the pinned <b>PayRound Support</b> chat on the user site. While you are <b>OFFLINE</b>, the 🤖 <b>PayRound Chat Bot</b> answers instantly and urges them to chat you on WhatsApp for faster replies. Switch yourself ONLINE when you're around to reply personally — the bot then stays quiet.
              </p>
              {!activeSupport ? (
                supportThreads.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No support chats yet. They appear here the moment a user messages PayRound Support from the user site.</div>
                ) : (
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {supportThreads.map(t => (
                      <button key={t.id} onClick={() => openSupportThread(t)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                        <span className="w-10 h-10 rounded-full bg-gray-900 text-white font-bold flex items-center justify-center text-sm shrink-0">{(t.user_name || t.user_email || 'U').charAt(0).toUpperCase()}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <span className="truncate">{t.user_name || t.user_email}</span>
                            {!t.owner_read && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full shrink-0">NEW</span>}
                            <span className="ml-auto text-[10px] font-normal text-gray-400 shrink-0">{t.last_at ? new Date(t.last_at).toLocaleString() : ''}</span>
                          </span>
                          <span className="block text-xs text-gray-500 truncate">{t.last_message || '—'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-50">
                    <button onClick={() => { setActiveSupport(null); setSupportMsgs([]); setSupProfile(null); loadData(); }} className="text-xs font-bold text-gray-600 border border-gray-200 bg-white px-3 py-1 rounded-full">← All chats</button>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{activeSupport.user_name || activeSupport.user_email}</p>
                      <p className="text-[10px] text-gray-400 truncate">{activeSupport.user_email}</p>
                    </div>
                    <button disabled={busy} onClick={viewSupportProfileFull} className="ml-auto text-[11px] font-bold border border-gray-300 bg-white px-3 py-1.5 rounded-full hover:bg-gray-100 shrink-0 disabled:opacity-60">👁 Full Profile</button>
                  </div>

                  {/* 👤 PROFILE PEEK — who you're chatting with, visible the whole time */}
                  {(supProfileLoading || supProfile) && (
                    <div className="border-b bg-emerald-50/50 px-4 py-2.5">
                      {supProfileLoading ? (
                        <p className="text-[11px] text-gray-400 animate-pulse font-semibold">Loading this user's profile…</p>
                      ) : !supProfile?.user ? (
                        <p className="text-[11px] text-amber-700 font-semibold">⚠️ No registered account found for <b>{activeSupport.user_email}</b> — maybe they typed a different email. You can still reply normally.</p>
                      ) : (
                        <>
                          <button onClick={() => setShowSupProfile(v => !v)} className="w-full flex items-center gap-2 text-left">
                            <span className="text-[11px] font-bold text-emerald-900">👤 Chatting with — user profile</span>
                            <span className="ml-auto text-[10px] text-gray-400 font-semibold">{showSupProfile ? 'hide ▲' : 'show ▼'}</span>
                          </button>
                          {showSupProfile && (() => { const u = supProfile.user; return (
                            <div className="mt-2 flex items-start gap-3">
                              {u.profile_pic ? (
                                <img src={u.profile_pic} alt="" onClick={() => setZoomImg(u.profile_pic)} className="w-12 h-12 rounded-full object-cover border cursor-zoom-in shrink-0" />
                              ) : (
                                <span className="w-12 h-12 rounded-full bg-gray-900 text-white font-bold flex items-center justify-center text-sm shrink-0">{(u.name || u.email || 'U').charAt(0).toUpperCase()}</span>
                              )}
                              <div className="flex-1 min-w-0 text-[11px] text-gray-600 space-y-0.5">
                                <p className="font-bold text-gray-900 text-xs flex items-center gap-1 flex-wrap">{u.name || '—'} {u.is_verified && <BlueBadge />} {u.is_frozen && <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-bold">🧊 frozen</span>}</p>
                                <p className="truncate">📧 {u.email}{u.phone ? ` · 📞 ${u.phone}` : ' · 📞 —'}</p>
                                <p>🗓 Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} · 👥 member of {supProfile.memberOf} group{supProfile.memberOf === 1 ? '' : 's'}{supProfile.adminOf > 0 ? ` · 👑 admin of ${supProfile.adminOf}` : ''}</p>
                                {u.bank_name && <p className="truncate">🏦 {u.bank_name} · {u.account_number || '—'} · {u.account_name || '—'}</p>}
                                <p className="text-gray-400">✔ approved: {(u.is_approved || u.approval_status === 'approved') ? 'yes' : 'no'} · 🎁 referral balances are shown in Referral Activity{u.occupation ? ` · 💼 ${u.occupation}` : ''}</p>
                              </div>
                            </div>
                          ); })()}
                        </>
                      )}
                    </div>
                  )}
                  <div className="max-h-96 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50/50">
                    {supportMsgs.map(m => {
                      const ownerMsg = m.sender_type === 'owner';
                      const botMsg = m.sender_type === 'bot';
                      return (
                        <div key={m.id} className={`flex ${ownerMsg || botMsg ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${ownerMsg ? 'bg-black text-white rounded-br-md' : botMsg ? 'bg-amber-50 border border-amber-300 text-amber-900 rounded-br-md' : 'bg-white border text-gray-900 rounded-bl-md'}`}>
                            {botMsg && <p className="text-[9px] font-bold text-amber-600 mb-0.5">🤖 AUTO-REPLY (bot answered because you were offline)</p>}
                            <p className="whitespace-pre-line break-words">{m.body}</p>
                            <p className={`text-[9px] mt-0.5 ${ownerMsg ? 'text-gray-400 text-right' : 'text-gray-400'}`}>{m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-3 border-t">
                    <input value={supReply} onChange={e => setSupReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendSupportReply(); } }} placeholder="Reply to this user… (they get a notification)" maxLength={1000} className="flex-1 px-4 py-2.5 border rounded-full text-sm" />
                    <button disabled={supBusy || !supReply.trim()} onClick={sendSupportReply} className="bg-black text-white text-xs font-bold px-5 py-2.5 rounded-full disabled:opacity-50">{supBusy ? '…' : 'Send'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. BANK DETAILS */}
          {activeMenu === 'bank' && (
            <div className="bg-white rounded-xl border p-6 max-w-xl">
              <h3 className="font-bold mb-1">Bank Details</h3>
              <p className="text-xs text-gray-500 mb-4">Shown to users whenever they need to pay you. Changes apply on the user site immediately.</p>
              <div className="space-y-3">
                <div><label className="text-xs font-bold">Bank Name</label><input value={bankDetails.bankName} onChange={e => setBankDetails({ ...bankDetails, bankName: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs font-bold">Account Number</label><input value={bankDetails.accountNumber} onChange={e => setBankDetails({ ...bankDetails, accountNumber: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs font-bold">Recipient's Name (Owner)</label><input value={bankDetails.accountName} onChange={e => setBankDetails({ ...bankDetails, accountName: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
              </div>
              <button disabled={busy} onClick={saveBankDetails} className="mt-4 bg-black hover:bg-gray-800 text-white px-6 py-2 rounded-xl text-xs font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save Bank Details'}</button>
            </div>
          )}

          {/* 8. REFERRAL ACTIVITY & PAYOUTS */}
          {activeMenu === 'referral' && (() => {
            const rs = referralDashboard.stats || EMPTY_REFERRAL_DASHBOARD.stats;
            const referrers = referralDashboard.referrers || [];
            const referralPayouts = referralDashboard.payouts || [];
            return (
              <div className="space-y-5">
                <div className="bg-white rounded-xl border p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-bold mb-1">Referral Activity & Payouts</h3>
                      <p className="text-xs text-gray-500 max-w-3xl">Every recorded relationship is shown, including people who have not qualified. A ₦500 reward appears only after PayRound approves the referred person's qualifying group. Cash payouts reduce available balance without changing historical earned claims.</p>
                    </div>
                    <button onClick={loadData} className="text-xs border rounded-full px-3 py-1.5 hover:bg-gray-50 font-medium">🔁 Refresh</button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      ['Relationships', rs.relationship_count, '👥'],
                      ['Unqualified', rs.unqualified_count, '⏳'],
                      ['Qualified, pending', rs.pending_count, '🕓'],
                      ['Rewards awarded', rs.awarded_count, '✅'],
                    ].map(([label, value, icon]) => (
                      <div key={label} className="rounded-xl border bg-gray-50 p-3">
                        <div className="text-lg">{icon}</div>
                        <div className="text-xl font-black mt-1">{Number(value || 0).toLocaleString()}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-3">
                    {[
                      ['Available now', rs.available_balance, 'text-emerald-700 bg-emerald-50 border-emerald-200'],
                      ['Lifetime earned', rs.lifetime_earned, 'text-purple-700 bg-purple-50 border-purple-200'],
                      ['Lifetime paid', rs.paid_out, 'text-blue-700 bg-blue-50 border-blue-200'],
                    ].map(([label, value, tone]) => (
                      <div key={label} className={`rounded-xl border p-3 ${tone}`}>
                        <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
                        <div className="text-2xl font-black mt-1">₦{Number(value || 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm">Referrers and relationship activity ({referrers.length})</h4>
                  {referrers.length > 0 ? referrers.map(r => {
                    const form = referralPayoutForms[r.user_id] || { amount: '', note: '' };
                    const available = Number(r.available_balance || 0);
                    return (
                      <div key={r.user_id} className="bg-white rounded-xl border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {r.profile_pic
                              ? <img src={r.profile_pic} alt="" className="w-11 h-11 rounded-full object-cover border" />
                              : <div className="w-11 h-11 rounded-full bg-purple-700 text-white flex items-center justify-center font-bold">{(r.name || r.email || 'U')[0].toUpperCase()}</div>}
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{r.name || 'PayRound member'} {r.eligible ? <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">eligible</span> : <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">not yet eligible</span>}</div>
                              <div className="text-[11px] text-gray-500 truncate">{r.email} · ID {String(r.user_id || '').slice(0, 8)}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">{r.referral_count || 0} referred · {r.unqualified_count || 0} unqualified · {r.pending_count || 0} pending · {r.awarded_count || 0} awarded</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-right">
                            <div><div className="text-[9px] text-gray-400">AVAILABLE</div><div className="text-sm font-black text-emerald-700">₦{available.toLocaleString()}</div></div>
                            <div><div className="text-[9px] text-gray-400">EARNED</div><div className="text-sm font-bold">₦{Number(r.lifetime_earned || 0).toLocaleString()}</div></div>
                            <div><div className="text-[9px] text-gray-400">PAID</div><div className="text-sm font-bold text-blue-700">₦{Number(r.paid_out || 0).toLocaleString()}</div></div>
                          </div>
                        </div>

                        <div className="mt-3 bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
                          <div className="text-[11px] font-bold text-emerald-900 mb-2">💸 Payout Referral Bonus</div>
                          <div className="grid sm:grid-cols-[minmax(120px,180px)_1fr_auto] gap-2">
                            <input type="number" inputMode="numeric" min="1" max={available || undefined} step="1" disabled={available <= 0 || referralBusyId === r.user_id}
                              value={form.amount ?? ''}
                              onChange={e => setReferralPayoutForms(prev => ({ ...prev, [r.user_id]: { ...form, amount: e.target.value, requestId: null } }))}
                              placeholder={available > 0 ? 'Amount in ₦' : 'No balance'}
                              className="border rounded-xl px-3 py-2 text-xs bg-white disabled:bg-gray-100" />
                            <input type="text" maxLength={500} disabled={available <= 0 || referralBusyId === r.user_id}
                              value={form.note ?? ''}
                              onChange={e => setReferralPayoutForms(prev => ({ ...prev, [r.user_id]: { ...form, note: e.target.value, requestId: null } }))}
                              placeholder="Optional payout note"
                              className="border rounded-xl px-3 py-2 text-xs bg-white disabled:bg-gray-100" />
                            <button disabled={available <= 0 || referralBusyId === r.user_id} onClick={() => payReferralBonus(r)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                              {referralBusyId === r.user_id ? 'Paying…' : 'Payout Referral Bonus'}
                            </button>
                          </div>
                          <p className="text-[10px] text-emerald-800 mt-1.5">Enter any whole-naira amount up to ₦{available.toLocaleString()}. Each payout is owner-authorized, audited and sent to the user's notifications.</p>
                        </div>

                        <div className="mt-3">
                          <div className="text-[10px] font-bold text-gray-500 mb-1">RELATIONSHIPS</div>
                          {(r.referrals || []).length > 0 ? (r.referrals || []).map(rel => {
                            const qualified = rel.status === 'pending' || rel.status === 'awarded';
                            const awarded = rel.status === 'awarded';
                            return (
                              <div key={rel.user_id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-xs">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{rel.name || 'PayRound member'} <span className="text-gray-400 font-normal">· {rel.email}</span></div>
                                  <div className="text-[10px] text-gray-400">Joined {rel.referred_at ? new Date(rel.referred_at).toLocaleString() : '—'}{rel.qualifying_group_name ? ` · qualifying group: ${rel.qualifying_group_name}` : ''}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${awarded ? 'bg-green-100 text-green-700' : qualified ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {awarded ? '₦500 awarded' : qualified ? '₦500 qualified — pending' : 'unqualified — no reward'}
                                  </span>
                                </div>
                              </div>
                            );
                          }) : <div className="text-xs text-gray-400 border-t py-2">No relationship rows.</div>}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="bg-white text-center py-10 border border-dashed rounded-xl text-sm text-gray-500">No referral relationships have been recorded yet.</div>
                  )}
                </div>

                <div className="bg-white rounded-xl border p-5">
                  <h4 className="font-bold text-sm mb-1">Payout history ({referralPayouts.length})</h4>
                  <p className="text-xs text-gray-500 mb-3">Permanent audit trail. Referral claims remain unchanged after payout.</p>
                  {referralPayouts.length > 0 ? referralPayouts.map(p => (
                    <div key={p.id} className="border-t first:border-t-0 py-3 flex flex-wrap items-start justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold">{p.user_name || p.user_email} · ₦{Number(p.amount || 0).toLocaleString()}</div>
                        <div className="text-gray-500">{p.user_email} · balance ₦{Number(p.balance_before || 0).toLocaleString()} → ₦{Number(p.balance_after || 0).toLocaleString()}</div>
                        {p.note && <div className="text-gray-600 mt-1">Note: {p.note}</div>}
                      </div>
                      <div className="text-right text-[10px] text-gray-400">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}<br />by {p.paid_by_email || 'PayRound owner'}</div>
                    </div>
                  )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No referral payouts recorded yet.</div>}
                </div>
              </div>
            );
          })()}

          {/* 9. SETTINGS */}
          {activeMenu === 'settings' && (
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-bold mb-1">Change Password</h3>
                <p className="text-xs text-gray-500 mb-4">Applies to both owner emails. Stored securely as a hash — never plain text. Login is required on every visit.</p>
                <div className="space-y-3">
                  <input value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} placeholder="Current Password" type="password" className="w-full border rounded-xl px-4 py-2 text-sm" />
                  <input value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })} placeholder="New Password (min 8 characters)" type="password" className="w-full border rounded-xl px-4 py-2 text-sm" />
                  <input value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="Confirm New Password" type="password" className="w-full border rounded-xl px-4 py-2 text-sm" />
                  <button disabled={busy} onClick={changePassword} className="w-full bg-black hover:bg-gray-800 text-white py-2 rounded-xl text-sm font-bold disabled:opacity-60">{busy ? 'Updating…' : 'Change Password'}</button>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  <div className="font-bold mb-1">Owner accounts</div>
                  {OWNER_EMAILS.map(e => <div key={e}>• {e}</div>)}
                </div>
              </div>

              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-bold mb-1">User Site Controls</h3>
                <p className="text-xs text-gray-500 mb-4">These values drive the user site. Leave a stat empty to show the real number.</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="text-xs font-bold">Group subscription plans (₦) — what creators pay</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div><label className="text-[10px] text-gray-500">1 Month</label><input type="number" min="0" value={siteControls.plan1m} onChange={e => setSiteControls({ ...siteControls, plan1m: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                      <div><label className="text-[10px] text-gray-500">6 Months</label><input type="number" min="0" value={siteControls.plan6m} onChange={e => setSiteControls({ ...siteControls, plan6m: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                      <div><label className="text-[10px] text-gray-500">12 Months</label><input type="number" min="0" value={siteControls.plan12m} onChange={e => setSiteControls({ ...siteControls, plan12m: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Creators pick a plan at group creation and upload the matching receipt. Currently ₦{Number(siteControls.plan1m).toLocaleString()} / ₦{Number(siteControls.plan6m).toLocaleString()} / ₦{Number(siteControls.plan12m).toLocaleString()}.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold">Ad slot prices (₦) — what advertisers pay</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div><label className="text-[10px] text-gray-500">1 Day</label><input type="number" min="0" value={siteControls.ad1day} onChange={e => setSiteControls({ ...siteControls, ad1day: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                      <div><label className="text-[10px] text-gray-500">1 Week</label><input type="number" min="0" value={siteControls.ad1week} onChange={e => setSiteControls({ ...siteControls, ad1week: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                      <div><label className="text-[10px] text-gray-500">1 Month</label><input type="number" min="0" value={siteControls.ad1month} onChange={e => setSiteControls({ ...siteControls, ad1month: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Advertisers pick 1 Day / 1 Week / 1 Month on the user site and pay you the matching amount. Currently ₦{Number(siteControls.ad1day).toLocaleString()} / ₦{Number(siteControls.ad1week).toLocaleString()} / ₦{Number(siteControls.ad1month).toLocaleString()}.</p>
                  </div>
                  <div className="border-t pt-3 text-xs font-bold text-gray-500">Homepage stats override (empty = real numbers)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs">Registered Users</label><input type="text" inputMode="text" value={siteControls.statsUsers} onChange={e => setSiteControls({ ...siteControls, statsUsers: e.target.value })} placeholder={String(usersList.length)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Active Groups</label><input type="text" inputMode="text" value={siteControls.statsGroups} onChange={e => setSiteControls({ ...siteControls, statsGroups: e.target.value })} placeholder={String(activeGroups.length)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Saved Through Platform (₦)</label><input type="text" inputMode="text" value={siteControls.statsSaved} onChange={e => setSiteControls({ ...siteControls, statsSaved: e.target.value })} placeholder="auto" className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Member Satisfaction (%)</label><input type="text" inputMode="text" value={siteControls.statsSatisfaction} onChange={e => setSiteControls({ ...siteControls, statsSatisfaction: e.target.value })} placeholder="auto" className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">💡 Type exactly how it should appear — <b>+</b> and <b>%</b> are allowed: e.g. <b>500+</b>, <b>₦2.5M+</b>, <b>98%</b>. Leave a box empty to use the real automatic number.</p>
                  <button disabled={busy} onClick={saveSiteControls} className="w-full bg-purple-700 hover:bg-purple-800 text-white py-2 rounded-xl text-sm font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save Site Controls'}</button>
                </div>
              </div>
            </div>
          )}

          {/* 10. ANNOUNCEMENTS */}
          {activeMenu === 'announcements' && (
            <div className="bg-white rounded-xl border p-6 max-w-2xl">
              <h3 className="font-bold mb-1">General Announcements</h3>
              <p className="text-xs text-gray-500 mb-4">Published announcements pop up at the top of the user site for ~10 seconds every time users load it, until you clear them here.</p>
              <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)} placeholder="Type your announcement…" className="w-full border rounded-xl p-4 text-sm" rows={4}></textarea>
              <div className="mt-3 border border-dashed rounded-xl p-6 text-center">
                <p className="text-xs text-gray-500">Optional image/video shown with the announcement.</p>
                <input type="file" accept="image/*,video/*" onChange={e => setAnnouncementFile(e.target.files?.[0] || null)} className="mt-2 text-xs" />
                {announcementFile && <p className="text-[11px] text-gray-400 mt-1">Selected: {announcementFile.name}</p>}
                {!announcementFile && announcementMedia && (
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-400 mb-1">Currently published media:</p>
                    <img src={announcementMedia} alt="announcement" className="max-h-32 mx-auto rounded-lg" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button disabled={busy} onClick={publishAnnouncement} className="bg-black hover:bg-gray-800 text-white px-6 py-2 rounded-xl text-xs font-bold disabled:opacity-60">{busy ? 'Publishing…' : 'Publish Announcement'}</button>
                <button disabled={busy} onClick={clearAnnouncement} className="border hover:bg-gray-50 px-6 py-2 rounded-xl text-xs disabled:opacity-60">Clear Announcement</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===== PROFILE MODAL (user or group) — review in detail before deciding ===== */}
      {profileView && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setProfileView(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {profileView.type === 'group' ? renderGroupProfile(profileView.data, profileView.request) : renderUserProfile(profileView.data, profileView.request)}
          </div>
        </div>
      )}

      {/* Photo lightbox — click any profile photo to expand it */}
      {zoomImg && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="expanded" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setZoomImg(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl leading-none flex items-center justify-center">×</button>
        </div>
      )}

      {/* Receipt modal */}
      {receiptView && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setReceiptView(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div>
                <div className="font-bold">{receiptView.type}</div>
                <div className="text-xs text-gray-500">{receiptView.name} • {receiptView.from} • {receiptView.date ? new Date(receiptView.date).toLocaleString() : ''}</div>
              </div>
              <button onClick={() => setReceiptView(null)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Close</button>
            </div>
            <div className="text-sm font-bold mb-2">₦{Number(receiptView.amount || 0).toLocaleString()}</div>
            {receiptView.receipt
              ? <img src={receiptView.receipt} alt="Transaction receipt" className="w-full rounded-xl border" />
              : <div className="text-center text-gray-500 border border-dashed rounded-xl py-10 text-sm">No receipt image attached.</div>}
          </div>
        </div>
      )}

      {/* 🔍 FULL-SCREEN ad media preview — unmounting it kills any playing video instantly */}
      {mediaView && <MediaLightbox view={mediaView} onClose={() => setMediaView(null)} onNav={navMedia} />}
      {/* 📊 per-ad analytics */}
      {adStatsFor && <OwnerAdStats ad={adStatsFor} onClose={() => setAdStatsFor(null)} />}
    </div>
  );

  /* ---------- PROFILE MODAL: GROUP ---------- */
  function renderGroupProfile(g, request) {
    const gMembers = groupMembers(g.id);
    const ratings = groupRatings(g.id);
    const isPending = g.status === 'pending_owner';
    return (
      <div>
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3">
            {g.avatar_url
              ? <img src={g.avatar_url} alt={g.name} className="w-14 h-14 rounded-2xl object-cover border shadow-sm" />
              : <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-sm" style={{ background: g.color || '#7C3AED' }}>{(g.name || 'G')[0].toUpperCase()}</div>}
            <div>
              <h3 className="font-bold text-lg">{g.name} {g.is_verified && <BlueBadge />} <span className="text-sm">{badgeEmoji(g.badge_tier)}</span></h3>
              <div className="text-[11px] text-purple-700 font-mono font-bold">Group ID: {g.id}</div>
            </div>
          </div>
          <button onClick={() => setProfileView(null)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Close</button>
        </div>

        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
          <span className={`px-2 py-0.5 rounded-full ${g.status === 'active' ? 'bg-green-100 text-green-700' : isPending ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>status: {g.status}</span>
          {g.is_verified && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">verified</span>}
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">badge: {g.badge_tier || 'Bronze'}</span>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-4">
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">GROUP DETAILS</div>
            {infoRow('Amount', `₦${Number(g.amount).toLocaleString()} ${String(g.frequency || '').toLowerCase() === 'custom' ? `every ${g.frequency_days || '?'} days` : (g.frequency || '')}`)}
            {Number(g.payout_amount) > 0
              ? infoRow('Payout per spot', `₦${Number(g.payout_amount).toLocaleString()} (admin interest ≈ ₦${(((Number(g.amount) || 0) * (parseInt(g.max_members, 10) || 0)) - Number(g.payout_amount)).toLocaleString()} / round)`)
              : infoRow('Payout per spot', `Full pot ₦${((Number(g.amount) || 0) * (parseInt(g.max_members, 10) || 0)).toLocaleString()}`)}
            {g.plan_months ? infoRow('Plan', `${g.plan_months} month${g.plan_months > 1 ? 's' : ''} — ₦${Number(g.plan_price || 0).toLocaleString()}`) : null}
            {g.expiry_at ? infoRow('Plan expires', new Date(g.expiry_at).toLocaleDateString()) : null}
            {infoRow('Max members', g.max_members)}
            {infoRow('Members (approved)', gMembers.length)}
            {infoRow('Color', <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block border" style={{ background: g.color }} /> {g.color}</span>)}
            {infoRow('Rating', <span><Stars n={Math.round(avgRating(g.id))} /> {avgRating(g.id).toFixed(1)} ({ratings.length})</span>)}
            {infoRow('Created', g.created_at ? new Date(g.created_at).toLocaleDateString() : '—')}
            {g.description && <div className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg p-2"><span className="font-bold">About:</span> {g.description}</div>}
            {Array.isArray(g.rules) && g.rules.length > 0 && <div className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg p-2"><span className="font-bold">Rules:</span> {g.rules.join(' • ')}</div>}
            {g.rejection_reason && <div className="text-xs text-red-600 mt-2">Decline reason: {g.rejection_reason}</div>}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">ADMIN</div>
            {infoRow('Name', g.admin_name)}
            {infoRow('Email', g.admin_email)}
            <div className="text-[11px] text-gray-400 mt-1 mb-3">Everyone can see the group admin. Admins can also join other groups as members. Group announcements are controlled by the admin only; admins must review a member's profile before approving them.</div>

            <div className="text-xs font-bold text-gray-500 mb-1">KYC & PAYMENT EVIDENCE</div>
            <div className="flex flex-wrap gap-2">
              {g.selfie_url
                ? <img src={g.selfie_url} alt="selfie" onClick={() => setZoomImg(g.selfie_url)} title="Tap to expand" className="w-16 h-16 rounded-lg border object-cover hover:opacity-80 cursor-zoom-in" />
                : <span className="text-[10px] text-gray-400 border border-dashed rounded-lg px-2 py-3">No selfie</span>}
              {g.id_url
                ? <img src={g.id_url} alt={`ID (${g.id_type || 'ID'})`} onClick={() => setZoomImg(g.id_url)} title="Tap to expand" className="w-16 h-16 rounded-lg border object-cover hover:opacity-80 cursor-zoom-in" />
                : <span className="text-[10px] text-gray-400 border border-dashed rounded-lg px-2 py-3">No ID</span>}
              {g.creation_receipt_url
                ? <img src={g.creation_receipt_url} alt="creation receipt" onClick={() => setZoomImg(g.creation_receipt_url)} title="Tap to expand" className="w-16 h-16 rounded-lg border object-cover hover:opacity-80 cursor-zoom-in" />
                : <span className="text-[10px] text-gray-400 border border-dashed rounded-lg px-2 py-3">No receipt</span>}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Selfie • {g.id_type || 'ID'} • ₦5,000 payment receipt (click to enlarge)</div>
          </div>
        </div>

        {/* Members */}
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-bold text-gray-500 mb-1">MEMBERS ({gMembers.length}) — visible in full to group members only</div>
          {gMembers.length > 0 ? gMembers.map(m => <div key={m.id} className="text-xs text-gray-600 border-b last:border-0 py-1">{m.member_name || m.member_email}</div>)
            : <div className="text-xs text-gray-400">No approved members recorded yet.</div>}
        </div>

        {/* Ratings & reviews */}
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-bold text-gray-500 mb-2">⭐ RATINGS & REVIEWS ({ratings.length}) — 1–5 stars, visible to everyone</div>
          <div className="max-h-40 overflow-y-auto space-y-2">
            {ratings.length > 0 ? ratings.map(r => (
              <div key={r.id} className="border rounded-xl p-2.5 text-xs">
                <div className="flex justify-between"><span className="font-medium">{r.reviewer_name || r.reviewer_email}</span><Stars n={r.rating || 0} /></div>
                {r.review && <p className="text-gray-600 mt-0.5">{r.review}</p>}
                <div className="text-[10px] text-gray-400 mt-0.5">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
              </div>
            )) : <div className="text-xs text-gray-400 border border-dashed rounded-xl p-4 text-center">No reviews yet for this group.</div>}
          </div>
        </div>

        {/* Blue check — owner only (separate from tier badges, nothing is automatic) */}
        {!isPending && (
          <div className="mt-4 border-t pt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">🔵 Blue Check (only you can give this):</span>
            {!g.is_verified ? (
              <button disabled={busy} onClick={() => verifyGroupCheck(g, true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">🔵 Add Blue Check</button>
            ) : (
              <button disabled={busy} onClick={() => verifyGroupCheck(g, false)} className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 py-1 rounded-full text-xs disabled:opacity-60">✖ Remove Blue Check</button>
            )}
          </div>
        )}

        {/* Badge tiers — owner only (each tier shows as a colored check mark) */}
        {!isPending && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Tier badge (shows as a colored check mark):</span>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'bronze')} className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60 tier-btn-emboss">🥉 Bronze — Tier 1</button>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'silver')} className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60 tier-btn-emboss">🥈 Silver — Tier 2</button>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'gold')} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60 tier-btn-emboss">🥇 Gold — Tier 3</button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 border-t pt-4 flex flex-wrap gap-2">
          {isPending && (
            <>
              <button disabled={busy} onClick={() => approveGroup(g)} className="bg-black hover:bg-gray-800 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve Group → Go Live</button>
              <button disabled={busy} onClick={() => declineGroup(g)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline Group</button>
            </>
          )}
          {request && request.status === 'pending' && (
            <>
              <button disabled={busy} onClick={() => reviewVerification(request, true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Verify This Group</button>
              <button disabled={busy} onClick={() => reviewVerification(request, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline Request</button>
            </>
          )}
          <button disabled={busy} onClick={() => freezeGroup(g, !g.is_frozen)}
            className={g.is_frozen
              ? "bg-sky-600 hover:bg-sky-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60"
              : "border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-60"}>
            {g.is_frozen ? '🔥 Unfreeze Group' : '❄️ Freeze Group'}
          </button>
        </div>
        <div className="text-[10px] text-gray-400 mt-2">❄️ Freezing hides the group from search and pauses joins, payments and chat on the user site until you unfreeze.</div>
      </div>
    );
  }

  /* ---------- PROFILE MODAL: USER ---------- */
  function renderUserProfile(u, request) {
    const adminGs = userAdminGroups(u);
    const memberGs = userMemberGroups(u);
    const referralAccount = referralAccountFor(u);
    const refs = referredUsers(u);
    const referredByAccount = (referralDashboard.referrers || []).find(r => (r.referrals || []).some(rel => rel.user_id === u.id));
    const revs = userReviews(u);
    const approved = isUserApproved(u);
    const declined = isUserDeclined(u);
    return (
      <div>
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3">
            {u.profile_pic
              ? <img src={u.profile_pic} alt={u.name} onClick={() => setZoomImg(u.profile_pic)} title="Click to expand" className="w-14 h-14 rounded-full object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
              : <div className="w-14 h-14 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-sm">{(u.name || u.email || 'U')[0].toUpperCase()}</div>}
            <div>
              <h3 className="font-bold text-lg">{u.name || '—'} {u.is_verified && <BlueBadge />}</h3>
              <div className="text-[11px] text-purple-700 font-mono font-bold">Unique ID: {refId(u)}</div>
            </div>
          </div>
          <button onClick={() => setProfileView(null)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Close</button>
        </div>

        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
          <span className={`px-2 py-0.5 rounded-full ${approved ? 'bg-green-100 text-green-700' : declined ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{approved ? 'approved user' : declined ? 'declined' : 'pending approval'}</span>
          {u.is_verified && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">🔵 blue verified</span>}
          {u.pending_profile_pic && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">📷 photo change pending</span>}
        </div>

        {/* Profile photo change request — owner approval required */}
        {u.pending_profile_pic && (
          <div className="mt-4 border border-purple-300 bg-purple-50/60 rounded-xl p-3">
            <div className="text-xs font-bold text-purple-800 mb-2">📷 PHOTO CHANGE REQUEST — the user uploaded a new profile photo</div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                {u.profile_pic
                  ? <img src={u.profile_pic} alt="current" onClick={() => setZoomImg(u.profile_pic)} title="Click to expand" className="w-16 h-16 rounded-full object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
                  : <div className="w-16 h-16 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-sm">{(u.name || u.email || 'U')[0].toUpperCase()}</div>}
                <div className="text-[10px] text-gray-500 mt-1">Current</div>
              </div>
              <div className="text-purple-500 font-bold text-lg">→</div>
              <div className="text-center">
                <img src={u.pending_profile_pic} alt="new" onClick={() => setZoomImg(u.pending_profile_pic)} title="Click to expand" className="w-16 h-16 rounded-full object-cover border-2 border-purple-400 shadow-sm cursor-zoom-in hover:opacity-90" />
                <div className="text-[10px] text-purple-700 font-bold mt-1">New photo</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button disabled={busy} onClick={() => reviewUserPhoto(u, true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve Photo</button>
              <button disabled={busy} onClick={() => reviewUserPhoto(u, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline Photo</button>
            </div>
          </div>
        )}

        {/* KYC document comparison — profile photo vs submitted ID photos (click to expand) */}
        <div className="mt-4 border rounded-xl p-3">
          <div className="text-xs font-bold text-gray-500 mb-2">🪪 IDENTITY CHECK — compare the profile photo with any ID photos on file (signup needs only a selfie; group creators submit ID with their group)</div>
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-center">
              {u.profile_pic
                ? <img src={u.profile_pic} alt="profile" onClick={() => setZoomImg(u.profile_pic)} title="Click to expand" className="w-16 h-16 rounded-xl object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
                : <div className="w-16 h-16 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-sm">{(u.name || u.email || 'U')[0].toUpperCase()}</div>}
              <div className="text-[10px] text-gray-500 mt-1">Profile photo</div>
            </div>
            <div className="text-center">
              {u.id_front_url
                ? <img src={u.id_front_url} alt="ID front" onClick={() => setZoomImg(u.id_front_url)} title="Click to expand" className="w-24 h-16 rounded-xl object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
                : <div className="w-24 h-16 rounded-xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">No ID<br/>front</div>}
              <div className="text-[10px] text-gray-500 mt-1">ID — front</div>
            </div>
            <div className="text-center">
              {u.id_back_url
                ? <img src={u.id_back_url} alt="ID back" onClick={() => setZoomImg(u.id_back_url)} title="Click to expand" className="w-24 h-16 rounded-xl object-cover border shadow-sm cursor-zoom-in hover:opacity-90" />
                : <div className="w-24 h-16 rounded-xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">No ID<br/>back</div>}
              <div className="text-[10px] text-gray-500 mt-1">ID — back</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-4">
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">ACCOUNT DETAILS</div>
            {infoRow('Name', u.name)}
            {infoRow('Email', u.email)}
            {infoRow('Phone', u.phone || '—')}
            {infoRow('Role', u.role || 'member')}
            {infoRow('Joined', u.created_at ? new Date(u.created_at).toLocaleString() : '—')}
            {u.decline_reason && infoRow('Decline reason', u.decline_reason)}
            {referredByAccount && infoRow('Referred by', `${referredByAccount.name || referredByAccount.email} (${String(referredByAccount.user_id).slice(0, 8)})`)}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">REFERRAL</div>
            {infoRow('Referral link', <span className="text-[10px] break-all">https://{USER_REF}{refId(u)}</span>)}
            {infoRow('Users referred', refs.length)}
            {infoRow('Available balance', `₦${Number(referralAccount?.available_balance || 0).toLocaleString()}`)}
            {infoRow('Lifetime earned', `₦${Number(referralAccount?.lifetime_earned || 0).toLocaleString()}`)}
            {infoRow('Lifetime paid', `₦${Number(referralAccount?.paid_out || 0).toLocaleString()}`)}
            {infoRow('Qualified, pending', `₦${Number(referralAccount?.pending_count || 0) * 500}`)}
            <button onClick={() => { navigator.clipboard?.writeText(`https://${USER_REF}${refId(u)}`); setMsg('Referral link copied.'); }} className="mt-1 text-[11px] border rounded-full px-3 py-1 hover:bg-gray-50">Copy referral link</button>
          </div>
        </div>

        <div className="mt-4 border-t pt-3 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">ADMIN OF ({adminGs.length})</div>
            {adminGs.length > 0 ? adminGs.map(g => <div key={g.id} className="text-xs text-gray-600 py-1 border-b last:border-0">{g.name} <span className="text-gray-400">({g.status})</span></div>) : <div className="text-xs text-gray-400">Not an admin of any group.</div>}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">MEMBER OF ({memberGs.length})</div>
            {memberGs.length > 0 ? memberGs.map(m => { const g = groups.find(x => x.id === m.group_id); return <div key={m.id} className="text-xs text-gray-600 py-1 border-b last:border-0">{g?.name || m.group_id}</div>; }) : <div className="text-xs text-gray-400">Not a member of any group yet.</div>}
          </div>
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-bold text-gray-500 mb-1">REVIEWS FROM GROUP ADMINS ({revs.length})</div>
          <div className="max-h-36 overflow-y-auto space-y-1.5">
            {revs.length > 0 ? revs.map(r => (
              <div key={r.id} className="text-xs text-gray-600 border rounded-lg p-2">
                <span className="text-yellow-500">{'★'.repeat(r.rating || 0)}{'☆'.repeat(Math.max(0, 5 - (r.rating || 0)))}</span> {r.review} <span className="text-gray-400">— {r.admin_email} • {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
              </div>
            )) : <div className="text-xs text-gray-400 border border-dashed rounded-xl p-4 text-center">No reviews yet from group admins.</div>}
          </div>
        </div>

        <div className="mt-5 border-t pt-4 flex flex-wrap gap-2">
          {!approved && (
            <button disabled={busy} onClick={() => approveUser(u)} className="bg-black hover:bg-gray-800 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve User</button>
          )}
          {!declined && (
            <button disabled={busy} onClick={() => declineUser(u)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">✖ Decline User</button>
          )}
          {request && request.status === 'pending' && (
            <button disabled={busy} onClick={() => reviewVerification(request, true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Verify → 🔵 Blue Badge</button>
          )}
          {/* Quick verify / unverify — visible only to you (owner), works from ANY user profile */}
          {approved && !u.is_verified && (
            <button disabled={busy} onClick={() => verifyUserBadge(u, true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">🔵 Verify User</button>
          )}
          {approved && u.is_verified && (
            <button disabled={busy} onClick={() => verifyUserBadge(u, false)} className="bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">Remove Blue Badge</button>
          )}
          <button disabled={busy} onClick={() => freezeUser(u, !u.is_frozen)}
            className={u.is_frozen
              ? "bg-sky-600 hover:bg-sky-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60"
              : "border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-60"}>
            {u.is_frozen ? '🔥 Unfreeze User' : '❄️ Freeze User'}
          </button>
          <button disabled={busy} onClick={() => ownerDeleteUser(u)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">🗑 Delete Account Forever</button>
        </div>
        <div className="text-[10px] text-gray-400 mt-2">Approving activates the account. The 🔵 blue badge can be granted right here (only you see these buttons).</div>
      </div>
    );
  }
}
