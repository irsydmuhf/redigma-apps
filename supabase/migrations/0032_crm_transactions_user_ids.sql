-- =====================================================================
-- Migration 0032: Tambah kolom user_id per peran di crm_transactions
-- =====================================================================
-- Setelah alias diset, transaksi bisa di-link ke akun pemilik per peran.
-- Kolom NULL = belum match alias (masuk Inbox Perlu Ditinjau).
-- =====================================================================

alter table public.crm_transactions
  add column if not exists cs_user_id      uuid references public.user_profiles(id) on delete set null,
  add column if not exists adv_user_id     uuid references public.user_profiles(id) on delete set null,
  add column if not exists crm_user_id     uuid references public.user_profiles(id) on delete set null,
  add column if not exists live_user_id    uuid references public.user_profiles(id) on delete set null,
  add column if not exists content_user_id uuid references public.user_profiles(id) on delete set null;

-- Kolom nama raw untuk Live & Content (CRM raw belum perlu — disiapkan saja)
alter table public.crm_transactions
  add column if not exists crm_name     text,
  add column if not exists live_name    text,
  add column if not exists content_name text;

-- Index buat query dashboard "transaksi saya"
create index if not exists idx_tx_cs_user      on public.crm_transactions (cs_user_id)      where cs_user_id is not null;
create index if not exists idx_tx_adv_user     on public.crm_transactions (adv_user_id)     where adv_user_id is not null;
create index if not exists idx_tx_crm_user     on public.crm_transactions (crm_user_id)     where crm_user_id is not null;
create index if not exists idx_tx_live_user    on public.crm_transactions (live_user_id)    where live_user_id is not null;
create index if not exists idx_tx_content_user on public.crm_transactions (content_user_id) where content_user_id is not null;

-- Index untuk Inbox (yang belum ke-link)
create index if not exists idx_tx_unlinked_cs  on public.crm_transactions (cs_name)  where cs_user_id  is null and cs_name  is not null;
create index if not exists idx_tx_unlinked_adv on public.crm_transactions (adv_name) where adv_user_id is null and adv_name is not null;

notify pgrst, 'reload schema';
