create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text not null check (length(trim(legal_name)) between 1 and 160),
  trade_name text not null check (length(trim(trade_name)) between 1 and 120),
  cnpj text not null check (cnpj ~ '^[A-Z0-9]{14}$'),
  email text not null check (length(trim(email)) between 3 and 254),
  phone text not null check (length(trim(phone)) between 1 and 30),
  portal text not null,
  created_at timestamptz not null default now(),
  constraint clients_org_cnpj_unique unique (organization_id, cnpj),
  constraint clients_org_id_unique unique (organization_id, id),
  constraint clients_org_portal_fk foreign key (organization_id, portal)
    references public.organization_portals (organization_id, portal) on delete restrict
);

create index if not exists clients_org_trade_name_idx on public.clients (organization_id, trade_name);
alter table public.orders add column if not exists client_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_org_client_fk') then
    alter table public.orders add constraint orders_org_client_fk
      foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict;
  end if;
end $$;

alter table public.clients enable row level security;
drop policy if exists "Members can read organization clients" on public.clients;
drop policy if exists "Members can add organization clients" on public.clients;
drop policy if exists "Members can update organization clients" on public.clients;
create policy "Members can read organization clients" on public.clients for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization clients" on public.clients for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization clients" on public.clients for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
grant select, insert, update on public.clients to authenticated;

