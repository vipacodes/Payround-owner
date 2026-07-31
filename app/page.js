'use client';
import { useState, useEffect } from 'react';
import { supabase, OWNER_EMAILS, isOwnerEmail, DEFAULT_OWNER_SETTINGS, GROUP_COLORS } from '@/lib/supabase';

export default function OwnerDashboard() {
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [groups, setGroups] = useState([]);
  const [ads, setAds] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [ownerSettings, setOwnerSettings] = useState(DEFAULT_OWNER_SETTINGS);
  const [tab, setTab] = useState('groups');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('payround_owner_user');
    if (stored) {
      const u = JSON.parse(stored);
      if (isOwnerEmail(u.email)) { setUser(u); setIsOwner(true); loadAll(); }
    }
  }, []);

  const loadAll = async () => {
    const { data: g } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (g) setGroups(g);
    const { data: a } = await supabase.from('ads').select('*').order('submitted_at', { ascending: false });
    if (a) setAds(a);
    const { data: r } = await supabase.from('member_receipts').select('*').order('uploaded_at', { ascending: false });
    if (r) setReceipts(r);
    const { data: s } = await supabase.from('owner_settings').select('*').eq('id', 1).single();
    if (s) setOwnerSettings(s);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    const pass = passwordInput;
    if (!isOwnerEmail(email)) { setMsg('Access Denied - Owner only'); return; }
    setMsg('Verifying securely...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      const u = { email, name: email.split('@')[0] };
      localStorage.setItem('payround_owner_user', JSON.stringify(u));
      setUser(u); setIsOwner(true); setMsg('Owner logged in'); loadAll();
    } catch (err) {
      setMsg('Invalid credentials - Please check email and password, or ensure account exists in Supabase Auth');
    }
  };

  const handleLogout = () => { localStorage.removeItem('payround_owner_user'); setUser(null); setIsOwner(false); };

  const approveGroup = async (g) => {
    const { error } = await supabase.from('groups').update({ status: 'active', is_verified: true }).eq('id', g.id);
    if (!error) { setMsg(`Group ${g.name} approved`); loadAll(); }
  };
  const rejectGroup = async (g) => {
    const reason = prompt('Rejection reason?'); if (!reason) return;
    await supabase.from('groups').update({ status: 'rejected', rejection_reason: reason }).eq('id', g.id);
    setMsg(`Group ${g.name} rejected`); loadAll();
  };
  const unfreezeGroup = async (g) => {
    const newExpiry = new Date(); newExpiry.setMonth(newExpiry.getMonth()+6);
    await supabase.from('groups').update({ status: 'active', expiry_at: newExpiry.toISOString(), frozen_at: null, renewal_receipt_url: null }).eq('id', g.id);
    setMsg(`Group ${g.name} unfrozen`); loadAll();
  };
  const approveAd = async (ad) => {
    const exp = new Date(); exp.setDate(exp.getDate()+ad.duration_days);
    await supabase.from('ads').update({ status: 'approved', approved_at: new Date().toISOString(), expires_at: exp.toISOString() }).eq('id', ad.id);
    setMsg(`Ad ${ad.business_name} approved`); loadAll();
  };
  const saveSettings = async () => {
    await supabase.from('owner_settings').upsert({ id: 1, ...ownerSettings, updated_at: new Date().toISOString() });
    setMsg('Settings saved');
  };

  const pendingGroups = groups.filter(g => g.status === 'pending_owner');
  const frozenGroups = groups.filter(g => g.status === 'frozen' || g.status === 'pending_renewal' || g.status === 'trial_frozen');
  const pendingAds = ads.filter(a => a.status === 'pending');

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6"><div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl">P</div><h1 className="text-2xl font-bold">PayRound Owner</h1><p className="text-sm text-gray-500 mt-1">Private admin - controls payround-omega</p><p className="text-xs text-gray-400 mt-2">Owner access only</p></div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input value={emailInput} onChange={e=>setEmailInput(e.target.value)} placeholder="Owner Email" type="email" className="w-full border rounded-xl px-4 py-3 text-sm" />
            <input value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Password" type="password" className="w-full border rounded-xl px-4 py-3 text-sm" />
            <button className="w-full bg-black text-white py-3 rounded-xl font-bold">Login as Owner</button>
          </form>
          {msg && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{msg}</div>}
          <div className="mt-6 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">Secure login via Supabase Auth. Only authorized owner emails can access.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center text-white font-bold">P</div><div><div className="font-bold">PayRound Owner</div><div className="text-[10px] text-gray-500">Controls payround-omega.vercel.app</div></div></div>
          <div className="flex items-center gap-3"><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{user.email}</span><button onClick={handleLogout} className="text-xs underline">Logout</button></div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Owner Dashboard 👑</h1>
        <p className="text-xs text-gray-500 mb-6">Palmpay {ownerSettings.account_number} • Shared DB</p>
        {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm mb-4">{msg}</div>}
        <div className="flex flex-wrap gap-2 mb-6 bg-white p-2 rounded-full border w-fit">
          {[
            {id:'groups', label:`Pending (${pendingGroups.length})`},
            {id:'frozen', label:`Frozen (${frozenGroups.length})`},
            {id:'ads', label:`Ads (${pendingAds.length})`},
            {id:'settings', label:'Bank'},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-full text-sm font-semibold ${tab===t.id?'bg-black text-white':'bg-gray-100'}`}>{t.label}</button>
          ))}
        </div>
        {tab==='groups' && (
          <div className="grid md:grid-cols-2 gap-4">
            {pendingGroups.length===0 && <div className="col-span-2 bg-white border rounded-2xl p-12 text-center text-gray-500">No pending groups</div>}
            {pendingGroups.map(g=>(
              <div key={g.id} className="bg-white rounded-2xl border p-5">
                <div className="flex justify-between"><span className="font-bold">{g.name}</span><span className="text-[10px] bg-amber-100 px-2 py-1 rounded-full">PENDING</span></div>
                <div className="text-sm text-gray-600 mt-1">{g.description}</div>
                <div className="flex gap-2 mt-4"><button onClick={()=>approveGroup(g)} className="flex-1 bg-black text-white py-2.5 rounded-xl text-sm font-bold">Approve</button><button onClick={()=>rejectGroup(g)} className="flex-1 bg-red-50 text-red-700 border py-2.5 rounded-xl text-sm">Reject</button></div>
              </div>
            ))}
          </div>
        )}
        {tab==='frozen' && (
          <div className="grid md:grid-cols-2 gap-4">
            {frozenGroups.map(g=>(
              <div key={g.id} className="bg-white rounded-2xl border p-5">
                <div className="font-bold">{g.name}</div>
                <button onClick={()=>unfreezeGroup(g)} className="mt-3 bg-black text-white py-2.5 rounded-xl text-sm font-bold w-full">Unfreeze</button>
              </div>
            ))}
          </div>
        )}
        {tab==='ads' && (
          <div className="grid md:grid-cols-2 gap-4">
            {pendingAds.map(ad=>(
              <div key={ad.id} className="bg-white rounded-2xl border p-5">
                <div className="font-bold">{ad.business_name}</div>
                <button onClick={()=>approveAd(ad)} className="mt-3 bg-black text-white py-2.5 rounded-xl text-sm font-bold w-full">Approve Ad</button>
              </div>
            ))}
          </div>
        )}
        {tab==='settings' && (
          <div className="max-w-xl bg-white rounded-2xl border p-6">
            <h3 className="font-bold mb-4">Bank Settings - Editable Anytime</h3>
            <div className="grid gap-3">
              <input value={ownerSettings.bank_name} onChange={e=>setOwnerSettings({...ownerSettings, bank_name:e.target.value})} className="border rounded-xl px-4 py-2 text-sm" placeholder="Bank Name" />
              <input value={ownerSettings.account_number} onChange={e=>setOwnerSettings({...ownerSettings, account_number:e.target.value})} className="border rounded-xl px-4 py-2 text-sm" placeholder="Account Number" />
              <input value={ownerSettings.account_name} onChange={e=>setOwnerSettings({...ownerSettings, account_name:e.target.value})} className="border rounded-xl px-4 py-2 text-sm" placeholder="Account Name" />
            </div>
            <button onClick={saveSettings} className="mt-4 bg-black text-white px-6 py-2 rounded-xl text-sm">Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
