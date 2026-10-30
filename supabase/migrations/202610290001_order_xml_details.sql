-- Structured details extracted from an XML attached to an existing order.
alter table public.orders
  add column if not exists xml_order_number text,
  add column if not exists xml_item_count integer not null default 0,
  add column if not exists xml_item_quantity numeric,
  add column if not exists xml_purchase_order text;

-- Existing organization-scoped order update policy protects these fields as well.
grant select, update on public.orders to authenticated;
