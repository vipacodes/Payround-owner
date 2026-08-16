function clean(value) {
  const text = String(value ?? '').trim().replace(/^["']|["']$/g, '');
  return !text || text === 'null' || text === 'undefined' ? '' : text;
}

function jwtRole(key) {
  if (!key.startsWith('eyJ')) return '';
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof window === 'undefined'
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(Array.from(atob(payload), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return String(JSON.parse(decoded)?.role || '').toLowerCase();
  } catch {
    return '';
  }
}

export function publicSupabaseConfig() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase URL.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTPS *.supabase.co URL.');
  }
  const role = jwtRole(key);
  if (!key || key.startsWith('sb_secret_') || role === 'service_role' || role === 'supabase_admin') {
    throw new Error('Browser Supabase key is missing or privileged. Configure only a publishable/anon key.');
  }
  if (!(key.startsWith('sb_publishable_') || role === 'anon')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase publishable/anon key.');
  }
  return Object.freeze({ url, key });
}
