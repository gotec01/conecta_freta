'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from './lib/supabase';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, ExternalLink, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Truck, X } from 'lucide-react';

type Portal = 'TempoCerto' | 'Trizy' | 'Nexello';
type Module = 'overview' | 'integrations' | 'portals';
const PORTALS: { name: Portal; description: string; short: string; tone: string }[] = [
  { name: 'TempoCerto', description: 'Agendamento de cargas', short: 'TC', tone: 'teal' },
  { name: 'Trizy', description: 'Gestão logística', short: 'T', tone: 'orange' },
  { name: 'Nexello', description: 'Portal de agendamentos', short: 'N', tone: 'navy' },
];
type Order = { id: string; order_number: string; portal: Portal; scheduled_at: string | null; status: 'Agendado' | 'Pendente' | 'Falhou'; created_at: string };

const PORTAL_LINKS: Record<Portal, string> = { TempoCerto: 'https://tempocerto.com/', Trizy: 'https://www.trizy.com.br/', Nexello: 'https://portal.nexello.com.br/' };
const initialOrders: Order[] = [
  { id: '1', order_number: 'PED-2024-0842', portal: 'TempoCerto', scheduled_at: '2026-10-16T09:30:00', status: 'Agendado', created_at: '2026-10-15T09:24:00' },
  { id: '2', order_number: 'PED-2024-0841', portal: 'Trizy', scheduled_at: null, status: 'Pendente', created_at: '2026-10-15T08:52:00' },
  { id: '3', order_number: 'PED-2024-0840', portal: 'Nexello', scheduled_at: '2026-10-15T14:00:00', status: 'Agendado', created_at: '2026-10-15T08:20:00' },
  { id: '4', order_number: 'PED-2024-0839', portal: 'TempoCerto', scheduled_at: null, status: 'Falhou', created_at: '2026-10-14T16:38:00' },
  { id: '5', order_number: 'PED-2024-0838', portal: 'Trizy', scheduled_at: '2026-10-15T16:30:00', status: 'Agendado', created_at: '2026-10-14T15:14:00' },
];

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const demoMode = process.env.NODE_ENV !== 'production' && !supabase;
  const [orders, setOrders] = useState<Order[]>(() => demoMode ? initialOrders : []);
  const [userEmail, setUserEmail] = useState('operacoes@empresa.com');
  const [authenticated, setAuthenticated] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<Module>('overview');
  const [activePortals, setActivePortals] = useState<Record<Portal, boolean>>({ TempoCerto: true, Trizy: true, Nexello: true });
  const [configuredCredentials, setConfiguredCredentials] = useState<Record<Portal, boolean>>({ TempoCerto: false, Trizy: false, Nexello: false });
  const [configPortal, setConfigPortal] = useState<Portal | null>(null);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginMode, setLoginMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [portalFilter, setPortalFilter] = useState('Todos os portais');
  const [statusFilter, setStatusFilter] = useState('Todos os status');
  const [form, setForm] = useState({ number: '', portal: 'TempoCerto' as Portal, date: '' });
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now).toLocaleUpperCase('pt-BR');
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

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
    const { data: portalRows } = await supabase.from('organization_portals').select('portal, active').eq('organization_id', memberships[0].organization_id);
    if (portalRows?.length) setActivePortals(prev => ({ ...prev, ...Object.fromEntries(portalRows.map(row => [row.portal, row.active])) }));
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

  async function addOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!form.number.trim()) return;
    if (!activePortals[form.portal]) { setToast(`Ative o portal ${form.portal} antes de adicionar o pedido.`); return; }
    const newOrder: Order = { id: crypto.randomUUID(), order_number: form.number.trim(), portal: form.portal, scheduled_at: form.date ? new Date(form.date).toISOString() : null, status: 'Pendente', created_at: new Date().toISOString() };
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada. Tente novamente em instantes.'); return; }
      const { data, error } = await supabase.from('orders').insert({ organization_id: organizationId, order_number: newOrder.order_number, portal: newOrder.portal, scheduled_at: newOrder.scheduled_at, status: newOrder.status }).select().single();
      if (error) { setToast(error.message); return; } if (data) newOrder.id = data.id;
    }
    setOrders([newOrder, ...orders]); setShowForm(false); setForm({ number: '', portal: 'TempoCerto', date: '' }); setToast('Pedido adicionado à fila de integração.');
  }

  async function togglePortal(portal: Portal) {
    const nextActive = !activePortals[portal];
    if (supabase && authenticated) {
      if (!organizationId) { setToast('Sua organização ainda está sendo carregada.'); return; }
      const { error } = await supabase.from('organization_portals').upsert({ organization_id: organizationId, portal, active: nextActive }, { onConflict: 'organization_id,portal' });
      if (error) { setToast(error.message); return; }
    }
    setActivePortals(prev => ({ ...prev, [portal]: nextActive }));
    if (!nextActive && form.portal === portal) { const replacement = PORTALS.find(item => item.name !== portal && activePortals[item.name]); if (replacement) setForm(prev => ({ ...prev, portal: replacement.name })); }
    setToast(`${portal} ${nextActive ? 'ativado' : 'desativado'}.`);
    if (nextActive && !activePortals[form.portal]) setForm(prev => ({ ...prev, portal }));
  }

  function publish(order: Order) { if (!activePortals[order.portal]) { setToast(`Ative o portal ${order.portal} antes de publicar.`); return; } window.open(PORTAL_LINKS[order.portal], '_blank', 'noopener,noreferrer'); setToast(`Portal ${order.portal} aberto. Conclua o agendamento no painel do portal.`); }
  const filtered = orders.filter(o => (o.order_number.toLowerCase().includes(query.toLowerCase()) || o.portal.toLowerCase().includes(query.toLowerCase())) && (portalFilter === 'Todos os portais' || o.portal === portalFilter) && (statusFilter === 'Todos os status' || o.status === statusFilter));
  const scheduledCount = orders.filter(o => o.status === 'Agendado').length;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6}/></div><span>nexo<span className="brand-dot">.</span></span></div>
      <div className="workspace-switch"><div className="workspace-icon">AC</div><div className="workspace-copy"><strong>Acme Cargas</strong><small>Plano inicial</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav><button className={`nav-item ${activeModule === 'overview' ? 'active' : ''}`} onClick={() => setActiveModule('overview')}><LayoutDashboard size={18}/>Visão geral</button><button className={`nav-item ${activeModule === 'integrations' ? 'active' : ''}`} onClick={() => setActiveModule('integrations')}><Truck size={18}/>Integrações<span className="nav-count">{orders.length}</span></button><button className={`nav-item ${activeModule === 'portals' ? 'active' : ''}`} onClick={() => setActiveModule('portals')}><Settings2 size={18}/>Portais</button></nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Precisa de ajuda?</strong><p>Estamos aqui para ajudar você a começar.</p><button onClick={() => setToast('Em breve: central de ajuda.')}>Falar com suporte <ArrowRight size={14}/></button></div><button className="profile" onClick={() => authenticated ? void signOut() : setLoginOpen(true)}><div className="avatar">{userEmail.slice(0,1).toUpperCase()}</div><div className="profile-copy"><strong>{userEmail.split('@')[0]}</strong><small>{userEmail}</small></div>{authenticated ? <LogOut size={16}/> : <Settings2 size={17}/>}</button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb"><Menu className="mobile-menu" size={20}/><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeModule === 'overview' ? 'Visão geral' : activeModule === 'integrations' ? 'Integrações' : 'Portais'}</strong></div><div className="top-actions"><div className="secure-pill"><ShieldCheck size={14}/> Ambiente seguro</div><button className="icon-button" aria-label="Ajuda" onClick={() => setToast('Central de ajuda em breve.')}><CircleHelp size={18}/></button><div className="top-avatar">{userEmail.slice(0,1).toUpperCase()}</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {dateLabel}</div><h1>{activeModule === 'overview' ? <>{greeting}, {userEmail.split('@')[0].split('.')[0]} <span className="wave">✳</span></> : activeModule === 'integrations' ? 'Integrações' : 'Portais'} </h1><p className="subtitle">{activeModule === 'overview' ? 'Acompanhe os principais indicadores da sua operação.' : activeModule === 'integrations' ? 'Gerencie seus pedidos e acompanhe os agendamentos.' : 'Ative somente os portais que sua empresa utiliza.'}</p></div>{activeModule === 'integrations' && <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={17}/> Novo pedido</button>}</div>
        {activeModule === 'overview' && <div className="metric-grid">
          <Metric title="Pedidos no total" value={String(orders.length).padStart(2,'0')} note="na sua fila de integração" icon={<Truck size={17}/>} tone="blue" trend="Fila atual"/>
          <Metric title="Agendados" value={String(scheduledCount).padStart(2,'0')} note="pedidos confirmados" icon={<Check size={17}/>} tone="green" trend={`${orders.length ? Math.round(scheduledCount/orders.length*100) : 0}%`}/>
          <Metric title="Aguardando ação" value={String(orders.filter(o => o.status === 'Pendente').length).padStart(2,'0')} note="prontos para publicar" icon={<Clock3 size={17}/>} tone="amber" trend="Ação necessária"/>
          <Metric title="Portais ativos" value={String(Object.values(activePortals).filter(Boolean).length).padStart(2,'0')} note="habilitados para operar" icon={<Activity size={17}/>} tone="violet" trend="de 3 portais"/>
        </div>}
        {activeModule === 'integrations' && <section className="orders-section module-orders" id="orders"><div className="section-heading order-title"><div><h2>Pedidos</h2><p>Consulte e publique pedidos nos portais ativos.</p></div><button className="active-summary clickable" onClick={() => setActiveModule('portals')}><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} portais ativos <ArrowRight size={14}/></button></div>
          <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar pedido ou portal..."/></div><div className="filters"><select value={portalFilter} onChange={e => setPortalFilter(e.target.value)}><option>Todos os portais</option>{PORTALS.map(portal => <option key={portal.name}>{portal.name}</option>)}</select><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Todos os status</option><option>Agendado</option><option>Pendente</option><option>Falhou</option></select></div></div>
            <div className="table-scroll"><table><thead><tr><th>PEDIDO</th><th>PORTAL</th><th>DATA AGENDADA</th><th>STATUS</th><th className="action-head">AÇÃO</th></tr></thead><tbody>{filtered.map(order => <tr key={order.id}><td><strong className="order-number">{order.order_number}</strong><small className="order-sub">Adicionado em {new Date(order.created_at).toLocaleDateString('pt-BR')}</small></td><td><PortalMini portal={order.portal}/></td><td>{order.scheduled_at ? <span className="date-cell"><CalendarDays size={15}/>{new Date(order.scheduled_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span> : <span className="muted">Não definido</span>}</td><td><Status status={order.status}/></td><td><button className="publish-button" onClick={() => publish(order)} disabled={!activePortals[order.portal]}><ExternalLink size={14}/> {activePortals[order.portal] ? 'Publicar' : 'Desativado'}</button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">Nenhum pedido encontrado.</div>}</div>
            <div className="table-footer"><span>Mostrando <strong>{filtered.length}</strong> de <strong>{orders.length}</strong> pedidos</span><button className="see-all" onClick={() => { setQuery(''); setPortalFilter('Todos os portais'); setStatusFilter('Todos os status'); }}>Limpar filtros <ArrowRight size={14}/></button></div>
          </div>
        </section>}
        {activeModule === 'portals' && <section className="portal-settings"><div className="section-heading"><div><h2>Conexões disponíveis</h2><p>Desative temporariamente um portal sem remover os pedidos já cadastrados.</p></div><span className="active-summary"><span className="footer-dot"/> {Object.values(activePortals).filter(Boolean).length} de 3 ativos</span></div><div className="portal-settings-grid">{PORTALS.map(portal => <PortalSetting key={portal.name} {...portal} active={activePortals[portal.name]} credentialsConfigured={configuredCredentials[portal.name]} onToggle={() => void togglePortal(portal.name)} onConfigure={() => { setConfigPortal(portal.name); setCredentialError(''); }} onOpen={() => window.open(PORTAL_LINKS[portal.name], '_blank', 'noopener,noreferrer')}/>)}</div><div className="portal-info-note"><ShieldCheck size={17}/><span>Quando um portal estiver desativado, ele não poderá ser selecionado em novos pedidos e a publicação ficará indisponível. Os pedidos existentes serão mantidos.</span></div></section>}
        <footer className="footer"><span>© 2026 Nexo. Integrações simples, operações mais leves.</span><span><span className="footer-dot"/> Todos os sistemas operacionais <span className="footer-sep">·</span> v0.1.0</span></footer>
      </div>
    </section>
    {configPortal && <CredentialModal portal={configPortal} alreadyConfigured={configuredCredentials[configPortal]} saving={savingCredentials} error={credentialError} onClose={() => setConfigPortal(null)} onSave={savePortalCredentials}/>}
    {showForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}><div className="modal"><div className="modal-head"><div><span className="modal-icon"><Plus size={18}/></span><h2>Adicionar pedido</h2><p>Informe os dados para preparar a integração.</p></div><button className="icon-button" onClick={() => setShowForm(false)}><X size={18}/></button></div><form onSubmit={addOrder}><label>Número do pedido<input required placeholder="Ex.: PED-2024-0843" value={form.number} onChange={e => setForm({...form,number:e.target.value})}/></label><label>Portal de integração<select required value={form.portal} onChange={e => setForm({...form,portal:e.target.value as Portal})}>{PORTALS.filter(portal => activePortals[portal.name]).map(portal => <option key={portal.name}>{portal.name}</option>)}</select></label><label>Data e hora agendada <span className="optional">Opcional</span><input type="datetime-local" value={form.date} onChange={e => setForm({...form,date:e.target.value})}/></label><div className="form-note"><Activity size={15}/> Seu pedido será salvo como pendente até a publicação no portal.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary-button" type="submit">Adicionar pedido <ArrowRight size={16}/></button></div></form></div></div>}
    {loginOpen && <LoginModal demo={demoMode} authUnavailable={!supabase && !demoMode} mode={loginMode} setMode={setLoginMode} onSubmit={signIn} toast={toast}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </main>;
}

function Metric({title,value,note,icon,tone,trend}:{title:string;value:string;note:string;icon:React.ReactNode;tone:string;trend:string}) { return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span>{note}</span><span className={`metric-trend ${tone}`}>{tone==='green'?<ArrowUpRight size={13}/>:null}{trend}</span></div></div>; }
function PortalCard({name,description,short,tone,href,onClick}:{name:string;description:string;short:string;tone:string;href:string;onClick:()=>void}) { return <button className="portal-card" onClick={onClick}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-info"><strong>{name}</strong><span>{description}</span></div><div className="connected"><span className="footer-dot"/> Ativo</div><ArrowUpRight className="portal-arrow" size={17}/><span className="sr-only">Abrir {href}</span></button>; }
function PortalSetting({name,description,short,tone,active,credentialsConfigured,onToggle,onConfigure,onOpen}:{name:Portal;description:string;short:string;tone:string;active:boolean;credentialsConfigured:boolean;onToggle:()=>void;onConfigure:()=>void;onOpen:()=>void}) { return <article className={`portal-setting-card ${active ? '' : 'inactive'}`}><div className={`portal-logo ${tone}`}>{short}</div><div className="portal-setting-copy"><strong>{name}</strong><span>{description}</span><span className={`portal-state ${active ? 'on' : 'off'}`}><i/> {active ? 'Integração ativa' : 'Integração desativada'}</span><span className={`credential-state ${credentialsConfigured ? 'saved' : ''}`}>{credentialsConfigured ? 'Acesso configurado' : 'Acesso não configurado'}</span></div><button className="configure-portal" aria-label={`Configurar acesso ${name}`} onClick={onConfigure}><Settings2 size={14}/> Configurar</button><button className={`switch ${active ? 'on' : ''}`} role="switch" aria-checked={active} aria-label={`${active ? 'Desativar' : 'Ativar'} ${name}`} onClick={onToggle}><span/></button><button className="portal-open" onClick={onOpen}>Abrir portal <ArrowUpRight size={14}/></button></article>; }
function CredentialModal({portal,alreadyConfigured,saving,error,onClose,onSave}:{portal:Portal;alreadyConfigured:boolean;saving:boolean;error:string;onClose:()=>void;onSave:(portal:Portal,username:string,password:string)=>void}) { const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}><div className="modal"><div className="modal-head"><div><span className="modal-icon"><ShieldCheck size={18}/></span><h2>Configurar {portal}</h2><p>Informe as credenciais usadas para acessar este portal.</p></div><button className="icon-button" onClick={onClose} disabled={saving}><X size={18}/></button></div>{alreadyConfigured&&<div className="credential-note">Já existe um acesso salvo. Preencha os dois campos para substituir as credenciais.</div>}<form onSubmit={e=>{e.preventDefault();onSave(portal,username,password);}}><label>Usuário<input autoComplete="username" required maxLength={500} placeholder="Usuário de acesso ao portal" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Senha<input autoComplete="new-password" type="password" required minLength={1} maxLength={500} placeholder="Senha de acesso ao portal" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="credential-note secure"><ShieldCheck size={15}/> As credenciais serão criptografadas antes de serem armazenadas.</div>{error&&<div className="login-error">{error}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando...':'Salvar acesso'} <Check size={15}/></button></div></form></div></div>; }
function PortalMini({portal}:{portal:Portal}) { const tone=portal==='TempoCerto'?'teal':portal==='Trizy'?'orange':'navy'; const initials=portal==='TempoCerto'?'TC':portal==='Trizy'?'T':'N'; return <span className="portal-mini"><span className={`mini-logo ${tone}`}>{initials}</span>{portal}</span>; }
function Status({status}:{status:Order['status']}) { const cls=status==='Agendado'?'success':status==='Pendente'?'pending':'failed'; const Icon=status==='Agendado'?Check:status==='Pendente'?Clock3:X; return <span className={`status ${cls}`}><Icon size={13}/>{status}</span>; }
function LoginModal({demo,authUnavailable,mode,setMode,onSubmit,toast}:{demo:boolean;authUnavailable:boolean;mode:boolean;setMode:(v:boolean)=>void;onSubmit:(email:string,password:string)=>void;toast:string}) { const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); return <div className="login-backdrop"><div className="login-card"><div className="brand login-brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6}/></div><span>nexo<span className="brand-dot">.</span></span></div><h1>{mode?'Crie sua conta':'Acesse sua conta'}</h1><p>{mode?'Comece a organizar suas integrações.':'Entre para acompanhar suas operações.'}</p>{demo&&<div className="demo-banner">Modo demonstração · configure o Supabase para habilitar contas seguras</div>}{authUnavailable&&<div className="demo-banner">A autenticação ainda não foi configurada para este ambiente. Configure o Supabase antes de liberar o acesso.</div>}<form onSubmit={e=>{e.preventDefault();onSubmit(email,password);}}><label>E-mail<input type="email" required placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required minLength={6} placeholder="Mínimo de 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/></label>{toast && <div className="login-error">{toast}</div>}<button className="primary-button login-submit" type="submit" disabled={authUnavailable}>{mode?'Criar conta':'Entrar'}<ArrowRight size={16}/></button></form><div className="login-switch">{mode?'Já tem uma conta?':'Ainda não tem uma conta?'} <button onClick={()=>setMode(!mode)}>{mode?'Entrar':'Criar conta'}</button></div><div className="login-security"><ShieldCheck size={14}/> Seus dados são protegidos com segurança.</div></div></div>; }
