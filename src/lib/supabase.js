import { createClient } from '@supabase/supabase-js';
import { publicSupabaseConfig } from '@/lib/supabaseConfig';

const { url: supabaseUrl, key: supabaseAnonKey } = publicSupabaseConfig();

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

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
