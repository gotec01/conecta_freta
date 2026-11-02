-- Execute in the Supabase SQL editor before enabling production sign-in.
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha empresa',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  portal text not null check (length(trim(portal)) between 1 and 60),
  requested_at timestamptz,
  confirmed_at timestamptz,
  xml_order_number text,
  xml_invoice_number text,
  xml_item_count integer not null default 0,
  xml_item_quantity numeric,
  xml_purchase_order text,
  voucher_path text,
  voucher_file_name text,
  voucher_content_type text check (voucher_content_type is null or voucher_content_type in ('application/pdf', 'image/jpeg')),
  status text not null default 'Pendente' check (status in ('Agendado', 'Pendente', 'Falhou')),
  created_at timestamptz not null default now()
);
create index if not exists orders_org_created_idx on public.orders (organization_id, created_at desc);

create table if not exists public.organization_portals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (length(trim(portal)) between 1 and 60),
  portal_url text not null,
  description text not null default '',
  delivery_method text not null default 'portal' check (delivery_method in ('portal', 'email')),
  delivery_email text,
  email_template_path text,
  email_template_name text,
  email_template_sheet text,
  constraint organization_portals_url_http_check check (portal_url ~* '^https?://'),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, portal)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text not null check (length(trim(legal_name)) between 1 and 160),
  trade_name text not null check (length(trim(trade_name)) between 1 and 120),
  cnpj text not null check (cnpj ~ '^[A-Z0-9]{14}$'),
  email text not null check (length(trim(email)) between 3 and 254),
  phone text not null check (length(trim(phone)) between 1 and 30),
  portal text not null,
  notification_recipients text[] not null default '{}',
  notification_cc text[] not null default '{}',
  notification_subject text not null default '',
  notification_body text not null default '',
  created_at timestamptz not null default now(),
  constraint clients_org_cnpj_unique unique (organization_id, cnpj),
  constraint clients_org_id_unique unique (organization_id, id),
  constraint clients_org_portal_fk foreign key (organization_id, portal)
    references public.organization_portals (organization_id, portal) on delete restrict
);
create index if not exists clients_org_trade_name_idx on public.clients (organization_id, trade_name);

-- Pedidos antigos permanecem válidos sem cliente vinculado.
alter table public.orders add column if not exists client_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_org_client_fk') then
    alter table public.orders add constraint orders_org_client_fk
      foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict;
  end if;
end $$;

create table if not exists public.portal_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (length(trim(portal)) between 1 and 60),
  username_ciphertext text not null,
  password_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_credentials_org_portal_idx on public.portal_credentials (organization_id, portal, created_at);

create or replace function public.create_personal_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  insert into public.organizations (name) values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Minha empresa')) returning id into org_id;
  insert into public.organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into public.organization_portals (organization_id, portal, portal_url, description, active) values
    (org_id, 'TempoCerto', 'https://tempocerto.com/', 'Agendamento de cargas', true),
    (org_id, 'Trizy', 'https://www.trizy.com.br/', 'Gestão logística', true),
    (org_id, 'Nexello', 'https://portal.nexello.com.br/', 'Portal de agendamentos', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_org on auth.users;
create trigger on_auth_user_created_org after insert on auth.users for each row execute procedure public.create_personal_organization();

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid());
$$;

