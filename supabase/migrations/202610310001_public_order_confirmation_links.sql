-- Public, unguessable links let clients review order and XML details and record a response.
alter table public.orders
  add column if not exists public_link_token_hash text,
  add column if not exists public_link_created_at timestamptz,
  add column if not exists public_link_viewed_at timestamptz,
  add column if not exists client_confirmation text,
  add column if not exists client_confirmation_at timestamptz;

alter table public.orders
  drop constraint if exists orders_client_confirmation_check;
alter table public.orders
  add constraint orders_client_confirmation_check
  check (client_confirmation is null or client_confirmation in ('confirmed', 'not_confirmed'));

create unique index if not exists orders_public_link_token_hash_unique
  on public.orders (public_link_token_hash)
  where public_link_token_hash is not null;

create index if not exists orders_public_link_viewed_idx
  on public.orders (organization_id, public_link_viewed_at);

-- Tokens are hashes only; raw public tokens are returned once when generated.
revoke all on public.orders from anon;
