import { createClient } from '@supabase/supabase-js';

function getEnv(name, fallback) {
  const val = process.env[name];
  if (!val || val === 'null' || val === 'undefined' || val.trim() === '') return fallback;
  return val.trim().replace(/^["']|["']$/g, '');
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://biqutnjvhkvldrihywdb.supabase.co');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
// Owner password - B@$ik0r0 - hashed check in production, plain for demo but stored in env in real
export const OWNER_PASSWORD = getEnv('OWNER_PASSWORD', 'B@$ik0r0');
export const OWNER_PASSWORD_HASH = 'B@$ik0r0'; // In production, hash this

export const GROUP_COLORS = ['#0A7E3C','#2563EB','#DC2626','#7C3AED','#EA580C','#0891B2','#BE185D','#4338CA','#15803D','#B45309','#0E7490','#1F2937'];

export function isOwnerEmail(email) {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase().trim());
}

export function verifyOwnerPassword(email, password) {
  if (!isOwnerEmail(email)) return false;
  return password === OWNER_PASSWORD;
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
