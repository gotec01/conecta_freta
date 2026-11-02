import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPublicOrderLinkStore, hashPublicOrderToken } from '../../../../lib/public-order-links';

export const runtime = 'nodejs';

const MAX_VOUCHER_BYTES = 10 * 1024 * 1024;
const BUCKET = 'order-vouchers';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

function cleanFileName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 240) || '';
}

async function findPublicOrder(token: string) {
  if (!token || token.length > 128) return { error: 'Este link não é válido.', status: 404 as const };
  const store = getPublicOrderLinkStore();
  if (!store) return { error: 'O serviço de confirmação está indisponível no momento.', status: 503 as const };
  const tokenHash = hashPublicOrderToken(token);
  const { data: order, error } = await store.from('orders')
    .select('id, organization_id, public_link_token_hash, voucher_path')
    .eq('public_link_token_hash', tokenHash)
    .maybeSingle();
  if (error) return { error: 'Não foi possível localizar este pedido.', status: 503 as const };
  if (!order) return { error: 'Este link não é válido ou foi substituído por um link mais recente.', status: 404 as const };
  return { store, order, tokenHash } as const;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await findPublicOrder(token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });

  let body: { file_name?: unknown; content_type?: unknown; size?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Não foi possível preparar o envio do voucher.' }, { status: 400, headers: NO_STORE });
  }

  const fileName = cleanFileName(body.file_name);
  const extension = fileName.toLowerCase().split('.').pop();
  const expectedType = extension === 'pdf' ? 'application/pdf' : ['jpg', 'jpeg'].includes(extension || '') ? 'image/jpeg' : '';
  const contentType = body.content_type;
  const size = body.size;
  if (!fileName || !expectedType || contentType !== expectedType) {
    return NextResponse.json({ error: 'Selecione um voucher em PDF ou JPEG.' }, { status: 415, headers: NO_STORE });
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > MAX_VOUCHER_BYTES) {
    return NextResponse.json({ error: 'O voucher deve ter conteúdo e no máximo 10 MB.' }, { status: 413, headers: NO_STORE });
  }

  const extensionForStorage = expectedType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${result.order.organization_id}/${result.order.id}/${randomUUID()}.${extensionForStorage}`;
  const { data, error } = await result.store.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message.includes('Bucket not found') ? 'O armazenamento de vouchers ainda não está configurado.' : 'Não foi possível preparar o envio do voucher.' }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ path, upload_token: data.token }, { headers: NO_STORE });
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await findPublicOrder(token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });

  let body: { path?: unknown; file_name?: unknown; content_type?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Não foi possível vincular o voucher ao pedido.' }, { status: 400, headers: NO_STORE });
  }

  const fileName = cleanFileName(body.file_name);
  const extension = fileName.toLowerCase().split('.').pop();
  const expectedType = extension === 'pdf' ? 'application/pdf' : ['jpg', 'jpeg'].includes(extension || '') ? 'image/jpeg' : '';
  if (!fileName || !expectedType || body.content_type !== expectedType || typeof body.path !== 'string') {
    return NextResponse.json({ error: 'Os dados do voucher não são válidos.' }, { status: 400, headers: NO_STORE });
  }

  const pathPrefix = `${result.order.organization_id}/${result.order.id}/`;
  const path = body.path;
  const pathFile = path.startsWith(pathPrefix) ? path.slice(pathPrefix.length) : '';
  const uuidParts = pathFile.split('-');
  const isUuid = uuidParts.length === 5 && uuidParts.every(part => /^[0-9a-f]+$/i.test(part)) && uuidParts.map(part => part.length).join('-') === '8-4-4-4-12';
  const expectedPathExtension = expectedType === 'application/pdf' ? 'pdf' : 'jpg';
  if (!pathFile || !isUuid || pathFile.split('.').length !== 2 || pathFile.split('.')[1].toLowerCase() !== expectedPathExtension) {
    return NextResponse.json({ error: 'O arquivo não corresponde a este pedido.' }, { status: 400, headers: NO_STORE });
  }

  const storage = result.store.storage.from(BUCKET);
  const { data: uploadedFile, error: downloadError } = await storage.download(path);
  if (downloadError || !uploadedFile || uploadedFile.size <= 0 || uploadedFile.size > MAX_VOUCHER_BYTES) {
    await storage.remove([path]);
    return NextResponse.json({ error: 'O arquivo enviado está vazio, excede 10 MB ou não está disponível.' }, { status: 400, headers: NO_STORE });
  }

  const signature = new Uint8Array(await uploadedFile.slice(0, 1024).arrayBuffer());
  const isValidPdf = expectedType === 'application/pdf' && new TextDecoder().decode(signature).includes('%PDF-');
  const isValidJpeg = expectedType === 'image/jpeg' && signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  if (!isValidPdf && !isValidJpeg) {
    await storage.remove([path]);
    return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde a um voucher PDF ou JPEG válido.' }, { status: 415, headers: NO_STORE });
  }

  const { data: saved, error: saveError } = await result.store.from('orders').update({
    voucher_path: path,
    voucher_file_name: fileName,
    voucher_content_type: expectedType,
  }).eq('id', result.order.id).eq('public_link_token_hash', result.tokenHash).select('id').maybeSingle();

  if (saveError || !saved) {
    await storage.remove([path]);
    return NextResponse.json({ error: 'Não foi possível vincular o voucher ao pedido.' }, { status: 503, headers: NO_STORE });
  }

  if (result.order.voucher_path && result.order.voucher_path !== path) {
    await storage.remove([result.order.voucher_path]);
  }

  return NextResponse.json({
    saved: true,
    voucher_file_name: fileName,
    voucher_content_type: expectedType,
  }, { headers: NO_STORE });
}
