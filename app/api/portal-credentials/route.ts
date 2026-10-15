import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { encryptPortalCredential } from '../../lib/portal-credentials-crypto';

type Portal = 'TempoCerto' | 'Trizy' | 'Nexello';
const portals: Portal[] = ['TempoCerto', 'Trizy', 'Nexello'];

async function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server components may not allow cookie writes. */ }
      },
    },
  });
}

function getCredentialStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createSupabaseAdmin(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getOrganization(supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };
  const { data: membership, error } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (error || !membership) return { response: NextResponse.json({ error: 'Não foi possível localizar sua organização.' }, { status: 403 }) };
  return { organizationId: membership.organization_id };
}

export async function GET() {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase não está configurado.' }, { status: 503 });
  const organization = await getOrganization(supabase);
  if ('response' in organization) return organization.response;
  const credentialStore = getCredentialStore();
  if (!credentialStore) return NextResponse.json({ error: 'Configure a chave privada do Supabase no servidor.' }, { status: 503 });
  const { data, error } = await credentialStore.from('portal_credentials').select('portal').eq('organization_id', organization.organizationId);
  if (error) return NextResponse.json({ error: 'Não foi possível consultar as configurações.' }, { status: 500 });
  const configured = Object.fromEntries(portals.map(portal => [portal, false])) as Record<Portal, boolean>;
  for (const row of data ?? []) if (portals.includes(row.portal as Portal)) configured[row.portal as Portal] = true;
  return NextResponse.json({ configured }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const encryptionKey = process.env.PORTAL_CREDENTIALS_ENCRYPTION_KEY;
  if (!encryptionKey || !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) return NextResponse.json({ error: 'Configure a chave de criptografia do servidor antes de salvar credenciais.' }, { status: 503 });
  if (!getCredentialStore()) return NextResponse.json({ error: 'Configure a chave privada do Supabase no servidor.' }, { status: 503 });
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase não está configurado.' }, { status: 503 });
  const organization = await getOrganization(supabase);
  if ('response' in organization) return organization.response;

  let body: { portal?: Portal; username?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  if (!body.portal || !portals.includes(body.portal) || !body.username?.trim() || !body.password) {
    return NextResponse.json({ error: 'Informe o portal, o usuário e a senha.' }, { status: 400 });
  }
  if (body.username.length > 500 || body.password.length > 500) return NextResponse.json({ error: 'Os campos podem ter no máximo 500 caracteres.' }, { status: 400 });

  let usernameCiphertext: string;
  let passwordCiphertext: string;
  try {
    usernameCiphertext = encryptPortalCredential(body.username.trim());
    passwordCiphertext = encryptPortalCredential(body.password);
  } catch {
    return NextResponse.json({ error: 'Configure a chave de criptografia do servidor antes de salvar credenciais.' }, { status: 503 });
  }

  const credentialStore = getCredentialStore();
  if (!credentialStore) return NextResponse.json({ error: 'Configure a chave privada do Supabase no servidor.' }, { status: 503 });
  const { error } = await credentialStore.from('portal_credentials').upsert({
    organization_id: organization.organizationId,
    portal: body.portal,
    username_ciphertext: usernameCiphertext,
    password_ciphertext: passwordCiphertext,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,portal' });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar as credenciais.' }, { status: 500 });
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
}
