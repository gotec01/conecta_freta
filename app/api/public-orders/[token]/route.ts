import { NextResponse } from 'next/server';
import { getPublicOrderLinkStore, hashPublicOrderToken } from '../../../lib/public-order-links';

const ORDER_FIELDS = 'id, organization_id, order_number, client_id, portal, requested_at, confirmed_at, status, created_at, xml_order_number, xml_invoice_number, xml_item_count, xml_item_quantity, xml_purchase_order, public_link_viewed_at, client_confirmation, client_confirmation_at, voucher_path, voucher_file_name, voucher_content_type';

async function findOrder(token: string) {
  const store = getPublicOrderLinkStore();
  if (!store) return { error: 'O serviço de confirmação está indisponível no momento.', status: 503 as const };
  if (!token || token.length > 128) return { error: 'Este link não é válido.', status: 404 as const };
  const { data: order, error } = await store.from('orders').select(ORDER_FIELDS).eq('public_link_token_hash', hashPublicOrderToken(token)).maybeSingle();
  if (error) return { error: 'Não foi possível carregar os dados deste pedido.', status: 503 as const };
  if (!order) return { error: 'Este link não é válido ou foi substituído por um link mais recente.', status: 404 as const };
  return { store, order } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await findOrder(token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store, max-age=0' } });

  const { order, store } = result;
  const viewedAt = order.public_link_viewed_at || new Date().toISOString();
  if (!order.public_link_viewed_at) {
    await store.from('orders').update({ public_link_viewed_at: viewedAt }).eq('id', order.id).eq('public_link_token_hash', hashPublicOrderToken(token));
  }
  let clientName = 'Cliente';
  if (order.client_id) {
    const { data: client } = await store.from('clients').select('trade_name').eq('id', order.client_id).eq('organization_id', order.organization_id).maybeSingle();
    if (client?.trade_name) clientName = client.trade_name;
  }

  return NextResponse.json({
    order: {
      order_number: order.order_number,
      client_name: clientName,
      portal: order.portal,
      requested_at: order.requested_at,
      confirmed_at: order.confirmed_at,
      status: order.status,
      created_at: order.created_at,
      xml_order_number: order.xml_order_number,
      xml_invoice_number: order.xml_invoice_number,
      xml_item_count: order.xml_item_count,
      xml_item_quantity: order.xml_item_quantity,
      xml_purchase_order: order.xml_purchase_order,
      client_confirmation: order.client_confirmation,
      client_confirmation_at: order.client_confirmation_at,
      has_voucher: Boolean(order.voucher_path),
      voucher_file_name: order.voucher_file_name,
      voucher_content_type: order.voucher_content_type,
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await findOrder(token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  let body: { response?: string; confirmed_at?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Não foi possível registrar sua resposta.' }, { status: 400 }); }
  if (body.response !== 'confirmed' && body.response !== 'not_confirmed') return NextResponse.json({ error: 'Selecione se confirma ou não confirma o agendamento.' }, { status: 400 });

  const update: Record<string, string> = { client_confirmation: body.response, client_confirmation_at: new Date().toISOString() };
  if (body.response === 'confirmed') {
    const confirmedAt = typeof body.confirmed_at === 'string' ? new Date(body.confirmed_at) : null;
    if (!confirmedAt || Number.isNaN(confirmedAt.getTime())) return NextResponse.json({ error: 'Informe uma data válida para confirmar o agendamento.' }, { status: 400 });
    update.confirmed_at = confirmedAt.toISOString();
  }
  const { error } = await result.store.from('orders').update(update).eq('id', result.order.id).eq('public_link_token_hash', hashPublicOrderToken(token));
  if (error) return NextResponse.json({ error: 'Não foi possível registrar sua resposta. Tente novamente.' }, { status: 503 });
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
