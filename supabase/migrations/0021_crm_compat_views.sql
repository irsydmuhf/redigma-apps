-- =====================================================================
-- COMPAT LAYER: Views yang me-mirror schema CRM lama
-- =====================================================================
-- Strategi: bikin VIEW dengan nama tabel CRM lama (customers, transactions,
-- followup_logs, whatsapp_templates, users) yang map dari tabel master baru
-- (crm_customers, crm_transactions, dll).
--
-- Tujuan: kode aplikasi crm-redigma yang masih query "from('customers')"
-- tetap jalan TANPA perlu di-rewrite. View aliasing column names.
--
-- INSTEAD OF triggers menangani INSERT/UPDATE/DELETE supaya write juga jalan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VIEW: customers (alias crm_customers dengan kolom lama)
-- ---------------------------------------------------------------------
drop view if exists public.customers cascade;
create view public.customers as
select
  id,
  phone as no_hp,
  full_name as nama,
  total_spent as sum_omset,
  last_purchase_at::text as last_order_date,
  total_orders as total_invoice,
  null::text as produk,  -- legacy field, tidak ada di master
  cs_name as crm_name,
  segment_rfm as rfm_segment,
  updated_at::text as last_updated,
  rfm_recency as r_score,
  rfm_frequency as f_score,
  rfm_monetary as m_score,
  null::int as jumlah_crm,  -- legacy
  null::text as detail_crm,  -- legacy
  assigned_cs_id as assigned_crm_id,
  updated_at::text as synced_at,
  -- Plus kolom baru yang dipakai oleh CRM operasional
  last_contact_at::text as last_contact_at,
  last_action_at::text as last_action_at,
  next_followup_at::text as next_followup_at,
  notes,
  tags,
  status
from public.crm_customers;

-- INSTEAD OF triggers untuk write operations
create or replace function public.customers_view_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_customers set
    phone = coalesce(NEW.no_hp, phone),
    full_name = coalesce(NEW.nama, full_name),
    total_spent = coalesce(NEW.sum_omset, total_spent),
    last_purchase_at = coalesce(NEW.last_order_date::timestamptz, last_purchase_at),
    total_orders = coalesce(NEW.total_invoice, total_orders),
    cs_name = coalesce(NEW.crm_name, cs_name),
    segment_rfm = coalesce(NEW.rfm_segment, segment_rfm),
    rfm_recency = coalesce(NEW.r_score, rfm_recency),
    rfm_frequency = coalesce(NEW.f_score, rfm_frequency),
    rfm_monetary = coalesce(NEW.m_score, rfm_monetary),
    assigned_cs_id = coalesce(NEW.assigned_crm_id, assigned_cs_id),
    last_contact_at = coalesce(NEW.last_contact_at::timestamptz, last_contact_at),
    last_action_at = coalesce(NEW.last_action_at::timestamptz, last_action_at),
    next_followup_at = coalesce(NEW.next_followup_at::timestamptz, next_followup_at),
    notes = coalesce(NEW.notes, notes),
    tags = coalesce(NEW.tags, tags),
    status = coalesce(NEW.status, status),
    updated_at = now()
  where id = OLD.id;
  return NEW;
end;
$$;

drop trigger if exists customers_update_trigger on public.customers;
create trigger customers_update_trigger
  instead of update on public.customers
  for each row execute function public.customers_view_update();

