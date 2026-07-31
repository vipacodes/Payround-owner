let supabaseClient = null;

function getEnv(name, fallback) {
  try {
    const val = process.env[name];
    if (!val || val === 'null' || val === 'undefined' || val.trim() === '' || String(val).includes('null')) return fallback;
    return String(val).trim().replace(/^["']|["']$/g, '');
  } catch { return fallback; }
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://biqutnjvhkvldrihywdb.supabase.co');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU');

try {
  const { createClient } = require('@supabase/supabase-js');
  if (supabaseUrl && supabaseUrl.startsWith('https://') && supabaseAnonKey && supabaseAnonKey.length > 20) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (e) {
  console.log('Supabase init fallback', e.message);
}

export const supabase = supabaseClient || {
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: { bank_name: 'Palmpay', account_number: '9151723199', account_name: 'Basikoro James Okeroghene', whatsapp: '+2349151723199', group_fee: 5000, renewal_fee: 5000, ad_1day: 500, ad_1week: 3325, ad_1month: 13500 }, error: null }),
      }),
      order: () => Promise.resolve({ data: [], error: null }),
    }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ data: null, error: null }),
  }),
  auth: {
    signInWithPassword: async ({ email, password }) => {
      if (email.toLowerCase() === 'vipadarapper@gmail.com' && password === 'B@$ik0r0') return { data: { user: { email } }, error: null };
      if (email.toLowerCase() === 'payroundsupport@gmail.com' && password === 'B@$ik0r0') return { data: { user: { email } }, error: null };
      return { data: null, error: { message: 'Invalid login credentials - Check Supabase Auth users exist' } };
    },
    resetPasswordForEmail: () => Promise.resolve({ data: null, error: null }),
  },
};

export const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
export const GROUP_COLORS = ['#0A7E3C','#2563EB','#DC2626','#7C3AED','#EA580C','#0891B2','#BE185D','#4338CA','#15803D','#B45309','#0E7490','#1F2937'];

export function isOwnerEmail(email) {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase().trim());
}

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
