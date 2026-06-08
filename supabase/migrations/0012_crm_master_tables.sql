-- =====================================================================
-- CRM Master Tables — landasan untuk aplikasi crm-redigma & app lain
-- =====================================================================
-- Pattern: ETL dari tabel CSV mentah (datasets) → tabel master rapi.
-- App downstream (CRM, Finance, dll) cuma baca dari tabel master ini,
-- tidak peduli struktur tabel CSV yang fluktuatif.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CRM MASTER TABLES
-- ---------------------------------------------------------------------

-- Customers — 1 row per customer (dedup by normalized_phone)
create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,                          -- normalized: 6281xxx
  email text,
  address text,
  city text,
  province text,
  segment_rfm text,                    -- 'gold', 'silver', 'bronze', dll
  total_spent numeric default 0,
  total_orders int default 0,
  last_purchase_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_data jsonb,                      -- backup full row dari CSV asli
  source_dataset_id uuid references public.datasets(id) on delete set null
);

create unique index if not exists idx_crm_customers_phone
  on public.crm_customers(phone) where phone is not null;
create unique index if not exists idx_crm_customers_email
  on public.crm_customers(email) where email is not null;
create index if not exists idx_crm_customers_segment on public.crm_customers(segment_rfm);

-- Transactions — riwayat order
create table if not exists public.crm_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers(id) on delete set null,
  order_id text,                       -- ID order dari source (mis. invoice number)
  amount numeric not null default 0,
  channel text,                        -- 'shopee', 'tiktok', 'manual', dll
  status text,                         -- 'paid', 'pending', 'cancelled'
  occurred_at timestamptz,
  raw_data jsonb,
  source_dataset_id uuid references public.datasets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_transactions_customer
  on public.crm_transactions(customer_id);
create unique index if not exists idx_crm_transactions_order_id
  on public.crm_transactions(order_id) where order_id is not null;
create index if not exists idx_crm_transactions_occurred
  on public.crm_transactions(occurred_at desc);

-- Followup logs — komunikasi CS dengan customer
create table if not exists public.crm_followup_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers(id) on delete cascade,
  user_id uuid references public.user_profiles(id),
  type text not null,                  -- 'wa', 'call', 'email', 'note'
  content text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_followup_customer
  on public.crm_followup_logs(customer_id, occurred_at desc);

-- WhatsApp templates
create table if not exists public.crm_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null,
  variables jsonb,                     -- {nama_customer: "string", produk: "string"}
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. MAPPING CONFIG — atur kolom CSV mana = kolom master mana
-- ---------------------------------------------------------------------
create table if not exists public.crm_dataset_mappings (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  target_table text not null check (target_table in (
    'crm_customers', 'crm_transactions'
  )),
  -- column_map: { master_column: source_column_physical_name }
  -- contoh: { "full_name": "nama_customer", "phone": "no_wa", "amount": "total_harga" }
  column_map jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_id, target_table)
);

-- ---------------------------------------------------------------------
-- 3. SYNC LOG
-- ---------------------------------------------------------------------
create table if not exists public.crm_sync_log (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references public.datasets(id) on delete set null,
  target_table text,
  mode text not null check (mode in ('auto', 'manual', 'rebuild_all')),
  status text not null check (status in ('success', 'failed', 'partial')),
  rows_processed int default 0,
  rows_inserted int default 0,
  rows_updated int default 0,
  rows_skipped int default 0,
  error_summary jsonb,
  duration_ms int,
  run_by uuid references public.user_profiles(id),
  run_at timestamptz not null default now()
);

create index if not exists idx_crm_sync_log_dataset on public.crm_sync_log(dataset_id, run_at desc);
create index if not exists idx_crm_sync_log_run_at on public.crm_sync_log(run_at desc);

-- ---------------------------------------------------------------------
-- 4. RLS POLICIES
-- ---------------------------------------------------------------------
alter table public.crm_customers enable row level security;
alter table public.crm_transactions enable row level security;
alter table public.crm_followup_logs enable row level security;
alter table public.crm_whatsapp_templates enable row level security;
alter table public.crm_dataset_mappings enable row level security;
alter table public.crm_sync_log enable row level security;

-- CRM tables — read for staff/spv/head di divisi CRM + admin/direksi.
-- Write — admin atau staff/spv/head di divisi CRM.
do $$
declare
  t text;
  crm_divs text := $sql$ in ('crm', 'crm_b2b', 'cs') $sql$;
begin
  for t in
    select unnest(array[
      'crm_customers', 'crm_transactions', 'crm_followup_logs',
      'crm_whatsapp_templates', 'crm_dataset_mappings', 'crm_sync_log'
    ])
  loop
    execute format('drop policy if exists "crm_select" on public.%I', t);
    execute format(
      $pol$ create policy "crm_select" on public.%I for select to authenticated using (
        public.is_admin(auth.uid()) or public.is_direksi(auth.uid())
        or exists (
          select 1 from public.user_divisions
          where user_id = auth.uid() and division_code %s
        )
      ) $pol$,
      t, crm_divs
    );

    execute format('drop policy if exists "crm_write" on public.%I', t);
    execute format(
      $pol$ create policy "crm_write" on public.%I for all to authenticated using (
        public.is_admin(auth.uid())
        or exists (
          select 1 from public.user_divisions
          where user_id = auth.uid() and division_code %s
            and role in ('staff', 'spv', 'head')
        )
      ) with check (true) $pol$,
      t, crm_divs
    );
  end loop;
end $$;
