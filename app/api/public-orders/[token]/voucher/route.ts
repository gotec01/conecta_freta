import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPublicOrderLinkStore, hashPublicOrderToken } from '../../../../lib/public-order-links';

export const runtime = 'nodejs';

const MAX_VOUCHER_BYTES = 10 * 1024 * 1024;
const BUCKET = 'order-vouchers';

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length > 128) {
    return NextResponse.json({ error: 'Este link não é válido.' }, { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const store = getPublicOrderLinkStore();
  if (!store) {
    return NextResponse.json({ error: 'O serviço de confirmação está indisponível no momento.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const tokenHash = hashPublicOrderToken(token);
  const { data: order, error: lookupError } = await store.from('orders')
    .select('id, organization_id, voucher_path')
    .eq('public_link_token_hash', tokenHash)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: 'Não foi possível localizar este pedido.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  if (!order) {
    return NextResponse.json({ error: 'Este link não é válido ou foi substituído por um link mais recente.' }, { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_VOUCHER_BYTES + 65536) {
    return NextResponse.json({ error: 'O voucher deve ter no máximo 10 MB.' }, { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler o arquivo enviado.' }, { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const file = form.get('voucher');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Selecione um arquivo PDF ou JPEG para anexar.' }, { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  if (file.size === 0 || file.size > MAX_VOUCHER_BYTES) {
    return NextResponse.json({ error: 'O voucher deve ter conteúdo e no máximo 10 MB.' }, { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const originalName = file.name.split(/[\\/]/).pop()?.replace(/[\\u0000-\\u001f\\u007f]/g, '').trim().slice(0, 240) || '';
  const extension = originalName.toLowerCase().split('.').pop();
  const expectedType = extension === 'pdf' ? 'application/pdf' : ['jpg', 'jpeg'].includes(extension || '') ? 'image/jpeg' : '';
  const contentType = file.type || expectedType;
  if (!expectedType || contentType !== expectedType) {
    return NextResponse.json({ error: 'Selecione um voucher em PDF ou JPEG.' }, { status: 415, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  if (!originalName) {
    return NextResponse.json({ error: 'O arquivo precisa ter um nome válido.' }, { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const safeExtension = expectedType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${order.organization_id}/${order.id}/${randomUUID()}.${safeExtension}`;
  const storage = store.storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(path, new Uint8Array(await file.arrayBuffer()), {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    const message = uploadError.message.includes('Bucket not found')
      ? 'O armazenamento de vouchers ainda não está configurado.'
      : 'Não foi possível enviar o voucher. Tente novamente.';
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  const { data: saved, error: saveError } = await store.from('orders').update({
    voucher_path: path,
    voucher_file_name: originalName,
    voucher_content_type: contentType,
  }).eq('id', order.id).eq('public_link_token_hash', tokenHash).select('id').maybeSingle();

  if (saveError || !saved) {
    await storage.remove([path]);
    return NextResponse.json({ error: 'Não foi possível vincular o voucher ao pedido.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }

  if (order.voucher_path && order.voucher_path !== path) {
    await storage.remove([order.voucher_path]);
  }

  return NextResponse.json({
    saved: true,
    voucher_file_name: originalName,
    voucher_content_type: contentType,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' } });
}