-- INSERT trigger untuk customers (kasus jarang tapi ada di sync)
create or replace function public.customers_view_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
begin
  v_phone := case
    when NEW.no_hp ~ '^\d+$' then NEW.no_hp
    when NEW.no_hp ~ '^0\d+$' then '62' || substring(NEW.no_hp from 2)
    else regexp_replace(coalesce(NEW.no_hp, ''), '[^0-9]', '', 'g')
  end;

  insert into public.crm_customers (
    full_name, phone, total_spent, last_purchase_at, total_orders,
    cs_name, segment_rfm, rfm_recency, rfm_frequency, rfm_monetary,
    assigned_cs_id, last_contact_at, last_action_at, next_followup_at,
    notes, tags, status
  )
  values (
    NEW.nama, nullif(v_phone, ''), NEW.sum_omset, NEW.last_order_date::timestamptz,
    NEW.total_invoice, NEW.crm_name, NEW.rfm_segment,
    NEW.r_score, NEW.f_score, NEW.m_score, NEW.assigned_crm_id,
    NEW.last_contact_at::timestamptz, NEW.last_action_at::timestamptz,
    NEW.next_followup_at::timestamptz, NEW.notes, NEW.tags,
    coalesce(NEW.status, 'active')
  )
  on conflict (phone) where phone is not null do update set
    full_name = coalesce(excluded.full_name, crm_customers.full_name),
    total_spent = coalesce(excluded.total_spent, crm_customers.total_spent),
    segment_rfm = coalesce(excluded.segment_rfm, crm_customers.segment_rfm),
    updated_at = now()
  returning id into NEW.id;
  return NEW;
end;
$$;

drop trigger if exists customers_insert_trigger on public.customers;
create trigger customers_insert_trigger
  instead of insert on public.customers
  for each row execute function public.customers_view_insert();

-- ---------------------------------------------------------------------
-- 2. VIEW: transactions (alias crm_transactions)
-- ---------------------------------------------------------------------
drop view if exists public.transactions cascade;
create view public.transactions as
select
  t.id,
  t.order_id as invoice_number,
  t.occurred_at::text as order_date,
  c.phone as no_hp,
  c.full_name as nama_customer,
  t.amount as omset,
  null::text as produk,  -- legacy
  t.channel as nama_sistem,
  t.created_at::text as synced_at,
  t.customer_id,
  t.status,
  t.channel
from public.crm_transactions t
left join public.crm_customers c on c.id = t.customer_id;

-- ---------------------------------------------------------------------
-- 3. VIEW: followup_logs (alias crm_followup_logs dengan kolom lama)
-- ---------------------------------------------------------------------
drop view if exists public.followup_logs cascade;
create view public.followup_logs as
select
  fl.id,
  fl.customer_id,
  c.phone as customer_no_hp,
  fl.user_id as crm_id,
  fl.user_id as crm_user_id,  -- alias kedua untuk kompatibilitas
  up.full_name as crm_name,
  fl.type as kontak_method,
  fl.type as method,
  fl.content as catatan,
  fl.content as notes,
  fl.occurred_at as followup_at,
  fl.occurred_at::date as followup_date,
  fl.created_at
from public.crm_followup_logs fl
left join public.crm_customers c on c.id = fl.customer_id
left join public.user_profiles up on up.id = fl.user_id;

create or replace function public.followup_logs_view_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid := NEW.customer_id;
begin
  -- Resolve customer_id dari no_hp kalau perlu
  if v_customer_id is null and NEW.customer_no_hp is not null then
    select id into v_customer_id from public.crm_customers where phone = NEW.customer_no_hp limit 1;
  end if;

  insert into public.crm_followup_logs (customer_id, user_id, type, content, occurred_at)
  values (
    v_customer_id,
    coalesce(NEW.crm_id, auth.uid()),
    coalesce(NEW.kontak_method, 'note'),
    NEW.catatan,
    coalesce(NEW.followup_at, now())
  );

  -- Update last_contact_at di customer
  if v_customer_id is not null then
    update public.crm_customers
    set last_contact_at = now(), last_action_at = now()
    where id = v_customer_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists followup_logs_insert_trigger on public.followup_logs;
create trigger followup_logs_insert_trigger
  instead of insert on public.followup_logs
  for each row execute function public.followup_logs_view_insert();

-- ---------------------------------------------------------------------
-- 4. VIEW: whatsapp_templates (alias crm_whatsapp_templates)
-- ---------------------------------------------------------------------
drop view if exists public.whatsapp_templates cascade;
create view public.whatsapp_templates as
select
  id,
  name,
  content,
  variables,
  is_active,
  created_by,
  created_at,
  updated_at
from public.crm_whatsapp_templates;

