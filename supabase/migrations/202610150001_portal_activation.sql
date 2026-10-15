-- Add per-organization portal activation controls to an existing MVP database.
create table if not exists public.organization_portals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal text not null check (portal in ('TempoCerto', 'Trizy', 'Nexello')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, portal)
);

alter table public.organization_portals enable row level security;

drop policy if exists "Members can read organization portals" on public.organization_portals;
drop policy if exists "Members can add organization portals" on public.organization_portals;
drop policy if exists "Members can update organization portals" on public.organization_portals;
create policy "Members can read organization portals" on public.organization_portals for select to authenticated using (public.is_org_member(organization_id));
create policy "Members can add organization portals" on public.organization_portals for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Members can update organization portals" on public.organization_portals for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

grant select, insert, update on public.organization_portals to authenticated;

-- Existing organizations start with all three portals active, matching the previous MVP defaults.
insert into public.organization_portals (organization_id, portal, active)
select org.id, portal.name, true
from public.organizations org
cross join (values ('TempoCerto'), ('Trizy'), ('Nexello')) as portal(name)
on conflict (organization_id, portal) do nothing;

-- New accounts also receive the three default portal settings.
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
