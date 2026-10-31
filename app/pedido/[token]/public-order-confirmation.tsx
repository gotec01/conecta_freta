'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, FileText, PackageCheck, ShieldCheck, Truck, X } from 'lucide-react';

type PublicOrder = {
  order_number: string;
  client_name: string;
  portal: string;
  requested_at: string | null;
  confirmed_at: string | null;
  status: string;
  created_at: string;
  xml_order_number: string | null;
  xml_invoice_number: string | null;
  xml_item_count: number | null;
  xml_item_quantity: number | null;
  xml_purchase_order: string | null;
  client_confirmation: 'confirmed' | 'not_confirmed' | null;
  client_confirmation_at: string | null;
};

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : 'Não definida';
}

export default function PublicOrderConfirmation({ token }: { token: string }) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [confirmedDate, setConfirmedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/public-orders/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o pedido.');
        if (active) {
          setOrder(result.order as PublicOrder);
          setConfirmedDate(toLocalInput(result.order.confirmed_at || result.order.requested_at));
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o pedido.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function respond(responseValue: 'confirmed' | 'not_confirmed') {
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/public-orders/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseValue, confirmed_at: responseValue === 'confirmed' && confirmedDate ? new Date(confirmedDate).toISOString() : null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar sua resposta.');
      setOrder(previous => previous ? { ...previous, client_confirmation: responseValue, client_confirmation_at: new Date().toISOString(), confirmed_at: responseValue === 'confirmed' ? new Date(confirmedDate).toISOString() : previous.confirmed_at } : previous);
      setMessage(responseValue === 'confirmed' ? 'Agendamento confirmado. Obrigado pelo retorno.' : 'Registramos que você não confirma este agendamento. A equipe responsável poderá entrar em contato.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar sua resposta.');
    } finally { setSaving(false); }
  }

  return <main className="public-order-page"><section className="public-order-card" aria-labelledby="public-order-title">
    <header className="public-order-header"><div className="public-order-brand"><span className="public-order-logo">N</span><span>Nexo <small>Confirmação de agendamento</small></span></div><span className="public-order-secure"><ShieldCheck size={14}/> Link seguro</span></header>
    {loading ? <div className="public-order-state"><span className="public-order-spinner"/><strong>Carregando os dados do pedido...</strong></div> : error && !order ? <div className="public-order-state public-order-error"><X size={22}/><strong>Não foi possível abrir este pedido</strong><p>{error}</p></div> : order ? <>
      <div className="public-order-intro"><span className="public-order-eyebrow"><Truck size={14}/> RESPOSTA DO CLIENTE</span><h1 id="public-order-title">Confirme o agendamento</h1><p>Confira os dados abaixo e informe se confirma a data do pedido.</p></div>
      <div className="public-order-main-info"><span>Pedido</span><strong>{order.order_number}</strong><span>Cliente</span><strong>{order.client_name}</strong><span>Portal</span><strong>{order.portal}</strong><span>Status na plataforma</span><strong>{order.status}</strong></div>
      <section className="public-order-section"><h2><CalendarDays size={16}/> Datas do agendamento</h2><div className="public-order-date-row"><span>Data solicitada</span><strong>{displayDate(order.requested_at)}</strong></div><label className="public-order-confirm-date">Data confirmada<input type="datetime-local" value={confirmedDate} onChange={event => setConfirmedDate(event.target.value)} disabled={saving}/><small>Você pode ajustar a data antes de confirmar.</small></label></section>
      <section className="public-order-section"><h2><FileText size={16}/> Informações do XML</h2><div className="public-order-xml-grid"><div><span>Número do pedido no XML</span><strong>{order.xml_order_number || 'Não informado'}</strong></div><div><span>Nota fiscal (nNF)</span><strong>{order.xml_invoice_number || 'Não informada'}</strong></div><div><span>Itens</span><strong>{order.xml_item_count ?? 0}</strong></div><div><span>Quantidade total</span><strong>{Number(order.xml_item_quantity || 0).toLocaleString('pt-BR')}</strong></div><div className="wide"><span>Ordem de compra</span><strong>{order.xml_purchase_order || 'Não informada'}</strong></div></div></section>
      {order.client_confirmation && <div className={`public-order-previous ${order.client_confirmation}`}><span>{order.client_confirmation === 'confirmed' ? <Check size={16}/> : <X size={16}/>}</span><div><strong>{order.client_confirmation === 'confirmed' ? 'Agendamento confirmado' : 'Agendamento não confirmado'}</strong><small>Resposta registrada em {displayDate(order.client_confirmation_at)}</small></div></div>}
      {message && <div className="public-order-success"><Check size={16}/>{message}</div>}{error && <div className="public-order-error-message">{error}</div>}
      <div className="public-order-actions"><button className="public-order-yes" onClick={() => void respond('confirmed')} disabled={saving || !confirmedDate}>{saving ? <><span className="public-order-spinner small"/> Registrando...</> : <><Check size={16}/> Confirmo a data</>}</button><button className="public-order-no" onClick={() => void respond('not_confirmed')} disabled={saving}><X size={16}/> Não confirmo</button></div>
      <div className="public-order-receipt"><PackageCheck size={14}/><span>Ao abrir este link, registramos o recebimento. Sua resposta será enviada à equipe responsável.</span></div>
    </> : null}
    <footer className="public-order-footer"><Clock3 size={13}/> Se precisar alterar outras informações, fale com a equipe responsável pelo pedido.</footer>
  </section></main>;
}
