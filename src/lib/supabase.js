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

let supabaseClient = null;
try {
  if (supabaseUrl && supabaseUrl.startsWith('https://') && supabaseAnonKey && supabaseAnonKey.length > 20) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (e) {
  console.warn('Supabase client not initialised:', e.message);
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
  group_fee: 5000,
  renewal_fee: 5000,
  ad_1day: 500,
  ad_1week: 3325,
  ad_1month: 13500,
};
