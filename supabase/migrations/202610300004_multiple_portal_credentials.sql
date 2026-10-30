-- Allow several encrypted login records per portal.
alter table public.portal_credentials
  add column if not exists id uuid default gen_random_uuid();
alter table public.portal_credentials
  add column if not exists created_at timestamptz not null default now();
update public.portal_credentials set id = gen_random_uuid() where id is null;
alter table public.portal_credentials alter column id set not null;
alter table public.portal_credentials drop constraint if exists portal_credentials_pkey;
alter table public.portal_credentials add constraint portal_credentials_pkey primary key (id);
create index if not exists portal_credentials_org_portal_idx
  on public.portal_credentials (organization_id, portal, created_at);

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
  if not found then raise exception 'Portal not found' using errcode = 'P0002'; end if;

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
  update public.clients set portal = new_name where organization_id = p_organization_id and portal = p_old_portal;
  update public.orders set portal = new_name where organization_id = p_organization_id and portal = p_old_portal;
  update public.portal_credentials set portal = new_name where organization_id = p_organization_id and portal = p_old_portal;
  delete from public.organization_portals where organization_id = p_organization_id and portal = p_old_portal;
end;
$$;

revoke all on function public.update_organization_portal_details(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_organization_portal_details(uuid, text, text, text, text) to authenticated;