-- Update portal details and keep organization references in sync when its name changes.
create or replace function public.update_organization_portal_details(
  p_organization_id uuid,
  p_old_portal text,
  p_name text,
  p_url text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_name text := trim(p_name);
  normalized_url text := trim(p_url);
  next_description text := trim(coalesce(p_description, ''));
  current_active boolean;
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized to edit this organization portal' using errcode = '42501';
  end if;
  if length(new_name) < 1 or length(new_name) > 60 then
    raise exception 'Portal name must contain between 1 and 60 characters' using errcode = '22023';
  end if;
  if normalized_url !~* '^https?://' then
    raise exception 'Portal URL must use http or https' using errcode = '22023';
  end if;
  if length(next_description) > 120 then
    raise exception 'Portal description cannot exceed 120 characters' using errcode = '22023';
  end if;

  select active into current_active
  from public.organization_portals
  where organization_id = p_organization_id and portal = p_old_portal
  for update;

  if not found then
    raise exception 'Portal not found' using errcode = 'P0002';
  end if;

  if new_name = p_old_portal then
    update public.organization_portals
    set portal_url = normalized_url, description = next_description, updated_at = now()
    where organization_id = p_organization_id and portal = p_old_portal;
    return;
  end if;

  if exists (
    select 1 from public.organization_portals
    where organization_id = p_organization_id and lower(portal) = lower(new_name)
  ) then
    raise exception 'A portal with this name already exists' using errcode = '23505';
  end if;

  insert into public.organization_portals (organization_id, portal, portal_url, description, active, updated_at)
  values (p_organization_id, new_name, normalized_url, next_description, current_active, now());

  update public.clients set portal = new_name
  where organization_id = p_organization_id and portal = p_old_portal;
  update public.orders set portal = new_name
  where organization_id = p_organization_id and portal = p_old_portal;
  update public.portal_credentials set portal = new_name
  where organization_id = p_organization_id and portal = p_old_portal;

  delete from public.organization_portals
  where organization_id = p_organization_id and portal = p_old_portal;
end;
$$;

revoke all on function public.update_organization_portal_details(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_organization_portal_details(uuid, text, text, text, text) to authenticated;

create or replace function public.update_organization_portal_configuration(
  p_organization_id uuid, p_old_portal text, p_name text, p_url text, p_description text,
  p_delivery_method text, p_delivery_email text, p_email_template_path text, p_email_template_name text, p_email_template_sheet text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized to edit this organization portal' using errcode = '42501';
  end if;
  if p_delivery_method not in ('portal', 'email') then raise exception 'Invalid portal delivery method' using errcode = '22023'; end if;
  if p_delivery_method = 'email' and nullif(trim(p_delivery_email), '') is null then raise exception 'A destination email is required for email delivery' using errcode = '22023'; end if;
  perform public.update_organization_portal_details(p_organization_id, p_old_portal, p_name, p_url, p_description);
  update public.organization_portals set
    delivery_method = p_delivery_method,
    delivery_email = case when p_delivery_method = 'email' then trim(p_delivery_email) else null end,
    email_template_path = case when p_delivery_method = 'email' then p_email_template_path else null end,
    email_template_name = case when p_delivery_method = 'email' then nullif(trim(p_email_template_name), '') else null end,
    email_template_sheet = case when p_delivery_method = 'email' then nullif(trim(p_email_template_sheet), '') else null end,
    updated_at = now()
  where organization_id = p_organization_id and portal = trim(p_name);
  if not found then raise exception 'Portal not found after update' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.update_organization_portal_configuration(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_organization_portal_configuration(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.orders enable row level security;
alter table public.organization_portals enable row level security;
alter table public.clients enable row level security;
alter table public.portal_credentials enable row level security;

create policy "Members can view their organizations" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "Members can view organization membership" on public.organization_members for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can read organization portals" on public.organization_portals for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization portals" on public.organization_portals for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization portals" on public.organization_portals for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can read organization clients" on public.clients for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization clients" on public.clients for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization clients" on public.clients for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can read organization orders" on public.orders for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization orders" on public.orders for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization orders" on public.orders for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can delete organization orders" on public.orders for delete to authenticated using (public.is_org_member(organization_id));

-- Access for the Supabase authenticated client. RLS still scopes every row by organization.
grant usage on schema public to authenticated;
grant select on public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update on public.organization_portals to authenticated;
grant select, insert, update on public.clients to authenticated;
revoke all on public.portal_credentials from anon, authenticated;
grant all on public.portal_credentials to service_role;

-- Private delivery voucher files are stored separately and linked through orders.voucher_path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-vouchers', 'order-vouchers', false, 10485760, array['application/pdf', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can view order vouchers" on storage.objects;
create policy "Organization members can view order vouchers" on storage.objects
for select to authenticated using (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);

drop policy if exists "Organization members can upload order vouchers" on storage.objects;
create policy "Organization members can upload order vouchers" on storage.objects
for insert to authenticated with check (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);

drop policy if exists "Organization members can delete order vouchers" on storage.objects;
create policy "Organization members can delete order vouchers" on storage.objects
for delete to authenticated using (
  bucket_id = 'order-vouchers' and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2]
      and o.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(o.organization_id)
  )
);

-- Private XLS/XLSX templates for portals that receive orders by email.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-email-templates', 'portal-email-templates', false, 10485760, array['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can view portal email templates" on storage.objects;
create policy "Organization members can view portal email templates" on storage.objects
for select to authenticated using (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));

drop policy if exists "Organization members can upload portal email templates" on storage.objects;
create policy "Organization members can upload portal email templates" on storage.objects
for insert to authenticated with check (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));

drop policy if exists "Organization members can delete portal email templates" on storage.objects;
create policy "Organization members can delete portal email templates" on storage.objects
for delete to authenticated using (bucket_id = 'portal-email-templates' and public.is_org_member((storage.foldername(name))[1]::uuid));
