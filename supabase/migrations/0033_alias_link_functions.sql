-- =====================================================================
-- Migration 0033: Fungsi untuk link transaksi ke akun via alias
-- =====================================================================
-- relink_transactions_for_role(role)  → re-scan SEMUA transaksi peran
-- relink_transactions_for_user(role,user) → re-scan untuk 1 user (dipanggil
--                                            setelah alias ditambah/diubah)
-- get_unlinked_names(role)           → daftar nama unik di Excel yang belum
--                                       match alias (untuk Inbox + Bulk Setup)
-- get_excel_names_for_role(role)     → semua nama unik (matched & unmatched)
--                                       untuk popup "Pilih dari Data"
-- =====================================================================

-- ---------------------------------------------------------------------
-- Map kode peran → kolom nama raw + kolom user_id di crm_transactions
-- ---------------------------------------------------------------------
-- Helper: returns name_col, user_id_col untuk role tertentu
create or replace function public._role_columns(p_role text)
returns table (name_col text, user_id_col text)
language sql immutable as $$
  select
    case p_role
      when 'cs'      then 'cs_name'
      when 'adv'     then 'adv_name'
      when 'crm'     then 'crm_name'
      when 'live'    then 'live_name'
      when 'content' then 'content_name'
      else null
    end,
    case p_role
      when 'cs'      then 'cs_user_id'
      when 'adv'     then 'adv_user_id'
      when 'crm'     then 'crm_user_id'
      when 'live'    then 'live_user_id'
      when 'content' then 'content_user_id'
      else null
    end;
$$;

