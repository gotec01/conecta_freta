'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from './lib/supabase';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Download, Edit2, ExternalLink, FileBarChart2, FileUp, LayoutDashboard, LogOut, Mail, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Truck, Users, X } from 'lucide-react';

type Portal = string;
type Module = 'overview' | 'integrations' | 'clients' | 'portals' | 'reports';
type PortalDefinition = { name: Portal; description: string; url: string; short: string; tone: string };
const INITIAL_PORTALS: PortalDefinition[] = [
  { name: 'TempoCerto', description: 'Agendamento de cargas', url: 'https://tempocerto.com/', short: 'TC', tone: 'teal' },
  { name: 'Trizy', description: 'Gestão logística', url: 'https://www.trizy.com.br/', short: 'T', tone: 'orange' },
  { name: 'Nexello', description: 'Portal de agendamentos', url: 'https://portal.nexello.com.br/', short: 'N', tone: 'navy' },
];
type Client = { id: string; legal_name: string; trade_name: string; cnpj: string; email: string; phone: string; portal: Portal; notification_recipients?: string[]; notification_cc?: string[]; notification_subject?: string; notification_body?: string };
type Order = { id: string; order_number: string; client_id: string | null; portal: Portal; requested_at: string | null; confirmed_at: string | null; status: 'Agendado' | 'Pendente' | 'Falhou'; created_at: string; xml_order_number?: string | null; xml_invoice_number?: string | null; xml_item_count?: number | null; xml_item_quantity?: number | null; xml_purchase_order?: string | null };
type OrderXmlDetails = { orderNumber: string; invoiceNumber: string; itemCount: number; itemQuantity: number; purchaseOrder: string };
type ImportFilters = { order: string; cnpj: string; client: string; group: string; seller: string; scheduled: string };
type ImportOrderRow = { id: string; values: Record<string, string>; order_number: string; client_id: string; portal: Portal; group: string; seller: string; scheduled: string; scheduled_at: string | null; selected: boolean; issue: string };

