import { createClient } from '@supabase/supabase-js';

function getEnv(name, fallback) {
  try {
    const val = process.env[name];
    if (!val || val === 'null' || val === 'undefined' || val.trim() === '' || String(val).includes('null')) return fallback;
    return String(val).trim().replace(/^["']|["']$/g, '');
  } catch { return fallback; }
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://biqutnjvhkvldrihywdb.supabase.co');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU');

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

let supabaseClient = null;
try {
  if (supabaseUrl && supabaseUrl.startsWith('https://') && supabaseAnonKey && supabaseAnonKey.length > 20) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    });
  }
} catch (e) {
  console.warn('Supabase client not initialised:', e.message);
}

/** REST call that always sends the owner Auth token (never the bare anon key). */
export async function ownerRest(pathAndQuery, { method = 'GET', body, session } = {}) {
  const tok = session?.access_token;
  if (!tok) {
    return { data: null, error: { message: 'Not signed in — log out and log in again.' } };
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${tok}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const message = (parsed && parsed.message) || text || `HTTP ${res.status}`;
    return { data: null, error: { message } };
  }
  return { data: parsed, error: null };
}

// Offline-safe fallback so the UI never crashes if env vars are missing
export const supabase = supabaseClient || {
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
      }),
      order: () => Promise.resolve({ data: [], error: null }),
    }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not connected' } }) }),
    insert: () => Promise.resolve({ data: null, error: { message: 'Supabase not connected' } }),
    upsert: () => Promise.resolve({ data: null, error: { message: 'Supabase not connected' } }),
  }),
  auth: {},
  storage: null,
};

export const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];

export const GROUP_COLORS = ['#0A7E3C', '#2563EB', '#DC2626', '#7C3AED', '#EA580C', '#0891B2', '#BE185D', '#4338CA', '#15803D', '#B45309', '#0E7490', '#1F2937'];

export function isOwnerEmail(email) {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase().trim());
}

// SHA-256 hash of the initial owner password. The plain-text password is
// intentionally NOT stored anywhere in this repository. Change the password
// from the Settings tab — the new hash is written to owner_settings and takes
// effect on every device. This constant is only a fallback for first login.
export const OWNER_PASSWORD_HASH_FALLBACK = '40ad63a5540eaa0e0823ca92dbfe7acfb75abf98b53203fdb663ed32cd86709b';

export const DEFAULT_OWNER_SETTINGS = {
  bank_name: 'Palmpay',
  account_number: '9151723199',
  account_name: 'Basikoro James Okeroghene',
  whatsapp: '+2349151723199',
  plan_1m: 1500,
  plan_6m: 8000,
  plan_12m: 15000,
  ad_1day: 500,
  ad_1week: 3325,
  ad_1month: 13500,
};
