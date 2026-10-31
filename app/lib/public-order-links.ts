import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const projectUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CONECTA_FRETE_SUPABASE_URL;
const publicKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.CONECTA_FRETE_SUPABASE_ANON_KEY || process.env.CONECTA_FRETE_SUPABASE_PUBLISHABLE_KEY;

export function getPublicOrderLinkStore() {
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CONECTA_FRETE_SUPABASE_SERVICE_ROLE_KEY || process.env.CONECTA_FRETE_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getAuthenticatedOrganization() {
  const url = projectUrl();
  const key = publicKey();
  if (!url || !key) return { error: 'Supabase não está configurado.', status: 503 } as const;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* A read-only render may not allow refreshing cookies. */ }
      },
    },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Faça login para continuar.', status: 401 } as const;
  const { data: membership, error } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (error || !membership) return { error: 'Não foi possível localizar sua organização.', status: 403 } as const;
  return { organizationId: membership.organization_id } as const;
}

export function createPublicOrderToken() {
  return randomBytes(32).toString('base64url');
}

export function hashPublicOrderToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