function normalizeCnpj(value: string) { return value.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
function normalizeSpreadsheetText(value:string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
function findSpreadsheetHeader(columns:string[],aliases:string[]) { const normalized=columns.map(column=>normalizeSpreadsheetText(column)); for(const alias of aliases){const index=normalized.findIndex(column=>column===normalizeSpreadsheetText(alias));if(index>=0)return columns[index];} return ''; }
function parseSpreadsheetDate(value:string):Date|null { const input=value.trim(); if(!input)return null; const br=input.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if(br){let year=Number(br[3]);if(year<100)year+=year<50?2000:1900;const date=new Date(year,Number(br[2])-1,Number(br[1]),Number(br[4]||0),Number(br[5]||0),Number(br[6]||0));return date.getFullYear()===year&&date.getMonth()===Number(br[2])-1&&date.getDate()===Number(br[1])?date:null;} const iso=input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);if(iso){const date=new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]),Number(iso[4]||0),Number(iso[5]||0),Number(iso[6]||0));return date.getFullYear()===Number(iso[1])&&date.getMonth()===Number(iso[2])-1&&date.getDate()===Number(iso[3])?date:null;}const parsed=new Date(input);return Number.isNaN(parsed.getTime())?null:parsed; }
function extractXmlOrderDetails(documentXml:Document):OrderXmlDetails {
  const nodes=Array.from(documentXml.getElementsByTagName('*'));
  const matchingText=(names:string[])=>nodes.find(node=>names.includes(node.localName.toLowerCase())&&node.textContent?.trim())?.textContent?.trim()||'';
  const orderNumber=matchingText(['nped','numeropedido','numpedido','pedido','numero','nct','ndf'])||matchingText(['xped']);
  const invoiceNumber=matchingText(['nnf']);
  const details=nodes.filter(node=>node.localName.toLowerCase()==='det');
  const quantities=details.map(detail=>Array.from(detail.getElementsByTagName('*')).find(node=>node.localName.toLowerCase()==='qcom')?.textContent?.trim()||'').filter(Boolean).map(value=>Number(value.replace(/\s/g,'').replace(',','.'))).filter(value=>Number.isFinite(value)&&value>=0);
  const observations=nodes.filter(node=>['infcpl','infadprod'].includes(normalizeSpreadsheetText(node.localName))&&node.textContent?.trim()).map(node=>node.textContent!.trim()).join('\n');
  const purchaseMatch=observations.match(/(?:ordem\s+de\s+compra|pedido\s+de\s+compra|ordem\s+compra|ordem\s+de\s+comp\.?|\boc\b|o\.?c\.?|purchase\s+order|\bpo\b)\s*(?:n[º°o.]?\s*)?[:#=\-]?\s*([a-z0-9][a-z0-9._/\-]*)/i);
  const purchaseOrder=purchaseMatch?.[1]||matchingText(['xped']);
  return { orderNumber, invoiceNumber, itemCount:details.length||quantities.length, itemQuantity:quantities.reduce((sum,value)=>sum+value,0), purchaseOrder };
}

const initialOrders: Order[] = [
  { id: '1', order_number: 'PED-2024-0842', client_id: 'demo-client-1', portal: 'TempoCerto', requested_at: '2026-10-16T09:30:00', confirmed_at: '2026-10-16T09:30:00', status: 'Agendado', created_at: '2026-10-15T09:24:00' },
  { id: '2', order_number: 'PED-2024-0841', client_id: 'demo-client-2', portal: 'Trizy', requested_at: null, confirmed_at: null, status: 'Pendente', created_at: '2026-10-15T08:52:00' },
  { id: '3', order_number: 'PED-2024-0840', client_id: 'demo-client-3', portal: 'Nexello', requested_at: '2026-10-15T14:00:00', confirmed_at: '2026-10-15T14:00:00', status: 'Agendado', created_at: '2026-10-15T08:20:00' },
  { id: '4', order_number: 'PED-2024-0839', client_id: 'demo-client-1', portal: 'TempoCerto', requested_at: null, confirmed_at: null, status: 'Falhou', created_at: '2026-10-14T16:38:00' },
  { id: '5', order_number: 'PED-2024-0838', client_id: 'demo-client-2', portal: 'Trizy', requested_at: '2026-10-15T16:30:00', confirmed_at: '2026-10-15T16:30:00', status: 'Agendado', created_at: '2026-10-14T15:14:00' },
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
  const [editingPortalName, setEditingPortalName] = useState<Portal | null>(null);
  const [savingPortal, setSavingPortal] = useState(false);
  const [portalDraft, setPortalDraft] = useState({ name: '', url: '', description: '' });
  const [showClientForm, setShowClientForm] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientFormError, setClientFormError] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [emailTemplateClient, setEmailTemplateClient] = useState<Client | null>(null);
  const [savingEmailTemplate, setSavingEmailTemplate] = useState(false);
  const [emailTemplateError, setEmailTemplateError] = useState('');
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
  const [xmlNewOrderDetails, setXmlNewOrderDetails] = useState<OrderXmlDetails>({ orderNumber: '', invoiceNumber: '', itemCount: 0, itemQuantity: 0, purchaseOrder: '' });
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [orderXmlTarget, setOrderXmlTarget] = useState<Order | null>(null);
  const [orderXmlFileName, setOrderXmlFileName] = useState('');
  const [orderXmlDraft, setOrderXmlDraft] = useState<OrderXmlDetails>({ orderNumber: '', invoiceNumber: '', itemCount: 0, itemQuantity: 0, purchaseOrder: '' });
  const [orderXmlError, setOrderXmlError] = useState('');
  const [savingOrderXml, setSavingOrderXml] = useState(false);
  const orderXmlInputRef = useRef<HTMLInputElement>(null);
  const [showSpreadsheetImport, setShowSpreadsheetImport] = useState(false);
  const [spreadsheetBusy, setSpreadsheetBusy] = useState(false);
  const [spreadsheetError, setSpreadsheetError] = useState('');
  const [spreadsheetFileName, setSpreadsheetFileName] = useState('');
  const [spreadsheetSheetName, setSpreadsheetSheetName] = useState('');
  const [spreadsheetColumns, setSpreadsheetColumns] = useState<string[]>([]);
  const [spreadsheetRawRows, setSpreadsheetRawRows] = useState<Record<string, string>[]>([]);
  const [spreadsheetFilters, setSpreadsheetFilters] = useState({ group: 'Todos', seller: 'Todos', scheduled: '' });
  const [spreadsheetMappings, setSpreadsheetMappings] = useState<ImportFilters>({ order: '', cnpj: '', client: '', group: '', seller: '', scheduled: '' });
  const [spreadsheetSelectedIds, setSpreadsheetSelectedIds] = useState<string[]>([]);
  const [spreadsheetClientOverrides, setSpreadsheetClientOverrides] = useState<Record<string, string>>({});
  const [savingSpreadsheetOrders, setSavingSpreadsheetOrders] = useState(false);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [portalFilter, setPortalFilter] = useState('Todos os portais');
  const [statusFilter, setStatusFilter] = useState('Todos os status');
  const [requestedDateStart, setRequestedDateStart] = useState('');
  const [requestedDateEnd, setRequestedDateEnd] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkPortal, setBulkPortal] = useState('');
  const [reportPortalFilter, setReportPortalFilter] = useState('Todos os portais');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [clientDraft, setClientDraft] = useState({ legal_name: '', trade_name: '', cnpj: '', email: '', phone: '', portal: 'TempoCerto' as Portal });
  const [form, setForm] = useState({ number: '', clientId: '', portal: 'TempoCerto' as Portal, requestedDate: '', confirmedDate: '' });
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
    const clientColumns = 'id, legal_name, trade_name, cnpj, email, phone, portal, notification_recipients, notification_cc, notification_subject, notification_body';
    const { data: clientRows, error: clientsError } = await supabase.from('clients').select(clientColumns).eq('organization_id', memberships[0].organization_id).order('trade_name');
    if (!clientsError && clientRows) setClients(clientRows as Client[]);
    else if (clientsError?.message.includes('notification_')) {
      const fallback = await supabase.from('clients').select('id, legal_name, trade_name, cnpj, email, phone, portal').eq('organization_id', memberships[0].organization_id).order('trade_name');
      if (!fallback.error && fallback.data) setClients(fallback.data as Client[]);
    }
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
    setForm({ number: '', clientId: '', portal: activePortalNames[0] || 'TempoCerto', requestedDate: '', confirmedDate: '' });
    setFormStatus('Pendente');
    setXmlFileName(''); setXmlImportError(''); setXmlClientId(''); setXmlOrderNumber(''); setXmlNewOrderDetails({ orderNumber: '', invoiceNumber: '', itemCount: 0, itemQuantity: 0, purchaseOrder: '' });
    setShowXmlImport(true);
  }

  async function handleXmlUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setXmlImportError(''); setXmlClientId(''); setXmlOrderNumber(''); setXmlNewOrderDetails({ orderNumber: '', invoiceNumber: '', itemCount: 0, itemQuantity: 0, purchaseOrder: '' }); setXmlFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xml')) { setXmlImportError('Selecione um arquivo com extensão .xml.'); return; }
    if (file.size > 5 * 1024 * 1024) { setXmlImportError('O XML deve ter no máximo 5 MB.'); return; }
    try {
      const source = await file.text();
      const documentXml = new DOMParser().parseFromString(source, 'application/xml');
      if (documentXml.querySelector('parsererror')) { setXmlImportError('Não foi possível ler o XML. Verifique se o arquivo está válido.'); return; }
      const details = extractXmlOrderDetails(documentXml);
      setXmlNewOrderDetails(details);
      const nodes = Array.from(documentXml.getElementsByTagName('*'));
      const cnpjs = nodes.filter(node => node.localName.toLowerCase() === 'cnpj').map(node => normalizeCnpj(node.textContent || '')).filter(value => value.length === 14);
      const foundClients = clients.filter(client => cnpjs.includes(normalizeCnpj(client.cnpj)));
      const uniqueClients = Array.from(new Map(foundClients.map(client => [client.id, client])).values());
      const extractedNumber = details.orderNumber;
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

  function openOrderXml(order: Order) {
    setOrderXmlTarget(order); setOrderXmlFileName(''); setOrderXmlError('');
    setOrderXmlDraft({ orderNumber: order.xml_order_number || '', invoiceNumber: order.xml_invoice_number || '', itemCount: order.xml_item_count || 0, itemQuantity: order.xml_item_quantity || 0, purchaseOrder: order.xml_purchase_order || '' });
  }

  async function handleOrderXmlUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setOrderXmlFileName(file.name); setOrderXmlError('');
    if (!file.name.toLowerCase().endsWith('.xml')) { setOrderXmlError('Selecione um arquivo com extensão .xml.'); return; }
    if (file.size > 5 * 1024 * 1024) { setOrderXmlError('O XML deve ter no máximo 5 MB.'); return; }
    try {
      const documentXml = new DOMParser().parseFromString(await file.text(), 'application/xml');
      if (documentXml.querySelector('parsererror')) throw new Error('O arquivo XML está inválido ou incompleto.');
      setOrderXmlDraft(extractXmlOrderDetails(documentXml));
    } catch (error) { setOrderXmlError(error instanceof Error ? error.message : 'Não foi possível ler os dados do XML.'); }
  }

  async function saveOrderXml() {
    if (!orderXmlTarget) return;
    if (!orderXmlDraft.orderNumber.trim()) { setOrderXmlError('Não encontrei o número do pedido no XML. Informe o número para continuar.'); return; }
    setSavingOrderXml(true); setOrderXmlError('');
    const xmlFields = { xml_order_number: orderXmlDraft.orderNumber.trim(), xml_invoice_number: orderXmlDraft.invoiceNumber.trim() || null, xml_item_count: Math.max(0, Math.trunc(orderXmlDraft.itemCount)), xml_item_quantity: Math.max(0, orderXmlDraft.itemQuantity), xml_purchase_order: orderXmlDraft.purchaseOrder.trim() || null };
    try {
      if (supabase && authenticated) {
        if (!organizationId) { setOrderXmlError('Sua organização ainda está carregando. Tente novamente.'); return; }
        const { error } = await supabase.from('orders').update(xmlFields).eq('id', orderXmlTarget.id).eq('organization_id', organizationId);
        if (error) { setOrderXmlError(error.message.includes('xml_') || error.message.includes('schema cache') ? 'Aplique a migração de dados do XML no Supabase antes de salvar.' : 'Não foi possível salvar os dados deste XML. Confira a conexão e tente novamente.'); return; }
      }
      setOrders(previous => previous.map(order => order.id === orderXmlTarget.id ? { ...order, ...xmlFields } : order));
      setOrderXmlTarget(null); setOrderXmlFileName(''); setToast(`Dados do XML salvos no pedido ${orderXmlTarget.order_number}.`);
    } catch { setOrderXmlError('Não foi possível salvar os dados deste XML. Confira a conexão e tente novamente.'); }
    finally { setSavingOrderXml(false); }
  }

  function openSpreadsheetImport() {
    setSpreadsheetError(''); setSpreadsheetFileName(''); setSpreadsheetSheetName(''); setSpreadsheetColumns([]); setSpreadsheetRawRows([]); setSpreadsheetSelectedIds([]); setSpreadsheetClientOverrides({});
    setSpreadsheetFilters({ group: 'Todos', seller: 'Todos', scheduled: '' });
    setSpreadsheetMappings({ order: '', cnpj: '', client: '', group: '', seller: '', scheduled: '' });
    setShowSpreadsheetImport(true);
  }

  async function handleSpreadsheetUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSpreadsheetBusy(true); setSpreadsheetError(''); setSpreadsheetFileName(file.name); setSpreadsheetSelectedIds([]); setSpreadsheetClientOverrides({});
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error('Selecione uma planilha .xls ou .xlsx.');
      if (file.size > 10 * 1024 * 1024) throw new Error('A planilha deve ter no máximo 10 MB.');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Não encontrei abas nessa planilha.');
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy hh:mm' });
      if (matrix.length < 2) throw new Error('A planilha precisa ter uma linha de cabeçalhos e pelo menos um pedido.');
      const headerRow = matrix[0].map((value, index) => String(value || '').trim() || `Coluna ${index + 1}`);
      const uniqueHeaders = headerRow.map((header, index) => headerRow.slice(0, index).includes(header) ? `${header} (${index + 1})` : header);
      const rawRows = matrix.slice(1).map(row => Object.fromEntries(uniqueHeaders.map((header, index) => [header, String(row[index] ?? '').trim()])))
        .filter(row => Object.values(row).some(value => value !== ''));
      if (rawRows.length > 2500) throw new Error('A planilha tem mais de 2.500 linhas. Divida o arquivo em partes menores para revisar com segurança.');
      if (!rawRows.length) throw new Error('Não encontrei linhas de pedidos nessa planilha.');
      setSpreadsheetSheetName(sheetName); setSpreadsheetColumns(uniqueHeaders); setSpreadsheetRawRows(rawRows);
      const mappings: ImportFilters = {
        order: findSpreadsheetHeader(uniqueHeaders, ['numero do pedido', 'numero pedido', 'n pedido', 'nro pedido', 'pedido', 'ordem', 'order', 'order number']),
        cnpj: findSpreadsheetHeader(uniqueHeaders, ['cnpj', 'cnpj cliente', 'documento cliente', 'cnpj tomador', 'cnpj destinatario']),
        client: findSpreadsheetHeader(uniqueHeaders, ['cliente', 'nome cliente', 'razao social', 'nome fantasia', 'empresa', 'customer']),
        group: findSpreadsheetHeader(uniqueHeaders, ['grupo do cliente', 'grupo cliente', 'grupo de cliente', 'grupo']),
        seller: findSpreadsheetHeader(uniqueHeaders, ['vendedor', 'nome vendedor', 'representante', 'salesperson']),
        scheduled: findSpreadsheetHeader(uniqueHeaders, ['agendado para', 'data agendada', 'data agendamento', 'data do agendamento', 'previsao agendamento', 'appointment date', 'agendado']),
      };
      setSpreadsheetMappings(mappings);
      if (!mappings.order) setSpreadsheetError('Planilha carregada, mas não identifiquei automaticamente a coluna do número do pedido. Escolha essa coluna no mapeamento abaixo.');
    } catch (error) {
      setSpreadsheetRawRows([]); setSpreadsheetColumns([]);
      setSpreadsheetError(error instanceof Error ? error.message : 'Não foi possível ler essa planilha.');
    } finally { setSpreadsheetBusy(false); }
  }

  async function saveOrder() {
    if (!form.number.trim()) return;
    if (!clients.length) { setToast('Cadastre um cliente antes de adicionar um pedido.'); return; }
    if (!form.clientId || !clients.some(client => client.id === form.clientId)) { setToast('Selecione o cliente relacionado ao pedido.'); return; }
    if (!activePortals[form.portal]) { setToast(`Ative o portal ${form.portal} antes de adicionar o pedido.`); return; }
    const originalOrder = orders.find(order => order.id === editingOrderId);
    const xmlFields = showXmlImport ? { xml_order_number: xmlNewOrderDetails.orderNumber.trim() || form.number.trim(), xml_invoice_number: xmlNewOrderDetails.invoiceNumber.trim() || null, xml_item_count: xmlNewOrderDetails.itemCount, xml_item_quantity: xmlNewOrderDetails.itemQuantity, xml_purchase_order: xmlNewOrderDetails.purchaseOrder.trim() || null } : {};
    const newOrder: Order = { ...(originalOrder || {}), ...xmlFields, id: editingOrderId || crypto.randomUUID(), order_number: form.number.trim(), client_id: form.clientId, portal: form.portal, requested_at: form.requestedDate ? new Date(form.requestedDate).toISOString() : null, confirmed_at: form.confirmedDate ? new Date(form.confirmedDate).toISOString() : null, status: formStatus, created_at: originalOrder?.created_at || new Date().toISOString() };
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada. Tente novamente em instantes.'); return; }
      const orderPayload = { order_number: newOrder.order_number, client_id: newOrder.client_id, portal: newOrder.portal, requested_at: newOrder.requested_at, confirmed_at: newOrder.confirmed_at, status: newOrder.status, ...xmlFields };
      const query = editingOrderId
        ? supabase.from('orders').update(orderPayload).eq('id', editingOrderId).eq('organization_id', organizationId)
        : supabase.from('orders').insert({ organization_id: organizationId, ...orderPayload });
      const { data, error } = await query.select().single();
      if (error) { setToast(error.message.includes('xml_') || error.message.includes('schema cache') ? 'Aplique a migração de dados do XML no Supabase antes de gerar pedidos por XML.' : error.message); return; } if (data) newOrder.id = data.id;
    }
    setOrders(previous => editingOrderId ? previous.map(order => order.id === editingOrderId ? newOrder : order) : [newOrder, ...previous]);
    const wasEditing = !!editingOrderId;
    setShowForm(false); setShowXmlImport(false); setEditingOrderId(null); setXmlFileName(''); setXmlClientId(''); setXmlOrderNumber(''); setXmlNewOrderDetails({ orderNumber: '', invoiceNumber: '', itemCount: 0, itemQuantity: 0, purchaseOrder: '' }); setForm({ number: '', clientId: '', portal: clients[0]?.portal || 'TempoCerto', requestedDate: '', confirmedDate: '' }); setFormStatus('Pendente'); setToast(wasEditing ? 'Pedido atualizado.' : 'Pedido adicionado à fila de integração.');
  }

  async function addOrder(event: React.FormEvent) { event.preventDefault(); await saveOrder(); }

  function selectVisibleSpreadsheetOrders(checked: boolean) {
    const visibleValidIds = visibleSpreadsheetOrders.filter(row => !row.issue).map(row => row.id);
    setSpreadsheetSelectedIds(previous => checked
      ? Array.from(new Set([...previous, ...visibleValidIds]))
      : previous.filter(id => !visibleValidIds.includes(id)));
  }

  async function saveSelectedSpreadsheetOrders() {
    if (!selectedSpreadsheetOrders.length) { setSpreadsheetError('Selecione ao menos um pedido válido para gravar.'); return; }
    setSavingSpreadsheetOrders(true); setSpreadsheetError('');
    const createdAt = new Date().toISOString();
    const newOrders: Order[] = selectedSpreadsheetOrders.map(row => ({ id: crypto.randomUUID(), order_number: row.order_number, client_id: row.client_id, portal: row.portal, requested_at: row.scheduled_at, confirmed_at: null, status: 'Pendente', created_at: createdAt }));
    try {
      if (supabase && authenticated) {
        if (!organizationId) { setSpreadsheetError('Sua organização ainda está carregando. Tente novamente.'); return; }
        const payload = selectedSpreadsheetOrders.map(row => ({ organization_id: organizationId, order_number: row.order_number, client_id: row.client_id, portal: row.portal, requested_at: row.scheduled_at, confirmed_at: null, status: 'Pendente' as const }));
        const { data, error } = await supabase.from('orders').insert(payload).select();
        if (error) { setSpreadsheetError(`Não foi possível gravar os pedidos: ${error.message}`); return; }
        if (data) newOrders.forEach((order, index) => { if (data[index]?.id) order.id = data[index].id; });
      }
      setOrders(previous => [...newOrders.reverse(), ...previous]);
      setSpreadsheetSelectedIds([]); setShowSpreadsheetImport(false); setSpreadsheetRawRows([]); setSpreadsheetFileName('');
      setToast(`${newOrders.length} ${newOrders.length === 1 ? 'pedido importado' : 'pedidos importados'} com sucesso.`);
    } catch {
      setSpreadsheetError('Ocorreu um erro ao gravar a planilha. Confira a conexão e tente novamente.');
    } finally { setSavingSpreadsheetOrders(false); }
  }

  function openOrderEditor(order: Order) {
    setEditingOrderId(order.id);
    setForm({ number: order.order_number, clientId: order.client_id || '', portal: order.portal, requestedDate: order.requested_at ? toLocalDateTime(order.requested_at) : '', confirmedDate: order.confirmed_at ? toLocalDateTime(order.confirmed_at) : '' });
    setFormStatus(order.status);
    setShowForm(true);
  }

  async function saveConfirmedDate(orderId: string, value: string) {
    const confirmed_at = value ? new Date(value).toISOString() : null;
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada. Tente novamente.'); return; }
      const { error } = await supabase.from('orders').update({ confirmed_at }).eq('id', orderId).eq('organization_id', organizationId);
      if (error) {
        setToast(error.message.includes('confirmed_at') || error.message.includes('schema cache') ? 'Aplique a migração da data confirmada no Supabase antes de salvar.' : 'Não foi possível salvar a data confirmada. Tente novamente.');
        return;
      }
    }
    setOrders(previous => previous.map(order => order.id === orderId ? { ...order, confirmed_at } : order));
    setToast(confirmed_at ? 'Data confirmada salva.' : 'Data confirmada removida.');
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
    const previousClient = editingClientId ? clients.find(client => client.id === editingClientId) : undefined;
    const newClient: Client = { ...(previousClient || {}), id: editingClientId || crypto.randomUUID(), legal_name: clientDraft.legal_name.trim(), trade_name: clientDraft.trade_name.trim(), cnpj: normalizedCnpj, email: clientDraft.email.trim(), phone: clientDraft.phone.trim(), portal: clientDraft.portal };
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

  async function saveClientEmailTemplate(client: Client, recipientsText: string, ccText: string, subject: string, body: string) {
    const splitEmails = (value: string) => Array.from(new Set(value.split(/[;,\n]+/).map(email => email.trim().toLowerCase()).filter(Boolean)));
    const recipients = splitEmails(recipientsText);
    const cc = splitEmails(ccText);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipients.length) { setEmailTemplateError('Informe pelo menos um e-mail responsável.'); return; }
    if ([...recipients, ...cc].some(email => !emailPattern.test(email))) { setEmailTemplateError('Confira os endereços de e-mail informados.'); return; }
    if (!subject.trim() || !body.trim()) { setEmailTemplateError('Preencha o título e o corpo do e-mail.'); return; }
    setSavingEmailTemplate(true); setEmailTemplateError('');
    const updates = { notification_recipients: recipients, notification_cc: cc, notification_subject: subject.trim(), notification_body: body.trim() };
    try {
      if (supabase && authenticated) {
        if (!organizationId) { setEmailTemplateError('Sua organização ainda está carregando. Tente novamente.'); return; }
        const { error } = await supabase.from('clients').update(updates).eq('id', client.id).eq('organization_id', organizationId);
        if (error) { setEmailTemplateError(error.message.includes('notification_') || error.message.includes('schema cache') ? 'Aplique a migração de configuração de e-mail no Supabase antes de salvar.' : 'Não foi possível salvar esta configuração. Confira sua conexão e tente novamente.'); return; }
      }
      const updatedClient = { ...client, ...updates };
      setClients(previous => previous.map(item => item.id === client.id ? updatedClient : item));
      setEmailTemplateClient(null); setToast(`E-mail padrão de ${client.trade_name} salvo.`);
    } catch { setEmailTemplateError('Não foi possível salvar esta configuração. Confira sua conexão e tente novamente.'); }
    finally { setSavingEmailTemplate(false); }
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
    const description = portalDraft.description.trim() || (editingPortalName ? '' : 'Portal cadastrado pela empresa');
    let url: URL;
    try { url = new URL(portalDraft.url.trim()); } catch { setPortalFormError('Informe um endereço válido para o portal.'); return; }
    if (!['http:', 'https:'].includes(url.protocol)) { setPortalFormError('O endereço precisa começar com http:// ou https://.'); return; }
    if (!name || name.length > 60) { setPortalFormError('O nome deve ter entre 1 e 60 caracteres.'); return; }
    if (portals.some(portal => portal.name !== editingPortalName && portal.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) { setPortalFormError('Já existe um portal com esse nome.'); return; }
    const currentPortal = portals.find(portal => portal.name === editingPortalName);
    const nextPortal: PortalDefinition = { name, description, url: url.toString(), short: portalInitials(name), tone: currentPortal?.tone || ['teal', 'orange', 'navy'][portals.length % 3] };
    setSavingPortal(true);
    try {
      if (supabase && authenticated) {
        if (!organizationId) { setPortalFormError('A organização ainda está carregando. Tente novamente.'); return; }
        if (editingPortalName) {
          const { error } = await supabase.rpc('update_organization_portal_details', { p_organization_id: organizationId, p_old_portal: editingPortalName, p_name: name, p_url: nextPortal.url, p_description: description });
          if (error) { setPortalFormError(error.message.includes('update_organization_portal_details') || error.message.includes('schema cache') ? 'Aplique a migração de edição de portais no Supabase antes de salvar.' : error.message.includes('already exists') ? 'Já existe um portal com esse nome.' : 'Não foi possível salvar as alterações do portal. Confira os dados e tente novamente.'); return; }
        } else {
          const { error } = await supabase.from('organization_portals').insert({ organization_id: organizationId, portal: name, portal_url: nextPortal.url, description, active: true });
          if (error) { setPortalFormError(error.message.includes('portal_url') ? 'Atualize o banco Supabase com a migração de portais antes de cadastrar.' : 'Não foi possível salvar o portal. Verifique a migração do banco e tente novamente.'); return; }
        }
      }
      if (editingPortalName) {
        const oldName = editingPortalName;
        setPortals(previous => previous.map(portal => portal.name === oldName ? nextPortal : portal));
        setOrders(previous => previous.map(order => order.portal === oldName ? { ...order, portal: name } : order));
        setClients(previous => previous.map(client => client.portal === oldName ? { ...client, portal: name } : client));
        setActivePortals(previous => { const active = previous[oldName] ?? true; const next = { ...previous, [name]: active }; if (name !== oldName) delete next[oldName]; return next; });
        setConfiguredCredentials(previous => { const configured = previous[oldName] ?? false; const next = { ...previous, [name]: configured }; if (name !== oldName) delete next[oldName]; return next; });
        setForm(previous => previous.portal === oldName ? { ...previous, portal: name } : previous);
        setPortalFilter(previous => previous === oldName ? name : previous);
        setReportPortalFilter(previous => previous === oldName ? name : previous);
        setBulkPortal(previous => previous === oldName ? name : previous);
        setConfigPortal(previous => previous === oldName ? name : previous);
        setToast(`Portal ${name} atualizado.`);
      } else {
        setPortals(previous => [...previous, nextPortal]);
        setActivePortals(previous => ({ ...previous, [name]: true }));
        setToast(`Portal ${name} cadastrado e ativado.`);
      }
      setPortalDraft({ name: '', url: '', description: '' });
      setEditingPortalName(null);
      setShowPortalForm(false);
    } catch {
      setPortalFormError('Não foi possível salvar o portal. Verifique sua conexão e tente novamente.');
    } finally { setSavingPortal(false); }
  }

  function openPortalEditor(portal: PortalDefinition) {
    setPortalFormError('');
    setEditingPortalName(portal.name);
    setPortalDraft({ name: portal.name, url: portal.url, description: portal.description });
    setShowPortalForm(true);
  }

  function publish(order: Order) { if (!activePortals[order.portal]) { setToast(`Ative o portal ${order.portal} antes de publicar.`); return; } const portal = portals.find(item => item.name === order.portal); if (!portal?.url) { setToast(`Cadastre o endereço do portal ${order.portal} antes de publicar.`); return; } window.open(portal.url, '_blank', 'noopener,noreferrer'); setToast(`Portal ${order.portal} aberto. Conclua o agendamento no painel do portal.`); }
  const filtered = orders.filter(order => {
    const client = clients.find(item => item.id === order.client_id);
    const requestedDate = order.requested_at ? localDateKey(new Date(order.requested_at)) : '';
    return (!query || order.order_number.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
      && (!clientFilter || `${client?.trade_name || ''} ${client?.legal_name || ''}`.toLocaleLowerCase('pt-BR').includes(clientFilter.toLocaleLowerCase('pt-BR')))
      && (portalFilter === 'Todos os portais' || order.portal === portalFilter)
      && (statusFilter === 'Todos os status' || order.status === statusFilter)
      && (!requestedDateStart || (!!requestedDate && requestedDate >= requestedDateStart))
      && (!requestedDateEnd || (!!requestedDate && requestedDate <= requestedDateEnd));
  });
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
  const todayScheduleOrders = orders.filter(order => order.confirmed_at && localDateKey(new Date(order.confirmed_at)) === todayKey);
  const hourlySchedule = Array.from({ length: 24 }, (_, hour) => ({ hour, count: todayScheduleOrders.filter(order => new Date(order.confirmed_at!).getHours() === hour).length }));
  const portalScheduleStats = portals.map(portal => ({ ...portal, count: orders.filter(order => order.portal === portal.name && order.status === 'Agendado').length })).sort((a, b) => b.count - a.count);
  const busiestPortal = portalScheduleStats[0];
  const maxPortalSchedule = Math.max(1, ...portalScheduleStats.map(portal => portal.count));
  const activePortalNames = portals.filter(portal => activePortals[portal.name]).map(portal => portal.name);
  const clientMatches = clients.filter(client => `${client.legal_name} ${client.trade_name} ${client.cnpj} ${client.email}`.toLocaleLowerCase('pt-BR').includes(clientQuery.toLocaleLowerCase('pt-BR')));
  const mappedOrderNumbers = spreadsheetRawRows.map(row => spreadsheetMappings.order ? (row[spreadsheetMappings.order] || '').trim().toLocaleLowerCase('pt-BR') : '');
  const importNumberCounts = new Map<string, number>();
  mappedOrderNumbers.forEach(number => { if (number) importNumberCounts.set(number, (importNumberCounts.get(number) || 0) + 1); });
  const spreadsheetOrders: ImportOrderRow[] = spreadsheetRawRows.map((values, index) => {
    const id = `spreadsheet-row-${index}`;
    const order_number = spreadsheetMappings.order ? (values[spreadsheetMappings.order] || '').trim() : '';
    const cnpjValue = spreadsheetMappings.cnpj ? values[spreadsheetMappings.cnpj] || '' : Object.values(values).find(value => normalizeCnpj(value).length === 14) || '';
    const normalizedCnpj = normalizeCnpj(cnpjValue);
    const clientName = spreadsheetMappings.client ? normalizeSpreadsheetText(values[spreadsheetMappings.client] || '') : '';
    const overrideClient = spreadsheetClientOverrides[id] ? clients.find(client => client.id === spreadsheetClientOverrides[id]) : undefined;
    const client = overrideClient || clients.find(item => normalizedCnpj.length === 14 && normalizeCnpj(item.cnpj) === normalizedCnpj)
      || (clientName ? clients.find(item => [item.trade_name, item.legal_name].some(name => normalizeSpreadsheetText(name) === clientName)) : undefined);
    const group = spreadsheetMappings.group ? values[spreadsheetMappings.group] || '' : '';
    const seller = spreadsheetMappings.seller ? values[spreadsheetMappings.seller] || '' : '';
    const scheduled = spreadsheetMappings.scheduled ? values[spreadsheetMappings.scheduled] || '' : '';
    const parsedDate = scheduled ? parseSpreadsheetDate(scheduled) : null;
    const issueParts: string[] = [];
    if (!spreadsheetMappings.order) issueParts.push('Mapeie a coluna do pedido');
    else if (!order_number) issueParts.push('Número do pedido vazio');
    if (order_number && (orders.some(order => order.order_number.trim().toLocaleLowerCase('pt-BR') === order_number.toLocaleLowerCase('pt-BR') && order.client_id === client?.id) || (importNumberCounts.get(order_number.toLocaleLowerCase('pt-BR')) || 0) > 1)) issueParts.push('Pedido duplicado');
    if (!client) issueParts.push('Associe a um cliente cadastrado');
    if (client && !activePortals[client.portal]) issueParts.push(`Ative o portal ${client.portal}`);
    if (scheduled && !parsedDate) issueParts.push('Data de agendamento não reconhecida');
    return { id, values, order_number, client_id: client?.id || '', portal: client?.portal || '', group, seller, scheduled, scheduled_at: parsedDate?.toISOString() || null, selected: spreadsheetSelectedIds.includes(id), issue: issueParts.join(' · ') };
  });
  const visibleSpreadsheetOrders = spreadsheetOrders.filter(row =>
    (spreadsheetFilters.group === 'Todos' || row.group === spreadsheetFilters.group)
    && (spreadsheetFilters.seller === 'Todos' || row.seller === spreadsheetFilters.seller)
    && (!spreadsheetFilters.scheduled || (parseSpreadsheetDate(row.scheduled) ? localDateKey(parseSpreadsheetDate(row.scheduled)!) === spreadsheetFilters.scheduled : false))
  );
  const validSpreadsheetOrders = spreadsheetOrders.filter(row => !row.issue);
  const selectedSpreadsheetOrders = spreadsheetOrders.filter(row => row.selected && !row.issue);
  const importGroups = Array.from(new Set(spreadsheetOrders.map(row => row.group).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const importSellers = Array.from(new Set(spreadsheetOrders.map(row => row.seller).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

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
      ['Pedido', 'Cliente', 'Portal', 'Data de cadastro', 'Data solicitada', 'Data confirmada', 'Status'],
      ...reportOrders.map(order => [order.order_number, clients.find(client => client.id === order.client_id)?.trade_name || '', order.portal, formatReportDate(order.created_at), order.requested_at ? formatReportDate(order.requested_at) : '', order.confirmed_at ? formatReportDate(order.confirmed_at) : '', order.status]),
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
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {dateLabel}</div><h1>{activeModule === 'overview' ? 'Dashboard' : activeModule === 'integrations' ? 'Integrações' : activeModule === 'clients' ? 'Clientes' : activeModule === 'reports' ? 'Relatórios' : 'Portais'} </h1><p className="subtitle">{activeModule === 'overview' ? 'Acompanhe os principais indicadores da sua operação.' : activeModule === 'integrations' ? 'Gerencie seus pedidos, datas solicitadas e confirmações dos clientes.' : activeModule === 'clients' ? 'Cadastre clientes e defina o portal padrão de cada operação.' : activeModule === 'reports' ? 'Analise os pedidos e resultados registrados por portal.' : 'Ative somente os portais que sua empresa utiliza.'}</p></div>{activeModule === 'integrations' && <div className="integration-header-actions"><button className="outline-button xml-upload-trigger" onClick={openXmlImport}><FileUp size={16}/> Upload XML</button><button className="outline-button spreadsheet-upload-trigger" onClick={openSpreadsheetImport}><FileUp size={16}/> Ler XLS</button><button className="primary-button" onClick={() => { setEditingOrderId(null); setFormStatus('Pendente'); setForm({ number: '', clientId: clients[0]?.id || '', portal: clients[0]?.portal || activePortalNames[0] || 'TempoCerto', requestedDate: '', confirmedDate: '' }); setShowForm(true); }}><Plus size={17}/> Novo pedido</button></div>}{activeModule === 'clients' && <button className="primary-button" onClick={() => { setClientFormError(''); setClientDraft(previous => ({ ...previous, portal: activePortalNames[0] || previous.portal })); setShowClientForm(true); }}><Plus size={17}/> Cadastrar cliente</button>}</div>
        {activeModule === 'overview' && <div className="metric-grid">
          <Metric title="Pedidos no total" value={String(orders.length).padStart(2,'0')} note="na sua fila de integração" icon={<Truck size={17}/>} tone="blue" trend="Fila atual"/>
          <Metric title="Agendados" value={String(scheduledCount).padStart(2,'0')} note="pedidos confirmados" icon={<Check size={17}/>} tone="green" trend={`${orders.length ? Math.round(scheduledCount/orders.length*100) : 0}%`}/>
          <Metric title="Aguardando ação" value={String(orders.filter(o => o.status === 'Pendente').length).padStart(2,'0')} note="prontos para publicar" icon={<Clock3 size={17}/>} tone="amber" trend="Ação necessária"/>
          <Metric title="Portais ativos" value={String(Object.values(activePortals).filter(Boolean).length).padStart(2,'0')} note="habilitados para operar" icon={<Activity size={17}/>} tone="violet" trend={`de ${portals.length} portais`}/>
        </div>}
        {activeModule === 'overview' && <section className="dashboard-charts" aria-label="Gráficos de agendamento"><article className="chart-card daily-chart"><div className="chart-card-heading"><div><h2>Agendamentos de hoje</h2><p>Pedidos confirmados distribuídos por horário</p></div><span className="chart-total"><strong>{todayScheduleOrders.length}</strong><small>hoje</small></span></div>{todayScheduleOrders.length ? <><div className="hourly-chart" role="img" aria-label={`${todayScheduleOrders.length} agendamentos registrados para hoje, distribuídos por horário`}>{hourlySchedule.map(({ hour, count }) => <div className="hour-column" key={hour} title={`${String(hour).padStart(2, '0')}h · ${count} ${count === 1 ? 'agendamento' : 'agendamentos'}`}><span className="hour-value">{count || ''}</span><div className="hour-bar-track"><i style={{ height: `${count ? Math.max(9, count / Math.max(...hourlySchedule.map(item => item.count)) * 100) : 0}%` }}/></div><small>{hour % 6 === 0 ? `${String(hour).padStart(2, '0')}h` : ''}</small></div>)}</div><div className="chart-footnote">Total de pedidos com status agendado e horário para hoje.</div></> : <div className="chart-empty"><CalendarDays size={19}/><span>Nenhum agendamento para hoje.</span></div>}</article><article className="chart-card portal-chart"><div className="chart-card-heading"><div><h2>Portal com mais agendamentos</h2><p>Pedidos com status agendado por portal</p></div>{busiestPortal && busiestPortal.count > 0 && <span className="leader-badge">Destaque</span>}</div>{scheduledCount ? <div className="portal-ranking">{portalScheduleStats.map((portal, index) => <div className={`portal-rank-row ${index === 0 && portal.count > 0 ? 'leader' : ''}`} key={portal.name}><div className="portal-rank-label"><span className={`mini-logo ${portal.tone}`}>{portal.short}</span><strong>{portal.name}</strong><b>{portal.count}</b></div><div className="portal-rank-track"><i style={{ width: `${portal.count / maxPortalSchedule * 100}%` }}/></div></div>)}</div> : <div className="chart-empty"><Truck size={19}/><span>Ainda não há pedidos agendados.</span></div>}{busiestPortal && scheduledCount > 0 && <div className="chart-footnote">{busiestPortal.name} lidera com {busiestPortal.count} {busiestPortal.count === 1 ? 'pedido agendado' : 'pedidos agendados'}.</div>}</article></section>}
        {activeModule === 'integrations' && <section className="orders-section module-orders" id="orders"><div className="section-heading order-title"><div><h2>Pedidos</h2><p>Consulte e publique pedidos nos portais ativos.</p></div><button className="active-summary clickable" onClick={() => setActiveModule('portals')}><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} portais ativos <ArrowRight size={14}/></button></div>
          <div className="table-card"><div className="table-toolbar integration-toolbar"><div className="integration-filters"><label className="search-box"><span>Número do pedido</span><div><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Digite o número do pedido..."/></div></label><label>Nome do cliente<input className="integration-filter-input" value={clientFilter} onChange={event => setClientFilter(event.target.value)} placeholder="Buscar cliente..."/></label><label>Portal<select value={portalFilter} onChange={e => setPortalFilter(e.target.value)}><option>Todos os portais</option>{portals.map(portal => <option key={portal.name}>{portal.name}</option>)}</select></label><label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Todos os status</option><option>Agendado</option><option>Pendente</option><option>Falhou</option></select></label><label>Data solicitada a partir de<input className="integration-filter-input" type="date" value={requestedDateStart} onChange={event => setRequestedDateStart(event.target.value)}/></label><label>Data solicitada até<input className="integration-filter-input" type="date" value={requestedDateEnd} onChange={event => setRequestedDateEnd(event.target.value)}/></label></div><button className="integration-filter-reset" onClick={() => { setQuery(''); setClientFilter(''); setPortalFilter('Todos os portais'); setStatusFilter('Todos os status'); setRequestedDateStart(''); setRequestedDateEnd(''); }}>Limpar filtros</button></div>
            {selectedOrders.length > 0 && <div className="bulk-toolbar"><div className="bulk-selection-count"><strong>{selectedOrders.length}</strong> {selectedOrders.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}</div><label className="bulk-portal-select">Portal<select value={bulkPortalValue} onChange={event => setBulkPortal(event.target.value)}>{selectedPortals.map(portal => <option key={portal.name} value={portal.name} disabled={!activePortals[portal.name]}>{portal.name} · {selectedOrders.filter(order => order.portal === portal.name).length} pedidos{activePortals[portal.name] ? '' : ' (desativado)'}</option>)}</select></label><button className="primary-button bulk-publish" onClick={publishSelected} disabled={!bulkPortalOrders.length || !activePortals[bulkPortalValue]}><ExternalLink size={15}/> Abrir portal com {bulkPortalOrders.length}</button><button className="bulk-clear" onClick={() => setSelectedOrderIds([])}>Limpar seleção</button></div>}
            <div className="table-scroll"><table className="selectable-orders"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Selecionar todos os pedidos visíveis" checked={filtered.length > 0 && filtered.every(order => selectedOrderIds.includes(order.id))} onChange={event => selectVisibleOrders(event.target.checked)}/></th><th>PEDIDO</th><th>NOTA FISCAL</th><th>CLIENTE</th><th>PORTAL</th><th>DATA SOLICITADA</th><th>DATA CONFIRMADA</th><th>STATUS</th><th className="action-head">AÇÃO</th></tr></thead><tbody>{filtered.map(order => <tr key={order.id}><td className="select-column"><input type="checkbox" aria-label={`Selecionar pedido ${order.order_number}`} checked={selectedOrderIds.includes(order.id)} onChange={event => setSelectedOrderIds(previous => event.target.checked ? Array.from(new Set([...previous, order.id])) : previous.filter(id => id !== order.id))}/></td><td><strong className="order-number">{order.order_number}</strong><small className="order-sub">Adicionado em {new Date(order.created_at).toLocaleDateString('pt-BR')}</small>{order.xml_order_number&&<small className="order-xml-summary" title={`Pedido XML ${order.xml_order_number} · ${order.xml_item_count||0} itens · Quantidade ${order.xml_item_quantity??0}${order.xml_purchase_order?` · OC ${order.xml_purchase_order}`:''}`}>XML: {order.xml_order_number} · {order.xml_item_count||0} itens / {Number(order.xml_item_quantity||0).toLocaleString('pt-BR')} un.{order.xml_purchase_order?` · OC ${order.xml_purchase_order}`:''}</small>}</td><td>{order.xml_invoice_number || <span className="muted">—</span>}</td><td>{clients.find(client => client.id === order.client_id)?.trade_name || <span className="muted">Não vinculado</span>}</td><td><PortalMini portal={order.portal} portals={portals}/></td><td>{order.requested_at ? <span className="date-cell"><CalendarDays size={15}/>{new Date(order.requested_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span> : <span className="muted">Não definido</span>}</td><td><ConfirmedDateCell value={order.confirmed_at} onSave={value => saveConfirmedDate(order.id, value)}/></td><td><Status status={order.status}/></td><td><div className="order-row-actions"><button className="edit-client-button xml-order-button" onClick={() => openOrderXml(order)} aria-label={`Anexar ou atualizar XML do pedido ${order.order_number}`}><FileUp size={14}/>{order.xml_order_number?'Editar XML':'Anexar XML'}</button><button className="edit-client-button" onClick={() => openOrderEditor(order)} aria-label={`Editar pedido ${order.order_number}`}><Edit2 size={14}/> Editar</button><button className="publish-button" onClick={() => publish(order)} disabled={!activePortals[order.portal]}><ExternalLink size={14}/> {activePortals[order.portal] ? 'Publicar' : 'Desativado'}</button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">Nenhum pedido encontrado.</div>}</div>
            <div className="table-footer"><span>Mostrando <strong>{filtered.length}</strong> de <strong>{orders.length}</strong> pedidos</span><button className="see-all" onClick={() => { setQuery(''); setClientFilter(''); setPortalFilter('Todos os portais'); setStatusFilter('Todos os status'); setRequestedDateStart(''); setRequestedDateEnd(''); }}>Limpar filtros <ArrowRight size={14}/></button></div>
          </div>
        </section>}
        {activeModule === 'clients' && <section className="clients-module">
          <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={clientQuery} onChange={event => setClientQuery(event.target.value)} placeholder="Buscar por nome, CNPJ ou e-mail..."/></div><span className="active-summary"><Users size={13}/> {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}</span></div>
            <div className="table-scroll"><table className="clients-table"><thead><tr><th>RAZÃO SOCIAL</th><th>NOME FANTASIA</th><th>CNPJ</th><th>CONTATO</th><th>PORTAL PADRÃO</th><th className="action-head">AÇÃO</th></tr></thead><tbody>{clientMatches.map(client => <tr key={client.id}><td><strong className="client-name">{client.legal_name}</strong></td><td>{client.trade_name}</td><td>{formatCnpj(client.cnpj)}</td><td><span className="client-contact">{client.email}<small>{client.phone}</small></span></td><td><PortalMini portal={client.portal} portals={portals}/></td><td><div className="client-row-actions"><button className="edit-client-button email-template-button" onClick={() => { setEmailTemplateClient(client); setEmailTemplateError(''); }} aria-label={`Configurar e-mail padrão de ${client.trade_name}`}><Mail size={14}/> E-mail padrão</button><button className="edit-client-button" onClick={() => openClientEditor(client)} aria-label={`Editar cliente ${client.trade_name}`}><Edit2 size={14}/> Editar</button></div></td></tr>)}</tbody></table>{clientMatches.length === 0 && <div className="empty-state">{clients.length ? 'Nenhum cliente encontrado para essa busca.' : 'Cadastre o primeiro cliente para vincular os pedidos ao portal correto.'}</div>}</div><div className="table-footer"><span>Exibindo <strong>{clientMatches.length}</strong> de <strong>{clients.length}</strong> clientes</span><button className="see-all" onClick={() => { setClientQuery(''); setClientFormError(''); setEditingClientId(null); setClientDraft(previous => ({ legal_name: '', trade_name: '', cnpj: '', email: '', phone: '', portal: activePortalNames[0] || previous.portal })); setShowClientForm(true); }}>Cadastrar cliente <Plus size={14}/></button></div>
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
          <div className="table-card"><div className="table-scroll"><table><thead><tr><th>PEDIDO</th><th>PORTAL</th><th>DATA DE CADASTRO</th><th>DATA SOLICITADA</th><th>DATA CONFIRMADA</th><th>STATUS</th></tr></thead><tbody>{reportOrders.map(order => <tr key={order.id}><td><strong className="order-number">{order.order_number}</strong></td><td><PortalMini portal={order.portal} portals={portals}/></td><td>{formatReportDate(order.created_at)}</td><td>{order.requested_at ? formatReportDate(order.requested_at) : <span className="muted">Não definido</span>}</td><td>{order.confirmed_at ? formatReportDate(order.confirmed_at) : <span className="muted">Aguardando confirmação</span>}</td><td><Status status={order.status}/></td></tr>)}</tbody></table>{reportOrders.length === 0 && <div className="empty-state">Nenhum pedido encontrado para os filtros selecionados.</div>}</div><div className="table-footer"><span>Exibindo <strong>{reportOrders.length}</strong> {reportOrders.length === 1 ? 'pedido' : 'pedidos'}</span><span>Fonte: pedidos cadastrados</span></div></div>
          <div className="portal-info-note report-note"><ShieldCheck size={17}/><span>Nesta fase, os indicadores refletem os status cadastrados no sistema. O botão Publicar abre o portal para conclusão manual e ainda não confirma o resultado automaticamente.</span></div>
        </section>}
        {activeModule === 'portals' && <section className="portal-settings"><div className="section-heading portal-heading"><div><h2>Conexões disponíveis</h2><p>Cadastre e gerencie os portais utilizados pela sua empresa.</p></div><div className="portal-heading-actions"><span className="active-summary"><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} de {portals.length} ativos</span><button className="primary-button" onClick={() => { setPortalFormError(''); setEditingPortalName(null); setPortalDraft({ name: '', url: '', description: '' }); setShowPortalForm(true); }}><Plus size={16}/> Adicionar portal</button></div></div><div className="portal-settings-grid">{portals.map(portal => <PortalSetting key={portal.name} {...portal} active={activePortals[portal.name] ?? true} credentialsConfigured={configuredCredentials[portal.name] ?? false} onToggle={() => void togglePortal(portal.name)} onConfigure={() => { setConfigPortal(portal.name); setCredentialError(''); }} onEdit={() => openPortalEditor(portal)} onOpen={() => window.open(portal.url, '_blank', 'noopener,noreferrer')}/>)}</div><div className="portal-info-note"><ShieldCheck size={17}/><span>Portais cadastrados ficam disponíveis para adicionar pedidos e gerar relatórios nesta organização. A integração automática será configurada em uma etapa futura.</span></div></section>}
        <footer className="footer"><span>© 2026 Nexo. Integrações simples, operações mais leves.</span><span><span className="footer-dot"/> Todos os sistemas operacionais <span className="footer-sep">·</span> v0.1.0</span></footer>
      </div>
    </section>
    {configPortal && <CredentialModal portal={configPortal} alreadyConfigured={configuredCredentials[configPortal]} saving={savingCredentials} error={credentialError} onClose={() => setConfigPortal(null)} onSave={savePortalCredentials}/>}
    {orderXmlTarget && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!savingOrderXml)setOrderXmlTarget(null);}}><div className="modal order-xml-modal"><div className="modal-head"><div><span className="modal-icon"><FileUp size={18}/></span><h2>XML do pedido {orderXmlTarget.order_number}</h2><p>Anexe o XML para preencher os dados e confira antes de salvar.</p></div><button className="icon-button" aria-label="Fechar" disabled={savingOrderXml} onClick={()=>setOrderXmlTarget(null)}><X size={18}/></button></div><input ref={orderXmlInputRef} type="file" accept=".xml,application/xml,text/xml" className="xml-file-input" onChange={handleOrderXmlUpload}/><button type="button" className="xml-dropzone" disabled={savingOrderXml} onClick={()=>orderXmlInputRef.current?.click()}><FileUp size={22}/><strong>{orderXmlFileName||'Selecionar arquivo XML'}</strong><span>XML de até 5 MB · O arquivo será lido no navegador</span></button>{orderXmlError&&<div className="login-error xml-error">{orderXmlError}</div>}{(orderXmlFileName||orderXmlTarget.xml_order_number)&&<><div className="xml-order-preview-heading"><Check size={15}/><strong>{orderXmlFileName?'Dados identificados no XML':'Dados XML já salvos'}</strong><span>Confira ou ajuste os valores:</span></div><label>Número do pedido do XML<input required maxLength={160} value={orderXmlDraft.orderNumber} onChange={event=>setOrderXmlDraft(previous=>({...previous,orderNumber:event.target.value}))}/></label><label>Número da nota (nNF)<input maxLength={60} placeholder="Extraído do campo nNF" value={orderXmlDraft.invoiceNumber} onChange={event=>setOrderXmlDraft(previous=>({...previous,invoiceNumber:event.target.value}))}/></label><div className="xml-order-fields"><label>Itens (linhas)<input type="number" min="0" step="1" value={orderXmlDraft.itemCount} onChange={event=>setOrderXmlDraft(previous=>({...previous,itemCount:Number(event.target.value)}))}/></label><label>Quantidade total (qCom)<input type="number" min="0" step="any" value={orderXmlDraft.itemQuantity} onChange={event=>setOrderXmlDraft(previous=>({...previous,itemQuantity:Number(event.target.value)}))}/></label></div><label>Ordem de compra<input maxLength={300} placeholder="Extraída das observações do XML" value={orderXmlDraft.purchaseOrder} onChange={event=>setOrderXmlDraft(previous=>({...previous,purchaseOrder:event.target.value}))}/></label><div className="form-note"><Activity size={15}/> A ordem de compra é localizada nas observações do XML; se não houver correspondência, você pode preencher este campo manualmente.</div></>}<div className="modal-actions"><button type="button" className="outline-button" disabled={savingOrderXml} onClick={()=>setOrderXmlTarget(null)}>Cancelar</button><button type="button" className="primary-button" disabled={savingOrderXml||!orderXmlDraft.orderNumber.trim()||(!orderXmlFileName&&!orderXmlTarget.xml_order_number)} onClick={()=>void saveOrderXml()}>{savingOrderXml?'Salvando...':'Salvar dados XML'} <Check size={15}/></button></div></div></div>}
    {showSpreadsheetImport && <SpreadsheetImportModal fileName={spreadsheetFileName} sheetName={spreadsheetSheetName} columns={spreadsheetColumns} allRows={spreadsheetOrders} visibleRows={visibleSpreadsheetOrders} validCount={validSpreadsheetOrders.length} selectedCount={selectedSpreadsheetOrders.length} mappings={spreadsheetMappings} groups={importGroups} sellers={importSellers} filters={spreadsheetFilters} busy={spreadsheetBusy} saving={savingSpreadsheetOrders} error={spreadsheetError} fileInputRef={spreadsheetInputRef} clients={clients} onClose={() => setShowSpreadsheetImport(false)} onUpload={handleSpreadsheetUpload} onMap={(field, value) => { setSpreadsheetMappings(previous => ({ ...previous, [field]: value })); if (field === 'order') setSpreadsheetError(''); }} onFilter={(field, value) => setSpreadsheetFilters(previous => ({ ...previous, [field]: value }))} onSelectAll={selectVisibleSpreadsheetOrders} onSelectRow={(id, checked) => setSpreadsheetSelectedIds(previous => checked ? Array.from(new Set([...previous, id])) : previous.filter(item => item !== id))} onClientOverride={(id, clientId) => setSpreadsheetClientOverrides(previous => ({ ...previous, [id]: clientId }))} onSave={() => void saveSelectedSpreadsheetOrders()}/>}
    {showXmlImport && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowXmlImport(false); }}><div className="modal xml-import-modal"><div className="modal-head"><div><span className="modal-icon"><FileUp size={18}/></span><h2>Novo pedido por XML</h2><p>Envie o XML para identificar o cliente e conferir os dados do pedido.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setShowXmlImport(false)}><X size={18}/></button></div><input ref={xmlInputRef} type="file" accept=".xml,application/xml,text/xml" className="xml-file-input" onChange={handleXmlUpload}/><button type="button" className="xml-dropzone" onClick={() => xmlInputRef.current?.click()}><FileUp size={22}/><strong>{xmlFileName || 'Selecionar arquivo XML'}</strong><span>Arquivo XML de até 5 MB</span></button>{xmlImportError && <div className="login-error xml-error">{xmlImportError}</div>}{xmlClientId && <div className="xml-match-card"><span className="xml-match-icon"><Check size={16}/></span><div><strong>Cliente identificado</strong><span>{clients.find(client => client.id === xmlClientId)?.trade_name} · CNPJ {formatCnpj(clients.find(client => client.id === xmlClientId)?.cnpj || '')}</span><small>Portal padrão: {clients.find(client => client.id === xmlClientId)?.portal}</small></div></div>}{xmlClientId && <><label>Número do pedido do XML<input required placeholder="Extraído do XML ou informe manualmente" value={form.number} onChange={event => { setForm(previous => ({ ...previous, number: event.target.value })); setXmlOrderNumber(event.target.value); setXmlNewOrderDetails(previous => ({ ...previous, orderNumber: event.target.value })); }}/></label><label>Número da nota (nNF)<input maxLength={60} placeholder="Extraído do campo nNF" value={xmlNewOrderDetails.invoiceNumber} onChange={event => setXmlNewOrderDetails(previous => ({ ...previous, invoiceNumber: event.target.value }))}/></label><div className="xml-order-fields"><label>Itens (linhas)<input type="number" min="0" step="1" value={xmlNewOrderDetails.itemCount} onChange={event => setXmlNewOrderDetails(previous => ({ ...previous, itemCount: Number(event.target.value) }))}/></label><label>Quantidade total (qCom)<input type="number" min="0" step="any" value={xmlNewOrderDetails.itemQuantity} onChange={event => setXmlNewOrderDetails(previous => ({ ...previous, itemQuantity: Number(event.target.value) }))}/></label></div><label>Ordem de compra<input maxLength={300} placeholder="Extraída das observações do XML" value={xmlNewOrderDetails.purchaseOrder} onChange={event => setXmlNewOrderDetails(previous => ({ ...previous, purchaseOrder: event.target.value }))}/></label><label>Data solicitada <span className="optional">Opcional</span><input type="datetime-local" value={form.requestedDate} onChange={event => setForm(previous => ({ ...previous, requestedDate: event.target.value }))}/></label><label>Portal vinculado<select value={form.portal} onChange={event => setForm(previous => ({ ...previous, portal: event.target.value }))}>{portals.map(portal => <option key={portal.name} value={portal.name} disabled={!activePortals[portal.name]}>{portal.name}{portal.name === clients.find(client => client.id === xmlClientId)?.portal ? ' · padrão do cliente' : ''}{activePortals[portal.name] ? '' : ' · desativado'}</option>)}</select></label><div className="form-note"><Activity size={15}/> Confira os dados extraídos. O arquivo XML é lido no navegador e não será armazenado; o pedido será salvo como pendente.</div></>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowXmlImport(false)}>Cancelar</button><button type="button" className="primary-button" disabled={!xmlClientId || !form.number.trim() || !activePortals[form.portal]} onClick={() => void saveOrder()}>Gravar novo pedido <ArrowRight size={16}/></button></div></div></div>}
    {emailTemplateClient && <ClientEmailTemplateModal client={emailTemplateClient} saving={savingEmailTemplate} error={emailTemplateError} onClose={() => { if (!savingEmailTemplate) setEmailTemplateClient(null); }} onSave={(recipients,cc,subject,body) => void saveClientEmailTemplate(emailTemplateClient,recipients,cc,subject,body)} onReview={async text => { const response=await fetch('/api/review-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}); const result=await response.json(); if(!response.ok) throw new Error(result.error||'Não foi possível revisar o texto.'); return result.text as string; }}/>} 
    {showClientForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingClient) { setShowClientForm(false); setEditingClientId(null); } }}><div className="modal client-modal"><div className="modal-head"><div><span className="modal-icon"><Users size={18}/></span><h2>{editingClientId ? 'Editar cliente' : 'Cadastrar cliente'}</h2><p>Os pedidos deste cliente usarão o portal padrão selecionado.</p></div><button className="icon-button" aria-label="Fechar" disabled={savingClient} onClick={() => { setShowClientForm(false); setEditingClientId(null); }}><X size={18}/></button></div><form onSubmit={addClient}><label>Razão social<input required maxLength={160} placeholder="Ex.: Transportadora Exemplo Ltda." value={clientDraft.legal_name} onChange={event => setClientDraft(previous => ({ ...previous, legal_name: event.target.value }))}/></label><label>Nome fantasia<input required maxLength={120} placeholder="Ex.: Exemplo Cargas" value={clientDraft.trade_name} onChange={event => setClientDraft(previous => ({ ...previous, trade_name: event.target.value }))}/></label><label>CNPJ<input required maxLength={18} placeholder="00.000.000/0000-00" value={clientDraft.cnpj} onChange={event => setClientDraft(previous => ({ ...previous, cnpj: event.target.value }))}/></label><div className="client-form-grid"><label>E-mail<input required type="email" maxLength={254} placeholder="contato@empresa.com.br" value={clientDraft.email} onChange={event => setClientDraft(previous => ({ ...previous, email: event.target.value }))}/></label><label>Telefone para contato<input required type="tel" maxLength={30} placeholder="(11) 90000-0000" value={clientDraft.phone} onChange={event => setClientDraft(previous => ({ ...previous, phone: event.target.value }))}/></label></div><label>Portal padrão<select required value={clientDraft.portal} onChange={event => setClientDraft(previous => ({ ...previous, portal: event.target.value }))} disabled={!activePortalNames.length}>{activePortalNames.map(portal => <option key={portal} value={portal}>{portal}</option>)}</select></label>{!activePortalNames.length && <div className="login-error">Ative um portal antes de cadastrar clientes.</div>}{clientFormError && <div className="login-error">{clientFormError}</div>}<div className="form-note"><ShieldCheck size={15}/> O cliente ficará disponível para todos os pedidos desta organização.</div><div className="modal-actions"><button type="button" className="outline-button" disabled={savingClient} onClick={() => { setShowClientForm(false); setEditingClientId(null); }}>Cancelar</button><button className="primary-button" type="submit" disabled={savingClient || !activePortalNames.length}>{savingClient ? 'Salvando...' : editingClientId ? 'Salvar alterações' : 'Cadastrar cliente'} <ArrowRight size={15}/></button></div></form></div></div>}
    {showPortalForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingPortal) { setShowPortalForm(false); setEditingPortalName(null); } }}><div className="modal"><div className="modal-head"><div><span className="modal-icon">{editingPortalName ? <Edit2 size={18}/> : <Plus size={18}/>}</span><h2>{editingPortalName ? 'Editar portal' : 'Adicionar portal'}</h2><p>{editingPortalName ? 'Altere os dados de cadastro deste portal.' : 'Cadastre o portal que sua empresa quer acompanhar.'}</p></div><button className="icon-button" aria-label="Fechar" disabled={savingPortal} onClick={() => { setShowPortalForm(false); setEditingPortalName(null); }}><X size={18}/></button></div><form onSubmit={addPortal}><label>Nome do portal<input required maxLength={60} placeholder="Ex.: Portal da transportadora" value={portalDraft.name} onChange={event => setPortalDraft(previous => ({ ...previous, name: event.target.value }))}/></label><label>Endereço do portal<input required type="url" placeholder="https://portal.empresa.com.br" value={portalDraft.url} onChange={event => setPortalDraft(previous => ({ ...previous, url: event.target.value }))}/></label><label>Descrição <span className="optional">Opcional</span><input maxLength={120} placeholder="Ex.: Agendamento de cargas" value={portalDraft.description} onChange={event => setPortalDraft(previous => ({ ...previous, description: event.target.value }))}/></label>{portalFormError && <div className="login-error">{portalFormError}</div>}<div className="form-note"><ShieldCheck size={15}/>{editingPortalName ? 'Os clientes, pedidos e credenciais serão mantidos vinculados ao portal.' : 'O novo portal será criado como ativo para esta organização.'}</div><div className="modal-actions"><button type="button" className="outline-button" disabled={savingPortal} onClick={() => { setShowPortalForm(false); setEditingPortalName(null); }}>Cancelar</button><button className="primary-button" type="submit" disabled={savingPortal}>{savingPortal ? 'Salvando...' : editingPortalName ? 'Salvar alterações' : 'Cadastrar portal'} <ArrowRight size={15}/></button></div></form></div></div>}
    {showForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setShowForm(false); setEditingOrderId(null); } }}><div className="modal"><div className="modal-head"><div><span className="modal-icon">{editingOrderId ? <Edit2 size={18}/> : <Plus size={18}/>}</span><h2>{editingOrderId ? 'Editar pedido' : 'Adicionar pedido'}</h2><p>{editingOrderId ? 'Atualize os dados deste pedido.' : 'Informe os dados para preparar a integração.'}</p></div><button className="icon-button" aria-label="Fechar" onClick={() => { setShowForm(false); setEditingOrderId(null); }}><X size={18}/></button></div><form onSubmit={addOrder}><label>Número do pedido<input required placeholder="Ex.: PED-2024-0843" value={form.number} onChange={event => setForm(previous => ({ ...previous, number: event.target.value }))}/></label><label>Cliente<select required value={form.clientId} onChange={event => { const client = clients.find(item => item.id === event.target.value); setForm(previous => ({ ...previous, clientId: event.target.value, portal: client?.portal || previous.portal })); }}><option value="" disabled>{clients.length ? 'Selecione o cliente' : 'Cadastre um cliente primeiro'}</option>{clients.map(client => <option key={client.id} value={client.id}>{client.trade_name} · {formatCnpj(client.cnpj)}</option>)}</select>{clients.length === 0 && <button type="button" className="inline-link" onClick={() => { setShowForm(false); setActiveModule('clients'); setShowClientForm(true); }}>Cadastrar cliente</button>}</label><label>Portal de integração<select required value={form.portal} onChange={event => setForm(previous => ({ ...previous, portal: event.target.value }))}>{portals.filter(portal => activePortals[portal.name]).map(portal => <option key={portal.name} value={portal.name}>{portal.name}{clients.find(client => client.id === form.clientId)?.portal === portal.name ? ' · padrão do cliente' : ''}</option>)}</select><span className="field-hint">Preenchido pelo portal padrão do cliente; você pode alterar.</span></label><label>Data solicitada <span className="optional">Opcional</span><input type="datetime-local" value={form.requestedDate} onChange={event => setForm(previous => ({ ...previous, requestedDate: event.target.value }))}/></label><label>Data confirmada <span className="optional">Opcional</span><input type="datetime-local" value={form.confirmedDate} onChange={event => setForm(previous => ({ ...previous, confirmedDate: event.target.value }))}/><span className="field-hint">Preencha quando o cliente retornar confirmando a data.</span></label><label>Status<select value={formStatus} onChange={event => setFormStatus(event.target.value as Order['status'])}><option value="Pendente">Pendente</option><option value="Agendado">Agendado</option><option value="Falhou">Falhou</option></select></label><div className="form-note"><Activity size={15}/>{editingOrderId ? 'As alterações serão refletidas nos indicadores e relatórios.' : 'Seu pedido será salvo como pendente até a publicação no portal.'}</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => { setShowForm(false); setEditingOrderId(null); }}>Cancelar</button><button className="primary-button" type="submit" disabled={!clients.length}>{editingOrderId ? 'Salvar alterações' : 'Adicionar pedido'} <ArrowRight size={16}/></button></div></form></div></div>}
    {loginOpen && <LoginModal demo={demoMode} authUnavailable={!supabase && !demoMode} mode={loginMode} setMode={setLoginMode} onSubmit={signIn} toast={toast}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </main>;
}