-- ---------------------------------------------------------------------
-- relink_transactions_for_role: re-scan SEMUA transaksi untuk 1 peran
-- ---------------------------------------------------------------------
create or replace function public.relink_transactions_for_role(p_role text)
returns table (matched int, unmatched int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '10min'
as $$
declare
  v_name_col text;
  v_user_col text;
  v_matched int := 0;
  v_unmatched int := 0;
  v_sql text;
begin
  select name_col, user_id_col into v_name_col, v_user_col
  from public._role_columns(p_role);

  if v_name_col is null then
    raise exception 'Unknown role code: %', p_role;
  end if;

  -- Update transaksi: cocokin nama_raw ke alias (case-insensitive, normalized).
  -- Date validity: pakai tanggal occurred_at, fallback now() kalau null.
  v_sql := format($s$
    update public.crm_transactions t
    set %I = (
      select a.user_id
      from public.user_role_aliases a
      where a.role_code = %L
        and a.alias_normalized = public.normalize_alias(t.%I)
        and (a.valid_from is null or a.valid_from <= coalesce(t.occurred_at::date, current_date))
        and (a.valid_to   is null or a.valid_to   >= coalesce(t.occurred_at::date, current_date))
      order by a.valid_from desc nulls last
      limit 1
    )
    where t.%I is not null and trim(t.%I) <> ''
  $s$, v_user_col, p_role, v_name_col, v_name_col, v_name_col);

  execute v_sql;

  -- Count hasil
  execute format(
    'select count(*) filter (where %I is not null),
            count(*) filter (where %I is null and %I is not null and trim(%I) <> '''')
     from public.crm_transactions',
    v_user_col, v_user_col, v_name_col, v_name_col
  ) into v_matched, v_unmatched;

  matched := coalesce(v_matched, 0);
  unmatched := coalesce(v_unmatched, 0);
  return next;
end;
$$;

grant execute on function public.relink_transactions_for_role(text) to authenticated;

-- ---------------------------------------------------------------------
-- relink_transactions_for_user: dipanggil setelah alias 1 user diubah
-- ---------------------------------------------------------------------
create or replace function public.relink_transactions_for_user(
  p_role text,
  p_user_id uuid
)
returns int  -- jumlah baris yg ter-link
language plpgsql
security definer
set search_path = public
set statement_timeout = '5min'
as $$
declare
  v_name_col text;
  v_user_col text;
  v_count int := 0;
  v_sql text;
begin
  select name_col, user_id_col into v_name_col, v_user_col
  from public._role_columns(p_role);

  if v_name_col is null then
    raise exception 'Unknown role: %', p_role;
  end if;

  -- 1) Lepaskan link lama yang sudah tidak match alias (alias dihapus)
  v_sql := format($s$
    update public.crm_transactions t
    set %I = null
    where %I = %L::uuid
      and not exists (
        select 1 from public.user_role_aliases a
        where a.user_id = %L::uuid
          and a.role_code = %L
          and a.alias_normalized = public.normalize_alias(t.%I)
          and (a.valid_from is null or a.valid_from <= coalesce(t.occurred_at::date, current_date))
          and (a.valid_to   is null or a.valid_to   >= coalesce(t.occurred_at::date, current_date))
      )
  $s$, v_user_col, v_user_col, p_user_id, p_user_id, p_role, v_name_col);
  execute v_sql;

  -- 2) Sambungkan transaksi yang match alias (yang masih NULL atau orang berbeda)
  v_sql := format($s$
    update public.crm_transactions t
    set %I = %L::uuid
    where t.%I is not null and trim(t.%I) <> ''
      and exists (
        select 1 from public.user_role_aliases a
        where a.user_id = %L::uuid
          and a.role_code = %L
          and a.alias_normalized = public.normalize_alias(t.%I)
          and (a.valid_from is null or a.valid_from <= coalesce(t.occurred_at::date, current_date))
          and (a.valid_to   is null or a.valid_to   >= coalesce(t.occurred_at::date, current_date))
      )
      and (t.%I is distinct from %L::uuid)
  $s$, v_user_col, p_user_id, v_name_col, v_name_col, p_user_id, p_role, v_name_col, v_user_col, p_user_id);
  execute v_sql;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.relink_transactions_for_user(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- get_unlinked_names: nama Excel yang belum match alias (untuk Inbox)
-- ---------------------------------------------------------------------
create or replace function public.get_unlinked_names(p_role text)
returns table (
  raw_name text,
  transaction_count bigint,
  total_amount numeric,
  first_seen timestamptz,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_name_col text;
  v_user_col text;
  v_sql text;
begin
  select name_col, user_id_col into v_name_col, v_user_col
  from public._role_columns(p_role);

  if v_name_col is null then
    raise exception 'Unknown role: %', p_role;
  end if;

  v_sql := format($s$
    select
      trim(%I) as raw_name,
      count(*) as transaction_count,
      coalesce(sum(amount), 0) as total_amount,
      min(occurred_at) as first_seen,
      max(occurred_at) as last_seen
    from public.crm_transactions
    where %I is null
      and %I is not null
      and trim(%I) <> ''
    group by trim(%I)
    order by count(*) desc
  $s$, v_name_col, v_user_col, v_name_col, v_name_col, v_name_col);

  return query execute v_sql;
end;
$$;

grant execute on function public.get_unlinked_names(text) to authenticated;

-- ---------------------------------------------------------------------
-- get_excel_names_for_role: semua nama unik di Excel + status
-- (untuk popup "Pilih dari Data" saat tambah alias)
-- ---------------------------------------------------------------------
create or replace function public.get_excel_names_for_role(p_role text)
returns table (
  raw_name text,
  transaction_count bigint,
  total_amount numeric,
  linked_user_id uuid,
  linked_user_email text,
  linked_user_name text,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_name_col text;
  v_user_col text;
  v_sql text;
begin
  select name_col, user_id_col into v_name_col, v_user_col
  from public._role_columns(p_role);

  if v_name_col is null then
    raise exception 'Unknown role: %', p_role;
  end if;

  v_sql := format($s$
    with grouped as (
      select
        trim(t.%I) as raw_name,
        count(*) as transaction_count,
        coalesce(sum(t.amount), 0) as total_amount,
        max(t.occurred_at) as last_seen,
        (array_agg(t.%I) filter (where t.%I is not null))[1] as any_user_id
      from public.crm_transactions t
      where t.%I is not null
        and trim(t.%I) <> ''
      group by trim(t.%I)
    )
    select
      g.raw_name,
      g.transaction_count,
      g.total_amount,
      g.any_user_id,
      p.email,
      p.full_name,
      g.last_seen
    from grouped g
    left join public.user_profiles p on p.id = g.any_user_id
    order by g.transaction_count desc
  $s$, v_name_col, v_user_col, v_user_col, v_name_col, v_name_col, v_name_col);

  return query execute v_sql;
end;
$$;

grant execute on function public.get_excel_names_for_role(text) to authenticated;

-- ---------------------------------------------------------------------
-- Notif refresh schema
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
