'use client';
import { useState, useEffect } from 'react';

const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
const OWNER_PASSWORD = 'B@$ik0r0';

export default function OwnerDashboardPro() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [activeMenu, setActiveMenu] = useState('dashboard');

  useEffect(() => {
    const stored = localStorage.getItem('payround_owner_user');
    if (stored) {
      try { const u = JSON.parse(stored); if (OWNER_EMAILS.includes(u.email?.toLowerCase())) { setUser(u); setIsOwner(true); } } catch {}
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!OWNER_EMAILS.includes(em)) { setMsg('Access Denied - Owner only'); return; }
    if (password !== OWNER_PASSWORD) { setMsg('Invalid password'); return; }
    const u = { email: em, name: em.split('@')[0] };
    localStorage.setItem('payround_owner_user', JSON.stringify(u));
    setUser(u); setIsOwner(true);
  };
  const handleLogout = () => { localStorage.removeItem('payround_owner_user'); setUser(null); setIsOwner(false); };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3 text-white font-bold text-xl">P</div>
            <h1 className="text-xl font-bold">PayRound Owner</h1>
            <p className="text-xs text-gray-500 mt-1">Professional Dashboard - Hidden from Google - No-index</p>
            <p className="text-[10px] text-gray-400 mt-1">Only Vipadarapper@gmail.com & Payroundsupport@gmail.com</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Owner Email" type="email" className="w-full border rounded-xl px-4 py-3 text-sm" />
            <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password B@$ik0r0" type="password" className="w-full border rounded-xl px-4 py-3 text-sm" />
            <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold">Login as Owner</button>
          </form>
          {msg && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">{msg}</div>}
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Total Users', value: '15,782', change: '12.5% from last month', icon: '👥', bg: 'bg-purple-100', iconBg: 'bg-purple-200', text: 'text-purple-700' },
    { label: 'Active Groups', value: '1,248', change: '8.3% from last month', icon: '👥', bg: 'bg-blue-100', iconBg: 'bg-blue-200', text: 'text-blue-700' },
    { label: 'Pending Groups', value: '32', change: '2 from last month', icon: '⏰', bg: 'bg-amber-100', iconBg: 'bg-amber-200', text: 'text-amber-700', down: true },
    { label: 'Total Contributions', value: '₦87,430,250', change: '15.7% from last month', icon: '💳', bg: 'bg-green-100', iconBg: 'bg-green-200', text: 'text-green-700' },
    { label: 'Total Payouts', value: '₦62,310,540', change: '11.2% from last month', icon: '📈', bg: 'bg-purple-100', iconBg: 'bg-purple-200', text: 'text-purple-700' },
  ];

  const activeGroups = [
    { name: 'Faith Connect', id: 'GRP-8921', admin: 'Adaobi N.', adminVerified: true, members: '25/30', payout: 'Aug 2, 2025', status: 'Active' },
    { name: 'Dream Big Savings', id: 'GRP-7742', admin: 'Chinedu K.', adminVerified: false, members: '30/30', payout: 'Aug 5, 2025', status: 'Active' },
    { name: 'Family First', id: 'GRP-6653', admin: 'Blessing A.', adminVerified: true, members: '20/25', payout: 'Aug 1, 2025', status: 'Active' },
    { name: 'We Rise Together', id: 'GRP-5541', admin: 'Emeka J.', adminVerified: true, members: '15/20', payout: 'Aug 3, 2025', status: 'Active' },
    { name: 'Unity Circle', id: 'GRP-4432', admin: 'Mercy O.', adminVerified: true, members: '28/30', payout: 'Aug 4, 2025', status: 'Active' },
  ];

  const pendingGroups = [
    { name: 'New Beginnings', admin: 'Precious M.', members: '12/20', created: 'Jul 30, 2025' },
    { name: 'Greater Heights', admin: 'Tosin B.', members: '8/15', created: 'Jul 29, 2025' },
    { name: 'Blessed Hands', admin: 'Joy U.', members: '10/25', created: 'Jul 29, 2025' },
    { name: 'Royal Circle', admin: 'Kingsley E.', members: '6/10', created: 'Jul 28, 2025' },
    { name: 'Progress Hub', admin: 'Sandra I.', members: '9/20', created: 'Jul 28, 2025' },
  ];

  const frozenAccounts = [
    { user: 'John Doe', email: 'johndoe@gmail.com', frozenOn: 'Jul 30, 2025', reason: 'Violation of rules' },
    { user: 'Mercy Chinwe', email: '09012345678', frozenOn: 'Jul 29, 2025', reason: 'Fraudulent activity' },
    { user: 'David Samuel', email: 'david@email.com', frozenOn: 'Jul 28, 2025', reason: 'Multiple complaints' },
  ];

  const frozenGroups = [
    { name: 'Quick Cash', id: 'GRP-3311', frozenOn: 'Jul 30, 2025', reason: 'Policy violation' },
    { name: 'Easy Money', id: 'GRP-2212', frozenOn: 'Jul 30, 2025', reason: 'Fraudulent activity' },
    { name: 'Lucky Loop', id: 'GRP-1122', frozenOn: 'Jul 28, 2025', reason: 'Multiple reports' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - matches screenshot dark */}
      <div className="w-64 bg-[#1a1b3a] text-white flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center font-bold">P</div>
            <div><div className="font-bold">PayRound</div><div className="text-[10px] text-white/50 tracking-widest">OWNER DASHBOARD</div></div>
          </div>
          <div className="mt-5 flex items-center gap-3 bg-white/5 rounded-xl p-3">
            <img src="https://i.pravatar.cc/100?img=12" alt="owner" className="w-8 h-8 rounded-full" />
            <div><div className="text-sm font-semibold">PayRound Owner</div><div className="text-[10px] bg-purple-600 px-2 py-0.5 rounded-full inline-block mt-1">Owner</div></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6">
          <div>
            <div className="text-[10px] text-white/40 tracking-widest px-3 mb-2">OVERVIEW</div>
            <div className="space-y-1">
              <button onClick={()=>setActiveMenu('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${activeMenu==='dashboard'?'bg-purple-600 text-white':'text-white/60 hover:bg-white/5'}`}><span>📊</span> Dashboard</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>📈</span> Analytics</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>👥</span> Users</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>👥</span> Groups</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>✅</span> Verifications</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>💳</span> Transactions</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>⚠️</span> Disputes</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>📢</span> Announcements</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl"><span>💬</span> Support Messages</button>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-white/40 tracking-widest px-3 mb-2">MANAGEMENT</div>
            <div className="space-y-1">
              <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/60 hover:bg-white/5 rounded-xl"><span className="flex items-center gap-3">⏳ Pending Groups</span><span className="bg-purple-600 text-[10px] px-2 py-0.5 rounded-full">12</span></button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">🚫 Freeze Accounts</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">🚫 Freeze Groups</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">🏅 Verification Badges</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">🏦 Bank Details</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">⚙️ Site Settings</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">📧 Email / SMS</button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">📝 Activity Logs</button>
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:bg-white/5 rounded-xl">↩️ Logout</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="bg-white border-b px-6 h-16 flex items-center justify-between">
          <div><h1 className="font-bold text-lg">Dashboard Overview</h1><p className="text-xs text-gray-500">Welcome back! Here&apos;s what&apos;s happening on PayRound.</p></div>
          <div className="flex items-center gap-4">
            <div className="text-xs border rounded-lg px-3 py-1.5">Jul 30, 2025 - Aug 30, 2025 ▼</div>
            <div className="relative"><span className="text-xl">🔔</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">8</span></div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.map((s,i)=>(
              <div key={i} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}><span className={`${s.text}`}>{s.icon}</span></div>
                  <span className={`text-[10px] ${s.down?'text-red-500':'text-green-600'}`}>{s.down?'↓':'↑'} {s.change}</span>
                </div>
                <div className="mt-3"><div className="text-xs text-gray-500">{s.label}</div><div className="font-bold text-lg">{s.value}</div></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Groups */}
            <div className="lg:col-span-2 bg-white rounded-xl border p-5">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2">👥 Active Groups</h3><button className="text-xs border rounded-lg px-3 py-1">View all</button></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-400"><tr><th className="text-left py-2 font-medium">Group Name</th><th className="text-left font-medium">Group ID</th><th className="text-left font-medium">Admin</th><th className="text-left font-medium">Members</th><th className="text-left font-medium">Next Payout</th><th className="text-left font-medium">Status</th></tr></thead>
                  <tbody>
                    {activeGroups.map((g,i)=>(
                      <tr key={i} className="border-t"><td className="py-3 font-medium">{g.name}</td><td className="font-mono text-gray-500">{g.id}</td><td className="flex items-center gap-1">{g.admin} {g.adminVerified&&<span className="text-blue-500">✓</span>}</td><td>{g.members}</td><td>{g.payout}</td><td><span className="bg-green-50 text-green-700 px-2 py-1 rounded-full text-[10px]">{g.status}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[11px] text-gray-500">Showing 1 to 5 of 1,248 groups • Real groups only when created and approved - top rated + most active at top</div>
            </div>

            {/* Pending Groups */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2">⏰ Pending Groups (Awaiting Approval)</h3><button className="text-xs border rounded-lg px-3 py-1">View all</button></div>
              <div className="space-y-3">
                {pendingGroups.map((g,i)=>(
                  <div key={i} className="flex items-center justify-between text-xs border-b pb-2">
                    <div><div className="font-medium">{g.name}</div><div className="text-gray-500">{g.admin} • {g.members} • {g.created}</div></div>
                    <div className="flex gap-1"><button className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] border">Approve</button><button className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-[10px] border">Reject</button></div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-gray-400 mt-3">Showing 1 to 5 of 32 groups • Selfie+ID+12 colors+₦5000 Palmpay 9151723199 receipt • AI + NIN API</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2">❄️ Recently Frozen Accounts</h3><button className="text-xs border rounded-lg px-3 py-1">View all</button></div>
                <table className="w-full text-xs">
                  <thead className="text-gray-400"><tr><th className="text-left py-2">User</th><th className="text-left">Email / Phone</th><th className="text-left">Frozen On</th><th className="text-left">Reason</th><th>Action</th></tr></thead>
                  <tbody>{frozenAccounts.map((u,i)=><tr key={i} className="border-t"><td className="py-2 font-medium">{u.user}</td><td className="text-gray-500">{u.email}</td><td>{u.frozenOn}</td><td>{u.reason}</td><td><button className="border rounded-full px-3 py-1 text-[10px]">Unfreeze</button></td></tr>)}</tbody>
                </table>
              </div>
              <div className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2">❄️ Frozen Groups</h3><button className="text-xs border rounded-lg px-3 py-1">View all</button></div>
                <table className="w-full text-xs">
                  <thead className="text-gray-400"><tr><th className="text-left py-2">Group Name</th><th className="text-left">Group ID</th><th className="text-left">Frozen On</th><th className="text-left">Reason</th><th>Action</th></tr></thead>
                  <tbody>{frozenGroups.map((g,i)=><tr key={i} className="border-t"><td className="py-2 font-medium">{g.name}</td><td className="font-mono text-gray-500">{g.id}</td><td>{g.frozenOn}</td><td>{g.reason}</td><td><button className="border rounded-full px-3 py-1 text-[10px]">Unfreeze</button></td></tr>)}</tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold text-sm mb-1">Verification Badges</h3><p className="text-[11px] text-gray-500 mb-4">Manage verification badges for group admins</p>
                <div className="space-y-3">
                  <div className="flex gap-3"><div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs">✓</div><div><div className="text-xs font-bold">Plain Verified</div><div className="text-[10px] text-gray-500">Basic verification • Used for standard verification</div></div></div>
                  <div className="flex gap-3"><div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">✓</div><div><div className="text-xs font-bold">Blue Verified</div><div className="text-[10px] text-gray-500">Advanced verification • For trusted and active admins</div></div></div>
                  <div className="flex gap-3"><div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-xs">✓</div><div><div className="text-xs font-bold">Gold Verified</div><div className="text-[10px] text-gray-500">Premium verification • For highly trusted & valued admins</div></div></div>
                </div>
                <button className="mt-4 w-full bg-purple-600 text-white text-xs py-2 rounded-lg">Manage Badges</button>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold text-sm">Bank Details (Displayed on User Site)</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                  <div><div className="text-gray-500">Bank Name</div><div className="font-medium">Wema Bank</div></div>
                  <div><div className="text-gray-500">Account Name</div><div className="font-medium">PayRound Technologies</div></div>
                  <div><div className="text-gray-500">Account Number</div><div className="font-mono">931/...</div></div>
                  <div><div className="text-gray-500">Settlement Percentage</div><div className="font-medium">2.5%</div></div>
                </div>
                <button className="mt-4 w-full bg-purple-600 text-white text-xs py-2 rounded-lg">Edit Bank Details</button>
                <p className="text-[10px] text-gray-400 mt-2">Editable anytime - Palmpay 9151723199 also - reflects on user site instantly</p>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold text-sm mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full flex justify-between items-center border rounded-lg px-3 py-2 text-xs"><span className="flex items-center gap-2">👤 Freeze User Account</span>›</button>
                  <button className="w-full flex justify-between items-center border rounded-lg px-3 py-2 text-xs"><span className="flex items-center gap-2">👥 Freeze Group</span>›</button>
                  <button className="w-full flex justify-between items-center border rounded-lg px-3 py-2 text-xs"><span className="flex items-center gap-2">📢 Send Announcement</span>›</button>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-bold text-sm">Support Contact</h3>
                <p className="text-[11px] text-gray-500 mt-1">Users will see this when their account is frozen.</p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2"><span>✉️</span> PayRoundSupport@gmail.com</div>
                  <div className="flex items-center gap-2"><span>📞</span> +234 915 172 3199</div>
                </div>
                <button className="mt-3 w-full border rounded-lg py-2 text-xs">Edit Contact Info</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-bold mb-4">Overall Analytics</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="flex justify-between items-center mb-2"><h4 className="text-xs font-bold">User Growth</h4><select className="text-[10px] border rounded px-2 py-1"><option>This Month</option></select></div>
                <div className="h-32 bg-gradient-to-t from-purple-50 to-white rounded-xl border flex items-end justify-center p-2">
                  <div className="w-full h-20 bg-purple-600/20 rounded-lg relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600"></div>
                    <div className="absolute bottom-2 right-2 text-[10px] bg-white border rounded px-2 py-1 shadow">Aug 30, 2025<br/>15,782 Users</div>
                    <svg className="w-full h-full" viewBox="0 0 100 40"><path d="M0,35 Q10,30 20,28 T40,20 T60,15 T80,10 T100,5" fill="none" stroke="#7c3aed" strokeWidth="2"/></svg>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>Jul 30</span><span>Aug 30</span></div>
              </div>
              <div>
                <h4 className="text-xs font-bold mb-2">Groups Overview</h4>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-full border-8 border-green-500 border-t-red-400 border-r-yellow-400 relative"><div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">1,248<br/>(80%)</div></div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full"></span>Active Groups 1,248 (80%)</div>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 bg-yellow-400 rounded-full"></span>Pending Groups 32 (10%)</div>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 bg-red-400 rounded-full"></span>Frozen Groups 28 (10%)</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2"><h4 className="text-xs font-bold">Contributions vs Payouts</h4><select className="text-[10px] border rounded px-2 py-1"><option>This Month</option></select></div>
                <div className="h-32 flex items-end gap-1">
                  {[40,60,30,50,70,40,60,70,60,70].map((h,i)=><div key={i} className="flex-1 flex flex-col gap-1"><div className="bg-purple-600 rounded-t" style={{height: `${h}%`}}></div><div className="bg-green-500 rounded-t" style={{height: `${h*0.6}%`}}></div></div>)}
                </div>
                <div className="flex justify-between text-[8px] text-gray-400 mt-1"><span>Jul 30</span><span>Aug 30</span></div>
              </div>
            </div>
          </div>

          <div className="text-center text-[10px] text-gray-400 mt-6">© 2025 PayRound Technologies. All rights reserved. • Owner Dashboard v1.0.0 • Professional • Clean • 12 Colors • KYC • Palmpay 9151723199 • No demo • Placeholders auto-update • 100% static opens</div>
        </div>
      </div>
    </div>
  );
}