type SpreadsheetImportModalProps = {
  fileName:string; sheetName:string; columns:string[]; allRows:ImportOrderRow[]; visibleRows:ImportOrderRow[]; validCount:number; selectedCount:number;
  mappings:ImportFilters; groups:string[]; sellers:string[]; filters:{group:string;seller:string;scheduled:string}; busy:boolean;saving:boolean;error:string;
  fileInputRef:React.RefObject<HTMLInputElement|null>;clients:Client[];onClose:()=>void;onUpload:(event:React.ChangeEvent<HTMLInputElement>)=>void;
  onMap:(field:keyof ImportFilters,value:string)=>void;onFilter:(field:'group'|'seller'|'scheduled',value:string)=>void;onSelectAll:(checked:boolean)=>void;
  onSelectRow:(id:string,checked:boolean)=>void;onClientOverride:(id:string,clientId:string)=>void;onSave:()=>void;
};
function SpreadsheetImportModal(props:SpreadsheetImportModalProps) {
  const {fileName,sheetName,columns,allRows,visibleRows,validCount,selectedCount,mappings,groups,sellers,filters,busy,saving,error,fileInputRef,clients,onClose,onUpload,onMap,onFilter,onSelectAll,onSelectRow,onClientOverride,onSave}=props;
  const validVisible=visibleRows.filter(row=>!row.issue);
  const allVisibleSelected=validVisible.length>0&&validVisible.every(row=>row.selected);
  const mappingFields:[keyof ImportFilters,string,boolean][]=[['order','Número do pedido',true],['cnpj','CNPJ do cliente',false],['client','Nome do cliente',false],['group','Grupo do cliente',false],['seller','Vendedor',false],['scheduled','Agendado para',false]];
  return <div className="modal-backdrop spreadsheet-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onClose();}}><div className="modal spreadsheet-import-modal" role="dialog" aria-modal="true" aria-labelledby="spreadsheet-title">
    <div className="modal-head"><div><span className="modal-icon"><FileUp size={18}/></span><h2 id="spreadsheet-title">Importar pedidos da planilha</h2><p>Confira as colunas, filtre e selecione os pedidos que serão adicionados.</p></div><button className="icon-button" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={18}/></button></div>
    <input ref={fileInputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="xml-file-input" onChange={onUpload}/>
    <button type="button" className="xml-dropzone spreadsheet-dropzone" disabled={busy} onClick={()=>fileInputRef.current?.click()}><FileUp size={21}/><strong>{busy?'Lendo planilha...':fileName||'Selecionar arquivo XLS ou XLSX'}</strong><span>{fileName?`Aba: ${sheetName} · ${allRows.length} linhas encontradas`:'A leitura acontece neste navegador; limite de 10 MB e 2.500 linhas.'}</span></button>
    {error&&<div className="login-error xml-error">{error}</div>}
    {columns.length>0&&<>
      <div className="spreadsheet-mapping"><div className="spreadsheet-section-title"><strong>Mapeamento das colunas</strong><span>Detectamos automaticamente alguns campos; revise se necessário.</span></div><div className="spreadsheet-mapping-grid">{mappingFields.map(([field,label,required])=><label key={field}>{label}{required&&<span className="required-mark"> *</span>}<select value={mappings[field]} onChange={event=>onMap(field,event.target.value)}><option value="">Não mapear</option>{columns.map(column=><option key={column} value={column}>{column}</option>)}</select></label>)}</div></div>
      <div className="spreadsheet-filters"><label>Grupo do cliente<select value={filters.group} onChange={event=>onFilter('group',event.target.value)}><option value="Todos">Todos os grupos</option>{groups.map(group=><option key={group} value={group}>{group}</option>)}</select></label><label>Vendedor<select value={filters.seller} onChange={event=>onFilter('seller',event.target.value)}><option value="Todos">Todos os vendedores</option>{sellers.map(seller=><option key={seller} value={seller}>{seller}</option>)}</select></label><label>Data solicitada<input type="date" value={filters.scheduled} onChange={event=>onFilter('scheduled',event.target.value)}/></label></div>
      <div className="spreadsheet-summary"><span><strong>{allRows.length}</strong> na planilha</span><span><strong>{validCount}</strong> válidos</span><span><strong>{selectedCount}</strong> selecionados</span><label><input type="checkbox" checked={allVisibleSelected} disabled={!validVisible.length} onChange={event=>onSelectAll(event.target.checked)}/> Selecionar válidos visíveis ({validVisible.length})</label></div>
      <div className="spreadsheet-table-wrap"><table className="spreadsheet-table"><thead><tr><th className="spreadsheet-check"></th>{columns.map(column=><th key={column}>{column}</th>)}<th>Cliente vinculado / portal</th><th>Validação</th></tr></thead><tbody>{visibleRows.map(row=><tr key={row.id}><td className="spreadsheet-check"><input aria-label={`Selecionar pedido ${row.order_number||'sem número'}`} type="checkbox" checked={row.selected&&!row.issue} disabled={!!row.issue} onChange={event=>onSelectRow(row.id,event.target.checked)}/></td>{columns.map(column=><td key={column} title={row.values[column]}>{row.values[column]||<span className="muted">—</span>}</td>)}<td className="spreadsheet-client-cell"><select aria-label="Associar cliente" value={row.client_id} onChange={event=>onClientOverride(row.id,event.target.value)}><option value="">Selecione cliente</option>{clients.map(client=><option key={client.id} value={client.id}>{client.trade_name} · {client.portal}</option>)}</select>{row.client_id&&<small>{row.portal} · portal padrão</small>}</td><td><span className={`spreadsheet-validation ${row.issue?'invalid':'valid'}`}>{row.issue||'Pronto para importar'}</span></td></tr>)}{visibleRows.length===0&&<tr><td colSpan={columns.length+4} className="spreadsheet-empty">Nenhum pedido corresponde aos filtros.</td></tr>}</tbody></table></div>
      <div className="spreadsheet-modal-footer"><span>{validCount} válidos de {allRows.length} linhas analisadas</span><div className="modal-actions"><button type="button" className="outline-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={saving||!selectedCount} onClick={onSave}>{saving?'Gravando...':`Gravar ${selectedCount} ${selectedCount===1?'pedido':'pedidos'}`} <ArrowRight size={15}/></button></div></div>
    </>}
  </div></div>;
}
function ClientEmailTemplateModal({client,saving,error,onClose,onSave,onReview}:{client:Client;saving:boolean;error:string;onClose:()=>void;onSave:(recipients:string,cc:string,subject:string,body:string)=>void;onReview:(text:string)=>Promise<string>}) {
  const [recipients,setRecipients]=useState((client.notification_recipients||[]).join(', '));
  const [cc,setCc]=useState((client.notification_cc||[]).join(', '));
  const [subject,setSubject]=useState(client.notification_subject||'Atualização do pedido {{numero_pedido}}');
  const [body,setBody]=useState(client.notification_body||'Olá,\n\nInformamos que o pedido {{numero_pedido}} foi atualizado no portal {{portal}}.\nData de agendamento: {{data_agendamento}}.\n\nAtenciosamente,\nEquipe de Operações');
  const [reviewing,setReviewing]=useState(false);const [reviewError,setReviewError]=useState('');
  async function reviewBody(){if(!body.trim()){setReviewError('Escreva o corpo do e-mail antes de solicitar a revisão.');return;}setReviewing(true);setReviewError('');try{setBody(await onReview(body));}catch(err){setReviewError(err instanceof Error?err.message:'Não foi possível revisar o texto.');}finally{setReviewing(false);}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving&&!reviewing)onClose();}}><div className="modal client-email-modal" role="dialog" aria-modal="true" aria-labelledby="client-email-title"><div className="modal-head"><div><span className="modal-icon"><Mail size={18}/></span><h2 id="client-email-title">E-mail padrão · {client.trade_name}</h2><p>Defina os destinatários e o modelo de mensagem para este cliente.</p></div><button className="icon-button" aria-label="Fechar" disabled={saving||reviewing} onClick={onClose}><X size={18}/></button></div><form onSubmit={event=>{event.preventDefault();onSave(recipients,cc,subject,body);}}><label>Emails responsáveis<input required maxLength={2000} placeholder="responsavel@empresa.com.br, outro@empresa.com.br" value={recipients} onChange={event=>setRecipients(event.target.value)}/><span className="field-hint">Separe os endereços por vírgula, ponto e vírgula ou linha.</span></label><label>Emails em cópia<input maxLength={2000} placeholder="copia@empresa.com.br" value={cc} onChange={event=>setCc(event.target.value)}/><span className="field-hint">Opcional. Também aceita vários endereços.</span></label><label>Título do e-mail<input required maxLength={200} placeholder="Atualização do pedido {{numero_pedido}}" value={subject} onChange={event=>setSubject(event.target.value)}/></label><label>Corpo do e-mail<textarea required maxLength={6000} rows={8} placeholder="Escreva a mensagem padrão..." value={body} onChange={event=>setBody(event.target.value)}/><span className="field-hint">Campos disponíveis: <code>{'{numero_pedido}'}</code>, <code>{'{portal}'}</code> e <code>{'{data_agendamento}'}</code>.</span></label><div className="email-review-row"><button type="button" className="outline-button email-review-button" disabled={reviewing||!body.trim()} onClick={()=>void reviewBody()}><Sparkles size={15}/>{reviewing?'Revisando texto...':'Revisar com IA'}</button><span>O corpo será enviado à IA para revisão; a sugestão pode ser editada antes de salvar.</span></div>{(reviewError||error)&&<div className="login-error">{reviewError||error}</div>}<div className="form-note"><ShieldCheck size={15}/> Este modelo fica salvo na configuração do cliente. O envio automático será ligado em uma etapa futura.</div><div className="modal-actions"><button type="button" className="outline-button" disabled={saving||reviewing} onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving||reviewing}>{saving?'Salvando...':'Salvar e-mail padrão'} <Check size={15}/></button></div></form></div></div>;
}
function Metric({title,value,note,icon,tone,trend}:{title:string;value:string;note:string;icon:React.ReactNode;tone:string;trend:string}) { return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span>{note}</span><span className={`metric-trend ${tone}`}>{tone==='green'?<ArrowUpRight size={13}/>:null}{trend}</span></div></div>; }
function ConfirmedDateCell({value,onSave}:{value:string|null;onSave:(value:string)=>Promise<void>}) {
  const [draft,setDraft]=useState(value?toLocalDateTime(value):'');
  const [saving,setSaving]=useState(false);
  const savedValue=value?toLocalDateTime(value):'';
  const changed=draft!==savedValue;
  useEffect(()=>{if(!changed)setDraft(savedValue);},[savedValue,changed]);
  async function save(){setSaving(true);try{await onSave(draft);}finally{setSaving(false);}}
  return <div className="confirmed-date-cell"><input aria-label="Data confirmada pelo cliente" type="datetime-local" value={draft} onChange={event=>setDraft(event.target.value)} /><button type="button" className="confirmed-date-save" disabled={!changed||saving} onClick={()=>void save()} aria-label="Salvar data confirmada">{saving?'Salvando':<><Check size={13}/> Salvar</>}</button></div>;
}
function PortalCard({name,description,short,tone,href,onClick}:{name:string;description:string;short:string;tone:string;href:string;onClick:()=>void}) { return <button className="portal-card" onClick={onClick}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-info"><strong>{name}</strong><span>{description}</span></div><div className="connected"><span className="footer-dot"/> Ativo</div><ArrowUpRight className="portal-arrow" size={17}/><span className="sr-only">Abrir {href}</span></button>; }
function PortalSetting({name,description,short,tone,active,credentialsConfigured,onToggle,onConfigure,onEdit,onOpen}:{name:Portal;description:string;short:string;tone:string;active:boolean;credentialsConfigured:boolean;onToggle:()=>void;onConfigure:()=>void;onEdit:()=>void;onOpen:()=>void}) { return <article className={`portal-setting-card ${active ? '' : 'inactive'}`}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-setting-copy"><strong>{name}</strong><span>{description}</span><span className={`portal-state ${active ? 'on' : 'off'}`}><i/> {active ? 'Integração ativa' : 'Integração desativada'}</span><span className={`credential-state ${credentialsConfigured ? 'saved' : ''}`}>{credentialsConfigured ? 'Acesso configurado' : 'Acesso não configurado'}</span></div><button className="edit-portal-button" aria-label={`Editar cadastro de ${name}`} onClick={onEdit}><Edit2 size={14}/> Editar</button><button className="configure-portal" aria-label={`Configurar acesso ${name}`} onClick={onConfigure}><Settings2 size={14}/> Configurar</button><button className={`switch ${active ? 'on' : ''}`} role="switch" aria-checked={active} aria-label={`${active ? 'Desativar' : 'Ativar'} ${name}`} onClick={onToggle}><span/></button><button className="portal-open" onClick={onOpen}>Abrir portal <ArrowUpRight size={14}/></button></article>; }
function CredentialModal({portal,alreadyConfigured,saving,error,onClose,onSave}:{portal:Portal;alreadyConfigured:boolean;saving:boolean;error:string;onClose:()=>void;onSave:(portal:Portal,username:string,password:string)=>void}) { const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}><div className="modal"><div className="modal-head"><div><span className="modal-icon"><ShieldCheck size={18}/></span><h2>Configurar {portal}</h2><p>Informe as credenciais usadas para acessar este portal.</p></div><button className="icon-button" onClick={onClose} disabled={saving}><X size={18}/></button></div>{alreadyConfigured&&<div className="credential-note">Já existe um acesso salvo. Preencha os dois campos para substituir as credenciais.</div>}<form onSubmit={e=>{e.preventDefault();onSave(portal,username,password);}}><label>Usuário<input autoComplete="username" required maxLength={500} placeholder="Usuário de acesso ao portal" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Senha<input autoComplete="new-password" type="password" required minLength={1} maxLength={500} placeholder="Senha de acesso ao portal" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="credential-note secure"><ShieldCheck size={15}/> As credenciais serão criptografadas antes de serem armazenadas.</div>{error&&<div className="login-error">{error}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando...':'Salvar acesso'} <Check size={15}/></button></div></form></div></div>; }
function PortalMini({portal,portals}:{portal:Portal;portals:PortalDefinition[]}) { const definition=portals.find(item=>item.name===portal); const tone=definition?.tone||'navy'; const initials=definition?.short||portalInitials(portal); return <span className="portal-mini"><span className={`mini-logo ${tone}`}>{initials}</span>{portal}</span>; }
function portalInitials(name:string) { const parts=name.trim().split(/\s+/); return (parts.length>1?`${parts[0][0]}${parts[1][0]}`:parts[0]?.slice(0,2)||'P').toLocaleUpperCase('pt-BR'); }
function formatReportDate(value:string) { return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
function formatCnpj(value:string) { const normalized=normalizeCnpj(value); return normalized.length===14?`${normalized.slice(0,2)}.${normalized.slice(2,5)}.${normalized.slice(5,8)}/${normalized.slice(8,12)}-${normalized.slice(12)}`:value; }
function toLocalDateTime(value:string) { const date=new Date(value); const pad=(part:number)=>String(part).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function localDateKey(date:Date) { const pad=(part:number)=>String(part).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function Status({status}:{status:Order['status']}) { const cls=status==='Agendado'?'success':status==='Pendente'?'pending':'failed'; const Icon=status==='Agendado'?Check:status==='Pendente'?Clock3:X; return <span className={`status ${cls}`}><Icon size={13}/>{status}</span>; }
function LoginModal({demo,authUnavailable,mode,setMode,onSubmit,toast}:{demo:boolean;authUnavailable:boolean;mode:boolean;setMode:(v:boolean)=>void;onSubmit:(email:string,password:string)=>void;toast:string}) { const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); return <div className="login-backdrop"><div className="login-card"><div className="brand login-brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6}/></div><span>nexo<span className="brand-dot">.</span></span></div><h1>{mode?'Crie sua conta':'Acesse sua conta'}</h1><p>{mode?'Comece a organizar suas integrações.':'Entre para acompanhar suas operações.'}</p>{demo&&<div className="demo-banner">Modo demonstração · configure o Supabase para habilitar contas seguras</div>}{authUnavailable&&<div className="demo-banner">A autenticação ainda não foi configurada para este ambiente. Configure o Supabase antes de liberar o acesso.</div>}<form onSubmit={e=>{e.preventDefault();onSubmit(email,password);}}><label>E-mail<input type="email" required placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required minLength={6} placeholder="Mínimo de 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/></label>{toast && <div className="login-error">{toast}</div>}<button className="primary-button login-submit" type="submit" disabled={authUnavailable}>{mode?'Criar conta':'Entrar'}<ArrowRight size={16}/></button></form><div className="login-switch">{mode?'Já tem uma conta?':'Ainda não tem uma conta?'} <button onClick={()=>setMode(!mode)}>{mode?'Entrar':'Criar conta'}</button></div><div className="login-security"><ShieldCheck size={14}/> Seus dados são protegidos com segurança.</div></div></div>; }