create or replace function public.whatsapp_templates_view_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_whatsapp_templates (name, content, variables, is_active, created_by)
  values (NEW.name, NEW.content, NEW.variables, coalesce(NEW.is_active, true), coalesce(NEW.created_by, auth.uid()))
  returning id into NEW.id;
  return NEW;
end;
$$;

create or replace function public.whatsapp_templates_view_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_whatsapp_templates set
    name = coalesce(NEW.name, name),
    content = coalesce(NEW.content, content),
    variables = coalesce(NEW.variables, variables),
    is_active = coalesce(NEW.is_active, is_active),
    updated_at = now()
  where id = OLD.id;
  return NEW;
end;
$$;

create or replace function public.whatsapp_templates_view_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.crm_whatsapp_templates where id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists whatsapp_templates_insert_trigger on public.whatsapp_templates;
create trigger whatsapp_templates_insert_trigger
  instead of insert on public.whatsapp_templates
  for each row execute function public.whatsapp_templates_view_insert();

drop trigger if exists whatsapp_templates_update_trigger on public.whatsapp_templates;
create trigger whatsapp_templates_update_trigger
  instead of update on public.whatsapp_templates
  for each row execute function public.whatsapp_templates_view_update();

drop trigger if exists whatsapp_templates_delete_trigger on public.whatsapp_templates;
create trigger whatsapp_templates_delete_trigger
  instead of delete on public.whatsapp_templates
  for each row execute function public.whatsapp_templates_view_delete();

-- ---------------------------------------------------------------------
-- 5. VIEW: users (mirror dari user_profiles + user_divisions)
-- ---------------------------------------------------------------------
-- CRM lama punya tabel users dengan kolom: id, name, no_hp, role, is_active, pin, dll
-- View ini mapping dari user_profiles + user_divisions.
-- ---------------------------------------------------------------------
drop view if exists public.users cascade;
create view public.users as
select
  up.id,
  up.full_name as name,
  up.email,
  '' as no_hp,  -- tidak relevan setelah Supabase Auth
  '' as phone,
  case
    when public.is_admin(up.id) then 'admin'
    when exists (
      select 1 from public.user_divisions ud
      where ud.user_id = up.id and ud.division_code in ('crm', 'crm_b2b', 'cs')
        and ud.role in ('head', 'spv')
    ) then 'manager'
    else 'crm'
  end as role,
  up.is_active,
  null::text as pin,
  null::text as pin_hash,
  0 as failed_attempts,
  null::timestamptz as locked_until,
  null::timestamptz as last_login_at,
  up.created_at,
  up.updated_at
from public.user_profiles up
where exists (
  select 1 from public.user_divisions ud
  where ud.user_id = up.id and ud.division_code in ('crm', 'crm_b2b', 'cs', 'data_it')
);

-- ---------------------------------------------------------------------
-- 6. VIEW: segment_snapshots (alias crm_segment_snapshots)
-- ---------------------------------------------------------------------
drop view if exists public.segment_snapshots cascade;
create view public.segment_snapshots as
select
  id,
  customer_id,
  segment_rfm as segment,
  recency as r_score,
  frequency as f_score,
  monetary as m_score,
  total_spent,
  snapshot_date,
  created_at
from public.crm_segment_snapshots;

-- ---------------------------------------------------------------------
-- 7. VIEW: customer_crm_access — empty (handled by assigned_cs_id now)
-- ---------------------------------------------------------------------
drop view if exists public.customer_crm_access cascade;
create view public.customer_crm_access as
select
  c.id::uuid as id,
  c.id as customer_id,
  c.phone as customer_no_hp,
  c.assigned_cs_id as crm_id,
  now() as granted_at,
  null::uuid as granted_by
from public.crm_customers c
where c.assigned_cs_id is not null;

-- ---------------------------------------------------------------------
-- 8. Grant access ke authenticated supaya view bisa di-query
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.followup_logs to authenticated;
grant select, insert, update, delete on public.whatsapp_templates to authenticated;
grant select on public.users to authenticated;
grant select on public.segment_snapshots to authenticated;
grant select on public.customer_crm_access to authenticated;

notify pgrst, 'reload schema';
