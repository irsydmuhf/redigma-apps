-- =====================================================================
-- Tambah kolom-kolom CRM operasional di crm_customers
-- =====================================================================
-- Kolom yang dibutuhkan oleh aplikasi crm-redigma untuk fitur:
-- - Dashboard "siapa belum di-follow up hari ini"
-- - Customer detail dengan riwayat aktivitas
-- - Assigned CS per customer
-- - Notes & tags
-- =====================================================================

alter table public.crm_customers
  add column if not exists last_contact_at timestamptz,
  add column if not exists last_action_at timestamptz,
  add column if not exists next_followup_at timestamptz,
  add column if not exists notes text,
  add column if not exists tags text[] default '{}',
  add column if not exists assigned_cs_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists assigned_advertiser_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists status text default 'active',  -- active | inactive | blocked
  add column if not exists rfm_recency int,
  add column if not exists rfm_frequency int,
  add column if not exists rfm_monetary int;

-- Index untuk dashboard "belum follow-up hari ini"
create index if not exists idx_crm_customers_next_followup
  on public.crm_customers(next_followup_at)
  where next_followup_at is not null;

-- Index untuk filter by assigned CS
create index if not exists idx_crm_customers_assigned_cs
  on public.crm_customers(assigned_cs_id)
  where assigned_cs_id is not null;

-- Index untuk last contact (for staleness queries)
create index if not exists idx_crm_customers_last_contact
  on public.crm_customers(last_contact_at desc nulls last);

notify pgrst, 'reload schema';
