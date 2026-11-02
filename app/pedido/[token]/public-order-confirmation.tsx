'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase';
import { CalendarDays, Check, Clock3, FileText, PackageCheck, Paperclip, ShieldCheck, Truck, X } from 'lucide-react';

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
  has_voucher: boolean;
  voucher_file_name: string | null;
  voucher_content_type: 'application/pdf' | 'image/jpeg' | null;
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
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState('');
  const [voucherMessage, setVoucherMessage] = useState('');
  const voucherInputRef = useRef<HTMLInputElement>(null);

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

  function selectVoucher(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    const contentType = file.type || (extension === 'pdf' ? 'application/pdf' : ['jpg', 'jpeg'].includes(extension || '') ? 'image/jpeg' : '');
    if (!['application/pdf', 'image/jpeg'].includes(contentType)) {
      setVoucherError('Selecione um voucher em PDF ou JPEG.');
      setVoucherFile(null);
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setVoucherError('O voucher deve ter conteúdo e no máximo 10 MB.');
      setVoucherFile(null);
      return;
    }
    setVoucherError('');
    setVoucherMessage('');
    setVoucherFile(file);
  }

  async function uploadVoucher() {
    if (!voucherFile) {
      setVoucherError('Selecione um arquivo PDF ou JPEG para anexar.');
      return;
    }
    const extension = voucherFile.name.toLowerCase().split('.').pop();
    const contentType = voucherFile.type || (extension === 'pdf' ? 'application/pdf' : 'image/jpeg');
    setVoucherBusy(true);
    setVoucherError('');
    setVoucherMessage('');
    try {
      const prepareResponse = await fetch(`/api/public-orders/${encodeURIComponent(token)}/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: voucherFile.name, content_type: contentType, size: voucherFile.size }),
      });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(prepared.error || 'Não foi possível preparar o envio do voucher.');

      const supabase = createClient();
      if (!supabase) throw new Error('Não foi possível conectar ao armazenamento do voucher.');
      const { error: uploadError } = await supabase.storage.from('order-vouchers').uploadToSignedUrl(prepared.path, prepared.upload_token, voucherFile, { contentType });
      if (uploadError) throw new Error('Não foi possível enviar o voucher. Tente novamente.');

      const linkResponse = await fetch(`/api/public-orders/${encodeURIComponent(token)}/voucher`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: prepared.path, file_name: voucherFile.name, content_type: contentType }),
      });
      const result = await linkResponse.json();
      if (!linkResponse.ok) throw new Error(result.error || 'Não foi possível vincular o voucher ao pedido.');
      setOrder(previous => previous ? {
        ...previous,
        has_voucher: true,
        voucher_file_name: result.voucher_file_name || voucherFile.name,
        voucher_content_type: result.voucher_content_type || null,
      } : previous);
      setVoucherFile(null);
      setVoucherMessage('Voucher anexado ao pedido. A equipe já pode visualizá-lo no botão Voucher.');
    } catch (cause) {
      setVoucherError(cause instanceof Error ? cause.message : 'Não foi possível anexar o voucher. Tente novamente.');
    } finally {
      setVoucherBusy(false);
    }
  }

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
      <section className="public-order-section public-order-voucher"><h2><Paperclip size={16}/> Voucher de entrega</h2><p>Anexe o comprovante em PDF ou JPEG. Limite de 10 MB; o voucher ficará vinculado a este pedido e disponível para a equipe na plataforma.</p>{order.has_voucher && <div className="public-order-voucher-current"><Check size={15}/><span><strong>Voucher anexado</strong><small>{order.voucher_file_name || 'Um arquivo já está vinculado a este pedido. Enviar outro substituirá o atual.'}</small></span></div>}<input ref={voucherInputRef} className="public-order-voucher-input" type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" onChange={selectVoucher} disabled={voucherBusy}/><div className="public-order-voucher-actions"><button className="public-order-voucher-select" type="button" onClick={() => voucherInputRef.current?.click()} disabled={voucherBusy}>{order.has_voucher ? 'Substituir voucher' : 'Selecionar voucher'}</button><span className="public-order-voucher-name">{voucherFile?.name || 'Nenhum novo arquivo selecionado'}</span><button className="public-order-voucher-save" type="button" onClick={() => void uploadVoucher()} disabled={!voucherFile || voucherBusy}>{voucherBusy ? <><span className="public-order-spinner small"/> Enviando...</> : <><Paperclip size={14}/> Anexar ao pedido</>}</button></div>{voucherError && <div className="public-order-error-message">{voucherError}</div>}{voucherMessage && <div className="public-order-success"><Check size={15}/>{voucherMessage}</div>}</section>
      {order.client_confirmation && <div className={`public-order-previous ${order.client_confirmation}`}><span>{order.client_confirmation === 'confirmed' ? <Check size={16}/> : <X size={16}/>}</span><div><strong>{order.client_confirmation === 'confirmed' ? 'Agendamento confirmado' : 'Agendamento não confirmado'}</strong><small>Resposta registrada em {displayDate(order.client_confirmation_at)}</small></div></div>}
      {message && <div className="public-order-success"><Check size={16}/>{message}</div>}{error && <div className="public-order-error-message">{error}</div>}
      <div className="public-order-actions"><button className="public-order-yes" onClick={() => void respond('confirmed')} disabled={saving || !confirmedDate}>{saving ? <><span className="public-order-spinner small"/> Registrando...</> : <><Check size={16}/> Confirmo a data</>}</button><button className="public-order-no" onClick={() => void respond('not_confirmed')} disabled={saving}><X size={16}/> Não confirmo</button></div>
      <div className="public-order-receipt"><PackageCheck size={14}/><span>Ao abrir este link, registramos o recebimento. Sua resposta será enviada à equipe responsável.</span></div>
    </> : null}
    <footer className="public-order-footer"><Clock3 size={13}/> Se precisar alterar outras informações, fale com a equipe responsável pelo pedido.</footer>
  </section></main>;
}
