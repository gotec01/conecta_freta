import { NextResponse } from 'next/server';
import { createPublicOrderToken, getAuthenticatedOrganization, getPublicOrderLinkStore, hashPublicOrderToken } from '../../../../lib/public-order-links';

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const identity = await getAuthenticatedOrganization();
  if ('error' in identity) return NextResponse.json({ error: identity.error }, { status: identity.status });
  const store = getPublicOrderLinkStore();
  if (!store) return NextResponse.json({ error: 'Configure a chave privada do Supabase no servidor.' }, { status: 503 });
  const { orderId } = await context.params;
  const token = createPublicOrderToken();
  const now = new Date().toISOString();
  const { data, error } = await store.from('orders').update({
    public_link_token_hash: hashPublicOrderToken(token),
    public_link_created_at: now,
    public_link_viewed_at: null,
    client_confirmation: null,
    client_confirmation_at: null,
  }).eq('id', orderId).eq('organization_id', identity.organizationId).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível criar o link. Aplique a migração de confirmação pública no Supabase.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Pedido não encontrado nesta organização.' }, { status: 404 });
  const url = new URL(`/pedido/${token}`, request.url).toString();
  return NextResponse.json({ url, created_at: now }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
