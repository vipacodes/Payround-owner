-- PayRound Supabase Setup - Run this in Supabase Dashboard -> SQL Editor -> New Query
-- Project: https://biqutnjvhkvldrihywdb.supabase.co

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE - 1 account per email enforced, trial once per email
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null,
  phone text,
  password_hash text,
  trial_used boolean default false,
  role text default 'member',
  created_at timestamp with time zone default now()
);
alter table users enable row level security;
create policy "Public can read users" on users for select using (true);
create policy "Public can insert users" on users for insert with check (true);
create policy "Public can update users" on users for update using (true);

-- GROUPS TABLE - With 12 colors, status, KYC, receipts, freeze logic
create table if not exists groups (
  id text primary key,
  name text not null,
  description text,
  amount integer not null,
  frequency text not null,
  max_members integer not null,
  color text not null default '#0A7E3C',
  admin_email text not null,
  admin_name text,
  status text not null default 'pending_owner', -- pending_owner, trial_active, trial_frozen, active, grace, frozen, deleted, rejected, pending_renewal
  selfie_url text,
  id_url text,
  id_type text,
  creation_receipt_url text,
  renewal_receipt_url text,
  first_payment_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  frozen_at timestamp with time zone,
  delete_at timestamp with time zone,
  expiry_at timestamp with time zone,
  grace_ends_at timestamp with time zone,
  health integer default 100,
  is_verified boolean default false,
  rejection_reason text,
  created_at timestamp with time zone default now()
);
alter table groups enable row level security;
create policy "Public read groups" on groups for select using (true);
create policy "Public insert groups" on groups for insert with check (true);
create policy "Public update groups" on groups for update using (true);
create policy "Public delete groups" on groups for delete using (true);

-- MEMBER RECEIPTS - Pending until Group Admin approves
create table if not exists member_receipts (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  member_email text not null,
  member_name text not null,
  amount integer not null,
  receipt_url text not null,
  status text not null default 'pending', -- pending, approved, rejected
  uploaded_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);
alter table member_receipts enable row level security;
create policy "Public read receipts" on member_receipts for select using (true);
create policy "Public insert receipts" on member_receipts for insert with check (true);
create policy "Public update receipts" on member_receipts for update using (true);

-- ADS - Pricing 500/day, 3325/week, 13500/month + media + receipt
create table if not exists ads (
  id text primary key,
  business_name text not null,
  description text not null,
  phone text not null,
  website text,
  media_url text not null,
  media_type text default 'image',
  duration_days integer not null,
  price integer not null,
  payment_receipt_url text not null,
  status text not null default 'pending', -- pending, approved, rejected, expired
  submitter_email text not null,
  submitted_at timestamp with time zone default now(),
  approved_at timestamp with time zone,
  expires_at timestamp with time zone
);
alter table ads enable row level security;
create policy "Public read ads" on ads for select using (true);
create policy "Public insert ads" on ads for insert with check (true);
create policy "Public update ads" on ads for update using (true);

-- OWNER SETTINGS - Editable anytime, Palmpay 9151723199
create table if not exists owner_settings (
  id integer primary key default 1,
  bank_name text not null default 'Palmpay',
  account_number text not null default '9151723199',
  account_name text not null default 'Basikoro James Okeroghene',
  whatsapp text not null default '+2349151723199',
  group_fee integer not null default 5000,
  renewal_fee integer not null default 5000,
  ad_1day integer not null default 500,
  ad_1week integer not null default 3325,
  ad_1month integer not null default 13500,
  updated_at timestamp with time zone default now()
);
alter table owner_settings enable row level security;
create policy "Public read owner_settings" on owner_settings for select using (true);
create policy "Public upsert owner_settings" on owner_settings for insert with check (true);
create policy "Public update owner_settings" on owner_settings for update using (true);

