'use client';
import { useState, useEffect } from 'react';
import { supabase, OWNER_EMAILS, DEFAULT_OWNER_SETTINGS, OWNER_PASSWORD_HASH_FALLBACK } from '@/lib/supabase';

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

const MENU = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'groups', icon: '👥', label: 'Groups' },
  { id: 'users', icon: '👤', label: 'Users' },
  { id: 'verification', icon: '✅', label: 'Verification' },
  { id: 'photo_requests', icon: '📷', label: 'Photo Requests' },
  { id: 'transactions', icon: '💳', label: 'Transactions' },
  { id: 'bank', icon: '🏦', label: 'Bank Details' },
  { id: 'referral', icon: '🎁', label: 'Referral Bonus' },
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
  const [members, setMembers] = useState([]);
  const [groupReviews, setGroupReviews] = useState([]);
  const [memberReviews, setMemberReviews] = useState([]);
  const [verifyRequests, setVerifyRequests] = useState([]);
  const [ads, setAds] = useState([]);

  const [profileView, setProfileView] = useState(null); // { type:'user'|'group', data:{...}, request? }
  const [photoPendingUsers, setPhotoPendingUsers] = useState([]); // full rows of users awaiting photo approval
  const [zoomImg, setZoomImg] = useState(null); // click-to-expand profile photo lightbox
  const [loadIssue, setLoadIssue] = useState(''); // visible if a data load ever fails (never silent)
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [receiptView, setReceiptView] = useState(null);

  const [bankDetails, setBankDetails] = useState({ bankName: DEFAULT_OWNER_SETTINGS.bank_name, accountNumber: DEFAULT_OWNER_SETTINGS.account_number, accountName: DEFAULT_OWNER_SETTINGS.account_name });
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementMedia, setAnnouncementMedia] = useState(null);
  const [announcementFile, setAnnouncementFile] = useState(null);
  const [pwHash, setPwHash] = useState(OWNER_PASSWORD_HASH_FALLBACK);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [siteControls, setSiteControls] = useState({ plan1m: DEFAULT_OWNER_SETTINGS.plan_1m, plan6m: DEFAULT_OWNER_SETTINGS.plan_6m, plan12m: DEFAULT_OWNER_SETTINGS.plan_12m, statsUsers: '', statsGroups: '', statsSaved: '', statsSatisfaction: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMenuClick = (menu) => {
    setActiveMenu(menu);
    setProfileView(null); setReceiptView(null);
    setMsg(''); setErr('');
    setSidebarOpen(false);
  };

  // NOTE: login is NOT persisted — the owner panel always asks for the password
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
            plan1m: s.plan_1m ?? DEFAULT_OWNER_SETTINGS.plan_1m,
            plan6m: s.plan_6m ?? DEFAULT_OWNER_SETTINGS.plan_6m,
            plan12m: s.plan_12m ?? DEFAULT_OWNER_SETTINGS.plan_12m,
            statsUsers: s.stats_users_override ?? '',
            statsGroups: s.stats_groups_override ?? '',
            statsSaved: s.stats_saved_override ?? '',
            statsSatisfaction: s.stats_satisfaction_override ?? '',
          });
        }
      } catch {}
    })();
  }, []);

  useEffect(() => { if (isOwner) loadData(); }, [isOwner]);

  const loadData = async () => {
    const safe = async (q) => { try { const { data } = await q; return data || []; } catch { return []; } };
    setGroups(await safe(supabase.from('groups').select('*').order('created_at', { ascending: false })));
    // Users list — compact select for speed, with a SAFE FALLBACK to select('*')
    // so the list can NEVER silently go empty (e.g. right after a new column is added).
    {
      let rq = await supabase.from('users').select('id, name, email, phone, password_hash, trial_used, role, created_at, is_verified, referred_by, referral_earnings, is_approved, approval_status, decline_reason, pending_profile_pic').order('created_at', { ascending: false });
      if (rq.error) rq = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (rq.error) setLoadIssue(`Users failed to load: ${rq.error.message}`);
      else { setLoadIssue(''); setUsersList(rq.data || []); }
    }
    // Full rows (with current photo) for users who have a pending photo change — for the Photo Requests tab
    {
      const pend = await safe(supabase.from('users').select('*').not('pending_profile_pic', 'is', null).order('created_at', { ascending: false }));
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
    setAds(await safe(supabase.from('ads').select('*')));
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
      const { data } = await supabase.from('users').select('*').eq('id', u.id).single();
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

  /* ---------- AUTH (no persistence — password required every visit) ---------- */
  const handleLogin = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setErr('Access denied — owner accounts only.'); return; }
    setBusy(true);
    try {
      const hash = await sha256Hex(password);
      if (hash !== pwHash) { setErr('Invalid password.'); return; }
      setUser({ email: em, name: 'PayRound Owner' });
      setIsOwner(true);
    } catch { setErr('Login failed in this browser. Use HTTPS.'); }
    finally { setBusy(false); }
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
      const { error } = await supabase.from('groups').update({ badge_tier: tier, is_verified: true }).eq('id', g.id);
      if (error) throw error;
      setMsg(`Badge for "${g.name}" updated to ${tier} ${badgeEmoji(tier)}.`);
      setProfileView({ ...profileView, data: { ...profileView.data, badge_tier: tier, is_verified: true } });
      loadData();
    } catch (e) { setErr(`Badge update failed: ${e.message}`); }
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
    try {
      const { error } = await supabase.from('owner_settings').update({
        plan_1m: Number(siteControls.plan1m) || DEFAULT_OWNER_SETTINGS.plan_1m,
        plan_6m: Number(siteControls.plan6m) || DEFAULT_OWNER_SETTINGS.plan_6m,
        plan_12m: Number(siteControls.plan12m) || DEFAULT_OWNER_SETTINGS.plan_12m,
        stats_users_override: num(siteControls.statsUsers), stats_groups_override: num(siteControls.statsGroups),
        stats_saved_override: num(siteControls.statsSaved), stats_satisfaction_override: num(siteControls.statsSatisfaction),
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
          const path = `owner/${Date.now()}-${announcementFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
          const { error: upErr } = await supabase.storage.from('announcements').upload(path, announcementFile, { upsert: true });
          if (!upErr) mediaUrl = supabase.storage.from('announcements').getPublicUrl(path).data.publicUrl;
          else setErr(`Media upload skipped (${upErr.message}) — text still published. Create a public "announcements" storage bucket to enable media.`);
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

  // Approve/decline submitted ads — approved ones go live on the home page + every user dashboard
  const reviewAd = async (ad, approve) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('ads').update({ status: approve ? 'approved' : 'declined' }).eq('id', ad.id);
      if (error) throw error;
      try {
        await notify('ad_review', null, approve
          ? `📢 Your ad "${ad.business_name || 'Business'}" is now LIVE on PayRound — shown to visitors and on every user dashboard. 🎉`
          : `Your ad "${ad.business_name || 'Business'}" was not approved this time. You can submit an improved ad anytime.`,
          (ad.submitter_email || '').toLowerCase() || null);
      } catch {}
      setMsg(approve ? `Ad "${ad.business_name}" approved — now visible on the user site.` : `Ad "${ad.business_name}" declined — the submitter has been notified.`);
      loadData();
    } catch (e) { setErr(`Ad review failed: ${e.message}`); }
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
    } catch (e) { setErr(`Change failed: ${e.message}`); }
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
            <p className="text-xs text-gray-500 mt-1">Admin control panel — password required every visit</p>
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
  const verifiedUsers = usersList.filter(u => u.is_verified);
  const groupRequests = verifyRequests.filter(r => (r.subject_type || 'group') === 'group' && r.status === 'pending');
  const userRequests = verifyRequests.filter(r => r.subject_type === 'user' && r.status === 'pending');
  const groupMembers = (gid) => members.filter(m => m.group_id === gid && m.status === 'approved');
  const groupRatings = (gid) => groupReviews.filter(r => r.group_id === gid);
  const avgRating = (gid) => { const rs = groupRatings(gid); return rs.length ? (rs.reduce((a, r) => a + (r.rating || 0), 0) / rs.length) : 0; };
  const refId = (u) => (u.id || '').slice(0, 8);
  const referredUsers = (u) => usersList.filter(x => x.referred_by && (x.referred_by === u.id || x.referred_by === refId(u)));
  const userAdminGroups = (u) => groups.filter(g => g.admin_email === u.email);
  const userMemberGroups = (u) => members.filter(m => m.member_email === u.email && m.status === 'approved');
  const userReviews = (u) => memberReviews.filter(r => r.member_email === u.email);
  const transactions = [
    ...groups.filter(g => g.creation_receipt_url).map(g => ({ id: `c-${g.id}`, type: `Creation fee (${g.plan_months || '?'}mo plan)`, from: g.admin_email, name: g.name, amount: g.plan_price || 5000, date: g.first_payment_at || g.created_at, receipt: g.creation_receipt_url })),
    ...groups.filter(g => g.renewal_receipt_url).map(g => ({ id: `r-${g.id}`, type: 'Group renewal', from: g.admin_email, name: g.name, amount: g.plan_price || 5000, date: g.expiry_at || g.created_at, receipt: g.renewal_receipt_url })),
    ...ads.map(a => ({ id: `a-${a.id}`, type: 'Ad placement', from: a.submitter_email, name: a.business_name, amount: a.price, date: a.submitted_at, receipt: a.payment_receipt_url })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

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
    <aside className="bg-gradient-to-b from-[#26224f] via-[#1e1b4b] to-[#141138] text-white flex flex-col h-full overflow-y-auto border-r-4 border-purple-500/40 shadow-[10px_0_30px_rgba(20,17,56,0.55)]">
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
        {menuBtn(MENU[3], groupRequests.length + userRequests.length)}
        {menuBtn(MENU[4], photoPendingUsers.length)}
        {MENU.slice(5).map(m => menuBtn(m))}
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
            <span className="text-[10px] md:text-xs bg-green-50 text-green-700 border px-2 md:px-3 py-1 rounded-full truncate max-w-[120px] md:max-w-none">{usersList.length} users • {user.email.split('@')[0]}</span>
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

          {/* 1. DASHBOARD */}
          {activeMenu === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Users Registered</div>
                  <div className="font-bold text-3xl mt-1">{usersList.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">{activeUsers.length} approved • {verifiedUsers.length} blue-verified • {pendingUsers.length} pending</div>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="text-xs text-gray-500">Total Active Groups</div>
                  <div className="font-bold text-3xl mt-1">{activeGroups.length}</div>
                  <div className="text-[10px] text-green-600 mt-1">{verifiedGroups.length} verified • {pendingGroups.length} pending</div>
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
                    <div className="min-w-0"><span className="font-medium">{g.name}</span> {g.is_verified && <BlueBadge />} <span className="text-xs text-gray-500 block sm:inline">ID: {g.id} • ₦{Number(g.amount).toLocaleString()} {g.frequency} • {groupMembers(g.id).length || g.max_members} members • <Stars n={Math.round(avgRating(g.id))} /> • Badge: {badgeEmoji(g.badge_tier)} {g.badge_tier || 'Bronze'}</span></div>
                    <button onClick={() => setProfileView({ type: 'group', data: g })} className="text-xs border rounded-full px-3 py-1 shrink-0 hover:bg-gray-50">View Profile →</button>
                  </div>
                )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No active groups yet — groups appear here after you approve them in the Groups tab.</div>}
              </div>
            </>
          )}

          {/* 2. GROUPS */}
          {activeMenu === 'groups' && (
            <div className="space-y-4">
              {subPills([{ id: 'active', label: '✅ Active Groups', count: activeGroups.length }, { id: 'pending', label: '🕓 Pending Approval', count: pendingGroups.length }], groupsSub, setGroupsSub)}

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
                        <div className="font-medium">{g.name} {g.is_verified && <BlueBadge />} <span className="text-xs text-gray-500">• ID: {g.id}</span></div>
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
                      <div className="font-medium text-sm">{u.name || '—'} {u.is_verified && <BlueBadge />} {u.pending_profile_pic && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">📷 photo pending</span>}</div>
                      <div className="text-[11px] text-purple-700 font-mono font-bold mt-0.5">ID: {refId(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                      <button onClick={() => openUserProfile(u)} className="mt-2 text-xs border rounded-full px-3 py-1 hover:bg-gray-50 font-medium">👁 View Profile</button>
                    </div>
                  )) : <div className="md:col-span-2 text-xs text-gray-500 border border-dashed rounded-xl p-8 text-center">{userSearch ? `No users match "${userSearch}".` : 'No approved users yet — approve users from the pending list.'}</div>
                ) : (
                  pendingUsers.filter(matchUser).length > 0 ? pendingUsers.filter(matchUser).map(u => (
                    <div key={u.id} className={`border rounded-xl p-4 ${isUserDeclined(u) ? 'border-red-200 bg-red-50/40' : ''}`}>
                      <div className="font-medium text-sm">{u.name || '—'} {isUserDeclined(u) && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-1">Declined</span>} {u.pending_profile_pic && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">📷 photo pending</span>}</div>
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
                Referral: ₦200 per new user who registers with their link — only if the referrer is a member of at least 1 group. Minimum withdrawal ₦1,000 (5 referrals).
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

          {activeMenu === 'transactions' && (
            <div className="bg-white rounded-xl border p-6 mt-4">
              <h3 className="font-bold mb-1">📢 Ad Requests</h3>
              <p className="text-xs text-gray-500 mb-4">Businesses that submitted ads from the user site. Approving puts the ad LIVE on the home page (visitors too) and every user dashboard. The submitter is notified either way.</p>
              {ads.filter(a => a.status === 'pending').length === 0 && ads.filter(a => a.status === 'approved').length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No ads submitted yet.</div>
              ) : (
                <>
                  {ads.filter(a => a.status === 'pending').map(a => (
                    <div key={a.id} className="border rounded-xl p-4 mb-3">
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{a.business_name || 'Business'} <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-1">PENDING</span></div>
                          <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">{a.description || '—'}</div>
                          <div className="text-[11px] text-gray-400 mt-1">{[a.contact, a.whatsapp ? `WhatsApp: ${a.whatsapp}` : '', a.website, a.submitter_email, a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''].filter(Boolean).join(' • ')}</div>
                          {(() => { try { const m = JSON.parse(a.media_urls || '[]'); return Array.isArray(m) && m.length > 0 ? (
                            <div className="flex gap-1.5 mt-2 flex-wrap">{m.slice(0, 6).map((src, i) => String(src).startsWith('data:video')
                              ? <video key={i} src={src} muted playsInline className="w-14 h-14 rounded-lg object-cover border bg-black" />
                              : <img key={i} src={src} alt="" className="w-14 h-14 rounded-lg object-cover border" />)}<span className="text-[10px] text-gray-400 self-center">{m.length} item{m.length > 1 ? 's' : ''} (slideshow)</span></div>
                          ) : null; } catch { return null; } })()}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button disabled={busy} onClick={() => reviewAd(a, true)} className="bg-black hover:bg-gray-800 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">✔ Approve → Go Live</button>
                          <button disabled={busy} onClick={() => reviewAd(a, false)} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-full text-xs disabled:opacity-60">Decline</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {ads.filter(a => a.status === 'approved').length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] font-bold text-gray-400 mb-2">LIVE ADS ({ads.filter(a => a.status === 'approved').length})</div>
                      {ads.filter(a => a.status === 'approved').map(a => (
                        <div key={a.id} className="flex flex-wrap justify-between items-center gap-2 border-b last:border-0 py-2.5 text-sm">
                          <div className="min-w-0"><span className="font-medium">{a.business_name}</span> <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-1">LIVE</span><div className="text-[11px] text-gray-400">{a.contact || a.website || ''}</div></div>
                          <button disabled={busy} onClick={() => reviewAd(a, false)} className="text-[11px] text-red-500 border border-red-200 px-3 py-1 rounded-full disabled:opacity-60">Take Down</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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

          {/* 8. REFERRAL BONUS */}
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
                  <button onClick={() => openUserProfile(u)} className="w-full flex justify-between items-center text-left">
                    <div>
                      <div className="font-medium text-sm">{u.name || u.email} {u.is_verified && <BlueBadge />} <span className="text-xs text-gray-500">ID: {refId(u)}</span></div>
                      <div className="text-xs text-gray-500">{referredUsers(u).length} referred</div>
                    </div>
                    <div className="text-sm font-bold text-green-700">₦{(referredUsers(u).length * 200).toLocaleString()}</div>
                  </button>
                </div>
              )) : <div className="text-center py-8 border border-dashed rounded-xl text-sm text-gray-500">No referral bonuses earned yet — this fills in automatically as people register with referral links.</div>}
            </div>
          )}

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
            {infoRow('Amount', `₦${Number(g.amount).toLocaleString()} ${g.frequency || ''}`)}
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

        {/* Badge tiers — owner only */}
        {!isPending && (
          <div className="mt-4 border-t pt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Verification badge (you review first):</span>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'bronze')} className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">🥉 Bronze — Tier 1</button>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'silver')} className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">🥈 Silver — Tier 2</button>
            <button disabled={busy} onClick={() => verifyGroupBadge(g, 'gold')} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60">🥇 Gold — Tier 3</button>
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
        </div>
      </div>
    );
  }

  /* ---------- PROFILE MODAL: USER ---------- */
  function renderUserProfile(u, request) {
    const adminGs = userAdminGroups(u);
    const memberGs = userMemberGroups(u);
    const refs = referredUsers(u);
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
            {u.referred_by && infoRow('Referred by', u.referred_by)}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 mb-1">REFERRAL</div>
            {infoRow('Referral link', <span className="text-[10px] break-all">https://{USER_REF}{refId(u)}</span>)}
            {infoRow('Users referred', refs.length)}
            {infoRow('Earnings', `₦${(refs.length * 200).toLocaleString()} ${(u.referral_earnings || 0) > 0 ? `(+₦${Number(u.referral_earnings).toLocaleString()} credited)` : ''}`)}
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
        </div>
        <div className="text-[10px] text-gray-400 mt-2">Approving activates the account. The 🔵 blue badge can be granted right here (only you see these buttons).</div>
      </div>
    );
  }
}
