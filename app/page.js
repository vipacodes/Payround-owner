'use client';
import { useState, useEffect } from 'react';
import { supabase, OWNER_EMAILS, DEFAULT_OWNER_SETTINGS, OWNER_PASSWORD_HASH_FALLBACK } from '@/lib/supabase';

// SHA-256 hex digest — used so the owner password is never stored in source code
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Current week range (Sun–Sat) for the header, e.g. "Jul 26 – Aug 1, 2026"
function currentWeekRange() {
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString('en-US', opts);
  const e = end.toLocaleDateString('en-US', opts);
  return start.getMonth() === end.getMonth()
    ? `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${s} – ${e}, ${end.getFullYear()}`;
}

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

export default function OwnerPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [groups, setGroups] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [bankDetails, setBankDetails] = useState({ bankName: DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: DEFAULT_OWNER_SETTINGS.account_number, accountName: DEFAULT_OWNER_SETTINGS.account_name });
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementMedia, setAnnouncementMedia] = useState(null); // url stored in settings
  const [announcementFile, setAnnouncementFile] = useState(null);
  const [pwHash, setPwHash] = useState(OWNER_PASSWORD_HASH_FALLBACK);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const handleMenuClick = (menu) => {
    setActiveMenu(menu);
    setSelectedGroup(null);
    setSidebarOpen(false); // panel closes after choosing an option, until hamburger is clicked again
  };

  // Load owner settings on first paint (needed for login hash + bank pill)
  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.from('owner_settings').select('*').eq('id', 1).single();
        if (s) {
          setBankDetails({ bankName: s.bank_name ?? DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: s.account_number ?? DEFAULT_OWNER_SETTINGS.account_number, accountName: s.account_name ?? DEFAULT_OWNER_SETTINGS.account_name });
          if (s.owner_password_hash) setPwHash(s.owner_password_hash);
          if (s.announcement_text) setAnnouncementText(s.announcement_text);
          if (s.announcement_media_url) setAnnouncementMedia(s.announcement_media_url);
        }
      } catch {}
      const stored = localStorage.getItem('payround_owner_user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (OWNER_EMAILS.includes(u.email?.toLowerCase())) { setUser(u); setIsOwner(true); }
        } catch {}
      }
    })();
  }, []);

  useEffect(() => { if (isOwner) loadData(); }, [isOwner]);

  const loadData = async () => {
    try {
      const { data: g } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
      if (g) setGroups(g);
    } catch {}
    try {
      const { data: u } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (u) setUsersList(u);
    } catch {}
    try {
      const { data: n } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (n) setNotifications(n.slice(0, 10));
    } catch {}
  };

  const notify = async (type, groupId, message) => {
    try {
      await supabase.from('notifications').insert({ id: `${type}-${Date.now()}`, type, group_id: groupId || null, message });
    } catch {}
  };

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
    } catch {
      setErr('Login failed in this browser (crypto unavailable). Use HTTPS.');
    } finally { setBusy(false); }
  };

  const handleLogout = async () => {
    try { await supabase.auth?.signOut?.(); } catch {}
    localStorage.removeItem('payround_owner_user');
    setUser(null); setIsOwner(false); setPassword(''); setMsg(''); setErr('');
  };

  const approveGroup = async (g) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'active', is_verified: true }).eq('id', g.id);
      if (error) throw error;
      await notify('group_approved', g.id, `Group "${g.name}" approved and is now live.`);
      setMsg(`"${g.name}" approved — now live on the user site.`);
      loadData();
    } catch (e) { setErr(`Approve failed: ${e.message}`); }
    setBusy(false);
  };

  const rejectGroup = async (g) => {
    const reason = window.prompt(`Reason for rejecting "${g.name}" (shown to the group admin):`, 'Requirements not met');
    if (reason === null) return; // cancelled
    setBusy(true);
    try {
      const { error } = await supabase.from('groups').update({ status: 'rejected', rejection_reason: reason }).eq('id', g.id);
      if (error) throw error;
      await notify('group_rejected', g.id, `Group "${g.name}" was declined: ${reason}`);
      setMsg(`"${g.name}" rejected.`); setErr('');
      loadData();
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
      setMsg(`${u.name || u.email} approved — blue verification badge granted.`);
      loadData();
    } catch (e) {
      setErr(`Approve failed: ${e.message}. If this mentions "is_verified", run the migration at the bottom of supabase_setup.sql.`);
    }
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

  const publishAnnouncement = async () => {
    if (!announcementText.trim() && !announcementFile) { setErr('Type an announcement or attach media first.'); return; }
    setBusy(true); setErr('');
    let mediaUrl = announcementMedia;
    try {
      if (announcementFile && supabase.storage) {
        try {
          const path = `owner/${Date.now()}-${announcementFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
          const { error: upErr } = await supabase.storage.from('announcements').upload(path, announcementFile, { upsert: true });
          if (!upErr) {
            mediaUrl = supabase.storage.from('announcements').getPublicUrl(path).data.publicUrl;
          } else {
            setErr(`Media upload skipped (${upErr.message}). Publishing text only. Create a public "announcements" storage bucket to enable media.`);
          }
        } catch {}
      }
      const { error } = await supabase.from('owner_settings').update({
        announcement_text: announcementText.trim(),
        announcement_media_url: mediaUrl,
        announcement_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setAnnouncementMedia(mediaUrl);
      setAnnouncementFile(null);
      setMsg('Announcement published — it now shows on the user site.');
    } catch (e) {
      setErr(`Publish failed: ${e.message}. If this mentions "announcement_", run the migration at the bottom of supabase_setup.sql.`);
    }
    setBusy(false);
  };

  const clearAnnouncement = async () => {
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.from('owner_settings').update({
        announcement_text: null,
        announcement_media_url: null,
        announcement_updated_at: new Date().toISOString(),
      }).eq('id', 1);
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
      const currentHash = await sha256Hex(current);
      if (currentHash !== pwHash) { setErr('Current password is incorrect.'); setBusy(false); return; }
      const newHash = await sha256Hex(next);
      const { error } = await supabase.from('owner_settings').update({ owner_password_hash: newHash, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      setPwHash(newHash);
      setPwForm({ current: '', next: '', confirm: '' });
      setMsg('Password changed successfully — it applies to both owner emails.');
    } catch (e) {
      setErr(`Change failed: ${e.message}. If this mentions "owner_password_hash", run the migration at the bottom of supabase_setup.sql.`);
    }
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

  const activeGroups = groups.filter(g => g.status === 'active');
  const pendingGroups = groups.filter(g => g.status === 'pending_owner');
  const frozenGroups = groups.filter(g => g.status === 'frozen' || g.status === 'trial_frozen');
  const activeUsers = usersList.filter(u => u.is_verified);
  const pendingUsers = usersList.filter(u => !u.is_verified);
  const title = activeMenu === 'dashboard' ? 'Dashboard Overview' : (MENU.find(m => m.id === activeMenu)?.label || 'Dashboard');

  /* ---------- DASHBOARD ---------- */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Backdrop when sidebar is open */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30" aria-hidden="true" />
      )}

      {/* Purple side tab — hidden by default, slides in via hamburger */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[30%] min-w-[280px] max-w-[360px] bg-[#1e1b4b] text-white flex flex-col overflow-y-auto transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center font-bold">P</div>
              <div>
                <div className="font-bold">PayRound</div>
                <div className="text-[10px] text-white/50 tracking-widest">OWNER PANEL</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
          </div>
          <div className="mt-5 flex items-center gap-3 bg-white/5 rounded-xl p-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold">{(user.email[0] || 'O').toUpperCase()}</div>
            <div>
              <div className="text-sm font-semibold truncate max-w-[160px]">{user.email}</div>
              <div className="text-[10px] bg-purple-600 px-2 py-0.5 rounded-full inline-block mt-1">Super Admin</div>
              <div className="text-[10px] text-green-400 mt-1">● Online</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 text-sm">
          <div>
            <div className="text-[10px] text-white/40 px-3 mb-2 tracking-widest">OVERVIEW</div>
            <button onClick={() => handleMenuClick('dashboard')} className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors ${activeMenu === 'dashboard' ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/10'}`}><span className="flex items-center gap-3">🏠 Dashboard</span><span>›</span></button>
          </div>
          <div className="space-y-1">
            {MENU.filter(m => m.id !== 'dashboard').map(m => (
              <button key={m.id} onClick={() => handleMenuClick(m.id)} className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors ${activeMenu === m.id ? 'bg-purple-600 text-white' : 'text-white/60 hover:bg-white/5'}`}>
                <span className="flex items-center gap-3">{m.icon} {m.label}</span>
                {m.id === 'groups' && pendingGroups.length > 0 ? <span className="bg-red-500 text-[10px] px-2 py-0.5 rounded-full">{pendingGroups.length}</span> : <span>›</span>}
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-white/10">
            <div className="bg-purple-900/30 rounded-xl p-3">
              <div className="text-xs">{bankDetails.bankName} {bankDetails.accountNumber}</div>
              <div className="text-[10px] text-white/50 mt-1">{bankDetails.accountName} — shown to users at payment.</div>
            </div>
          </div>
        </nav>

        <div className="p-3 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-white/70 hover:bg-white/5 rounded-xl bg-white/5"><span>↩️</span> Log Out</button>
          <div className="text-[9px] text-white/20 mt-3 px-3">Owner Dashboard v1.1.0</div>
        </div>
      </aside>

      {/* Main content — always full width */}
      <main className="min-h-screen">
        <div className="bg-white border-b px-4 md:px-6 h-16 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle menu" className="w-10 h-10 shrink-0 bg-[#1a1b3a] hover:bg-[#25265a] text-white rounded-xl flex items-center justify-center transition-colors">☰</button>
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

          {activeMenu === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl border p-5"><div className="text-xs text-gray-500">Registered Users</div><div className="font-bold text-2xl mt-1">{usersList.length}</div><div className="text-[10px] text-green-600 mt-1">{activeUsers.length} verified</div></div>
                <div className="bg-white rounded-xl border p-5"><div className="text-xs text-gray-500">Active Groups</div><div className="font-bold text-2xl mt-1">{activeGroups.length}</div><div className="text-[10px] text-green-600">Live on user site</div></div>
                <div className="bg-white rounded-xl border p-5"><div className="text-xs text-gray-500">Pending Groups</div><div className="font-bold text-2xl">{pendingGroups.length}</div><div className="text-[10px] text-amber-600">Awaiting your approval</div></div>
                <div className="bg-white rounded-xl border p-5"><div className="text-xs text-gray-500">Frozen Groups</div><div className="font-bold text-2xl">{frozenGroups.length}</div><div className="text-[10px] text-gray-500">{groups.length} total groups</div></div>
                <div className="bg-white rounded-xl border p-5"><div className="text-xs text-gray-500">Pending Users</div><div className="font-bold text-2xl">{pendingUsers.length}</div><div className="text-[10px] text-amber-600">Awaiting verification</div></div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-4">Latest Registrations</h3>
                  {usersList.length > 0 ? usersList.slice(0, 6).map(u => (
                    <div key={u.id} className="flex justify-between items-center border-b last:border-0 py-2 text-sm">
                      <span className="truncate">{u.name || '—'} <span className="text-gray-400 text-xs">{u.email}</span></span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.is_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{u.is_verified ? 'Verified' : 'Pending'}</span>
                    </div>
                  )) : <div className="h-32 bg-purple-50 rounded-xl flex items-center justify-center text-xs text-purple-700">No registered users yet — this fills up automatically as people sign up.</div>}
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-bold mb-4">Groups Overview</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Active</span><span className="font-bold text-green-700">{activeGroups.length}</span></div>
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
                    <div className="min-w-0"><span className="font-medium">{g.name}</span> <span className="text-xs text-gray-500 block sm:inline">ID: {g.id} • ₦{Number(g.amount).toLocaleString()} {g.frequency} • {g.max_members} members • Next payout: {g.expiry_at ? new Date(g.expiry_at).toLocaleDateString() : 'TBD'} • Rating: {g.rating || 0}★ • Badge: {g.badge_tier || 'Bronze'}</span></div>
                    <button onClick={() => setSelectedGroup(g)} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No active groups yet — groups appear here after you approve them in the Groups tab.</div>}
              </div>

              {selectedGroup && (
                <div className="bg-white rounded-2xl border p-6 shadow-lg">
                  <div className="flex justify-between gap-3"><h3 className="font-bold">Group Profile: {selectedGroup.name}</h3><button onClick={() => setSelectedGroup(null)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50">Close</button></div>
                  <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-bold">Group Info</div>
                      <div className="text-gray-600 mt-1">ID: {selectedGroup.id} • ₦{Number(selectedGroup.amount).toLocaleString()} {selectedGroup.frequency} • Max {selectedGroup.max_members} members • Badge: {selectedGroup.badge_tier || 'Bronze'}</div>
                      {selectedGroup.description && <div className="mt-2 text-gray-600">{selectedGroup.description}</div>}
                    </div>
                    <div>
                      <div className="font-bold">Admin</div>
                      <div className="text-gray-600 mt-1">{selectedGroup.admin_name || '—'} • {selectedGroup.admin_email}</div>
                      <div className="mt-2 text-xs text-gray-500">Members are visible to group members only; everyone can see the group admin.</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => verifyGroupBadge(selectedGroup, 'bronze')} className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1 rounded-full text-xs">Bronze Badge</button>
                    <button disabled={busy} onClick={() => verifyGroupBadge(selectedGroup, 'silver')} className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded-full text-xs">Silver Badge</button>
                    <button disabled={busy} onClick={() => verifyGroupBadge(selectedGroup, 'gold')} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-full text-xs">Gold Badge</button>
                  </div>
                </div>
              )}
            </>
          )}

          {activeMenu === 'groups' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold mb-1">Active Groups</h3>
                <p className="text-xs text-gray-500 mb-3">Approved and visible on the user site.</p>
                {activeGroups.map(g => (
                  <div key={g.id} className="border-b last:border-0 py-3 text-sm">
                    <div className="font-medium">{g.name} <span className="text-xs text-gray-500">• ID: {g.id}</span></div>
                    <div className="text-xs text-gray-500">Admin: {g.admin_name || g.admin_email} • {g.max_members} members • Rating: {g.rating || 0}★ • Badge: {g.badge_tier || 'Bronze'}</div>
                    <button onClick={() => { setSelectedGroup(g); setActiveMenu('dashboard'); }} className="mt-2 text-xs border rounded-full px-3 py-1 hover:bg-gray-50">View Profile →</button>
                  </div>
                ))}
                {activeGroups.length === 0 && <div className="text-center text-gray-500 py-8 border border-dashed rounded-xl text-sm">No active groups yet.</div>}
              </div>
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold mb-1">Pending Groups</h3>
                <p className="text-xs text-gray-500 mb-3">Review KYC (selfie + ID) before approving.</p>
                {pendingGroups.map(g => (
                  <div key={g.id} className="border rounded-xl p-3 mb-3">
                    <div className="font-medium text-sm">{g.name} <span className="text-xs text-gray-500">• {g.admin_email}</span></div>
                    <div className="text-xs text-gray-500 mt-1">₦{Number(g.amount).toLocaleString()} {g.frequency} • {g.max_members} members • Color: <span className="inline-block w-3 h-3 rounded-full align-middle" style={{ background: g.color }} /></div>
                    <div className="flex gap-2 mt-2">
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
            </div>
          )}

          {activeMenu === 'users' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Users</h3>
              <p className="text-xs text-gray-500 mb-4">Each user has a unique ID and referral link. The blue verification badge can only be granted by you here.</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-bold text-sm mb-2">Active Users ({activeUsers.length})</h4>
                  {activeUsers.length > 0 ? activeUsers.map(u => (
                    <div key={u.id} className="border-b last:border-0 py-3 text-sm">
                      <div className="font-medium">{u.name || '—'} <span className="text-blue-600" title="Blue verified">✓</span></div>
                      <div className="text-xs text-gray-500">{u.email} • ID: {u.id?.slice(0, 8)}</div>
                      <div className="text-xs text-gray-500 truncate">Referral link: payround-omega.vercel.app/signup?ref={u.id?.slice(0, 8)}</div>
                    </div>
                  )) : <div className="text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">No verified users yet — approve users from the pending list.</div>}
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-2">Pending Approval ({pendingUsers.length})</h4>
                  {pendingUsers.length > 0 ? pendingUsers.map(u => (
                    <div key={u.id} className="border rounded-xl p-3 mb-2 text-sm">
                      <div className="font-medium">{u.name || '—'}</div>
                      <div className="text-xs text-gray-500">{u.email} • Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</div>
                      <button disabled={busy} onClick={() => approveUser(u)} className="mt-2 bg-black hover:bg-gray-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">Approve → Blue Badge</button>
                    </div>
                  )) : <div className="text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">No users waiting for approval.</div>}
                </div>
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                Referral rules: ₦200 bonus per new user who registers with a member's link. Bonus unlocks only if the referrer belongs to at least one group. Minimum withdrawal is ₦1,000 (5 referrals).
              </div>
            </div>
          )}

          {activeMenu === 'verification' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Verification Requests</h3>
              <p className="text-xs text-gray-500 mb-4">Groups submit evidence (images) explaining why they should be verified. Approving grants a badge tier — Bronze, Silver or Gold.</p>
              <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">
                {notifications.filter(n => n.type?.includes('verification')).length === 0
                  ? 'No verification requests yet. When a group submits one it will appear here, and your decision will notify them on the user site.'
                  : notifications.filter(n => n.type?.includes('verification')).map(n => <div key={n.id} className="py-1">{n.message}</div>)}
              </div>
            </div>
          )}

          {activeMenu === 'transactions' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Transactions</h3>
              <p className="text-xs text-gray-500 mb-4">Every payment between users and you (group creation, renewals, ads) will be listed here with its receipt.</p>
              <div className="text-center py-12 border border-dashed rounded-xl text-sm text-gray-500">No transactions yet. Payments to {bankDetails.bankName} {bankDetails.accountNumber} will show here automatically.</div>
            </div>
          )}

          {activeMenu === 'bank' && (
            <div className="bg-white rounded-xl border p-6 max-w-xl">
              <h3 className="font-bold mb-1">Bank Details</h3>
              <p className="text-xs text-gray-500 mb-4">This is shown to users whenever they need to pay you. Changes apply on the user site immediately.</p>
              <div className="space-y-3">
                <div><label className="text-xs font-bold">Bank Name</label><input value={bankDetails.bankName} onChange={e => setBankDetails({ ...bankDetails, bankName: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs font-bold">Account Number</label><input value={bankDetails.accountNumber} onChange={e => setBankDetails({ ...bankDetails, accountNumber: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs font-bold">Recipient's Name (Owner)</label><input value={bankDetails.accountName} onChange={e => setBankDetails({ ...bankDetails, accountName: e.target.value })} className="w-full border rounded-xl px-4 py-2 text-sm mt-1" /></div>
              </div>
              <button disabled={busy} onClick={saveBankDetails} className="mt-4 bg-black hover:bg-gray-800 text-white px-6 py-2 rounded-xl text-xs font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save Bank Details'}</button>
            </div>
          )}

          {activeMenu === 'referral' && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold mb-1">Referral Bonus</h3>
              <p className="text-xs text-gray-500 mb-4">Users earn ₦200 for every new registration made through their link.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mb-4 space-y-1">
                <div>• Minimum withdrawal: ₦1,000 (5 referrals).</div>
                <div>• Referrers must belong to at least one group to earn.</div>
              </div>
              <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No referral bonuses earned yet. When someone registers with a user's link, it will be listed here with the count of signups they referred.</div>
            </div>
          )}

          {activeMenu === 'settings' && (
            <div className="bg-white rounded-xl border p-6 max-w-md">
              <h3 className="font-bold mb-1">Settings</h3>
              <p className="text-xs text-gray-500 mb-4">Change the password for both owner emails. Stored securely as a hash — never in plain text.</p>
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
          )}

          {activeMenu === 'announcements' && (
            <div className="bg-white rounded-xl border p-6 max-w-2xl">
              <h3 className="font-bold mb-1">General Announcements</h3>
              <p className="text-xs text-gray-500 mb-4">Published announcements appear at the top of the user site until you clear them.</p>
              <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)} placeholder="Type your announcement…" className="w-full border rounded-xl p-4 text-sm" rows={4}></textarea>
              <div className="mt-3 border border-dashed rounded-xl p-6 text-center">
                <p className="text-xs text-gray-500">Optional image/video to show with the announcement.</p>
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
    </div>
  );
}