-- Insert default owner settings
insert into owner_settings (id, bank_name, account_number, account_name, whatsapp, group_fee, renewal_fee, ad_1day, ad_1week, ad_1month)
values (1, 'Palmpay', '9151723199', 'Basikoro James Okeroghene', '+2349151723199', 5000, 5000, 500, 3325, 13500)
on conflict (id) do update set
  bank_name = excluded.bank_name,
  account_number = excluded.account_number,
  account_name = excluded.account_name,
  whatsapp = excluded.whatsapp,
  group_fee = excluded.group_fee,
  renewal_fee = excluded.renewal_fee,
  ad_1day = excluded.ad_1day,
  ad_1week = excluded.ad_1week,
  ad_1month = excluded.ad_1month,
  updated_at = now();

-- NOTIFICATIONS - For owner dashboard + WhatsApp to +2349151723199
create table if not exists notifications (
  id text primary key,
  type text not null,
  group_id text,
  message text not null,
  is_read boolean default false,
  created_at timestamp with time zone default now()
);
alter table notifications enable row level security;
create policy "Public read notifications" on notifications for select using (true);
create policy "Public insert notifications" on notifications for insert with check (true);
create policy "Public update notifications" on notifications for update using (true);

-- SEED ORIGINAL GROUPS with colors
insert into groups (id, name, description, amount, frequency, max_members, color, admin_email, admin_name, status, is_verified, health)
values 
  ('BF10248', 'Bright Future Ajo', 'A community savings group for bright futures. We save together, grow together.', 50000, 'Weekly', 20, '#0A7E3C', 'bola@example.com', 'Bola Adewale', 'active', true, 92),
  ('MF56789', 'Market Women Ajo', 'For traders at Balogun Market. Daily contributions, weekly payouts.', 2000, 'Daily', 15, '#2563EB', 'esther@example.com', 'Esther Ogunlesi', 'active', true, 85),
  ('CF90123', 'Church Family Fund', 'Church members supporting each other through monthly contributions.', 10000, 'Monthly', 25, '#DC2626', 'john@example.com', 'Pastor John Adebayo', 'active', true, 78)
on conflict (id) do nothing;

-- ============================================================
-- MIGRATION v1.1 (Aug 2026) - Run this section once if your
-- database was created before this version. Safe to re-run.
-- ============================================================

-- Blue verification badge on users (owner grants in owner panel)
alter table users add column if not exists is_verified boolean default false;

-- Owner announcements shown at top of the user site
alter table owner_settings add column if not exists announcement_text text;
alter table owner_settings add column if not exists announcement_media_url text;
alter table owner_settings add column if not exists announcement_updated_at timestamp with time zone;

-- Owner password stored as SHA-256 hash only (never plain text).
-- Managed from the owner panel -> Settings tab.
alter table owner_settings add column if not exists owner_password_hash text;

-- ============================================================
-- MIGRATION v1.2 (Aug 2026) - Safe to re-run.
-- ============================================================

-- Referral system: who referred this user + their earnings
alter table users add column if not exists referred_by text;
alter table users add column if not exists referral_earnings integer default 0;

-- GROUP MEMBERS - join requests approved by group admin before becoming member
create table if not exists members (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  member_email text not null,
  member_name text,
  status text not null default 'pending', -- pending, approved, declined
  requested_at timestamp with time zone default now(),
  approved_at timestamp with time zone,
  unique (group_id, member_email)
);
alter table members enable row level security;
create policy "Public read members" on members for select using (true);
create policy "Public insert members" on members for insert with check (true);
create policy "Public update members" on members for update using (true);

-- GROUP REVIEWS - users rate groups 1-5 stars with review text
create table if not exists group_reviews (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  reviewer_email text not null,
  reviewer_name text,
  rating integer not null check (rating between 1 and 5),
  review text,
  created_at timestamp with time zone default now()
);
alter table group_reviews enable row level security;
create policy "Public read group_reviews" on group_reviews for select using (true);
create policy "Public insert group_reviews" on group_reviews for insert with check (true);

