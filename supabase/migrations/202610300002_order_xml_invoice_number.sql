-- Keep the NF-e invoice number (ide/nNF) separately from the integration order number.
alter table public.orders
  add column if not exists xml_invoice_number text;
