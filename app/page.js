'use client';
import { useState, useEffect } from 'react';
import { supabase, OWNER_EMAILS, DEFAULT_OWNER_SETTINGS, OWNER_PASSWORD_HASH_FALLBACK } from '@/lib/supabase';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function currentWeekRange() {
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const s = start.toLocaleDateString('en-US', { month: 'short' });
  return start.getMonth() === end.getMonth()
    ? `${s} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`;
}

const USER_REF = 'payround-omega.vercel.app/signup?ref=';

const MENU = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'groups', icon: '👥', label: 'Groups' },
  { id: 'users', icon: '👤', label: 'Users' },
  { id: 'verification', icon: '✅', label: 'Verification' },
  { id: 'transactions', icon: '💳', label: 'Transactions' },
  { id: 'bank', icon: '🏦', label: 'Bank Details' },
  { id: 'referral', icon: '🎁', label: 'Referral Bonus' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'announcements', icon: '📢', label: 'Announcements' },
];

function Stars({ n }) {
  return <span className="text-yellow-500 tracking-tight">{'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}</span>;
}

export default function OwnerPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');

  // sub-buttons
  const [groupsSub, setGroupsSub] = useState('active');
  const [usersSub, setUsersSub] = useState('active');
  const [verifySub, setVerifySub] = useState('requests');

  // data
  const [groups, setGroups] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [members, setMembers] = useState([]);
  const [groupReviews, setGroupReviews] = useState([]);
  const [verifyRequests, setVerifyRequests] = useState([]);
  const [ads, setAds] = useState([]);

  // selections
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showReviews, setShowReviews] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [receiptView, setReceiptView] = useState(null);

  // settings/forms
  const [bankDetails, setBankDetails] = useState({ bankName: DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: DEFAULT_OWNER_SETTINGS.account_number, accountName: DEFAULT_OWNER_SETTINGS.account_name });
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementMedia, setAnnouncementMedia] = useState(null);
  const [announcementFile, setAnnouncementFile] = useState(null);
  const [pwHash, setPwHash] = useState(OWNER_PASSWORD_HASH_FALLBACK);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [siteControls, setSiteControls] = useState({ subscriptionMonths: 4, statsUsers: '', statsGroups: '', statsSaved: '', statsSatisfaction: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMenuClick = (menu) => {
    setActiveMenu(menu);
    setSelectedGroup(null); setSelectedUser(null); setShowReviews(false); setReceiptView(null);
    setMsg(''); setErr('');
    setSidebarOpen(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.from('owner_settings').select('*').eq('id', 1).single();
        if (s) {
          setBankDetails({ bankName: s.bank_name ?? DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: s.account_number ?? DEFAULT_OWNER_SETTINGS.account_number, accountName: s.account_name ?? DEFAULT_OWNER_SETTINGS.account_name });
          if (s.owner_password_hash) setPwHash(s.owner_password_hash);
          if (s.announcement_text) setAnnouncementText(s.announcement_text);
          if (s.announcement_media_url) setAnnouncementMedia(s.announcement_media_url);
          setSiteControls({
            subscriptionMonths: s.subscription_months ?? 4,
            statsUsers: s.stats_users_override ?? '',
            statsGroups: s.stats_groups_override ?? '',
            statsSaved: s.stats_saved_override ?? '',
            statsSatisfaction: s.stats_satisfaction_override ?? '',
          });
        }
      } catch {}
      const stored = localStorage.getItem('payround_owner_user');
      if (stored) { try { const u = JSON.parse(stored); if (OWNER_EMAILS.includes(u.email?.toLowerCase())) { setUser(u); setIsOwner(true); } } catch {} }
    })();
  }, []);

  useEffect(() => { if (isOwner) loadData(); }, [isOwner]);

  const loadData = async () => {
    const safe = async (q) => { try { const { data } = await q; return data || []; } catch { return []; } };
    setGroups(await safe(supabase.from('groups').select('*').order('created_at', { ascending: false })));
    setUsersList(await safe(supabase.from('users').select('*').order('created_at', { ascending: false })));
    setMembers(await safe(supabase.from('members').select('*')));
    setGroupReviews(await safe(supabase.from('group_reviews').select('*').order('created_at', { ascending: false })));
    setVerifyRequests(await safe(supabase.from('verification_requests').select('*').order('created_at', { ascending: false })));
    setAds(await safe(supabase.from('ads').select('*')));
  };

  const notify = async (type, groupId, message) => {
    try { await supabase.from('notifications').insert({ id: `${type}-${Date.now()}`, type, group_id: groupId || null, message }); } catch {}
  };

  /* ---------- AUTH ---------- */
  const handleLogin = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setErr('Access denied — owner accounts only.'); return; }
    setBusy(true);
    try {
      const hash = await sha256Hex(password);
      if (hash !== pwHash) { setErr('Invalid password.'); return; }
      const u = { email: em, name: 'PayRound Owner' };
      localStorage.setItem('payround_owner_user', JSON.stringify(u));
      setUser(u); setIsOwner(true);
    } catch { setErr('Login failed in this browser. Use HTTPS.'); }
    finally { setBusy(false); }
  };

  const handleLogout = async () => {
    try { await supabase.auth?.signOut?.(); } catch {}
    localStorage.removeItem('payround_owner_user');
    setUser(null); setIsOwner(false); setPassword(''); setMsg(''); setErr('');
    setSidebarOpen(false); setActiveMenu('dashboard');
  };

  /* ---------- ACTIONS ---------- */
  const approveGroup = async (g) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'active', is_verified: true }).eq('id', g.id);
      if (error) throw error;
      await notify('group_approved', g.id, `Group "${g.name}" approved and is now live.`);
      setMsg(`"${g.name}" approved — now live on the user site.`); loadData();
    } catch (e) { setErr(`Approve failed: ${e.message}`); }
    setBusy(false);
  };

  const rejectGroup = async (g) => {
    const reason = window.prompt(`Reason for rejecting "${g.name}" (shown to the group admin):`, 'Requirements not met');
    if (reason === null) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'rejected', rejection_reason: reason }).eq('id', g.id);
      if (error) throw error;
      await notify('group_rejected', g.id, `Group "${g.name}" was declined: ${reason}`);
      setMsg(`"${g.name}" rejected.`); loadData();
    } catch (e) { setErr(`Reject failed: ${e.message}`); }
    setBusy(false);
  };

  const verifyGroupBadge = async (g, tier) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ badge_tier: tier, is_verified: true }).eq('id', g.id);
      if (error) throw error;
      setMsg(`Badge for "${g.name}" updated to ${tier}.`);
      setSelectedGroup({ ...selectedGroup, badge_tier: tier, is_verified: true });
      loadData();
    } catch (e) { setErr(`Badge update failed: ${e.message}`); }
    setBusy(false);
  };

  const approveUser = async (u) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('users').update({ is_verified: true }).eq('id', u.id);
      if (error) throw error;
      await notify('user_approved', null, `User ${u.name || u.email} verified with blue badge.`);
      setMsg(`${u.name || u.email} approved — blue verification badge granted.`); loadData();
    } catch (e) { setErr(`Approve failed: ${e.message}. If it mentions "is_verified", run the migration SQL.`); }
    setBusy(false);
  };

  const reviewVerification = async (req, approve) => {
    setBusy(true);
    const verdict = approve ? 'approved' : 'declined';
    const reason = approve ? '' : (window.prompt('Reason for declining (optional):', 'Not eligible for verification') ?? '');
    if (!approve && reason === null) { setBusy(false); return; }
    try {
      const { error } = await supabase.from('verification_requests').update({ status: verdict, reviewed_at: new Date().toISOString(), decline_reason: reason || null }).eq('id', req.id);
      if (error) throw error;
      if (approve && req.group_id) {
        await supabase.from('groups').update({ is_verified: true }).eq('id', req.group_id);
      }
      await notify(approve ? 'verification_approved' : 'verification_declined', req.group_id || null,
        approve
          ? `Verification request for "${req.group_name || req.group_id}" has been approved.`
          : `Verification request for "${req.group_name || req.group_id}" was denied${reason ? `: ${reason}` : ' because it is not eligible for verification'}. You can re-apply after 7 days.`);
      setMsg(`Request ${verdict} — the group admin will see a notification on the user site.`);
      loadData();
    } catch (e) { setErr(`Review failed: ${e.message}. If it mentions "verification_requests", run the migration SQL.`); }
    setBusy(false);
  };

  const saveBankDetails = async () => {
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.from('owner_settings').update({
        bank_name: bankDetails.bankName.trim(),
        account_number: bankDetails.accountNumber.trim(),
        account_name: bankDetails.accountName.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setMsg('Bank details saved — visible on the user site immediately.');
    } catch (e) { setErr(`Save failed: ${e.message}`); }
    setBusy(false);
  };

  const saveSiteControls = async () => {
    setBusy(true); setErr('');
    const num = (v) => (v === '' || v === null ? null : Number(v));
    try {
      const { error } = await supabase.from('owner_settings').update({
        subscription_months: Number(siteControls.subscriptionMonths) || 4,
        stats_users_override: num(siteControls.statsUsers),
        stats_groups_override: num(siteControls.statsGroups),
        stats_saved_override: num(siteControls.statsSaved),
        stats_satisfaction_override: num(siteControls.statsSatisfaction),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setMsg('Site controls saved — the user site picks these up on next load.');
    } catch (e) { setErr(`Save failed: ${e.message}. If it mentions "stats_" or "subscription_months", run the migration SQL.`); }
    setBusy(false);
  };

  const publishAnnouncement = async () => {
    if (!announcementText.trim() && !announcementFile) { setErr('Type an announcement or attach media first.'); return; }
    setBusy(true); setErr('');
    let mediaUrl = announcementMedia;
    try {
      if (announcementFile && supabase.storage) {
        try {
          const path = `owner/${Date.now()}-${announcementFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
          const { error: upErr } = await supabase.storage.from('announcements').upload(path, announcementFile, { upsert: true });
          if (!upErr) mediaUrl = supabase.storage.from('announcements').getPublicUrl(path).data.publicUrl;
          else setErr(`Media upload skipped (${upErr.message}) — text still published. Create a public "announcements" storage bucket to enable media.`);
        } catch {}
      }
      const { error } = await supabase.from('owner_settings').update({
        announcement_text: announcementText.trim(),
        announcement_media_url: mediaUrl,
        announcement_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setAnnouncementMedia(mediaUrl); setAnnouncementFile(null);
      setMsg('Announcement published — it pops up at the top of the user site until you clear it.');
    } catch (e) { setErr(`Publish failed: ${e.message}. If it mentions "announcement_", run the migration SQL.`); }
    setBusy(false);
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
    } catch (e) { setErr(`Change failed: ${e.message}. If it mentions "owner_password_hash", run the migration SQL.`); }
    setBusy(false);
  };

  /* ---------- LOGIN ---------- */
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-purple-700 rounded-xl flex items-center justify-center mx-auto mb-3 text-white font-bold text-xl">P</div>
            <h1 className="text-xl font-bold">PayRound Owner</h1>
            <p className="text-xs text-gray-500 mt-1">Admin control panel — restricted access</p>
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
  const activeUsers = usersList.filter(u => u.is_verified);
  const pendingUsers = usersList.filter(u => !u.is_verified);
  const pendingVerify = verifyRequests.filter(r => r.status === 'pending');
  const reviewedVerify = verifyRequests.filter(r => r.status !== 'pending');
  const groupMembers = (gid) => members.filter(m => m.group_id === gid && m.status === 'approved');
  const groupRatings = (gid) => groupReviews.filter(r => r.group_id === gid);
  const avgRating = (gid) => { const rs = groupRatings(gid); return rs.length ? (rs.reduce((a, r) => a + (r.rating || 0), 0) / rs.length) : 0; };
  const refId = (u) => (u.id || '').slice(0, 8);
  const referredUsers = (u) => usersList.filter(x => x.referred_by && (x.referred_by === u.id || x.referred_by === refId(u)));
  const transactions = [
    ...groups.filter(g => g.creation_receipt_url).map(g => ({ id: `c-${g.id}`, type: 'Group creation fee', from: g.admin_email, name: g.name, amount: 5000, date: g.first_payment_at || g.created_at, receipt: g.creation_receipt_url })),
    ...groups.filter(g => g.renewal_receipt_url).map(g => ({ id: `r-${g.id}`, type: 'Group renewal', from: g.admin_email, name: g.name, amount: 5000, date: g.expiry_at || g.created_at, receipt: g.renewal_receipt_url })),
    ...ads.map(a => ({ id: `a-${a.id}`, type: 'Ad placement', from: a.submitter_email, name: a.business_name, amount: a.price, date: a.submitted_at, receipt: a.payment_receipt_url })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // users growth: registrations per day, last 14 days
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
  const growth = days.map(d => {
    const key = d.toDateString();
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, count: usersList.filter(u => u.created_at && new Date(u.created_at).toDateString() === key).length };
  });
  const maxGrowth = Math.max(1, ...growth.map(g => g.count));

  const title = activeMenu === 'dashboard' ? 'Dashboard Overview' : (MENU.find(m => m.id === activeMenu)?.label || 'Dashboard');

  const menuBtn = (m, badge) => (
    <button key={m.id} onClick={() => handleMenuClick(m.id)}
      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-150 border-b-2 ${activeMenu === m.id
        ? 'bg-purple-600 text-white border-purple-900 shadow-[0_4px_0_rgba(0,0,0,0.4)]'
        : 'text-white/70 border-black/30 bg-white/5 hover:bg-white/10 shadow-[0_4px_0_rgba(0,0,0,0.35)] active:shadow-none active:translate-y-[3px]'}`}>
      <span className="flex items-center gap-3">{m.icon} {m.label}</span>
      {badge > 0 ? <span className="bg-red-500 text-[10px] px-2 py-0.5 rounded-full shadow">{badge}</span> : <span>›</span>}
    </button>
  );

  const sidebar = (
    <aside className={`bg-gradient-to-b from-[#26224f] via-[#1e1b4b] to-[#141138] text-white flex flex-col h-full overflow-y-auto border-r-4 border-purple-500/40 shadow-[10px_0_30px_rgba(20,17,56,0.55)] ${sidebarOpen ? '' : ''}`}>
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center font-bold shadow-[0_3px_0_rgba(0,0,0,0.4)]">P</div>
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
        {menuBtn(MENU[3], pendingVerify.length)}
        {MENU.slice(4).map(m => menuBtn(m))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2">
        <div className="bg-purple-900/40 rounded-xl p-3 border-b-2 border-black/20 shadow-[0_4px_0_rgba(0,0,0,0.25)]">
          <div className="text-xs">{bankDetails.bankName} {bankDetails.accountNumber}</div>
          <div className="text-[10px] text-white/50 mt-1">{bankDetails.accountName} — shown to users at payment.</div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center justify-between px-3 py-3 text-sm rounded-xl text-white/80 bg-red-900/40 hover:bg-red-900/60 border-b-2 border-red-950 shadow-[0_4px_0_rgba(0,0,0,0.4)] active:shadow-none active:translate-y-[3px] transition-all">
          <span className="flex items-center gap-3">↩️ Log Out</span><span>›</span>
        </button>
        <div className="text-[9px] text-white/20 px-3 pt-1">Owner Dashboard v1.2</div>
      </div>
    </aside>
  );

  const subPills = (options, value, set) => (
    <div className="flex gap-2 bg-white p-1.5 rounded-full border w-fit shadow-sm">
      {options.map(o => (
        <button key={o.id} onClick={() => set(o.id)} className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${value === o.id ? 'bg-purple-700 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  );

  /* ---------- DASHBOARD ---------- */
  return (
    <div className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-[minmax(250px,20%)_1fr]">
      {/* Desktop: purple 3D tab always visible, top-to-bottom, 20% width. Mobile: slide-over */}
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
            <span className="text-[10px] md:text-xs bg-green-50 text-green-700 border px-2 md:px-3 py-1 rounded-full truncate max-w-[120px] md:max-w-none">{usersList.length} users • {user.email.split('@')[0]}</span>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm">{msg}</div>}
          {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{err}</div>}

          {/* 1. DASHBOARD */}
          {activeMenu === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Users Registered</div>
                  <div className="font-bold text-3xl mt-1">{usersList.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">{activeUsers.length} verified • {pendingUsers.length} pending</div>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Active Groups</div>
                  <div className="font-bold text-3xl mt-1">{activeGroups.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">Live on user site</div>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">Users Growth</h3>
                  <p className="text-[11px] text-gray-400 mb-4">Registrations with dates — last 14 days</p>
                  <div className="flex items-end gap-1.5 h-40">
                    {growth.map((g, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <span className="text-[9px] text-gray-500 font-bold">{g.count > 0 ? g.count : ''}</span>
                        <div className={`w-full rounded-t-md ${g.count > 0 ? 'bg-purple-600' : 'bg-purple-100'}`} style={{ height: `${Math.max(3, (g.count / maxGrowth) * 100)}%` }} title={`${g.label}: ${g.count} signups`} />
                        <span className="text-[8px] text-gray-400 truncate w-full text-center">{i % 2 === 0 ? g.label : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-4">Group Overview</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Active groups</span><span className="font-bold text-green-700">{activeGroups.length}</span></div>
                    <div className="flex justify-between"><span>Pending approval</span><span className="font-bold text-amber-600">{pendingGroups.length}</span></div>
                    <div className="flex justify-between"><span>Frozen</span><span className="font-bold text-blue-700">{frozenGroups.length}</span></div>
                    <div className="flex justify-between"><span>Rejected</span><span className="font-bold text-red-600">{groups.filter(g => g.status === 'rejected').length}</span></div>
                    <div className="flex justify-between border-t pt-2"><span>Total</span><span className="font-bold">{groups.length}</span></div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold mb-3">Active Groups</h3>
                {activeGroups.length > 0 ? activeGroups.map(g => (
                  <div key={g.id} className="flex justify-between items-center gap-3 border-b last:border-0 py-3 text-sm">
                    <div className="min-w-0"><span className="font-medium">{g.name}</span> <span className="text-xs text-gray-500 block sm:inline">ID: {g.id} • ₦{Number(g.amount).toLocaleString()} {g.frequency} • {groupMembers(g.id).length || g.max_members} members • <Stars n={Math.round(avgRating(g.id))} /> • Badge: {g.badge_tier || 'Bronze'}</span></div>
                    <button onClick={() => { setSelectedGroup(g); setShowReviews(false); }} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No active groups yet — groups appear here after you approve them in the Groups tab.</div>}
              </div>

              {selectedGroup && renderGroupProfile()}
            </>
          )}

          {/* 2. GROUPS */}
          {activeMenu === 'groups' && (
            <div className="space-y-4">
              {subPills([{ id: 'active', label: 'Active Groups', count: activeGroups.length }, { id: 'pending', label: 'Pending Approval', count: pendingGroups.length }], groupsSub, setGroupsSub)}

              {groupsSub === 'active' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">Active Groups</h3>
                  <p className="text-xs text-gray-500 mb-3">Approved by you and visible to users on the user site. Click one to see its profile, admin, members, rating and reviews.</p>
                  {activeGroups.map(g => (
                    <div key={g.id} className="border-b last:border-0 py-3 text-sm flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{g.name} <span className="text-xs text-gray-500">• ID: {g.id}</span></div>
                        <div className="text-xs text-gray-500">Admin: {g.admin_name || g.admin_email} • {groupMembers(g.id).length || g.max_members} members • <Stars n={Math.round(avgRating(g.id))} /> ({groupRatings(g.id).length} reviews) • Badge: {g.badge_tier || 'Bronze'}</div>
                      </div>
                      <button onClick={() => { setSelectedGroup(g); setShowReviews(false); }} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                    </div>
                  ))}
                  {activeGroups.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">No active groups yet.</div>}
                </div>
              )}

              {groupsSub === 'pending' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-1">Pending Groups</h3>
                  <p className="text-xs text-gray-500 mb-3">Review KYC (selfie + ID + receipt) before approving. Approved groups go live on the user site immediately.</p>
                  {pendingGroups.map(g => (
                    <div key={g.id} className="border rounded-xl p-3 mb-3">
                      <div className="font-medium text-sm">{g.name} <span className="text-xs text-gray-500">• {g.admin_email}</span></div>
                      <div className="text-xs text-gray-500 mt-1">₦{Number(g.amount).toLocaleString()} {g.frequency} • {g.max_members} members • Color: <span className="inline-block w-3 h-3 rounded-full align-middle" style={{ background: g.color }} /></div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {g.selfie_url && <a href={g.selfie_url} target="_blank" rel="noreferrer" className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Selfie</a>}
                        {g.id_url && <a href={g.id_url} target="_blank" rel="noreferrer" className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">ID</a>}
                        {g.creation_receipt_url && <a href={g.creation_receipt_url} target="_blank" rel="noreferrer" className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Receipt</a>}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button disabled={busy} onClick={() => approveGroup(g)} className="bg-black hover:bg-gray-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Approve → Go Live</button>
                        <button disabled={busy} onClick={() => rejectGroup(g)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1 rounded-full text-xs disabled:opacity-60">Reject</button>
                      </div>
                    </div>
                  ))}
                  {pendingGroups.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">No groups waiting for review.</div>}
                </div>
              )}

              {selectedGroup && renderGroupProfile()}
            </div>
          )}

          {/* 3. USERS */}
          {activeMenu === 'users' && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <div>
                <h3 className="font-bold mb-1">Users</h3>
                <p className="text-xs text-gray-500">Every user has a unique ID and a referral link containing it. The blue verification badge is granted only by you.</p>
              </div>
              {subPills([{ id: 'active', label: 'Active Users', count: activeUsers.length }, { id: 'pending', label: 'Pending Approval', count: pendingUsers.length }], usersSub, setUsersSub)}

              <div className="grid md:grid-cols-2 gap-4">
                {usersSub === 'active' ? (
                  activeUsers.length > 0 ? activeUsers.map(u => (
                    <button key={u.id} onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)} className={`text-left border rounded-xl p-4 hover:border-purple-400 transition-colors ${selectedUser?.id === u.id ? 'border-purple-500 bg-purple-50/50' : ''}`}>
                      <div className="font-medium text-sm">{u.name || '—'} <span className="inline-block w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] text-center leading-4 align-middle" title="Blue verified">✓</span></div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </button>
                  )) : <div className="md:col-span-2 text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">No verified users yet — approve users from the pending list.</div>
                ) : (
                  pendingUsers.length > 0 ? pendingUsers.map(u => (
                    <div key={u.id} className="border rounded-xl p-4">
                      <div className="font-medium text-sm">{u.name || '—'}</div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email} • Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</div>
                      <button disabled={busy} onClick={() => approveUser(u)} className="mt-2 bg-black hover:bg-gray-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Approve → Blue Badge</button>
                    </div>
                  )) : <div className="md:col-span-2 text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">No users waiting for approval.</div>
                )}
              </div>

              {selectedUser && (
                <div className="border rounded-2xl p-5 bg-gray-50">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-bold">{selectedUser.name || '—'} <span className="inline-block w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] text-center leading-4 align-middle">✓</span></div>
                      <div className="text-xs text-purple-700 font-mono font-bold">Unique ID: {refId(selectedUser)}</div>
                      <div className="text-xs text-gray-500 mt-1">{selectedUser.email} {selectedUser.phone ? `• ${selectedUser.phone}` : ''} • Joined {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : '—'}</div>
                    </div>
                    <button onClick={() => setSelectedUser(null)} className="text-xs border rounded-full px-3 py-1 bg-white hover:bg-gray-100">Close</button>
                  </div>
                  <div className="mt-3 text-xs">
                    <div className="font-bold mb-1">Referral link (auto-fills "Referred by" on signup)</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="bg-white border rounded-lg px-2 py-1 break-all">https://{USER_REF}{refId(selectedUser)}</code>
                      <button onClick={() => { navigator.clipboard?.writeText(`https://${USER_REF}${refId(selectedUser)}`); setMsg('Referral link copied.'); }} className="border rounded-full px-3 py-1 bg-white hover:bg-gray-100">Copy</button>
                    </div>
                    <div className="text-gray-500 mt-2">{referredUsers(selectedUser).length} users referred • ₦{(referredUsers(selectedUser).length * 200).toLocaleString()} earned (must be a member of at least 1 group to withdraw)</div>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                Referral: ₦200 per new user who registers with their link — only if the referrer is a member of at least 1 group. Minimum withdrawal ₦1,000 (5 referrals).
              </div>
            </div>
          )}

          {/* 4. VERIFICATION */}
          {activeMenu === 'verification' && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <div>
                <h3 className="font-bold mb-1">Verification</h3>
                <p className="text-xs text-gray-500">Groups submit images explaining why they should be verified. Your decision notifies the admin on the user site. A declined group can re-apply after 7 days.</p>
              </div>
              {subPills([{ id: 'requests', label: 'Requests', count: pendingVerify.length }, { id: 'reviewed', label: 'Reviewed', count: reviewedVerify.length }], verifySub, setVerifySub)}

              {verifySub === 'requests' && (
                pendingVerify.length > 0 ? pendingVerify.map(r => (
                  <div key={r.id} className="border rounded-xl p-4 mb-3">
                    <div className="font-medium text-sm">{r.group_name || r.group_id} <span className="text-xs text-gray-500">• {r.admin_email}</span></div>
                    <div className="text-xs text-gray-500 mt-1">Submitted {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</div>
                    {r.reason && <p className="text-sm mt-2 bg-gray-50 rounded-lg p-3">{r.reason}</p>}
                    {r.images && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {String(r.images).split(',').filter(Boolean).map((img, i) => (
                          <a key={i} href={img.trim()} target="_blank" rel="noreferrer"><img src={img.trim()} alt={`evidence ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border hover:opacity-80" /></a>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button disabled={busy} onClick={() => reviewVerification(r, true)} className="bg-black hover:bg-gray-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Approve → Notified</button>
                      <button disabled={busy} onClick={() => reviewVerification(r, false)} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1 rounded-full text-xs disabled:opacity-60">Decline → Notified</button>
                    </div>
                  </div>
                )) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No verification requests waiting.</div>
              )}

              {verifySub === 'reviewed' && (
                reviewedVerify.length > 0 ? reviewedVerify.map(r => {
                  const reapply = r.reviewed_at ? new Date(new Date(r.reviewed_at).getTime() + 7 * 864e5) : null;
                  return (
                    <div key={r.id} className="border rounded-xl p-4 mb-2 text-sm flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-medium">{r.group_name || r.group_id}</div>
                        <div className="text-xs text-gray-500">Reviewed {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : '—'}{r.decline_reason ? ` • ${r.decline_reason}` : ''}</div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span>
                        {r.status === 'declined' && reapply && <div className="text-[10px] text-gray-400 mt-1">Can re-apply after {reapply.toLocaleDateString()}</div>}
                      </div>
                    </div>
                  );
                }) : <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">Nothing reviewed yet.</div>
              )}
            </div>
          )}

          {/* 5. TRANSACTIONS */}
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

          {/* 6. BANK DETAILS */}
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

          {/* 7. REFERRAL BONUS */}
          {activeMenu === 'referral' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Referral Bonus</h3>
              <p className="text-xs text-gray-500 mb-4">Users who earned ₦200 per referral. Click a user to see who registered with their link.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mb-4 space-y-1 font-medium">
                <div>• Minimum referral bonus withdrawal is ₦1,000</div>
                <div>• You can earn through referral only if you are a member or admin of a group</div>
                <div>• So a minimum of 5 new users (₦1,000) is needed before withdrawal</div>
              </div>
              {usersList.filter(u => referredUsers(u).length > 0).length > 0 ? usersList.filter(u => referredUsers(u).length > 0).map(u => (
                <div key={u.id} className="border rounded-xl p-4 mb-2">
                  <button onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)} className="w-full flex justify-between items-center text-left">
                    <div>
                      <div className="font-medium text-sm">{u.name || u.email} <span className="text-xs text-gray-500">ID: {refId(u)}</span></div>
                      <div className="text-xs text-gray-500">{referredUsers(u).length} referred</div>
                    </div>
                    <div className="text-sm font-bold text-green-700">₦{(referredUsers(u).length * 200).toLocaleString()}</div>
                  </button>
                  {selectedUser?.id === u.id && (
                    <div className="mt-3 border-t pt-3">
                      <div className="text-xs font-bold mb-2">Registered through their link:</div>
                      {referredUsers(u).map(x => (
                        <div key={x.id} className="text-xs text-gray-600 py-1 border-b last:border-0">{x.name || '—'} • {x.email} • {x.created_at ? new Date(x.created_at).toLocaleDateString() : '—'}</div>
                      ))}
                    </div>
                  )}
                </div>
              )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No referral bonuses earned yet — this fills in automatically as people register with referral links.</div>}
            </div>
          )}

          {/* 8. SETTINGS */}
          {activeMenu === 'settings' && (
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-bold mb-1">Change Password</h3>
                <p className="text-xs text-gray-500 mb-4">Applies to both owner emails. Stored securely as a hash — never plain text.</p>
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
                    <label className="text-xs font-bold">Subscription length (months) — ₦5,000 per cycle</label>
                    <input type="number" min="1" value={siteControls.subscriptionMonths} onChange={e => setSiteControls({ ...siteControls, subscriptionMonths: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" />
                    <p className="text-[10px] text-gray-400 mt-1">Now {siteControls.subscriptionMonths} months — was 6, changed to 4 per your instruction.</p>
                  </div>
                  <div className="border-t pt-3 text-xs font-bold text-gray-500">Homepage stats override (empty = real numbers)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs">Registered Users</label><input type="number" value={siteControls.statsUsers} onChange={e => setSiteControls({ ...siteControls, statsUsers: e.target.value })} placeholder={String(usersList.length)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Active Groups</label><input type="number" value={siteControls.statsGroups} onChange={e => setSiteControls({ ...siteControls, statsGroups: e.target.value })} placeholder={String(activeGroups.length)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Saved Through Platform (₦)</label><input type="number" value={siteControls.statsSaved} onChange={e => setSiteControls({ ...siteControls, statsSaved: e.target.value })} placeholder="auto" className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs">Member Satisfaction (%)</label><input type="number" min="0" max="100" value={siteControls.statsSatisfaction} onChange={e => setSiteControls({ ...siteControls, statsSatisfaction: e.target.value })} placeholder="auto" className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <button disabled={busy} onClick={saveSiteControls} className="w-full bg-purple-700 hover:bg-purple-800 text-white py-2 rounded-xl text-sm font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save Site Controls'}</button>
                </div>
              </div>
            </div>
          )}

          {/* 9. ANNOUNCEMENTS */}
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
    </div>
  );

  function renderGroupProfile() {
    const g = selectedGroup;
    const gMembers = groupMembers(g.id);
    const ratings = groupRatings(g.id);
    return (
      <div className="bg-white rounded-2xl border p-6 shadow-lg">
        <div className="flex justify-between gap-3"><h3 className="font-bold">Group Profile: {g.name}</h3><button onClick={() => { setSelectedGroup(null); setShowReviews(false); }} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Close</button></div>
        <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-bold">Group Info</div>
            <div className="text-gray-600 mt-1">ID: {g.id} • ₦{Number(g.amount).toLocaleString()} {g.frequency} • Max {g.max_members} members • Badge: {g.badge_tier || 'Bronze'} {g.is_verified ? '✓' : ''}</div>
            <div className="text-gray-600 mt-1"><Stars n={Math.round(avgRating(g.id))} /> {avgRating(g.id).toFixed(1)} ({ratings.length} reviews)</div>
            {g.description && <div className="mt-2 text-gray-600 text-xs">About: {g.description}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setShowReviews(!showReviews)} className="bg-black text-white px-3 py-1 rounded-full text-xs">⭐ Rating & Reviews</button>
            </div>
          </div>
          <div>
            <div className="font-bold">Admin & Members</div>
            <div className="text-gray-600 mt-1 text-xs">Admin: {g.admin_name || '—'} ({g.admin_email}) — visible to everyone. Admins can also join other groups as members. Admins must review a member's profile before approving them.</div>
            <div className="text-gray-600 mt-1 text-xs">Announcements tab is controlled by the group admin only.</div>
            <div className="mt-2">
              <div className="text-xs font-bold mb-1">Members ({gMembers.length}) — visible in full to members only</div>
              {gMembers.length > 0 ? gMembers.map(m => (
                <div key={m.id} className="text-xs text-gray-600 border-b last:border-0 py-1">{m.member_name || m.member_email}</div>
              )) : <div className="text-xs text-gray-400">No approved members recorded yet.</div>}
            </div>
          </div>
        </div>

        {showReviews && (
          <div className="mt-4 border-t pt-4">
            <div className="text-xs font-bold mb-2">Individual ratings & reviews (1–5 stars, visible to everyone)</div>
            {ratings.length > 0 ? ratings.map(r => (
              <div key={r.id} className="border rounded-xl p-3 mb-2 text-xs">
                <div className="flex justify-between"><span className="font-medium">{r.reviewer_name || r.reviewer_email}</span><Stars n={r.rating || 0} /></div>
                {r.review && <p className="text-gray-600 mt-1">{r.review}</p>}
                <div className="text-[10px] text-gray-400 mt-1">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
              </div>
            )) : <div className="text-xs text-gray-400 border border-dashed rounded-xl p-6 text-center">No reviews yet for this group.</div>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <span className="text-xs text-gray-500 self-center">Set badge:</span>
          <button disabled={busy} onClick={() => verifyGroupBadge(g, 'bronze')} className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Bronze (Tier 1)</button>
          <button disabled={busy} onClick={() => verifyGroupBadge(g, 'silver')} className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Silver (Tier 2)</button>
          <button disabled={busy} onClick={() => verifyGroupBadge(g, 'gold')} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Gold (Tier 3)</button>
        </div>
      </div>
    );
  }
}