-- MEMBER REVIEWS - group admins review members; visible to other admins at join approval
create table if not exists member_reviews (
  id text primary key,
  member_email text not null,
  group_id text references groups(id) on delete set null,
  admin_email text not null,
  rating integer check (rating between 1 and 5),
  review text,
  created_at timestamp with time zone default now()
);
alter table member_reviews enable row level security;
create policy "Public read member_reviews" on member_reviews for select using (true);
create policy "Public insert member_reviews" on member_reviews for insert with check (true);

-- VERIFICATION REQUESTS - groups submit images why they should be verified
create table if not exists verification_requests (
  id text primary key,
  group_id text references groups(id) on delete cascade,
  group_name text,
  admin_email text,
  reason text,
  images text, -- comma-separated image urls
  status text not null default 'pending', -- pending, approved, declined
  decline_reason text,
  created_at timestamp with time zone default now(),
  reviewed_at timestamp with time zone
);
alter table verification_requests enable row level security;
create policy "Public read verification_requests" on verification_requests for select using (true);
create policy "Public insert verification_requests" on verification_requests for insert with check (true);
create policy "Public update verification_requests" on verification_requests for update using (true);

-- Subscription cycle changed from 6 months to 4 months
alter table owner_settings add column if not exists subscription_months integer not null default 4;

-- Homepage stats overrides (NULL = show real number). Managed from owner Settings.
alter table owner_settings add column if not exists stats_users_override integer;
alter table owner_settings add column if not exists stats_groups_override integer;
alter table owner_settings add column if not exists stats_saved_override integer;
alter table owner_settings add column if not exists stats_satisfaction_override integer;

-- ============================================================
-- MIGRATION v1.3 (Aug 2026) - Safe to re-run.
-- ============================================================

-- User APPROVAL is now separate from the blue verification badge:
-- approving a user activates the account; the blue badge is granted
-- only from the owner panel -> Verification tab.
alter table users add column if not exists is_approved boolean default false;
alter table users add column if not exists approval_status text not null default 'pending'; -- pending, approved, declined
alter table users add column if not exists decline_reason text;

-- Verification requests can now be for groups OR users
alter table verification_requests add column if not exists subject_type text not null default 'group'; -- group, user
alter table verification_requests add column if not exists user_email text;
alter table verification_requests add column if not exists user_name text;

-- ============================================================
-- MIGRATION v1.4 (Aug 2026) - Safe to re-run.
-- ============================================================

-- Profile images: user signup photo + optional group picture
alter table users add column if not exists profile_pic text;
alter table groups add column if not exists avatar_url text;

-- Targeted notifications (user_email NULL = broadcast to everyone)
alter table notifications add column if not exists user_email text;

-- Users can delete their own account from the user site Settings tab
drop policy if exists "Public delete users" on users;
create policy "Public delete users" on users for delete using (true);

-- ============================================================
-- MIGRATION v1.5 (Aug 2026) - Group subscription plans. Safe to re-run.
-- Old: ₦5,000 / 4 months. New: creator picks a plan at creation.
-- ============================================================

-- Plans chosen per group
alter table groups add column if not exists plan_months integer;
alter table groups add column if not exists plan_price integer;

-- Plan prices (owner-editable from owner panel -> Settings)
alter table owner_settings add column if not exists plan_1m integer not null default 1500;
alter table owner_settings add column if not exists plan_6m integer not null default 8000;
alter table owner_settings add column if not exists plan_12m integer not null default 15000;

-- Optional: public storage bucket for announcement media
-- (Create in Dashboard -> Storage -> New bucket -> name: announcements, public: on)

-- SEED ADS
insert into ads (id, business_name, description, phone, website, media_url, duration_days, price, payment_receipt_url, status, submitter_email, expires_at)
values
  ('ad1', 'BolarTech Solutions', 'Affordable web development and IT services. We build modern websites from ₦150,000.', '08012345678', 'https://bolartech.com', 'https://via.placeholder.com/400x200?text=BolarTech', 30, 13500, 'https://via.placeholder.com/400x200?text=Receipt', 'approved', 'admin@test.com', now() + interval '30 days'),
  ('ad2', 'Deola Fashion House', 'Premium native and contemporary fashion. Custom designs for all occasions.', '08098765432', null, 'https://via.placeholder.com/400x200?text=Deola', 7, 3325, 'https://via.placeholder.com/400x200?text=Receipt', 'approved', 'admin@test.com', now() + interval '7 days')
