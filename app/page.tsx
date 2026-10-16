'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from './lib/supabase';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Download, Edit2, ExternalLink, FileBarChart2, FileUp, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Truck, Users, X } from 'lucide-react';

type Portal = string;
type Module = 'overview' | 'integrations' | 'clients' | 'portals' | 'reports';
type PortalDefinition = { name: Portal; description: string; url: string; short: string; tone: string };
const INITIAL_PORTALS: PortalDefinition[] = [
  { name: 'TempoCerto', description: 'Agendamento de cargas', url: 'https://tempocerto.com/', short: 'TC', tone: 'teal' },
  { name: 'Trizy', description: 'Gestão logística', url: 'https://www.trizy.com.br/', short: 'T', tone: 'orange' },
  { name: 'Nexello', description: 'Portal de agendamentos', url: 'https://portal.nexello.com.br/', short: 'N', tone: 'navy' },
];
type Client = { id: string; legal_name: string; trade_name: string; cnpj: string; email: string; phone: string; portal: Portal };
type Order = { id: string; order_number: string; client_id: string | null; portal: Portal; scheduled_at: string | null; status: 'Agendado' | 'Pendente' | 'Falhou'; created_at: string };

function normalizeCnpj(value: string) { return value.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }

const initialOrders: Order[] = [
  { id: '1', order_number: 'PED-2024-0842', client_id: 'demo-client-1', portal: 'TempoCerto', scheduled_at: '2026-10-16T09:30:00', status: 'Agendado', created_at: '2026-10-15T09:24:00' },
  { id: '2', order_number: 'PED-2024-0841', client_id: 'demo-client-2', portal: 'Trizy', scheduled_at: null, status: 'Pendente', created_at: '2026-10-15T08:52:00' },
  { id: '3', order_number: 'PED-2024-0840', client_id: 'demo-client-3', portal: 'Nexello', scheduled_at: '2026-10-15T14:00:00', status: 'Agendado', created_at: '2026-10-15T08:20:00' },
  { id: '4', order_number: 'PED-2024-0839', client_id: 'demo-client-1', portal: 'TempoCerto', scheduled_at: null, status: 'Falhou', created_at: '2026-10-14T16:38:00' },
  { id: '5', order_number: 'PED-2024-0838', client_id: 'demo-client-2', portal: 'Trizy', scheduled_at: '2026-10-15T16:30:00', status: 'Agendado', created_at: '2026-10-14T15:14:00' },
];
const initialClients: Client[] = [
  { id: 'demo-client-1', legal_name: 'Transportadora Exemplo Ltda.', trade_name: 'Exemplo Cargas', cnpj: '00000000000000', email: 'contato@example.com', phone: '(11) 90000-0000', portal: 'TempoCerto' },
  { id: 'demo-client-2', legal_name: 'Logística Modelo S.A.', trade_name: 'Modelo Log', cnpj: '11111111111111', email: 'operacao@example.com', phone: '(21) 90000-0000', portal: 'Trizy' },
  { id: 'demo-client-3', legal_name: 'Distribuidora Demo Ltda.', trade_name: 'Demo Distribuição', cnpj: '22222222222222', email: 'agenda@example.com', phone: '(31) 90000-0000', portal: 'Nexello' },
];

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const demoMode = process.env.NODE_ENV !== 'production' && !supabase;
  const [orders, setOrders] = useState<Order[]>(() => demoMode ? initialOrders : []);
  const [clients, setClients] = useState<Client[]>(() => demoMode ? initialClients : []);
  const [userEmail, setUserEmail] = useState('operacoes@empresa.com');
  const [authenticated, setAuthenticated] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<Module>('overview');
  const [portals, setPortals] = useState<PortalDefinition[]>(INITIAL_PORTALS);
  const [activePortals, setActivePortals] = useState<Record<Portal, boolean>>({ TempoCerto: true, Trizy: true, Nexello: true });
  const [configuredCredentials, setConfiguredCredentials] = useState<Record<Portal, boolean>>({ TempoCerto: false, Trizy: false, Nexello: false });
  const [configPortal, setConfigPortal] = useState<Portal | null>(null);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const [showPortalForm, setShowPortalForm] = useState(false);
  const [portalFormError, setPortalFormError] = useState('');
  const [portalDraft, setPortalDraft] = useState({ name: '', url: '', description: '' });
  const [showClientForm, setShowClientForm] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginMode, setLoginMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<Order['status']>('Pendente');
  const [showXmlImport, setShowXmlImport] = useState(false);
  const [xmlFileName, setXmlFileName] = useState('');
  const [xmlImportError, setXmlImportError] = useState('');
  const [xmlClientId, setXmlClientId] = useState('');
  const [xmlOrderNumber, setXmlOrderNumber] = useState('');
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [portalFilter, setPortalFilter] = useState('Todos os portais');
  const [statusFilter, setStatusFilter] = useState('Todos os status');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkPortal, setBulkPortal] = useState('');
  const [reportPortalFilter, setReportPortalFilter] = useState('Todos os portais');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [clientDraft, setClientDraft] = useState({ legal_name: '', trade_name: '', cnpj: '', email: '', phone: '', portal: 'TempoCerto' as Portal });
  const [form, setForm] = useState({ number: '', clientId: '', portal: 'TempoCerto' as Portal, date: '' });
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now).toLocaleUpperCase('pt-BR');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setAuthenticated(true); setUserEmail(data.session.user.email || ''); void loadOrders(); void loadCredentialStatus(); }
      else setLoginOpen(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session); if (session?.user.email) setUserEmail(session.user.email); if (session) { setLoginOpen(false); void loadOrders(); void loadCredentialStatus(); }
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function loadOrders() {
    if (!supabase) return;
    const { data: memberships } = await supabase.from('organization_members').select('organization_id').limit(1);
    if (!memberships?.[0]) return;
    setOrganizationId(memberships[0].organization_id);
    const { data: portalRows } = await supabase.from('organization_portals').select('portal, active, portal_url, description').eq('organization_id', memberships[0].organization_id);
    if (portalRows?.length) {
      setActivePortals(prev => ({ ...prev, ...Object.fromEntries(portalRows.map(row => [row.portal, row.active])) }));
      setPortals(prev => {
        const saved = portalRows.map((row, index) => ({
          name: row.portal,
          url: row.portal_url || INITIAL_PORTALS.find(portal => portal.name === row.portal)?.url || '',
          description: row.description || INITIAL_PORTALS.find(portal => portal.name === row.portal)?.description || 'Portal cadastrado pela empresa',
          short: portalInitials(row.portal),
          tone: INITIAL_PORTALS.find(portal => portal.name === row.portal)?.tone || ['teal', 'orange', 'navy'][index % 3],
        }));
        return [...INITIAL_PORTALS.map(defaultPortal => saved.find(portal => portal.name === defaultPortal.name) || defaultPortal), ...saved.filter(portal => !INITIAL_PORTALS.some(defaultPortal => defaultPortal.name === portal.name))];
      });
    }
    const { data: clientRows, error: clientsError } = await supabase.from('clients').select('id, legal_name, trade_name, cnpj, email, phone, portal').eq('organization_id', memberships[0].organization_id).order('trade_name');
    if (!clientsError && clientRows) setClients(clientRows as Client[]);
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (!error && data) setOrders(data as Order[]);
  }

  async function loadCredentialStatus() {
    if (!supabase) return;
    const response = await fetch('/api/portal-credentials');
    if (!response.ok) return;
    const result = await response.json();
    if (result.configured) setConfiguredCredentials(result.configured as Record<Portal, boolean>);
  }

  async function savePortalCredentials(portal: Portal, username: string, password: string) {
    setSavingCredentials(true); setCredentialError('');
    try {
      const response = await fetch('/api/portal-credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal, username, password }),
      });
      const result = await response.json();
      if (!response.ok) { setCredentialError(result.error || 'Não foi possível salvar as credenciais.'); return; }
      setConfiguredCredentials(prev => ({ ...prev, [portal]: true }));
      setConfigPortal(null); setToast(`Acesso do portal ${portal} configurado com segurança.`);
    } catch {
      setCredentialError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally { setSavingCredentials(false); }
  }

  async function signIn(email: string, password: string) {
    if (!supabase) { if (!demoMode) { setToast('A autenticação Supabase ainda não está configurada neste ambiente.'); return; } setUserEmail(email); setAuthenticated(true); setLoginOpen(false); setToast('Modo demonstração: configure o Supabase para habilitar o acesso seguro.'); return; }
    const action = loginMode ? supabase.auth.signUp({ email, password }) : supabase.auth.signInWithPassword({ email, password });
    const { error } = await action;
    if (error) setToast(error.message);
    else if (loginMode) setToast('Conta criada. Confirme seu e-mail para entrar.');
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setAuthenticated(false); setLoginOpen(true);
  }

  function openXmlImport() {
    setEditingOrderId(null);
    setForm({ number: '', clientId: '', portal: activePortalNames[0] || 'TempoCerto', date: '' });
    setFormStatus('Pendente');
    setXmlFileName(''); setXmlImportError(''); setXmlClientId(''); setXmlOrderNumber('');
    setShowXmlImport(true);
  }

  async function handleXmlUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setXmlImportError(''); setXmlClientId(''); setXmlOrderNumber(''); setXmlFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xml')) { setXmlImportError('Selecione um arquivo com extensão .xml.'); return; }
    if (file.size > 5 * 1024 * 1024) { setXmlImportError('O XML deve ter no máximo 5 MB.'); return; }
    try {
      const source = await file.text();
      const documentXml = new DOMParser().parseFromString(source, 'application/xml');
      if (documentXml.querySelector('parsererror')) { setXmlImportError('Não foi possível ler o XML. Verifique se o arquivo está válido.'); return; }
      const nodes = Array.from(documentXml.getElementsByTagName('*'));
      const cnpjs = nodes.filter(node => node.localName.toLowerCase() === 'cnpj').map(node => normalizeCnpj(node.textContent || '')).filter(value => value.length === 14);
      const foundClients = clients.filter(client => cnpjs.includes(normalizeCnpj(client.cnpj)));
      const uniqueClients = Array.from(new Map(foundClients.map(client => [client.id, client])).values());
      const numberTags = ['numeropedido', 'npedido', 'numpedido', 'xped', 'nped', 'nnf', 'nct', 'ndf', 'numero'];
      let extractedNumber = '';
      for (const tag of numberTags) {
        const value = nodes.find(node => node.localName.toLowerCase() === tag && node.textContent?.trim())?.textContent?.trim();
        if (value) { extractedNumber = value; break; }
      }
      setXmlOrderNumber(extractedNumber);
      if (uniqueClients.length !== 1) {
        setXmlImportError(uniqueClients.length ? 'O XML corresponde a mais de um cliente cadastrado. Revise os CNPJs do arquivo.' : 'Nenhum CNPJ do XML corresponde a um cliente cadastrado. Cadastre o cliente ou confira o XML.');
        return;
      }
      const client = uniqueClients[0];
      setXmlClientId(client.id);
      setForm(previous => ({ ...previous, number: extractedNumber, clientId: client.id, portal: client.portal }));
      if (!activePortals[client.portal]) setXmlImportError(`Cliente identificado: ${client.trade_name}, mas o portal padrão ${client.portal} está desativado. Ative o portal antes de gravar o pedido.`);
    } catch {
      setXmlImportError('Não foi possível abrir esse arquivo XML. Tente selecionar o arquivo novamente.');
    }
  }

  async function saveOrder() {
    if (!form.number.trim()) return;
    if (!clients.length) { setToast('Cadastre um cliente antes de adicionar um pedido.'); return; }
    if (!form.clientId || !clients.some(client => client.id === form.clientId)) { setToast('Selecione o cliente relacionado ao pedido.'); return; }
    if (!activePortals[form.portal]) { setToast(`Ative o portal ${form.portal} antes de adicionar o pedido.`); return; }
    const originalOrder = orders.find(order => order.id === editingOrderId);
    const newOrder: Order = { id: editingOrderId || crypto.randomUUID(), order_number: form.number.trim(), client_id: form.clientId, portal: form.portal, scheduled_at: form.date ? new Date(form.date).toISOString() : null, status: formStatus, created_at: originalOrder?.created_at || new Date().toISOString() };
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada. Tente novamente em instantes.'); return; }
      const orderPayload = { order_number: newOrder.order_number, client_id: newOrder.client_id, portal: newOrder.portal, scheduled_at: newOrder.scheduled_at, status: newOrder.status };
      const query = editingOrderId
        ? supabase.from('orders').update(orderPayload).eq('id', editingOrderId).eq('organization_id', organizationId)
        : supabase.from('orders').insert({ organization_id: organizationId, ...orderPayload });
      const { data, error } = await query.select().single();
      if (error) { setToast(error.message); return; } if (data) newOrder.id = data.id;
    }
    setOrders(previous => editingOrderId ? previous.map(order => order.id === editingOrderId ? newOrder : order) : [newOrder, ...previous]);
    const wasEditing = !!editingOrderId;
    setShowForm(false); setShowXmlImport(false); setEditingOrderId(null); setXmlFileName(''); setXmlClientId(''); setXmlOrderNumber(''); setForm({ number: '', clientId: '', portal: clients[0]?.portal || 'TempoCerto', date: '' }); setFormStatus('Pendente'); setToast(wasEditing ? 'Pedido atualizado.' : 'Pedido adicionado à fila de integração.');
  }

  async function addOrder(event: React.FormEvent) { event.preventDefault(); await saveOrder(); }

  function openOrderEditor(order: Order) {
    setEditingOrderId(order.id);
    setForm({ number: order.order_number, clientId: order.client_id || '', portal: order.portal, date: order.scheduled_at ? toLocalDateTime(order.scheduled_at) : '' });
    setFormStatus(order.status);
    setShowForm(true);
  }

  async function addClient(event: React.FormEvent) {
    event.preventDefault();
    setClientFormError('');
    const normalizedCnpj = normalizeCnpj(clientDraft.cnpj);
    if (!clientDraft.legal_name.trim() || !clientDraft.trade_name.trim() || !clientDraft.email.trim() || !clientDraft.phone.trim()) { setClientFormError('Preencha todos os campos do cliente.'); return; }
    if (normalizedCnpj.length !== 14) { setClientFormError('O CNPJ deve ter 14 letras ou números.'); return; }
    if (clients.some(client => client.id !== editingClientId && normalizeCnpj(client.cnpj) === normalizedCnpj)) { setClientFormError('Já existe um cliente com esse CNPJ nesta organização.'); return; }
    if (!activePortals[clientDraft.portal]) { setClientFormError('Ative o portal escolhido antes de cadastrar o cliente.'); return; }
    setSavingClient(true);
    const newClient: Client = { id: editingClientId || crypto.randomUUID(), legal_name: clientDraft.legal_name.trim(), trade_name: clientDraft.trade_name.trim(), cnpj: normalizedCnpj, email: clientDraft.email.trim(), phone: clientDraft.phone.trim(), portal: clientDraft.portal };
    if (supabase && authenticated) {
      if (!organizationId) { setClientFormError('A organização ainda está carregando. Tente novamente.'); setSavingClient(false); return; }
      const clientQuery = editingClientId
        ? supabase.from('clients').update({ legal_name: newClient.legal_name, trade_name: newClient.trade_name, cnpj: newClient.cnpj, email: newClient.email, phone: newClient.phone, portal: newClient.portal }).eq('id', editingClientId).eq('organization_id', organizationId)
        : supabase.from('clients').insert({ organization_id: organizationId, legal_name: newClient.legal_name, trade_name: newClient.trade_name, cnpj: newClient.cnpj, email: newClient.email, phone: newClient.phone, portal: newClient.portal });
      const { data, error } = await clientQuery.select('id, legal_name, trade_name, cnpj, email, phone, portal').single();
      if (error) {
        setClientFormError(error.message.includes('clients') || error.message.includes('schema cache') ? 'Aplique a migração de clientes no Supabase antes de cadastrar.' : 'Não foi possível salvar o cliente. Verifique os dados e tente novamente.');
        setSavingClient(false);
        return;
      }
      if (data) newClient.id = data.id;
    }
    setClients(previous => editingClientId ? previous.map(client => client.id === editingClientId ? newClient : client) : [...previous, newClient]);
    setClientDraft({ legal_name: '', trade_name: '', cnpj: '', email: '', phone: '', portal: activePortalNames[0] || clientDraft.portal });
    setShowClientForm(false);
    const wasEditing = !!editingClientId;
    setEditingClientId(null);
    setSavingClient(false);
    setToast(wasEditing ? `Cliente ${newClient.trade_name} atualizado.` : `Cliente ${newClient.trade_name} cadastrado.`);
  }

  function openClientEditor(client: Client) {
    setClientFormError('');
    setEditingClientId(client.id);
    setClientDraft({ legal_name: client.legal_name, trade_name: client.trade_name, cnpj: client.cnpj, email: client.email, phone: client.phone, portal: client.portal });
    setShowClientForm(true);
  }

  async function togglePortal(portal: Portal) {
    const nextActive = !activePortals[portal];
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada.'); return; }
      const { error } = await supabase.from('organization_portals').upsert({ organization_id: organizationId, portal, active: nextActive }, { onConflict: 'organization_id,portal' });
      if (error) { setToast(error.message); return; }
    }
    setActivePortals(prev => ({ ...prev, [portal]: nextActive }));
    if (!nextActive && form.portal === portal) { const replacement = portals.find(item => item.name !== portal && activePortals[item.name]); if (replacement) setForm(prev => ({ ...prev, portal: replacement.name })); }
    setToast(`${portal} ${nextActive ? 'ativado' : 'desativado'}.`);
    if (nextActive && !activePortals[form.portal]) setForm(prev => ({ ...prev, portal }));
  }

  async function addPortal(event: React.FormEvent) {
    event.preventDefault();
    setPortalFormError('');
    const name = portalDraft.name.trim();
    const description = portalDraft.description.trim() || 'Portal cadastrado pela empresa';
    let url: URL;
    try { url = new URL(portalDraft.url.trim()); } catch { setPortalFormError('Informe um endereço válido para o portal.'); return; }
    if (!['http:', 'https:'].includes(url.protocol)) { setPortalFormError('O endereço precisa começar com http:// ou https://.'); return; }
    if (!name || name.length > 60) { setPortalFormError('O nome deve ter entre 1 e 60 caracteres.'); return; }
    if (portals.some(portal => portal.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) { setPortalFormError('Já existe um portal com esse nome.'); return; }
    const nextPortal: PortalDefinition = { name, description, url: url.toString(), short: portalInitials(name), tone: ['teal', 'orange', 'navy'][portals.length % 3] };
    if (supabase && authenticated) {
      if (!organizationId) { setPortalFormError('A organização ainda está carregando. Tente novamente.'); return; }
      const { error } = await supabase.from('organization_portals').insert({ organization_id: organizationId, portal: name, portal_url: nextPortal.url, description, active: true });
      if (error) { setPortalFormError(error.message.includes('portal_url') ? 'Atualize o banco Supabase com a nova migração para cadastrar portais.' : 'Não foi possível salvar o portal. Verifique a migração do banco e tente novamente.'); return; }
    }
    setPortals(previous => [...previous, nextPortal]);
    setActivePortals(previous => ({ ...previous, [name]: true }));
    setPortalDraft({ name: '', url: '', description: '' });
    setShowPortalForm(false);
    setToast(`Portal ${name} cadastrado e ativado.`);
  }

  function publish(order: Order) { if (!activePortals[order.portal]) { setToast(`Ative o portal ${order.portal} antes de publicar.`); return; } const portal = portals.find(item => item.name === order.portal); if (!portal?.url) { setToast(`Cadastre o endereço do portal ${order.portal} antes de publicar.`); return; } window.open(portal.url, '_blank', 'noopener,noreferrer'); setToast(`Portal ${order.portal} aberto. Conclua o agendamento no painel do portal.`); }
  const filtered = orders.filter(o => (o.order_number.toLowerCase().includes(query.toLowerCase()) || o.portal.toLowerCase().includes(query.toLowerCase())) && (portalFilter === 'Todos os portais' || o.portal === portalFilter) && (statusFilter === 'Todos os status' || o.status === statusFilter));
  const selectedOrders = orders.filter(order => selectedOrderIds.includes(order.id));
  const selectedPortals = portals.filter(portal => selectedOrders.some(order => order.portal === portal.name));
  const bulkPortalValue = selectedPortals.some(portal => portal.name === bulkPortal) ? bulkPortal : selectedPortals[0]?.name || '';
  const bulkPortalOrders = selectedOrders.filter(order => order.portal === bulkPortalValue);
  const reportOrders = orders.filter(order => {
    const createdDate = order.created_at.slice(0, 10);
    return (reportPortalFilter === 'Todos os portais' || order.portal === reportPortalFilter)
      && (!reportStart || createdDate >= reportStart)
      && (!reportEnd || createdDate <= reportEnd);
  });
  const reportScheduled = reportOrders.filter(order => order.status === 'Agendado').length;
  const reportPending = reportOrders.filter(order => order.status === 'Pendente').length;
  const reportFailed = reportOrders.filter(order => order.status === 'Falhou').length;
  const scheduledCount = orders.filter(o => o.status === 'Agendado').length;
  const todayKey = localDateKey(now);
  const todayScheduleOrders = orders.filter(order => order.scheduled_at && localDateKey(new Date(order.scheduled_at)) === todayKey);
  const hourlySchedule = Array.from({ length: 24 }, (_, hour) => ({ hour, count: todayScheduleOrders.filter(order => new Date(order.scheduled_at!).getHours() === hour).length }));
  const portalScheduleStats = portals.map(portal => ({ ...portal, count: orders.filter(order => order.portal === portal.name && order.status === 'Agendado').length })).sort((a, b) => b.count - a.count);
  const busiestPortal = portalScheduleStats[0];
  const maxPortalSchedule = Math.max(1, ...portalScheduleStats.map(portal => portal.count));
  const activePortalNames = portals.filter(portal => activePortals[portal.name]).map(portal => portal.name);
  const clientMatches = clients.filter(client => `${client.legal_name} ${client.trade_name} ${client.cnpj} ${client.email}`.toLocaleLowerCase('pt-BR').includes(clientQuery.toLocaleLowerCase('pt-BR')));

  function selectVisibleOrders(checked: boolean) {
    const visibleIds = filtered.map(order => order.id);
    setSelectedOrderIds(previous => checked
      ? Array.from(new Set([...previous, ...visibleIds]))
      : previous.filter(id => !visibleIds.includes(id)));
  }

  function publishSelected() {
    const portal = portals.find(item => item.name === bulkPortalValue);
    if (!bulkPortalOrders.length) { setToast('Selecione pedidos do portal que deseja abrir.'); return; }
    if (!activePortals[bulkPortalValue]) { setToast(`Ative o portal ${bulkPortalValue} antes de publicar.`); return; }
    if (!portal?.url) { setToast(`Cadastre o endereço do portal ${bulkPortalValue} antes de publicar.`); return; }
    window.open(portal.url, '_blank', 'noopener,noreferrer');
    setToast(`${bulkPortalOrders.length} ${bulkPortalOrders.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'} para publicação no ${bulkPortalValue}. Conclua o processo no painel do portal.`);
  }

  function exportReport() {
    const rows = [
      ['Pedido', 'Cliente', 'Portal', 'Data de cadastro', 'Data agendada', 'Status'],
      ...reportOrders.map(order => [order.order_number, clients.find(client => client.id === order.client_id)?.trade_name || '', order.portal, formatReportDate(order.created_at), order.scheduled_at ? formatReportDate(order.scheduled_at) : '', order.status]),
    ];
    const csv = `\uFEFF${rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-integracoes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Relatório exportado em CSV.');
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6}/></div><span>nexo<span className="brand-dot">.</span></span></div>
      <div className="workspace-switch"><div className="workspace-icon">AC</div><div className="workspace-copy"><strong>Acme Cargas</strong><small>Plano inicial</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav><button className={`nav-item ${activeModule === 'overview' ? 'active' : ''}`} onClick={() => setActiveModule('overview')}><LayoutDashboard size={18}/>Dashboard</button><button className={`nav-item ${activeModule === 'integrations' ? 'active' : ''}`} onClick={() => setActiveModule('integrations')}><Truck size={18}/>Integrações<span className="nav-count">{orders.length}</span></button><button className={`nav-item ${activeModule === 'clients' ? 'active' : ''}`} onClick={() => setActiveModule('clients')}><Users size={18}/>Clientes<span className="nav-count">{clients.length}</span></button><button className={`nav-item ${activeModule === 'reports' ? 'active' : ''}`} onClick={() => setActiveModule('reports')}><FileBarChart2 size={18}/>Relatórios</button><button className={`nav-item ${activeModule === 'portals' ? 'active' : ''}`} onClick={() => setActiveModule('portals')}><Settings2 size={18}/>Portais</button></nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Precisa de ajuda?</strong><p>Estamos aqui para ajudar você a começar.</p><button onClick={() => setToast('Em breve: central de ajuda.')}>Falar com suporte <ArrowRight size={14}/></button></div><button className="profile" onClick={() => authenticated ? void signOut() : setLoginOpen(true)}><div className="avatar">{userEmail.slice(0,1).toUpperCase()}</div><div className="profile-copy"><strong>{userEmail.split('@')[0]}</strong><small>{userEmail}</small></div>{authenticated ? <LogOut size={16}/> : <Settings2 size={17}/>}</button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb"><Menu className="mobile-menu" size={20}/><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeModule === 'overview' ? 'Dashboard' : activeModule === 'integrations' ? 'Integrações' : activeModule === 'clients' ? 'Clientes' : activeModule === 'reports' ? 'Relatórios' : 'Portais'}</strong></div><div className="top-actions"><div className="secure-pill"><ShieldCheck size={14}/> Ambiente seguro</div><button className="icon-button" aria-label="Ajuda" onClick={() => setToast('Central de ajuda em breve.')}><CircleHelp size={18}/></button><div className="top-avatar">{userEmail.slice(0,1).toUpperCase()}</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {dateLabel}</div><h1>{activeModule === 'overview' ? 'Dashboard' : activeModule === 'integrations' ? 'Integrações' : activeModule === 'clients' ? 'Clientes' : activeModule === 'reports' ? 'Relatórios' : 'Portais'} </h1><p className="subtitle">{activeModule === 'overview' ? 'Acompanhe os principais indicadores da sua operação.' : activeModule === 'integrations' ? 'Gerencie seus pedidos e acompanhe os agendamentos.' : activeModule === 'clients' ? 'Cadastre clientes e defina o portal padrão de cada operação.' : activeModule === 'reports' ? 'Analise os pedidos e resultados registrados por portal.' : 'Ative somente os portais que sua empresa utiliza.'}</p></div>{activeModule === 'integrations' && <div className="integration-header-actions"><button className="outline-button xml-upload-trigger" onClick={openXmlImport}><FileUp size={16}/> Upload XML</button><button className="primary-button" onClick={() => { setEditingOrderId(null); setFormStatus('Pendente'); setForm({ number: '', clientId: clients[0]?.id || '', portal: clients[0]?.portal || activePortalNames[0] || 'TempoCerto', date: '' }); setShowForm(true); }}><Plus size={17}/> Novo pedido</button></div>}{activeModule === 'clients' && <button className="primary-button" onClick={() => { setClientFormError(''); setClientDraft(previous => ({ ...previous, portal: activePortalNames[0] || previous.portal })); setShowClientForm(true); }}><Plus size={17}/> Cadastrar cliente</button>}</div>
        {activeModule === 'overview' && <div className="metric-grid">
          <Metric title="Pedidos no total" value={String(orders.length).padStart(2,'0')} note="na sua fila de integração" icon={<Truck size={17}/>} tone="blue" trend="Fila atual"/>
          <Metric title="Agendados" value={String(scheduledCount).padStart(2,'0')} note="pedidos confirmados" icon={<Check size={17}/>} tone="green" trend={`${orders.length ? Math.round(scheduledCount/orders.length*100) : 0}%`}/>
          <Metric title="Aguardando ação" value={String(orders.filter(o => o.status === 'Pendente').length).padStart(2,'0')} note="prontos para publicar" icon={<Clock3 size={17}/>} tone="amber" trend="Ação necessária"/>
          <Metric title="Portais ativos" value={String(Object.values(activePortals).filter(Boolean).length).padStart(2,'0')} note="habilitados para operar" icon={<Activity size={17}/>} tone="violet" trend={`de ${portals.length} portais`}/>
        </div>}
        {activeModule === 'overview' && <section className="dashboard-charts" aria-label="Gráficos de agendamento"><article className="chart-card daily-chart"><div className="chart-card-heading"><div><h2>Agendamentos de hoje</h2><p>Pedidos confirmados distribuídos por horário</p></div><span className="chart-total"><strong>{todayScheduleOrders.length}</strong><small>hoje</small></span></div>{todayScheduleOrders.length ? <><div className="hourly-chart" role="img" aria-label={`${todayScheduleOrders.length} agendamentos registrados para hoje, distribuídos por horário`}>{hourlySchedule.map(({ hour, count }) => <div className="hour-column" key={hour} title={`${String(hour).padStart(2, '0')}h · ${count} ${count === 1 ? 'agendamento' : 'agendamentos'}`}><span className="hour-value">{count || ''}</span><div className="hour-bar-track"><i style={{ height: `${count ? Math.max(9, count / Math.max(...hourlySchedule.map(item => item.count)) * 100) : 0}%` }}/></div><small>{hour % 6 === 0 ? `${String(hour).padStart(2, '0')}h` : ''}</small></div>)}</div><div className="chart-footnote">Total de pedidos com status agendado e horário para hoje.</div></> : <div className="chart-empty"><CalendarDays size={19}/><span>Nenhum agendamento para hoje.</span></div>}</article><article className="chart-card portal-chart"><div className="chart-card-heading"><div><h2>Portal com mais agendamentos</h2><p>Pedidos com status agendado por portal</p></div>{busiestPortal && busiestPortal.count > 0 && <span className="leader-badge">Destaque</span>}</div>{scheduledCount ? <div className="portal-ranking">{portalScheduleStats.map((portal, index) => <div className={`portal-rank-row ${index === 0 && portal.count > 0 ? 'leader' : ''}`} key={portal.name}><div className="portal-rank-label"><span className={`mini-logo ${portal.tone}`}>{portal.short}</span><strong>{portal.name}</strong><b>{portal.count}</b></div><div className="portal-rank-track"><i style={{ width: `${portal.count / maxPortalSchedule * 100}%` }}/></div></div>)}</div> : <div className="chart-empty"><Truck size={19}/><span>Ainda não há pedidos agendados.</span></div>}{busiestPortal && scheduledCount > 0 && <div className="chart-footnote">{busiestPortal.name} lidera com {busiestPortal.count} {busiestPortal.count === 1 ? 'pedido agendado' : 'pedidos agendados'}.</div>}</article></section>}
        {activeModule === 'integrations' && <section className="orders-section module-orders" id="orders"><div className="section-heading order-title"><div><h2>Pedidos</h2><p>Consulte e publique pedidos nos portais ativos.</p></div><button className="active-summary clickable" onClick={() => setActiveModule('portals')}><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} portais ativos <ArrowRight size={14}/></button></div>
          <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar pedido ou portal..."/></div><div className="filters"><select value={portalFilter} onChange={e => setPortalFilter(e.target.value)}><option>Todos os portais</option>{portals.map(portal => <option key={portal.name}>{portal.name}</option>)}</select><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Todos os status</option><option>Agendado</option><option>Pendente</option><option>Falhou</option></select></div></div>
            {selectedOrders.length > 0 && <div className="bulk-toolbar"><div className="bulk-selection-count"><strong>{selectedOrders.length}</strong> {selectedOrders.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}</div><label className="bulk-portal-select">Portal<select value={bulkPortalValue} onChange={event => setBulkPortal(event.target.value)}>{selectedPortals.map(portal => <option key={portal.name} value={portal.name} disabled={!activePortals[portal.name]}>{portal.name} · {selectedOrders.filter(order => order.portal === portal.name).length} pedidos{activePortals[portal.name] ? '' : ' (desativado)'}</option>)}</select></label><button className="primary-button bulk-publish" onClick={publishSelected} disabled={!bulkPortalOrders.length || !activePortals[bulkPortalValue]}><ExternalLink size={15}/> Abrir portal com {bulkPortalOrders.length}</button><button className="bulk-clear" onClick={() => setSelectedOrderIds([])}>Limpar seleção</button></div>}
            <div className="table-scroll"><table className="selectable-orders"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Selecionar todos os pedidos visíveis" checked={filtered.length > 0 && filtered.every(order => selectedOrderIds.includes(order.id))} onChange={event => selectVisibleOrders(event.target.checked)}/></th><th>PEDIDO</th><th>CLIENTE</th><th>PORTAL</th><th>DATA AGENDADA</th><th>STATUS</th><th className="action-head">AÇÃO</th></tr></thead><tbody>{filtered.map(order => <tr key={order.id}><td className="select-column"><input type="checkbox" aria-label={`Selecionar pedido ${order.order_number}`} checked={selectedOrderIds.includes(order.id)} onChange={event => setSelectedOrderIds(previous => event.target.checked ? Array.from(new Set([...previous, order.id])) : previous.filter(id => id !== order.id))}/></td><td><strong className="order-number">{order.order_number}</strong><small className="order-sub">Adicionado em {new Date(order.created_at).toLocaleDateString('pt-BR')}</small></td><td>{clients.find(client => client.id === order.client_id)?.trade_name || <span className="muted">Não vinculado</span>}</td><td><PortalMini portal={order.portal} portals={portals}/></td><td>{order.scheduled_at ? <span className="date-cell"><CalendarDays size={15}/>{new Date(order.scheduled_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span> : <span className="muted">Não definido</span>}</td><td><Status status={order.status}/></td><td><div className="order-row-actions"><button className="edit-client-button" onClick={() => openOrderEditor(order)} aria-label={`Editar pedido ${order.order_number}`}><Edit2 size={14}/> Editar</button><button className="publish-button" onClick={() => publish(order)} disabled={!activePortals[order.portal]}><ExternalLink size={14}/> {activePortals[order.portal] ? 'Publicar' : 'Desativado'}</button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">Nenhum pedido encontrado.</div>}</div>
            <div className="table-footer"><span>Mostrando <strong>{filtered.length}</strong> de <strong>{orders.length}</strong> pedidos</span><button className="see-all" onClick={() => { setQuery(''); setPortalFilter('Todos os portais'); setStatusFilter('Todos os status'); }}>Limpar filtros <ArrowRight size={14}/></button></div>
          </div>
        </section>}
        {activeModule === 'clients' && <section className="clients-module">
          <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={clientQuery} onChange={event => setClientQuery(event.target.value)} placeholder="Buscar por nome, CNPJ ou e-mail..."/></div><span className="active-summary"><Users size={13}/> {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}</span></div>
            <div className="table-scroll"><table className="clients-table"><thead><tr><th>RAZÃO SOCIAL</th><th>NOME FANTASIA</th><th>CNPJ</th><th>CONTATO</th><th>PORTAL PADRÃO</th><th className="action-head">AÇÃO</th></tr></thead><tbody>{clientMatches.map(client => <tr key={client.id}><td><strong className="client-name">{client.legal_name}</strong></td><td>{client.trade_name}</td><td>{formatCnpj(client.cnpj)}</td><td><span className="client-contact">{client.email}<small>{client.phone}</small></span></td><td><PortalMini portal={client.portal} portals={portals}/></td><td><button className="edit-client-button" onClick={() => openClientEditor(client)} aria-label={`Editar cliente ${client.trade_name}`}><Edit2 size={14}/> Editar</button></td></tr>)}</tbody></table>{clientMatches.length === 0 && <div className="empty-state">{clients.length ? 'Nenhum cliente encontrado para essa busca.' : 'Cadastre o primeiro cliente para vincular os pedidos ao portal correto.'}</div>}</div><div className="table-footer"><span>Exibindo <strong>{clientMatches.length}</strong> de <strong>{clients.length}</strong> clientes</span><button className="see-all" onClick={() => { setClientQuery(''); setClientFormError(''); setEditingClientId(null); setClientDraft(previous => ({ legal_name: '', trade_name: '', cnpj: '', email: '', phone: '', portal: activePortalNames[0] || previous.portal })); setShowClientForm(true); }}>Cadastrar cliente <Plus size={14}/></button></div>
          </div><div className="portal-info-note"><ShieldCheck size={17}/><span>O portal padrão do cliente será sugerido automaticamente ao criar um pedido. Você poderá selecionar outro portal ativo naquele pedido.</span></div>
        </section>}
        {activeModule === 'reports' && <section className="reports-module">
          <div className="report-filters">
            <label>Portal<select value={reportPortalFilter} onChange={event => setReportPortalFilter(event.target.value)}><option>Todos os portais</option>{portals.map(portal => <option key={portal.name}>{portal.name}</option>)}</select></label>
            <label>Cadastro a partir de<input type="date" value={reportStart} onChange={event => setReportStart(event.target.value)}/></label>
            <label>Cadastro até<input type="date" value={reportEnd} onChange={event => setReportEnd(event.target.value)}/></label>
            <button className="outline-button report-export" onClick={exportReport} disabled={!reportOrders.length}><Download size={15}/> Exportar CSV</button>
          </div>
          <div className="metric-grid report-metrics">
            <Metric title="Pedidos no período" value={String(reportOrders.length).padStart(2, '0')} note="pedidos cadastrados" icon={<FileBarChart2 size={17}/>} tone="blue" trend="Total"/>
            <Metric title="Agendados" value={String(reportScheduled).padStart(2, '0')} note="status confirmado" icon={<Check size={17}/>} tone="green" trend={`${reportOrders.length ? Math.round(reportScheduled / reportOrders.length * 100) : 0}%`}/>
            <Metric title="Pendentes" value={String(reportPending).padStart(2, '0')} note="aguardam ação" icon={<Clock3 size={17}/>} tone="amber" trend="Em aberto"/>
            <Metric title="Falhas registradas" value={String(reportFailed).padStart(2, '0')} note="pedidos marcados com falha" icon={<X size={17}/>} tone="violet" trend="Revisar"/>
          </div>
          <div className="section-heading report-heading"><div><h2>Resumo por portal</h2><p>Distribuição dos pedidos conforme os filtros selecionados.</p></div></div>
          <div className="report-portal-grid">{portals.filter(portal => reportPortalFilter === 'Todos os portais' || portal.name === reportPortalFilter).map(portal => {
            const portalOrders = reportOrders.filter(order => order.portal === portal.name);
            const total = portalOrders.length;
            const scheduled = portalOrders.filter(order => order.status === 'Agendado').length;
            const pending = portalOrders.filter(order => order.status === 'Pendente').length;
            const failed = portalOrders.filter(order => order.status === 'Falhou').length;
            return <article className="report-portal-card" key={portal.name}><div className="report-portal-title"><span className={`portal-logo ${portal.tone}`}>{portal.short}</span><div><strong>{portal.name}</strong><small>{total} {total === 1 ? 'pedido' : 'pedidos'}</small></div></div><div className="report-bar" aria-label={`${scheduled} agendados, ${pending} pendentes e ${failed} falhas`}><span className="bar-scheduled" style={{ width: `${total ? scheduled / total * 100 : 0}%` }}/><span className="bar-pending" style={{ width: `${total ? pending / total * 100 : 0}%` }}/><span className="bar-failed" style={{ width: `${total ? failed / total * 100 : 0}%` }}/></div><div className="report-legend"><span><i className="legend-scheduled"/>Agendados <strong>{scheduled}</strong></span><span><i className="legend-pending"/>Pendentes <strong>{pending}</strong></span><span><i className="legend-failed"/>Falhas <strong>{failed}</strong></span></div></article>;
          })}</div>
          <div className="section-heading report-heading"><div><h2>Pedidos no período</h2><p>O relatório usa o status atual de cada pedido.</p></div></div>
          <div className="table-card"><div className="table-scroll"><table><thead><tr><th>PEDIDO</th><th>PORTAL</th><th>DATA DE CADASTRO</th><th>DATA AGENDADA</th><th>STATUS</th></tr></thead><tbody>{reportOrders.map(order => <tr key={order.id}><td><strong className="order-number">{order.order_number}</strong></td><td><PortalMini portal={order.portal} portals={portals}/></td><td>{formatReportDate(order.created_at)}</td><td>{order.scheduled_at ? formatReportDate(order.scheduled_at) : <span className="muted">Não definido</span>}</td><td><Status status={order.status}/></td></tr>)}</tbody></table>{reportOrders.length === 0 && <div className="empty-state">Nenhum pedido encontrado para os filtros selecionados.</div>}</div><div className="table-footer"><span>Exibindo <strong>{reportOrders.length}</strong> {reportOrders.length === 1 ? 'pedido' : 'pedidos'}</span><span>Fonte: pedidos cadastrados</span></div></div>
          <div className="portal-info-note report-note"><ShieldCheck size={17}/><span>Nesta fase, os indicadores refletem os status cadastrados no sistema. O botão Publicar abre o portal para conclusão manual e ainda não confirma o resultado automaticamente.</span></div>
        </section>}
        {activeModule === 'portals' && <section className="portal-settings"><div className="section-heading portal-heading"><div><h2>Conexões disponíveis</h2><p>Cadastre e gerencie os portais utilizados pela sua empresa.</p></div><div className="portal-heading-actions"><span className="active-summary"><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} de {portals.length} ativos</span><button className="primary-button" onClick={() => { setPortalFormError(''); setShowPortalForm(true); }}><Plus size={16}/> Adicionar portal</button></div></div><div className="portal-settings-grid">{portals.map(portal => <PortalSetting key={portal.name} {...portal} active={activePortals[portal.name] ?? true} credentialsConfigured={configuredCredentials[portal.name] ?? false} onToggle={() => void togglePortal(portal.name)} onConfigure={() => { setConfigPortal(portal.name); setCredentialError(''); }} onOpen={() => window.open(portal.url, '_blank', 'noopener,noreferrer')}/>)}</div><div className="portal-info-note"><ShieldCheck size={17}/><span>Portais cadastrados ficam disponíveis para adicionar pedidos e gerar relatórios nesta organização. A integração automática será configurada em uma etapa futura.</span></div></section>}
        <footer className="footer"><span>© 2026 Nexo. Integrações simples, operações mais leves.</span><span><span className="footer-dot"/> Todos os sistemas operacionais <span className="footer-sep">·</span> v0.1.0</span></footer>
      </div>
    </section>
    {configPortal && <CredentialModal portal={configPortal} alreadyConfigured={configuredCredentials[configPortal]} saving={savingCredentials} error={credentialError} onClose={() => setConfigPortal(null)} onSave={savePortalCredentials}/>}
    {showXmlImport && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowXmlImport(false); }}><div className="modal xml-import-modal"><div className="modal-head"><div><span className="modal-icon"><FileUp size={18}/></span><h2>Novo pedido por XML</h2><p>Envie o XML para localizar o cliente pelo CNPJ cadastrado.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setShowXmlImport(false)}><X size={18}/></button></div><input ref={xmlInputRef} type="file" accept=".xml,application/xml,text/xml" className="xml-file-input" onChange={handleXmlUpload}/><button type="button" className="xml-dropzone" onClick={() => xmlInputRef.current?.click()}><FileUp size={22}/><strong>{xmlFileName || 'Selecionar arquivo XML'}</strong><span>Arquivo XML de até 5 MB</span></button>{xmlImportError && <div className="login-error xml-error">{xmlImportError}</div>}{xmlClientId && <div className="xml-match-card"><span className="xml-match-icon"><Check size={16}/></span><div><strong>Cliente identificado</strong><span>{clients.find(client => client.id === xmlClientId)?.trade_name} · CNPJ {formatCnpj(clients.find(client => client.id === xmlClientId)?.cnpj || '')}</span><small>Portal padrão: {clients.find(client => client.id === xmlClientId)?.portal}</small></div></div>}{xmlClientId && <><label>Número do pedido<input required placeholder="Extraído do XML ou informe manualmente" value={form.number} onChange={event => { setForm(previous => ({ ...previous, number: event.target.value })); setXmlOrderNumber(event.target.value); }}/></label><label>Data e hora agendada <span className="optional">Opcional</span><input type="datetime-local" value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))}/></label><label>Portal vinculado<select value={form.portal} onChange={event => setForm(previous => ({ ...previous, portal: event.target.value }))}>{portals.map(portal => <option key={portal.name} value={portal.name} disabled={!activePortals[portal.name]}>{portal.name}{portal.name === clients.find(client => client.id === xmlClientId)?.portal ? ' · padrão do cliente' : ''}{activePortals[portal.name] ? '' : ' · desativado'}</option>)}</select></label><div className="form-note"><Activity size={15}/> O arquivo será lido no navegador e não será armazenado. O novo pedido será salvo como pendente.</div></>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowXmlImport(false)}>Cancelar</button><button type="button" className="primary-button" disabled={!xmlClientId || !form.number.trim() || !activePortals[form.portal]} onClick={() => void saveOrder()}>Gravar novo pedido <ArrowRight size={16}/></button></div></div></div>}
    {showClientForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingClient) { setShowClientForm(false); setEditingClientId(null); } }}><div className="modal client-modal"><div className="modal-head"><div><span className="modal-icon"><Users size={18}/></span><h2>{editingClientId ? 'Editar cliente' : 'Cadastrar cliente'}</h2><p>Os pedidos deste cliente usarão o portal padrão selecionado.</p></div><button className="icon-button" aria-label="Fechar" disabled={savingClient} onClick={() => { setShowClientForm(false); setEditingClientId(null); }}><X size={18}/></button></div><form onSubmit={addClient}><label>Razão social<input required maxLength={160} placeholder="Ex.: Transportadora Exemplo Ltda." value={clientDraft.legal_name} onChange={event => setClientDraft(previous => ({ ...previous, legal_name: event.target.value }))}/></label><label>Nome fantasia<input required maxLength={120} placeholder="Ex.: Exemplo Cargas" value={clientDraft.trade_name} onChange={event => setClientDraft(previous => ({ ...previous, trade_name: event.target.value }))}/></label><label>CNPJ<input required maxLength={18} placeholder="00.000.000/0000-00" value={clientDraft.cnpj} onChange={event => setClientDraft(previous => ({ ...previous, cnpj: event.target.value }))}/></label><div className="client-form-grid"><label>E-mail<input required type="email" maxLength={254} placeholder="contato@empresa.com.br" value={clientDraft.email} onChange={event => setClientDraft(previous => ({ ...previous, email: event.target.value }))}/></label><label>Telefone para contato<input required type="tel" maxLength={30} placeholder="(11) 90000-0000" value={clientDraft.phone} onChange={event => setClientDraft(previous => ({ ...previous, phone: event.target.value }))}/></label></div><label>Portal padrão<select required value={clientDraft.portal} onChange={event => setClientDraft(previous => ({ ...previous, portal: event.target.value }))} disabled={!activePortalNames.length}>{activePortalNames.map(portal => <option key={portal} value={portal}>{portal}</option>)}</select></label>{!activePortalNames.length && <div className="login-error">Ative um portal antes de cadastrar clientes.</div>}{clientFormError && <div className="login-error">{clientFormError}</div>}<div className="form-note"><ShieldCheck size={15}/> O cliente ficará disponível para todos os pedidos desta organização.</div><div className="modal-actions"><button type="button" className="outline-button" disabled={savingClient} onClick={() => { setShowClientForm(false); setEditingClientId(null); }}>Cancelar</button><button className="primary-button" type="submit" disabled={savingClient || !activePortalNames.length}>{savingClient ? 'Salvando...' : editingClientId ? 'Salvar alterações' : 'Cadastrar cliente'} <ArrowRight size={15}/></button></div></form></div></div>}
    {showPortalForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowPortalForm(false); }}><div className="modal"><div className="modal-head"><div><span className="modal-icon"><Plus size={18}/></span><h2>Adicionar portal</h2><p>Cadastre o portal que sua empresa quer acompanhar.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setShowPortalForm(false)}><X size={18}/></button></div><form onSubmit={addPortal}><label>Nome do portal<input required maxLength={60} placeholder="Ex.: Portal da transportadora" value={portalDraft.name} onChange={event => setPortalDraft(previous => ({ ...previous, name: event.target.value }))}/></label><label>Endereço do portal<input required type="url" placeholder="https://portal.empresa.com.br" value={portalDraft.url} onChange={event => setPortalDraft(previous => ({ ...previous, url: event.target.value }))}/></label><label>Descrição <span className="optional">Opcional</span><input maxLength={120} placeholder="Ex.: Agendamento de cargas" value={portalDraft.description} onChange={event => setPortalDraft(previous => ({ ...previous, description: event.target.value }))}/></label>{portalFormError && <div className="login-error">{portalFormError}</div>}<div className="form-note"><ShieldCheck size={15}/> O novo portal será criado como ativo para esta organização.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowPortalForm(false)}>Cancelar</button><button className="primary-button" type="submit">Cadastrar portal <ArrowRight size={15}/></button></div></form></div></div>}
    {showForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setShowForm(false); setEditingOrderId(null); } }}><div className="modal"><div className="modal-head"><div><span className="modal-icon">{editingOrderId ? <Edit2 size={18}/> : <Plus size={18}/>}</span><h2>{editingOrderId ? 'Editar pedido' : 'Adicionar pedido'}</h2><p>{editingOrderId ? 'Atualize os dados deste pedido.' : 'Informe os dados para preparar a integração.'}</p></div><button className="icon-button" aria-label="Fechar" onClick={() => { setShowForm(false); setEditingOrderId(null); }}><X size={18}/></button></div><form onSubmit={addOrder}><label>Número do pedido<input required placeholder="Ex.: PED-2024-0843" value={form.number} onChange={event => setForm(previous => ({ ...previous, number: event.target.value }))}/></label><label>Cliente<select required value={form.clientId} onChange={event => { const client = clients.find(item => item.id === event.target.value); setForm(previous => ({ ...previous, clientId: event.target.value, portal: client?.portal || previous.portal })); }}><option value="" disabled>{clients.length ? 'Selecione o cliente' : 'Cadastre um cliente primeiro'}</option>{clients.map(client => <option key={client.id} value={client.id}>{client.trade_name} · {formatCnpj(client.cnpj)}</option>)}</select>{clients.length === 0 && <button type="button" className="inline-link" onClick={() => { setShowForm(false); setActiveModule('clients'); setShowClientForm(true); }}>Cadastrar cliente</button>}</label><label>Portal de integração<select required value={form.portal} onChange={event => setForm(previous => ({ ...previous, portal: event.target.value }))}>{portals.filter(portal => activePortals[portal.name]).map(portal => <option key={portal.name} value={portal.name}>{portal.name}{clients.find(client => client.id === form.clientId)?.portal === portal.name ? ' · padrão do cliente' : ''}</option>)}</select><span className="field-hint">Preenchido pelo portal padrão do cliente; você pode alterar.</span></label><label>Data e hora agendada <span className="optional">Opcional</span><input type="datetime-local" value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))}/></label><label>Status<select value={formStatus} onChange={event => setFormStatus(event.target.value as Order['status'])}><option value="Pendente">Pendente</option><option value="Agendado">Agendado</option><option value="Falhou">Falhou</option></select></label><div className="form-note"><Activity size={15}/>{editingOrderId ? 'As alterações serão refletidas nos indicadores e relatórios.' : 'Seu pedido será salvo como pendente até a publicação no portal.'}</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => { setShowForm(false); setEditingOrderId(null); }}>Cancelar</button><button className="primary-button" type="submit" disabled={!clients.length}>{editingOrderId ? 'Salvar alterações' : 'Adicionar pedido'} <ArrowRight size={16}/></button></div></form></div></div>}
    {loginOpen && <LoginModal demo={demoMode} authUnavailable={!supabase && !demoMode} mode={loginMode} setMode={setLoginMode} onSubmit={signIn} toast={toast}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </main>;
}

function Metric({title,value,note,icon,tone,trend}:{title:string;value:string;note:string;icon:React.ReactNode;tone:string;trend:string}) { return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span>{note}</span><span className={`metric-trend ${tone}`}>{tone==='green'?<ArrowUpRight size={13}/>:null}{trend}</span></div></div>; }
function PortalCard({name,description,short,tone,href,onClick}:{name:string;description:string;short:string;tone:string;href:string;onClick:()=>void}) { return <button className="portal-card" onClick={onClick}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-info"><strong>{name}</strong><span>{description}</span></div><div className="connected"><span className="footer-dot"/> Ativo</div><ArrowUpRight className="portal-arrow" size={17}/><span className="sr-only">Abrir {href}</span></button>; }
function PortalSetting({name,description,short,tone,active,credentialsConfigured,onToggle,onConfigure,onOpen}:{name:Portal;description:string;short:string;tone:string;active:boolean;credentialsConfigured:boolean;onToggle:()=>void;onConfigure:()=>void;onOpen:()=>void}) { return <article className={`portal-setting-card ${active ? '' : 'inactive'}`}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-setting-copy"><strong>{name}</strong><span>{description}</span><span className={`portal-state ${active ? 'on' : 'off'}`}><i/> {active ? 'Integração ativa' : 'Integração desativada'}</span><span className={`credential-state ${credentialsConfigured ? 'saved' : ''}`}>{credentialsConfigured ? 'Acesso configurado' : 'Acesso não configurado'}</span></div><button className="configure-portal" aria-label={`Configurar acesso ${name}`} onClick={onConfigure}><Settings2 size={14}/> Configurar</button><button className={`switch ${active ? 'on' : ''}`} role="switch" aria-checked={active} aria-label={`${active ? 'Desativar' : 'Ativar'} ${name}`} onClick={onToggle}><span/></button><button className="portal-open" onClick={onOpen}>Abrir portal <ArrowUpRight size={14}/></button></article>; }
function CredentialModal({portal,alreadyConfigured,saving,error,onClose,onSave}:{portal:Portal;alreadyConfigured:boolean;saving:boolean;error:string;onClose:()=>void;onSave:(portal:Portal,username:string,password:string)=>void}) { const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}><div className="modal"><div className="modal-head"><div><span className="modal-icon"><ShieldCheck size={18}/></span><h2>Configurar {portal}</h2><p>Informe as credenciais usadas para acessar este portal.</p></div><button className="icon-button" onClick={onClose} disabled={saving}><X size={18}/></button></div>{alreadyConfigured&&<div className="credential-note">Já existe um acesso salvo. Preencha os dois campos para substituir as credenciais.</div>}<form onSubmit={e=>{e.preventDefault();onSave(portal,username,password);}}><label>Usuário<input autoComplete="username" required maxLength={500} placeholder="Usuário de acesso ao portal" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Senha<input autoComplete="new-password" type="password" required minLength={1} maxLength={500} placeholder="Senha de acesso ao portal" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="credential-note secure"><ShieldCheck size={15}/> As credenciais serão criptografadas antes de serem armazenadas.</div>{error&&<div className="login-error">{error}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando...':'Salvar acesso'} <Check size={15}/></button></div></form></div></div>; }
function PortalMini({portal,portals}:{portal:Portal;portals:PortalDefinition[]}) { const definition=portals.find(item=>item.name===portal); const tone=definition?.tone||'navy'; const initials=definition?.short||portalInitials(portal); return <span className="portal-mini"><span className={`mini-logo ${tone}`}>{initials}</span>{portal}</span>; }
function portalInitials(name:string) { const parts=name.trim().split(/\s+/); return (parts.length>1?`${parts[0][0]}${parts[1][0]}`:parts[0]?.slice(0,2)||'P').toLocaleUpperCase('pt-BR'); }
function formatReportDate(value:string) { return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
function formatCnpj(value:string) { const normalized=normalizeCnpj(value); return normalized.length===14?`${normalized.slice(0,2)}.${normalized.slice(2,5)}.${normalized.slice(5,8)}/${normalized.slice(8,12)}-${normalized.slice(12)}`:value; }
function toLocalDateTime(value:string) { const date=new Date(value); const pad=(part:number)=>String(part).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function localDateKey(date:Date) { const pad=(part:number)=>String(part).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function Status({status}:{status:Order['status']}) { const cls=status==='Agendado'?'success':status==='Pendente'?'pending':'failed'; const Icon=status==='Agendado'?Check:status==='Pendente'?Clock3:X; return <span className={`status ${cls}`}><Icon size={13}/>{status}</span>; }
function LoginModal({demo,authUnavailable,mode,setMode,onSubmit,toast}:{demo:boolean;authUnavailable:boolean;mode:boolean;setMode:(v:boolean)=>void;onSubmit:(email:string,password:string)=>void;toast:string}) { const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); return <div className="login-backdrop"><div className="login-card"><div className="brand login-brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6}/></div><span>nexo<span className="brand-dot">.</span></span></div><h1>{mode?'Crie sua conta':'Acesse sua conta'}</h1><p>{mode?'Comece a organizar suas integrações.':'Entre para acompanhar suas operações.'}</p>{demo&&<div className="demo-banner">Modo demonstração · configure o Supabase para habilitar contas seguras</div>}{authUnavailable&&<div className="demo-banner">A autenticação ainda não foi configurada para este ambiente. Configure o Supabase antes de liberar o acesso.</div>}<form onSubmit={e=>{e.preventDefault();onSubmit(email,password);}}><label>E-mail<input type="email" required placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required minLength={6} placeholder="Mínimo de 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/></label>{toast && <div className="login-error">{toast}</div>}<button className="primary-button login-submit" type="submit" disabled={authUnavailable}>{mode?'Criar conta':'Entrar'}<ArrowRight size={16}/></button></form><div className="login-switch">{mode?'Já tem uma conta?':'Ainda não tem uma conta?'} <button onClick={()=>setMode(!mode)}>{mode?'Entrar':'Criar conta'}</button></div><div className="login-security"><ShieldCheck size={14}/> Seus dados são protegidos com segurança.</div></div></div>; }
