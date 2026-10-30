-- Split the original schedule date into the customer's requested date and
-- the date later confirmed by the customer. Preserve all existing values.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'scheduled_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'requested_at'
  ) then
    alter table public.orders rename column scheduled_at to requested_at;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'scheduled_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'requested_at'
  ) then
    update public.orders set requested_at = coalesce(requested_at, scheduled_at);
  end if;
end $$;

alter table public.orders add column if not exists requested_at timestamptz;
alter table public.orders add column if not exists confirmed_at timestamptz;