on conflict (id) do nothing;

-- ============================================================
-- v1.6 MIGRATION — Profile photo changes require owner approval
-- (user uploads -> saved here; owner approves -> moved to profile_pic)
-- ============================================================
alter table users add column if not exists pending_profile_pic text;

-- ============================================================
-- v1.7 MIGRATION — DELETE policies for auto-purge & account deletion
-- (notifications older than 60 days are auto-deleted by the apps;
--  users' membership rows are removed when they delete their account)
-- ============================================================
drop policy if exists "Public delete notifications" on notifications;
create policy "Public delete notifications" on notifications for delete using (true);
drop policy if exists "Public delete members" on members;
create policy "Public delete members" on members for delete using (true);

-- ============================================================
-- v1.8 MIGRATION — group badge tiers + member phone on join requests
-- ============================================================
alter table groups add column if not exists badge_tier text;
alter table members add column if not exists member_phone text;

-- ============================================================
-- v1.9 MIGRATION — signup ID photos for owner review (+ legacy
-- broadcast notifications purge, already applied to the database)
-- ============================================================
alter table users add column if not exists id_front_url text;
alter table users add column if not exists id_back_url text;
delete from notifications where user_email is null and group_id is null;
-- =====================================================================
-- v2.0 — Group rotation spots, contribution payments & payout board
-- A member can hold multiple spots. Receipts are uploaded per spot and
-- per number of weeks (upfront). Group admin approves (marks member paid)
-- or declines (with optional reason, member notified). Collected payouts
-- are marked per spot and visible to everyone in the group.
-- =====================================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS spots text DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS spots_requested integer DEFAULT 1;

-- Receipt uploads for weekly/period contributions
CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  group_id text NOT NULL,
  member_id text,
  user_email text NOT NULL,
  member_name text,
  spots text DEFAULT '',            -- comma-separated spot numbers paid for, e.g. '1,19'
  weeks integer DEFAULT 1,         -- how many weeks/periods this payment covers
  amount numeric DEFAULT 0,
  receipt_url text,                -- compressed image data URL
  status text DEFAULT 'pending',   -- pending | approved | declined
  decline_reason text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_select ON payments FOR SELECT USING (true);
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY payments_update ON payments FOR UPDATE USING (true);
CREATE POLICY payments_delete ON payments FOR DELETE USING (true);

-- Payout board — one row per collected payout (marked by group admin)
CREATE TABLE IF NOT EXISTS payouts (
  id text PRIMARY KEY,
  group_id text NOT NULL,
  spot integer NOT NULL,
  user_email text,
  member_name text,
  amount numeric DEFAULT 0,
  week integer,
  status text DEFAULT 'collected',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_select ON payouts;
DROP POLICY IF EXISTS payouts_insert ON payouts;
DROP POLICY IF EXISTS payouts_update ON payouts;
DROP POLICY IF EXISTS payouts_delete ON payouts;
CREATE POLICY payouts_select ON payouts FOR SELECT USING (true);
CREATE POLICY payouts_insert ON payouts FOR INSERT WITH CHECK (true);
CREATE POLICY payouts_update ON payouts FOR UPDATE USING (true);
CREATE POLICY payouts_delete ON payouts FOR DELETE USING (true);

-- v2.1 editable profile fields (unlocked after PayRound approves the account)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;

-- v2.2 follow system + ad contact column (+ schema reload note: run NOTIFY pgrst, 'reload schema'; after)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS contact text;

CREATE TABLE IF NOT EXISTS follows (
  id text PRIMARY KEY,
  follower_email text NOT NULL,
  following_id text,
  following_email text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follows_select ON follows;
DROP POLICY IF EXISTS follows_insert ON follows;
DROP POLICY IF EXISTS follows_delete ON follows;
CREATE POLICY follows_select ON follows FOR SELECT USING (true);
CREATE POLICY follows_insert ON follows FOR INSERT WITH CHECK (true);
CREATE POLICY follows_delete ON follows FOR DELETE USING (true);

-- v2.3 ad media slideshow + whatsapp business contact
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_urls text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS whatsapp text;
NOTIFY pgrst, 'reload schema';


-- =============================================
-- v2.4: Verified-badge applications store the applicant's valid ID
--       so the owner can compare it with the user's profile selfie
-- =============================================
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS id_front_url text;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS id_back_url text;
NOTIFY pgrst, 'reload schema';


-- =============================================
-- v2.5: Direct messages between users (business owners, admins, everyone)
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  from_email text NOT NULL,
  to_email text NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_delete ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (true);
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY messages_update ON messages FOR UPDATE USING (true);
CREATE POLICY messages_delete ON messages FOR DELETE USING (true);
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v2.6: Group chat rooms — every group gets its own members-only conversation
--       (group_messages: inbox rows per group; read/insert/delete are public,
--        the app itself restricts room access to that group's admin & approved members)
-- =============================================
CREATE TABLE IF NOT EXISTS group_messages (
  id text PRIMARY KEY,
  group_id text NOT NULL,
  from_email text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages (group_id, created_at);
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_messages_select ON group_messages;
DROP POLICY IF EXISTS group_messages_insert ON group_messages;
DROP POLICY IF EXISTS group_messages_delete ON group_messages;
CREATE POLICY group_messages_select ON group_messages FOR SELECT USING (true);
CREATE POLICY group_messages_insert ON group_messages FOR INSERT WITH CHECK (true);
CREATE POLICY group_messages_delete ON group_messages FOR DELETE USING (true);
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v2.7: Each group can publish its own rules — shown to every user BEFORE joining
-- =============================================
ALTER TABLE groups ADD COLUMN IF NOT EXISTS rules text;
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v2.8: Group chat admin-lock — when chat_open is FALSE only the group admin can
--       type; the admin opens it for members whenever they want (default: locked)
-- =============================================
ALTER TABLE groups ADD COLUMN IF NOT EXISTS chat_open boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v2.9: User bank account details (editable in Settings, shown on profiles;
--       a group admin's bank is pinned at the top of their group page)
-- =============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name text;
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v3.0: Spot wishlist on join requests — a joiner can ask for preferred spot numbers;
--       if admin can't grant them, admin sends an alternative offer (offered_spots)
--       which the user must ACCEPT or DECLINE before becoming a member
-- =============================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS desired_spots text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS offered_spots text;
NOTIFY pgrst, 'reload schema';

-- =============================================
-- v3.1: Receipt stamps in group chat (image + linked payment + review status),
--       admin payment remark on bank details, owner freeze flags on users/groups,
--       and group edit requests that need owner approval
-- =============================================
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS receipt_status text; -- pending | approved | declined
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_remark text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS group_edit_requests (
  id text PRIMARY KEY,
  group_id text,
  admin_email text,
  changes text,           -- JSON: { field: newValue } — name/description/amount/frequency/max_members
  summary text,           -- human-readable summary for the owner review screen
  status text DEFAULT 'pending',
  decline_reason text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE group_edit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ger_select ON group_edit_requests;
DROP POLICY IF EXISTS ger_insert ON group_edit_requests;
DROP POLICY IF EXISTS ger_update ON group_edit_requests;
DROP POLICY IF EXISTS ger_delete ON group_edit_requests;
CREATE POLICY ger_select ON group_edit_requests FOR SELECT USING (true);
CREATE POLICY ger_insert ON group_edit_requests FOR INSERT WITH CHECK (true);
CREATE POLICY ger_update ON group_edit_requests FOR UPDATE USING (true);
CREATE POLICY ger_delete ON group_edit_requests FOR DELETE USING (true);
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- v3.2 — Custom frequency + admin payout/interest (Aug 2026)
-- =====================================================================
-- groups.frequency_days — when frequency = 'Custom', members contribute every N days
-- groups.payout_amount  — what ONE spot collects on its turn (empty = full pot);
--                          the gap between the full pot and this payout is the
--                          group admin's interest (member side never shows it)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS frequency_days integer;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS payout_amount numeric;
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- v3.3 — Allow receipt stamps to update in group chat (3 Aug 2026 fix)
-- =====================================================================
-- Without this UPDATE policy, approving/declining a payment could NOT flip
-- the receipt's stamp in the group chat (RLS silently blocked the update),
-- so approved receipts kept showing "waiting for review" forever.
DROP POLICY IF EXISTS group_messages_update ON group_messages;
CREATE POLICY group_messages_update ON group_messages FOR UPDATE USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- v3.4 — Group announcement box + admin auto-tick (3 Aug 2026)
-- =====================================================================
-- groups.announcement      — the admin's pinned 📢 message shown above the group
--                            chat composer; stays until the admin clears it
-- groups.admin_auto_paid   — TRUE (default): spots the admin holds tick themselves
--                            paid every round, no receipts needed; FALSE: admin
--                            uploads receipts like everyone else
ALTER TABLE groups ADD COLUMN IF NOT EXISTS announcement text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS admin_auto_paid boolean DEFAULT true;
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- v3.5  ADS PAY-FIRST FLOW
-- Advertisers pick a duration (duration_days/price), pay the owner account, and
-- upload payment_receipt_url AFTER the ad row exists (so leaving to pay never
-- loses data). Users can delete their own ads. Approve stamps approved_at +
-- expires_at; expired ads hide automatically on the user site.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ads ALTER COLUMN payment_receipt_url DROP NOT NULL;
ALTER TABLE public.ads ALTER COLUMN media_url DROP NOT NULL;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz;
DROP POLICY IF EXISTS "ads_update_all" ON public.ads;
CREATE POLICY "ads_update_all" ON public.ads FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ads_delete_all" ON public.ads;
CREATE POLICY "ads_delete_all" ON public.ads FOR DELETE USING (true);
DROP POLICY IF EXISTS "ads_insert_all" ON public.ads;
CREATE POLICY "ads_insert_all" ON public.ads FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "ads_select_all" ON public.ads;
CREATE POLICY "ads_select_all" ON public.ads FOR SELECT USING (true);
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- v3.6  REAL PASSWORD RESET + EMAIL CHANGE
-- /forgot-password generates a temporary password (reset_code) that works for
-- 20 minutes (reset_expires). Logging in with it forces a password change.
-- Users can also change their password & email in Settings (old password
-- required); the email rewrite cascades every table that stores the address.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_code text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_expires timestamptz;
DROP POLICY IF EXISTS "follows_update_all" ON public.follows;
CREATE POLICY "follows_update_all" ON public.follows FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "group_reviews_update_all" ON public.group_reviews;
CREATE POLICY "group_reviews_update_all" ON public.group_reviews FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "member_reviews_update_all" ON public.member_reviews;
CREATE POLICY "member_reviews_update_all" ON public.member_reviews FOR UPDATE USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- v3.7  AD ALT TEXT + REJECTION REASONS + SUPPORT CHAT (bot answers when offline)
-- advertisers can attach optional alt text per media; owner must give a reason
-- when declining an ad; advertisers edit & resubmit rejected ads.
-- support_threads/support_messages power the PayRound Support chat:
-- owner replies from the owner panel; when owner_settings.is_online = false the
-- user site posts an instant chatbot reply (with WhatsApp nudge).
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS media_alts text;
ALTER TABLE public.owner_settings ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.support_threads (
  id text PRIMARY KEY,
  user_email text NOT NULL,
  user_name text,
  last_message text,
  last_at timestamptz DEFAULT now(),
  user_read boolean NOT NULL DEFAULT true,
  owner_read boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.support_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_threads_all" ON public.support_threads;
CREATE POLICY "support_threads_all" ON public.support_threads FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "support_messages_all" ON public.support_messages;
CREATE POLICY "support_messages_all" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';

-- =========================
-- v3.8 — Follower notifications name the follower + deep-link highlight
-- Convention (NO schema change needed): new_follower messages end with a hidden
-- token "[[FOL:<email>]]" — the app strips it for display and uses it to open
-- /profile?followers=1&hl=<email> → the followers list opens with that person
-- scrolled into view & highlighted. Backfill below tags old notifications where
-- the user has EXACTLY ONE follower (100% unambiguous). Safe to re-run.
-- =========================
WITH single AS (
  SELECT lower(following_email) AS fe_email, min(lower(follower_email)) AS follower
  FROM public.follows GROUP BY lower(following_email) HAVING count(*) = 1
)
UPDATE public.notifications n
SET message = '➕ ' || coalesce(nullif(trim((SELECT u.name FROM public.users u WHERE lower(u.email) = s.follower)), ''), 'Someone')
  || ' started following you on PayRound — tap to see them in your followers list.'
  || '[[FOL:' || s.follower || ']]'
FROM single s
WHERE n.type = 'new_follower' AND lower(n.user_email) = s.fe_email AND n.message NOT LIKE '%[[FOL:%';
NOTIFY pgrst, 'reload schema';

-- =========================
-- v3.9 — Ads media Storage bucket: videos as REAL files (up to 12–15MB),
-- no more giant base64 crammed into the ads row (that was the "Submitting…" hangs).
-- Bucket: ads-media → PUBLIC, 15MB per-file cap, image/* + video/* mime types only.
-- Created via Storage REST API (POST /storage/v1/bucket) with the service key.
-- Browser uploads go DIRECT from the user app with the anon key — enabled by the
-- four policies below (already applied via the Management API; kept here for the record):
-- =========================
-- create policy ads_media_read   on storage.objects for select to anon, authenticated using (bucket_id = 'ads-media');
-- create policy ads_media_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'ads-media');
-- create policy ads_media_update on storage.objects for update to anon, authenticated using (bucket_id = 'ads-media') with check (bucket_id = 'ads-media');
-- create policy ads_media_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'ads-media');
-- Files live at: ads-media/ads/<adId>/media-<n>-<ts>.<ext>
-- The ads table rows now store those https URLs inside media_urls (JSON array);
-- small media (photos, receipts) stay base64 data-URLs as before. Both render.

-- =========================
-- v4.0 — AD ANALYTICS + EXPIRY LIFECYCLE (5 Aug 2026)
-- Every ad impression (a media item genuinely appearing on screen) and every tap-through
-- to a business page is recorded in ad_events — views count even when nobody clicks.
-- Dedupe rule in the app: one row per viewer per ad-media per DAY, and the advertiser's
-- own views of their own ad are never counted (honest reach).
-- Lifecycle: approved ads auto-hide from the site feed at expires_at; they hold status
-- 'approved' for 24h on the owner panel (⌛ Expired tab), then the owner panel archives
-- them (status 'archived') — advertisers keep the ad + analytics in My Ads indefinitely.
-- =========================
create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  ad_id text not null references public.ads(id) on delete cascade,
  kind text not null default 'view',   -- 'view' (impression) | 'click' (opened business page)
  media_index integer,                 -- which slideshow item (null = whole-ad event)
  viewer text,                         -- viewer's account email (lowercase); null = guest
  created_at timestamptz not null default now()
);
create index if not exists ad_events_ad_idx on public.ad_events (ad_id, created_at);
alter table public.ad_events enable row level security;
create policy "Public insert ad_events" on public.ad_events for insert to anon, authenticated with check (true);
create policy "Public read ad_events"   on public.ad_events for select to anon, authenticated using (true);
-- (applied live via the Management API on 5 Aug 2026; re-running this whole file is safe apart
--  from policy-name collisions — drop policy if exists first if you ever replay it)
