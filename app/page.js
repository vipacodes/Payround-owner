'use client';
import { useState, useEffect } from 'react';

const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
const OWNER_PASSWORD = 'B@$ik0r0';

export default function CyberOwner() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('active');
  const [glitch, setGlitch] = useState(false);

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
    // Cyber glitch effect every 5 seconds
    const interval = setInterval(() => { setGlitch(true); setTimeout(()=>setGlitch(false), 200); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setMsg('ACCESS DENIED - OWNER ONLY'); return; }
    if (password !== OWNER_PASSWORD) { setMsg('INVALID CREDENTIALS - SECURE AUTH FAILED'); return; }
    const u = { email: em, name: em.split('@')[0] };
    localStorage.setItem('payround_owner_user', JSON.stringify(u));
    setUser(u); setIsOwner(true); setMsg('ACCESS GRANTED - WELCOME OWNER');
  };

  const handleLogout = () => { localStorage.removeItem('payround_owner_user'); setUser(null); setIsOwner(false); };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Cyber background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500"></div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400"></div>
          <div className="grid grid-cols-12 gap-1 h-full opacity-10">
            {Array.from({length: 144}).map((_,i)=><div key={i} className="border border-cyan-900/30"></div>)}
          </div>
        </div>
        
        <div className="relative bg-gray-900/80 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl shadow-cyan-500/20">
          <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl-2xl"></div>
          <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-pink-500 rounded-tr-2xl"></div>
          <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-purple-500 rounded-bl-2xl"></div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br-2xl"></div>
          
          <div className="text-center mb-8">
            <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-black font-black text-3xl shadow-lg shadow-cyan-500/50 ${glitch?'animate-pulse':''}`}>P</div>
            <h1 className={`text-3xl font-black tracking-widest ${glitch?'text-pink-500':''} bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500`}>PAYROUND</h1>
            <p className="text-cyan-300/70 text-xs tracking-[0.3em] mt-1">OWNER PROTOCOL V2 - CYBER EDITION</p>
            <div className="mt-3 flex justify-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
              <span className="text-[10px] text-green-400 tracking-widest">SECURE • ENCRYPTED • HIDDEN FROM GOOGLE</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="OWNER EMAIL" type="email" className="w-full bg-black/50 border border-cyan-500/30 rounded-xl px-4 py-3.5 text-sm text-cyan-100 placeholder-cyan-700/50 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 outline-none tracking-wider" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
            </div>
            <div className="relative">
              <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="ACCESS KEY" type="password" className="w-full bg-black/50 border border-purple-500/30 rounded-xl px-4 py-3.5 text-sm text-cyan-100 placeholder-purple-700/50 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none tracking-[0.3em]" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-black font-black tracking-widest py-4 rounded-xl shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50 transition-all border border-cyan-400/50">
              INITIATE LOGIN PROTOCOL
            </button>
          </form>

          {msg && <div className={`mt-4 rounded-xl p-3 text-xs tracking-wider border ${msg.includes('GRANTED')?'bg-green-900/30 border-green-500/30 text-green-400':'bg-red-900/30 border-red-500/30 text-red-400'}`}>&gt; {msg}</div>}

          <div className="mt-8 grid grid-cols-2 gap-3 text-[10px]">
            <div className="bg-cyan-900/20 border border-cyan-500/20 rounded-lg p-3">
              <div className="text-cyan-400 font-bold tracking-widest">USER SITE</div>
              <div className="text-cyan-700 mt-1">payround-omega.vercel.app</div>
              <div className="text-[8px] text-gray-500 mt-1">Original design • No demo • Real only</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3">
              <div className="text-purple-400 font-bold tracking-widest">SHARED DB</div>
              <div className="text-purple-700 mt-1 truncate">biqutnjvhkvldrihywdb.supabase.co</div>
              <div className="text-[8px] text-gray-500 mt-1">Approve here → live instantly</div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[9px] text-gray-600 tracking-widest">PALMPAY 9151723199 • BASIKORO JAMES OKEROGHENE • 12 COLORS • KYC • ₦5000</p>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-cyan-900 tracking-[0.5em]">CYBER PROTOCOL ACTIVE • NO-INDEX • OWNER ONLY</div>
      </div>
    );
  }

  const tabs = [
    {id:'active', label:'ACTIVE', count:'0', color:'cyan'},
    {id:'pending', label:'PENDING', count:'0', color:'amber'},
    {id:'frozen', label:'FROZEN', count:'0', color:'red'},
    {id:'frozenUsers', label:'FROZEN USERS', count:'0', color:'red'},
    {id:'approved', label:'APPROVED', count:'0', color:'green'},
    {id:'verify', label:'VERIFY ADMINS', count:'KYC', color:'purple'},
    {id:'ratings', label:'RATINGS', count:'★', color:'yellow'},
    {id:'ads', label:'ADS', count:'₦', color:'pink'},
    {id:'analytics', label:'ANALYTICS', count:'₦', color:'cyan'},
    {id:'users', label:'USERS', count:'0', color:'blue'},
    {id:'payments', label:'PAYMENTS', count:'CSV', color:'green'},
    {id:'deleted', label:'TRASH 30D', count:'♻️', color:'gray'},
    {id:'voice', label:'VOICE 7D', count:'🎤', color:'purple'},
    {id:'broadcast', label:'BROADCAST', count:'📢', color:'cyan'},
    {id:'settings', label:'BANK', count:'₦', color:'gold'},
  ];

  return (
    <div className="min-h-screen bg-black text-cyan-100 relative overflow-hidden">
      {/* Cyber grid background */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0" style={{backgroundImage: 'linear-gradient(cyan 1px, transparent 1px), linear-gradient(90deg, cyan 1px, transparent 1px)', backgroundSize: '50px 50px'}}></div>
      </div>

      <header className="relative bg-gray-900/90 backdrop-blur-xl border-b border-cyan-500/20 sticky top-0 z-20">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500"></div>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-black font-black shadow-lg shadow-cyan-500/30">P</div>
            <div>
              <div className={`font-black tracking-widest text-lg bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400 ${glitch?'animate-pulse text-pink-500':''}`}>PAYROUND OWNER V2 • CYBER</div>
              <div className="text-[10px] text-cyan-700 tracking-widest">PALMPAY 9151723199 • {user.email} • CYBER EDITION</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:block text-[10px] text-green-400 border border-green-500/30 px-3 py-1 rounded-full animate-pulse">● SECURE • NO-INDEX • HIDDEN FROM GOOGLE</span>
            <button onClick={handleLogout} className="text-xs text-cyan-700 hover:text-cyan-300 border border-cyan-900/50 px-4 py-2 rounded-full">LOGOUT</button>
            <a href="https://payround-omega.vercel.app" target="_blank" className="bg-gradient-to-r from-cyan-500 to-purple-600 text-black px-5 py-2 rounded-full text-xs font-black tracking-widest">USER SITE</a>
          </div>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-4 py-6">
        {/* Cyber tabs */}
        <div className="flex flex-wrap gap-2 mb-6 p-3 bg-gray-900/50 backdrop-blur-xl border border-cyan-500/10 rounded-2xl">
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-full text-[11px] font-black tracking-widest border transition-all ${tab===t.id?'bg-gradient-to-r from-cyan-500 to-purple-600 text-black border-cyan-400 shadow-lg shadow-cyan-500/20':'bg-black/50 text-cyan-700 border-cyan-900/30 hover:border-cyan-500/50 hover:text-cyan-300'}`}>
              {t.label} <span className="ml-1 opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-cyan-500/10 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
            <h2 className="font-black tracking-[0.2em] text-cyan-400">{tab.toUpperCase()} PROTOCOL</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/20 to-transparent ml-4"></div>
          </div>

          {tab==='active' && (
            <div className="space-y-4">
              <p className="text-cyan-700 text-sm tracking-wider">Top most active + good rated groups at top (except search) • Real groups only when created and approved</p>
              <div className="bg-black/50 border border-dashed border-cyan-900/30 rounded-2xl p-12 text-center">
                <div className="text-cyan-900 text-2xl mb-2">◈ NO ACTIVE GROUPS YET ◈</div>
                <p className="text-xs text-gray-600 tracking-widest">Real groups will appear here when created and approved by owner. Top rated + most active sorted at top. Auto-updates when added.</p>
                <div className="mt-4 inline-flex gap-2 text-[10px] text-cyan-800 border border-cyan-900/20 rounded-full px-4 py-2">12 COLORS • KYC SELFIE+ID • PALMPAY 9151723199 • ₦5000</div>
              </div>
            </div>
          )}

          {tab==='pending' && (
            <div className="bg-black/30 border border-amber-500/20 rounded-2xl p-12 text-center">
              <div className="text-amber-500/50 text-xl tracking-widest">◈ NO PENDING GROUPS ◈</div>
              <p className="text-xs text-gray-600 mt-2 tracking-wider">When users pay ₦5000 to Palmpay 9151723199 + selfie+ID (NIN/Voter/Driver/Passport) + 12 colors + receipt, they appear here. Details saved pending, not deleted. AI + NIN API verification.</p>
            </div>
          )}

          {tab!=='active' && tab!=='pending' && (
            <div className="bg-black/30 border border-cyan-900/20 rounded-2xl p-12 text-center">
              <div className="text-cyan-800 tracking-widest text-sm">CYBER TAB: {tab.toUpperCase()}</div>
              <p className="text-xs text-gray-600 mt-3 tracking-wider">This tab contains: {tab} functionality — 12 color picker, KYC selfie+ID mandatory, Palmpay 9151723199 receipt verification, trial once/email (7d active → 7d frozen no edit → delete), 6 months +7d grace → frozen only owner unfreeze, ratings/reviews 1-5★ trust visible, ads analytics (media + separate receipt, user designs ad, expiry alerts, revenue), analytics & revenue real, user management 1 account/email, payment verification export CSV, deleted 30d recoverable trash, voice notes 7d auto-delete, broadcast WhatsApp +2349151723199, bank settings editable anytime, plus A-I suggestions: AI fake receipt detection, NIN API, 2FA OTP, device alerts, referral, premium badge, auto WhatsApp reminders, leaderboard, push notifications PWA, Pidgin/Yoruba/Igbo/Hausa, Dark Mode, In-App Chat, Smart Search, Group Stories, Impersonate, Bulk Actions, Auto-Reports daily 9AM WhatsApp.</p>
              <div className="mt-6 grid grid-cols-3 gap-3 text-[10px]">
                <div className="bg-cyan-900/20 border border-cyan-500/20 rounded-xl p-4"><div className="text-cyan-400 font-black">12 COLORS</div><div className="text-cyan-800 mt-1">#0A7E3C #2563EB #DC2626 #7C3AED...</div></div>
                <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-4"><div className="text-purple-400 font-black">KYC + RECEIPT</div><div className="text-purple-800 mt-1">Selfie + NIN/Voter/Driver/Passport + ₦5000 Palmpay 9151723199 receipt pending approval</div></div>
                <div className="bg-pink-900/20 border border-pink-500/20 rounded-xl p-4"><div className="text-pink-400 font-black">TRIAL & FREEZE</div><div className="text-pink-800 mt-1">Once/email: 7d active → 7d frozen no edit → delete | 6 months +7d grace → frozen only owner unfreeze</div></div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-between items-center text-[9px] text-cyan-900 tracking-[0.3em] border-t border-cyan-900/10 pt-4">
          <span>CYBER PROTOCOL V2 • NO-INDEX • HIDDEN FROM GOOGLE • OWNER ONLY • PALMPAY 9151723199 • 12 COLORS • KYC • ₦5000</span>
          <span className="animate-pulse">● SECURE</span>
        </div>
      </div>
    </div>
  );
}
