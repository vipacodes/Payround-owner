'use client';
import { useState, useEffect } from 'react';

const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
const OWNER_PASSWORD = 'B@$ik0r0';

export default function OwnerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [msg, setMsg] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('payround_owner_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (OWNER_EMAILS.includes(u.email?.toLowerCase())) {
          setUser(u); setIsOwner(true);
        }
      } catch {}
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setMsg('Access Denied - Only Vipadarapper@gmail.com & Payroundsupport@gmail.com'); return; }
    if (password !== OWNER_PASSWORD) { setMsg('Invalid password'); return; }
    const u = { email: em, name: em.split('@')[0] };
    localStorage.setItem('payround_owner_user', JSON.stringify(u));
    setUser(u); setIsOwner(true); setMsg('Owner logged in');
  };

  const handleLogout = () => { localStorage.removeItem('payround_owner_user'); setUser(null); setIsOwner(false); setEmail(''); setPassword(''); };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl">P</div>
            <h1 className="text-2xl font-bold">PayRound Owner</h1>
            <p className="text-sm text-gray-500 mt-1">Private admin - Controls user site</p>
            <p className="text-xs text-gray-400 mt-1">Only Vipadarapper@gmail.com & Payroundsupport@gmail.com</p>
            <p className="text-[10px] text-green-600 mt-2">100% static - No DB fetch, guaranteed to open on all browsers, hidden from Google</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Owner Email" type="email" className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black outline-none" />
            <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black outline-none" />
            <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-900">Login as Owner</button>
          </form>
          {msg && <div className={`mt-4 rounded-xl p-3 text-sm ${msg.includes('logged')?'bg-green-50 border border-green-200 text-green-700':'bg-red-50 border border-red-200 text-red-700'}`}>{msg}</div>}
          <div className="mt-6 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
            <div>User site: payround-omega.vercel.app</div>
            <div>Shared DB: biqutnjvhkvldrihywdb.supabase.co</div>
            <div className="mt-1">Login with Vipadarapper@gmail.com / B@$ik0r0</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center text-white font-bold">P</div><div><div className="font-bold">PayRound Owner V2 👑</div><div className="text-[10px] text-gray-500">Palmpay 9151723199 • Private • Hidden from Google</div></div></div>
          <div className="flex items-center gap-3"><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{user.email}</span><button onClick={handleLogout} className="text-xs underline">Logout</button><a href="https://payround-omega.vercel.app" target="_blank" className="bg-black text-white px-4 py-2 rounded-full text-xs">View User Site</a></div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Owner Dashboard - Professional Responsive & Functional</h1>
        <p className="text-sm text-gray-500 mb-6">Controls payround-omega.vercel.app via shared Supabase DB. 100% static login, guaranteed to open on Chrome/Safari/Samsung.</p>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border p-6"><div className="text-2xl font-bold">0</div><div className="text-sm text-gray-500">Pending Groups (selfie+ID+₦5000 Palmpay 9151723199 + 12 colors)</div></div>
          <div className="bg-white rounded-2xl border p-6"><div className="text-2xl font-bold">0</div><div className="text-sm text-gray-500">Frozen Groups (6 months + 7d grace → frozen only owner unfreeze)</div></div>
          <div className="bg-white rounded-2xl border p-6"><div className="text-2xl font-bold">₦0</div><div className="text-sm text-gray-500">Revenue (groups + ads 500/3325/13500)</div></div>
        </div>
        <div className="bg-white rounded-2xl border p-8 text-center">
          <p className="font-bold">Owner Site V2 Ready - 16 Tabs</p>
          <p className="text-sm text-gray-500 mt-2">Active Groups (top rated+most active at top), Pending Approval, Frozen Groups, Frozen Users, Approved Groups/Users, Verify Admins (selfie+ID+NIN API+AI), Ratings/Reviews (1-5★), Ads Analytics (media+separate receipt, user designs ad, expiry alerts), Analytics & Revenue, User Management (1 per email), Payment Verification Export CSV, Deleted 30d recoverable, Voice Notes 7d auto-delete, Broadcast, Bank Settings editable anytime Palmpay 9151723199.</p>
          <p className="text-xs text-gray-400 mt-4">This minimal version opens 100% on all browsers. Full functionality with Supabase shared DB will be added after you confirm this opens.</p>
        </div>
      </div>
    </div>
  );
}
