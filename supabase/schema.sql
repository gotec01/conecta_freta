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
  portal text not null check (portal in ('TempoCerto', 'Trizy', 'Nexello')),
  scheduled_at timestamptz,
  status text not null default 'Pendente' check (status in ('Agendado', 'Pendente', 'Falhou')),
  created_at timestamptz not null default now()
);
create index if not exists orders_org_created_idx on public.orders (organization_id, created_at desc);

create table if not exists public.organization_portals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (portal in ('TempoCerto', 'Trizy', 'Nexello')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, portal)
);

create table if not exists public.portal_credentials (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (portal in ('TempoCerto', 'Trizy', 'Nexello')),
  username_ciphertext text not null,
  password_ciphertext text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, portal)
);

create or replace function public.create_personal_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  insert into public.organizations (name) values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Minha empresa')) returning id into org_id;
  insert into public.organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into public.organization_portals (organization_id, portal, active) values
    (org_id, 'TempoCerto', true), (org_id, 'Trizy', true), (org_id, 'Nexello', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_org on auth.users;
create trigger on_auth_user_created_org after insert on auth.users for each row execute procedure public.create_personal_organization();

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid());
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.orders enable row level security;
alter table public.organization_portals enable row level security;
alter table public.portal_credentials enable row level security;

create policy "Members can view their organizations" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "Members can view organization membership" on public.organization_members for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can read organization portals" on public.organization_portals for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization portals" on public.organization_portals for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization portals" on public.organization_portals for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can read organization orders" on public.orders for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization orders" on public.orders for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization orders" on public.orders for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can delete organization orders" on public.orders for delete to authenticated using (public.is_org_member(organization_id));

-- Access for the Supabase authenticated client. RLS still scopes every row by organization.
grant usage on schema public to authenticated;
grant select on public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update on public.organization_portals to authenticated;
revoke all on public.portal_credentials from anon, authenticated;
grant all on public.portal_credentials to service_role;
