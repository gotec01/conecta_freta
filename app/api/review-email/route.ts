import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';

async function getAuthenticatedUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return process.env.NODE_ENV !== 'production' ? { demo: true } as const : null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Cookie writes may be unavailable in this handler. */ }
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && user ? { demo: false } as const : null;
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedUser();
  if (!identity) return NextResponse.json({ error: 'Faça login para revisar o texto.' }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Configure OPENAI_API_KEY no ambiente local ou na Vercel para habilitar a revisão com IA.' }, { status: 503 });

  let body: { text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'Escreva o corpo do e-mail antes de revisar.' }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: 'O texto pode ter no máximo 6.000 caracteres.' }, { status: 400 });

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_EMAIL_REVIEW_MODEL || 'gpt-6-astra',
        instructions: 'Revise o texto de e-mail em português do Brasil para deixá-lo formal, claro, cordial e profissional. Corrija gramática e fluidez sem mudar o sentido, sem acrescentar fatos e preservando exatamente tokens entre chaves como {{numero_pedido}}, {{portal}} e {{data_agendamento}}. Retorne somente o texto revisado, sem explicações, título ou aspas.',
        input: text,
        max_output_tokens: 1400,
        store: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? 'Limite temporário de uso da IA atingido. Tente novamente em instantes.' : 'A IA não conseguiu revisar o texto agora. Confira a configuração e tente novamente.' }, { status: response.status === 429 ? 429 : 502 });
    const reviewedText = result.output_text?.trim() || result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text?.trim();
    if (!reviewedText) return NextResponse.json({ error: 'A IA não retornou uma sugestão de texto.' }, { status: 502 });
    return NextResponse.json({ text: reviewedText }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço de IA. Tente novamente.' }, { status: 502 });
  }
}
