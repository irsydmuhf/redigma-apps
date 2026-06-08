-- =====================================================================
-- Tabel crm_segment_snapshots — riwayat segmentasi RFM per periode
-- =====================================================================
-- Setiap kali RFM dihitung ulang (mingguan/bulanan), snapshot disimpan
-- di sini supaya bisa lihat movement segmentasi over time.
-- =====================================================================

create table if not exists public.crm_segment_snapshots (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers(id) on delete cascade,
  segment_rfm text not null,
  recency int,
  frequency int,
  monetary int,
  total_spent numeric default 0,
  snapshot_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_segment_snapshots_customer
  on public.crm_segment_snapshots(customer_id, snapshot_date desc);
create index if not exists idx_crm_segment_snapshots_date
  on public.crm_segment_snapshots(snapshot_date desc);

alter table public.crm_segment_snapshots enable row level security;

drop policy if exists "crm_segment_select" on public.crm_segment_snapshots;
create policy "crm_segment_select"
  on public.crm_segment_snapshots for select to authenticated
  using (
    public.is_admin(auth.uid()) or public.is_direksi(auth.uid())
    or exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and division_code in ('crm', 'crm_b2b', 'cs')
    )
  );

drop policy if exists "crm_segment_write" on public.crm_segment_snapshots;
create policy "crm_segment_write"
  on public.crm_segment_snapshots for all to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and division_code in ('crm', 'crm_b2b', 'cs')
        and role in ('staff', 'spv', 'head')
    )
  )
  with check (true);

notify pgrst, 'reload schema';
