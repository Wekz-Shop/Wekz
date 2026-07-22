/* ════════════════════════════════════════════════════════════════════════
   wkz-admin.js — WeKz Shop Admin Matrix
   Requer: wkz-bus.js, wkz-core.js (carregados ANTES deste arquivo).
   Sprint M4 — Admin Matrix. Extração cirúrgica de
   WeKzShop_v2_9_36_CORRIGIDO.html — Zero Rewrite.

   NOTA IMPORTANTE: esta é a SEGUNDA tentativa de Sprint M4. A primeira
   versão (não veio deste histórico de extração) continha código
   inventado do zero — mesmos nomes de função, lógica/dados totalmente
   diferentes do monólito real (confirmado comparando syncOverviewKPIs,
   ADMIN_DISPUTES, validateCNPJ linha a linha). Foi descartada por
   completo. Esta versão segue o mesmo processo cirúrgico de M1-M3, com
   origem de linha citada em cada bloco.
   ════════════════════════════════════════════════════════════════════════ */

/* ── 4.1: Navegação Admin + Aprovação de Lojas ───────────────────────────
   window.currentAdminUser (placeholder — "preenchido após autenticação
   real", conforme o próprio comentário do monólito), switchAdminTab,
   ADMIN_STORES, renderAdminStores, admSyncStoreBadge/ReportBadge,
   admApproveStore, admRejectStore.
   Origem monólito: linhas 38723–38938
   ─────────────────────────────────────────────────────────────────────── */
/* ════════════════════════════════════════════════════════════
   WEKZ ADMIN DASHBOARD — JavaScript v1.0.0
   • showPage('admin-dashboard') — função de navegação
   • switchAdminTab() — troca de abas + scroll-to-top + nav fade
   • renderAdminStores() / renderAdminReports() / renderAdminKyc() — listagens dinâmicas
   • admSyncStoreBadge() / admSyncReportBadge() / admSyncKycBadge() — sincronia de contadores
   • Kz wisdom para admin
   FIX BUG-ADM01: DEV BYPASS removido — acesso ao painel requer
   autenticação real via back-end (/api/auth/admin).
   ════════════════════════════════════════════════════════════ */

/* ── Dados de usuário admin (preenchidos após autenticação real) ── */
window.currentAdminUser = {
  nome:    'Admin WeKz',
  role:    'superadmin',
  avatar:  'A',
};

/* ── switchAdminTab ── */
function switchAdminTab(tab, el) {
  document.querySelectorAll('.adm-panel').forEach(p => p.style.display = 'none');
  const target = document.getElementById('adm-' + tab);
  if (target) { target.style.display = 'block'; target.classList.add('active'); }

  document.querySelectorAll('.adm-nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  // Scroll painel ao topo a cada troca de aba
  const mainEl = document.getElementById('admMain');
  if (mainEl) mainEl.scrollTop = 0;

  // Atualiza fade do nav carousel (fix: chamada direta evita problema de ordering dos patches)
  setTimeout(admNavFadeInit, 30);

  // Lazy render
  if (tab === 'store-approval')    renderAdminStores();
  if (tab === 'kyc')               renderAdminKyc();
  if (tab === 'product-reports')  renderAdminReports();
  if (tab === 'comunicados')      renderCommHistory();
  if (tab === 'seguranca')        renderSecurityPanel();
}

/* Estado do filtro de stores ativo */
let _admStoresActiveFilter = 'all';

/* ── filterAdminStores ── */
function filterAdminStores(filter, btn) {
  _admStoresActiveFilter = filter;
  document.querySelectorAll('#adm-store-approval .adm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminStores(filter);
}

/* ── filterAdminReports ── */
function filterAdminReports(filter, btn) {
  document.querySelectorAll('#adm-product-reports .adm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminReports(filter);
}

/* ── Dados simulados: Lojas pendentes ── */
const ADMIN_STORES = [
  { id:'ST001', avatar:'🛋️', name:'Casa Moderna Decor', owner:'Tatiana M.', cnpj:'12.345.678/0001-90', cat:'Casa & Decoração', date:'20/05/2025', status:'pending',  docs: true },
  { id:'ST002', avatar:'👗', name:'Moda Exclusiva BR',  owner:'Rodrigo F.', cnpj:'98.765.432/0001-11', cat:'Moda & Vestuário',  date:'19/05/2025', status:'pending',  docs: true },
  { id:'ST003', avatar:'💄', name:'GlowBeauty Shop',    owner:'Camila S.',  cnpj:'Pendente envio',    cat:'Beleza & Saúde',   date:'19/05/2025', status:'docs',     docs: false },
  { id:'ST004', avatar:'🎮', name:'GameZone Brasil',    owner:'Lucas P.',   cnpj:'34.512.890/0001-44', cat:'Games & Consoles',  date:'18/05/2025', status:'pending',  docs: true },
  { id:'ST005', avatar:'📱', name:'TechParts Direct',   owner:'Ana B.',     cnpj:'67.234.901/0001-22', cat:'Eletrônicos',       date:'18/05/2025', status:'pending',  docs: true },
  { id:'ST006', avatar:'🐾', name:'PetLife Store',      owner:'Fernanda K.',cnpj:'Pendente envio',    cat:'Pet Shop',          date:'17/05/2025', status:'docs',     docs: false },
  { id:'ST007', avatar:'🚗', name:'AutoPeças Online',   owner:'Marco A.',   cnpj:'11.098.765/0001-33', cat:'Automotivo',        date:'17/05/2025', status:'pending',  docs: true },
];

function renderAdminStores(filter = 'all') {
  _admStoresActiveFilter = filter;
  const list = document.getElementById('admStoreList');
  if (!list) return;
  let data = [...ADMIN_STORES];
  if (filter !== 'all') data = data.filter(s => s.status === filter);

  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">✅ Nenhuma loja nesta categoria no momento.</div>';
    return;
  }

  list.innerHTML = data.map(s => `
    <div class="adm-store-card" id="admStore_${s.id}" data-sid="${s.id}">
      <div class="adm-store-avatar">${s.avatar}</div>
      <div class="adm-store-info">
        <div class="adm-store-name">${s.name} <span style="font-size:10px;color:var(--muted);font-weight:500;">#${s.id}</span></div>
        <div class="adm-store-meta"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;opacity:0.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${s.owner} · CNPJ: <em style="color:${s.docs?'var(--teal)':'#EF4444'}">${s.cnpj}</em> · Solicitado em ${s.date}</div>
        <div class="adm-store-tags">
          <span class="adm-tag ${s.status === 'pending' ? 'adm-tag-pending' : 'adm-tag-docs'}">${s.status === 'pending' ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Aguardando Aprovação' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Documentação Incompleta'}</span>
          <span class="adm-tag adm-tag-cat">${s.cat}</span>
        </div>
      </div>
      <div class="adm-store-actions">
        <button class="adm-btn-view" data-saction="docs" data-sid="${s.id}">Ver Docs</button>
        ${s.docs ? `<button class="adm-btn-approve" data-saction="approve" data-sid="${s.id}">Aprovar</button>` : `<button class="adm-btn-view" data-saction="requestdocs" data-sid="${s.id}">Solicitar Docs</button>`}
        <button class="adm-btn-reject" data-saction="reject" data-sid="${s.id}">✕ Recusar</button>
      </div>
    </div>`).join('');

  /* Delegação de eventos para stores — evita problemas de nomes com caracteres especiais */
  list.onclick = function(e) {
    const btn = e.target.closest('[data-saction]');
    if (!btn) return;
    const action = btn.dataset.saction;
    const sid    = btn.dataset.sid;
    const store  = ADMIN_STORES.find(s => s.id === sid);
    if (!store) return;
    if (action === 'approve')     admApproveStore(sid, store.name);
    if (action === 'reject')      admRejectStore(sid, store.name);
    if (action === 'docs')        showToast('📋 Abrindo dossiê da loja ' + store.name + '...');
    if (action === 'requestdocs') { showToast('📨 E-mail enviado para ' + store.owner); admAuditAdd('🏪', 'Loja "' + store.name + '" — solicitação de documentos enviada', 'Admin WeKz'); }
  };
}

/* ── admSyncStoreBadge: atualiza badge nav, KPI overview e contadores de filtro ── */
function admSyncStoreBadge() {
  const total   = ADMIN_STORES.length;
  const pending = ADMIN_STORES.filter(s => s.status === 'pending').length;
  const docs    = ADMIN_STORES.filter(s => s.status === 'docs').length;

  // Nav badge
  const nb = document.getElementById('navBadgeStores');
  if (nb) { nb.textContent = total; nb.style.display = total > 0 ? '' : 'none'; }

  // KPI overview
  const kpi = document.getElementById('kpiStoresNum');
  if (kpi) kpi.textContent = total;

  // Sub título da aba
  const sub = document.getElementById('storeApprovalSub');
  if (sub) sub.textContent = total + ' solicitaç' + (total === 1 ? 'ão aguardando revisão' : 'ões aguardando revisão');

  // Contadores dos filtros
  const all = document.getElementById('countStoresAll');    if (all) all.textContent = total;
  const pen = document.getElementById('countStoresPending');if (pen) pen.textContent = pending;
  const doc = document.getElementById('countStoresDocs');   if (doc) doc.textContent = docs;
}


/* ── admSyncReportBadge: atualiza badge nav, KPI overview e contadores de filtro ── */
function admSyncReportBadge() {
  const urgent = ADMIN_REPORTS.filter(r => r.severity === 'urgent').length;
  const review = ADMIN_REPORTS.filter(r => r.severity === 'review').length;
  const total  = urgent + review;

  // Nav badge
  const nb = document.getElementById('navBadgeReports');
  if (nb) { nb.textContent = urgent; nb.style.display = urgent > 0 ? '' : 'none'; }

  // KPI overview
  const kpi = document.getElementById('kpiReportsNum');
  if (kpi) kpi.textContent = urgent;

  // Sub título da aba
  const sub = document.getElementById('reportsApprovalSub');
  if (sub) sub.textContent = urgent + ' produto' + (urgent === 1 ? ' requer' : 's requerem') + ' ação imediata · ' + review + ' em análise';

  // Contadores dos filtros
  const all = document.getElementById('countReportsAll');    if (all) all.textContent = total;
  const urg = document.getElementById('countReportsUrgent'); if (urg) urg.textContent = urgent;
  const rev = document.getElementById('countReportsReview'); if (rev) rev.textContent = review;
}

function admApproveStore(id, name) {
  const idx = ADMIN_STORES.findIndex(s => s.id === id);
  if (idx !== -1) ADMIN_STORES.splice(idx, 1);
  const card = document.getElementById('admStore_' + id);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
    setTimeout(() => { card.remove(); renderAdminStores(_admStoresActiveFilter); }, 400);
  } else {
    renderAdminStores(_admStoresActiveFilter);
  }
  admSyncStoreBadge();
  admAuditAdd('✅', 'Loja "' + name + '" aprovada', 'Admin WeKz');
  showToast('✅ Loja "' + name + '" aprovada! Vendedor notificado por e-mail.');
  /* [v1.9.0] Actualiza mock supplier user status → desbloqueia Painel do Fornecedor */
  if (typeof window.spdSetApprovalStatus === 'function') {
    window.spdSetApprovalStatus('approved');
  }
}

function admRejectStore(id, name) {
  const idx = ADMIN_STORES.findIndex(s => s.id === id);
  if (idx !== -1) ADMIN_STORES.splice(idx, 1);
  const card = document.getElementById('admStore_' + id);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';
    setTimeout(() => { card.remove(); renderAdminStores(_admStoresActiveFilter); }, 400);
  } else {
    renderAdminStores(_admStoresActiveFilter);
  }
  admSyncStoreBadge();
  admAuditAdd('🚫', 'Loja "' + name + '" recusada', 'Admin WeKz');
  showToast('❌ Loja "' + name + '" recusada. Vendedor notificado.');
  /* [v1.9.0] Actualiza mock supplier user status → mostra tela de rejeição */
  if (typeof window.spdSetApprovalStatus === 'function') {
    window.spdSetApprovalStatus('rejected');
  }
}

/* ══════════════════════════════════════════════════════════════
   MÓDULO: KYC/KYB — Painel Admin (v2.9.5)
   ─────────────────────────────────────────────────────────────
   Fila de verificações de identidade/empresa enviadas no
   onboarding de vendedores (ver WkzKYC, seller-side). O time de
   compliance da WeKz revisa aqui os dados extraídos por OCR, o
   score de risco e aprova/recusa a abertura da loja.
   ══════════════════════════════════════════════════════════════ */


/* ── 4.2: Revisão de KYC + Denúncias/Moderação ───────────────────────────
   ADMIN_KYC, renderAdminKyc, openKycReview, admApproveKyc/RejectKyc,
   admRequestMoreKycDocs, ADMIN_REPORTS, renderAdminReports, admTakedown,
   admNotifyStore, admInvestigate. Esta é a peça que faltava para a aba
   "Denúncias" do Seller (M3) ter dados — revisão fica no Admin, exibição
   fica no Seller (não integrado ainda, ver changelog).
   Origem monólito: linhas 38939–39295
   ─────────────────────────────────────────────────────────────────────── */
const KYC_STATUS_LABEL = {
  'pending':      { label: 'Aguardando Análise', tagClass: 'adm-tag-pending' },
  'under-review': { label: 'Em Análise',         tagClass: 'adm-tag-docs' },
  'approved':     { label: 'Aprovado',           tagClass: 'adm-tag-kyc-approved' },
  'rejected':     { label: 'Recusado',           tagClass: 'adm-tag-kyc-rejected' }
};
const KYC_RISK_LABEL = { baixo: 'Risco Baixo', medio: 'Risco Médio', alto: 'Risco Alto' };

/* ── Dados simulados: fila de verificação KYC/KYB ── */
const ADMIN_KYC = [
  {
    id: 'KYC001', protocol: 'PROTO-KYC-20260615093244-7F3A2C',
    avatar: '🛋️', vendorName: 'Casa Moderna Decor Ltda', ownerName: 'Tatiana Mendes',
    type: 'PJ', cpfCnpj: '12.345.678/0001-90', date: '15/06/2026',
    status: 'pending', risk: 'baixo', riskScore: 24,
    docs: {
      rg:          { confidence: 96, data: { nome: 'Tatiana Mendes', cpf: '234.567.891-22', validade: '14/08/2031' } },
      cnpj:        { confidence: 91, data: { razaoSocial: 'Casa Moderna Decor Ltda', cnpj: '12.345.678/0001-90', constituicao: '02/03/2019', atividade: 'Comércio varejista de artigos de decoração' } },
      comprovante: { confidence: 88, data: { endereco: 'Av. Paulista, 1500 - sala 12', cidade: 'São Paulo/SP', cep: '01310-200' } }
    }
  },
  {
    id: 'KYC002', protocol: 'PROTO-KYC-20260614161002-A19DE4',
    avatar: '📱', vendorName: 'TechParts Direct', ownerName: 'Ana Beatriz Lopes',
    type: 'PJ', cpfCnpj: '67.234.901/0001-22', date: '14/06/2026',
    status: 'under-review', risk: 'medio', riskScore: 52,
    docs: {
      rg:          { confidence: 93, data: { nome: 'Ana Beatriz Lopes', cpf: '112.334.556-09', validade: '02/11/2029' } },
      cnpj:        { confidence: 79, data: { razaoSocial: 'TechParts Direct Importação Ltda', cnpj: '67.234.901/0001-22', constituicao: '18/01/2026', atividade: 'Comércio atacadista de componentes eletrônicos' } },
      comprovante: { confidence: 85, data: { endereco: 'Rua Vergueiro, 880 - cj 4', cidade: 'São Paulo/SP', cep: '01504-000' } }
    }
  },
  {
    id: 'KYC003', protocol: 'PROTO-KYC-20260613084511-9C0B71',
    avatar: '🎮', vendorName: 'GameZone Brasil', ownerName: 'Lucas Pereira',
    type: 'PJ', cpfCnpj: '34.512.890/0001-44', date: '13/06/2026',
    status: 'pending', risk: 'baixo', riskScore: 18,
    docs: {
      rg:          { confidence: 98, data: { nome: 'Lucas Pereira', cpf: '345.667.123-87', validade: '20/05/2030' } },
      cnpj:        { confidence: 95, data: { razaoSocial: 'GameZone Brasil Comércio Eletrônico Ltda', cnpj: '34.512.890/0001-44', constituicao: '09/07/2017', atividade: 'Comércio varejista de jogos e consoles' } },
      comprovante: { confidence: 90, data: { endereco: 'Rua Augusta, 2200', cidade: 'São Paulo/SP', cep: '01412-100' } }
    }
  },
  {
    id: 'KYC004', protocol: 'PROTO-KYC-20260610112309-1144D8',
    avatar: '🧴', vendorName: 'BeautySecret Store', ownerName: 'Patrícia Nunes',
    type: 'PJ', cpfCnpj: '21.908.733/0001-05', date: '10/06/2026',
    status: 'under-review', risk: 'alto', riskScore: 81,
    docs: {
      rg:          { confidence: 87, data: { nome: 'Patrícia Nunes', cpf: '556.778.234-11', validade: '11/02/2027' } },
      cnpj:        { confidence: 62, data: { razaoSocial: 'BeautySecret Comércio Ltda', cnpj: '21.908.733/0001-05', constituicao: '03/04/2026', atividade: 'Comércio varejista de cosméticos' } },
      comprovante: { confidence: 70, data: { endereco: 'Rua das Perobas, 91', cidade: 'Guarulhos/SP', cep: '07034-000' } }
    }
  },
  {
    id: 'KYC005', protocol: 'PROTO-KYC-20260605143012-5E27AB',
    avatar: '🐾', vendorName: 'PetLife Store', ownerName: 'Fernanda Köhler',
    type: 'PJ', cpfCnpj: '55.678.234/0001-67', date: '05/06/2026',
    status: 'approved', risk: 'baixo', riskScore: 20,
    docs: {
      rg:          { confidence: 97, data: { nome: 'Fernanda Köhler', cpf: '667.889.345-65', validade: '15/09/2032' } },
      cnpj:        { confidence: 94, data: { razaoSocial: 'PetLife Comércio de Produtos Pet Ltda', cnpj: '55.678.234/0001-67', constituicao: '22/06/2015', atividade: 'Comércio varejista de animais vivos e artigos pet' } },
      comprovante: { confidence: 92, data: { endereco: 'Av. Brigadeiro Faria Lima, 3477', cidade: 'São Paulo/SP', cep: '04538-133' } }
    }
  },
  {
    id: 'KYC006', protocol: 'PROTO-KYC-20260602100455-3DC912',
    avatar: '👟', vendorName: 'FashionClone Shop', ownerName: 'Marcelo Tavares',
    type: 'PJ', cpfCnpj: '09.123.445/0001-88', date: '02/06/2026',
    status: 'rejected', risk: 'alto', riskScore: 93,
    docs: {
      rg:          { confidence: 71, data: { nome: 'Marcelo Tavares', cpf: '778.990.456-33', validade: '08/01/2026' } },
      cnpj:        { confidence: 41, data: { razaoSocial: 'FashionClone Comércio Ltda', cnpj: '09.123.445/0001-88', constituicao: '11/05/2026', atividade: 'Comércio varejista de calçados' } },
      comprovante: { confidence: 55, data: { endereco: 'Rua XV de Novembro, 45', cidade: 'Curitiba/PR', cep: '80020-310' } }
    }
  }
];

let _admKycActiveFilter = 'all';

/* ── Render lista de verificações KYC ── */
function renderAdminKyc(filter) {
  _admKycActiveFilter = filter || _admKycActiveFilter;
  const list = document.getElementById('admKycList');
  if (!list) return;

  let data = [...ADMIN_KYC];
  if (_admKycActiveFilter !== 'all') data = data.filter(k => k.status === _admKycActiveFilter);

  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">✅ Nenhuma verificação nesta categoria.</div>';
    return;
  }

  list.innerHTML = data.map(k => {
    const st = KYC_STATUS_LABEL[k.status] || KYC_STATUS_LABEL.pending;
    const docsOk = [k.docs.rg, k.docs.cnpj, k.docs.comprovante].filter(Boolean).length;
    const actionable = k.status === 'pending' || k.status === 'under-review';
    return `
    <div class="adm-store-card" id="admKyc_${k.id}" data-kid="${k.id}">
      <div class="adm-store-avatar">${k.avatar}</div>
      <div class="adm-store-info">
        <div class="adm-store-name">${k.vendorName} <span style="font-size:10px;color:var(--muted);font-weight:500;">#${k.id}</span></div>
        <div class="adm-store-meta"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;opacity:0.7"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg> ${k.ownerName} · ${k.type}: <em style="color:var(--teal)">${k.cpfCnpj}</em> · Protocolo ${k.protocol} · ${docsOk}/3 docs · Enviado em ${k.date}</div>
        <div class="adm-store-tags">
          <span class="adm-tag ${st.tagClass}">${st.label}</span>
          <span class="adm-tag adm-tag-risk-${k.risk}">${KYC_RISK_LABEL[k.risk]} (${k.riskScore})</span>
        </div>
      </div>
      <div class="adm-store-actions">
        <button class="adm-btn-view" data-kaction="review" data-kid="${k.id}">🔍 Revisar Documentos</button>
        ${actionable ? `<button class="adm-btn-approve" data-kaction="approve" data-kid="${k.id}">Aprovar</button><button class="adm-btn-reject" data-kaction="reject" data-kid="${k.id}">✕ Recusar</button>` : ''}
      </div>
    </div>`;
  }).join('');

  /* Delegação de eventos — evita problemas com nomes/aspas especiais */
  list.onclick = function(e) {
    const btn = e.target.closest('[data-kaction]');
    if (!btn) return;
    const action = btn.dataset.kaction;
    const kid    = btn.dataset.kid;
    const k = ADMIN_KYC.find(x => x.id === kid);
    if (!k) return;
    if (action === 'review')  openKycReview(kid);
    if (action === 'approve') admApproveKyc(kid);
    if (action === 'reject')  admRejectKyc(kid);
  };
}

function filterAdminKyc(filter, btn) {
  document.querySelectorAll('#adm-kyc .adm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminKyc(filter);
}

/* ── admSyncKycBadge: atualiza badge nav, KPI overview, subtítulo e contadores ── */
function admSyncKycBadge() {
  const pending  = ADMIN_KYC.filter(k => k.status === 'pending').length;
  const review   = ADMIN_KYC.filter(k => k.status === 'under-review').length;
  const approved = ADMIN_KYC.filter(k => k.status === 'approved').length;
  const rejected = ADMIN_KYC.filter(k => k.status === 'rejected').length;
  const total    = ADMIN_KYC.length;
  const open     = pending + review;
  const highRisk = ADMIN_KYC.filter(k => k.risk === 'alto' && (k.status === 'pending' || k.status === 'under-review')).length;

  const nb = document.getElementById('navBadgeKyc');
  if (nb) { nb.textContent = open; nb.style.display = open > 0 ? '' : 'none'; }

  const kpi = document.getElementById('kpiKycNum');
  if (kpi) kpi.textContent = open;
  const kpiRisco = document.getElementById('kpiKycRisco');
  if (kpiRisco) kpiRisco.textContent = highRisk > 0 ? `⚠ ${highRisk} de risco alto` : '';

  const sub = document.getElementById('kycSub');
  if (sub) sub.textContent = open + ' verificaç' + (open === 1 ? 'ão aguardando análise' : 'ões aguardando análise') + (highRisk > 0 ? ` · ${highRisk} de risco alto` : '');

  const all = document.getElementById('countKycAll');      if (all) all.textContent = total;
  const pen = document.getElementById('countKycPending');  if (pen) pen.textContent = pending;
  const rev = document.getElementById('countKycReview');   if (rev) rev.textContent = review;
  const apr = document.getElementById('countKycApproved'); if (apr) apr.textContent = approved;
  const rej = document.getElementById('countKycRejected'); if (rej) rej.textContent = rejected;
}

function _admCloseKycModal() {
  const m = document.getElementById('admKycReviewModal');
  if (m) m.classList.remove('open');
}

/* ── Abre modal com dossiê completo (dados extraídos por OCR + risco) ── */
function openKycReview(id) {
  const k = ADMIN_KYC.find(x => x.id === id);
  if (!k) return;
  const st = KYC_STATUS_LABEL[k.status] || KYC_STATUS_LABEL.pending;
  const riskRGB = k.risk === 'alto' ? '239,68,68' : (k.risk === 'medio' ? '245,158,11' : '34,197,94');

  const docCard = (title, icon, doc, fields) => doc ? `
    <div class="adm-kyc-doc-card">
      <div class="adm-kyc-doc-head">
        <div class="adm-kyc-doc-title">${icon} ${title}</div>
        <div class="adm-kyc-conf">Confiança OCR: ${doc.confidence}%</div>
      </div>
      <div class="adm-kyc-conf-bar"><div class="adm-kyc-conf-fill" style="width:${doc.confidence}%"></div></div>
      ${fields.map(f => `<div class="adm-kyc-doc-row"><span>${f[0]}</span><strong>${doc.data[f[1]] || '—'}</strong></div>`).join('')}
    </div>` : `<div class="adm-kyc-doc-card" style="opacity:0.5;text-align:center;color:var(--muted);font-size:12px;">${icon} ${title} — não enviado</div>`;

  const actionsHtml = (k.status === 'pending' || k.status === 'under-review') ? `
      <button class="adm-btn-approve" style="flex:1;min-width:140px;padding:11px;" onclick="admApproveKyc('${k.id}');_admCloseKycModal();">✓ Aprovar Verificação</button>
      <button class="adm-btn-reject" style="flex:1;min-width:140px;padding:11px;" onclick="admRejectKyc('${k.id}');_admCloseKycModal();">✕ Recusar</button>
      <button class="adm-btn-view" style="flex:1;min-width:140px;padding:11px;" onclick="admRequestMoreKycDocs('${k.id}')">📨 Solicitar Mais Documentos</button>`
    : `<div style="padding:6px 0;color:${k.status === 'approved' ? '#22C55E' : '#EF4444'};font-size:13px;font-weight:600;">${k.status === 'approved' ? '✅ Verificação já aprovada.' : '❌ Verificação já recusada.'}</div>`;

  // C2: sanitiza campos provenientes de dados de utilizador antes de injetar no modal KYC
  const _kVendor   = (typeof wkzSanitizeHTML === 'function') ? wkzSanitizeHTML(k.vendorName, true) : escapeHtml(k.vendorName); // C2: userContent=true
  const _kOwner    = (typeof wkzSanitizeHTML === 'function') ? wkzSanitizeHTML(k.ownerName, true)  : escapeHtml(k.ownerName);
  const _kProtocol = escapeHtml(k.protocol);
  const _kDate     = escapeHtml(k.date);
  const html = `
    <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px;">${k.avatar} ${_kVendor}</h2>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">${_kOwner} · Protocolo <strong style="color:var(--teal)">${_kProtocol}</strong> · Enviado em ${_kDate}</div>

    <div class="adm-kyc-risk-box" style="background:rgba(${riskRGB},0.08);">
      <div style="font-size:24px;">${k.risk === 'alto' ? '🚨' : (k.risk === 'medio' ? '⚠️' : '✅')}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:var(--text);">${KYC_RISK_LABEL[k.risk]} — score ${k.riskScore}/100</div>
        <div style="font-size:11px;color:var(--muted);">Calculado a partir da validação de CNPJ, idade da empresa e completude documental.</div>
      </div>
      <span class="adm-tag ${st.tagClass}" style="white-space:nowrap;">${st.label}</span>
    </div>

    ${docCard('RG / Identidade', '🪪', k.docs.rg, [['Nome', 'nome'], ['CPF', 'cpf'], ['Validade', 'validade']])}
    ${docCard('CNPJ', '🏢', k.docs.cnpj, [['Razão Social', 'razaoSocial'], ['CNPJ', 'cnpj'], ['Constituída em', 'constituicao'], ['Atividade', 'atividade']])}
    ${docCard('Comprovante de Endereço', '🏠', k.docs.comprovante, [['Endereço', 'endereco'], ['Cidade/UF', 'cidade'], ['CEP', 'cep']])}

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">${actionsHtml}</div>
  `;
  _wkzModal('admKycReviewModal', html, { maxWidth: '560px' });
}

function admApproveKyc(id) {
  const k = ADMIN_KYC.find(x => x.id === id);
  if (!k || k.status === 'approved') return;
  k.status = 'approved';
  const card = document.getElementById('admKyc_' + id);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
    setTimeout(() => renderAdminKyc(_admKycActiveFilter), 400);
  } else {
    renderAdminKyc(_admKycActiveFilter);
  }
  admSyncKycBadge();
  admAuditAdd('✅', `KYC "${k.vendorName}" aprovado (protocolo ${k.protocol})`, 'Admin WeKz');
  showToast('✅ KYC de "' + k.vendorName + '" aprovado! Loja liberada para vender.');
  if (typeof window.spdSetApprovalStatus === 'function') window.spdSetApprovalStatus('approved');
}

function admRejectKyc(id) {
  const k = ADMIN_KYC.find(x => x.id === id);
  if (!k || k.status === 'rejected') return;
  k.status = 'rejected';
  const card = document.getElementById('admKyc_' + id);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';
    setTimeout(() => renderAdminKyc(_admKycActiveFilter), 400);
  } else {
    renderAdminKyc(_admKycActiveFilter);
  }
  admSyncKycBadge();
  admAuditAdd('🚫', `KYC "${k.vendorName}" recusado (protocolo ${k.protocol})`, 'Admin WeKz');
  showToast('❌ KYC de "' + k.vendorName + '" recusado. Vendedor notificado.');
  if (typeof window.spdSetApprovalStatus === 'function') window.spdSetApprovalStatus('rejected');
}

function admRequestMoreKycDocs(id) {
  const k = ADMIN_KYC.find(x => x.id === id);
  if (!k) return;
  k.status = 'under-review';
  _admCloseKycModal();
  renderAdminKyc(_admKycActiveFilter);
  admSyncKycBadge();
  admAuditAdd('📨', `Documentos adicionais solicitados para "${k.vendorName}" (protocolo ${k.protocol})`, 'Admin WeKz');
  showToast('📨 Solicitação de documentos adicionais enviada para ' + k.ownerName + '.');
}

/* ── Dados simulados: Produtos com denúncias ── */
const ADMIN_REPORTS = [
  { id:'RP001', emoji:'📱', name:'Smartphone Ultra Xclone 5G',  store:'TechDeals Express',   reason:'Produto falsificado / réplica', reports:8,  severity:'urgent', status:'urgent' },
  { id:'RP002', emoji:'💊', name:'Suplemento "Emagrece Já" 500g', store:'NutriShop Brasil',   reason:'Alegações médicas não comprovadas', reports:5,  severity:'urgent', status:'urgent' },
  { id:'RP003', emoji:'👟', name:'Tênis Supreme XLR Ultra',      store:'FashionClone Shop',  reason:'Uso de marca registrada sem licença', reports:12, severity:'urgent', status:'urgent' },
  { id:'RP004', emoji:'⌚', name:'Smartwatch FitPro X200',       store:'GadgetDiscount BR',  reason:'Descrição enganosa (não é original)', reports:3,  severity:'review', status:'review' },
  { id:'RP005', emoji:'🧴', name:'Creme Anti-Idade Milagroso',   store:'BeautySecret Store', reason:'Promessa de resultados não comprovados', reports:2, severity:'review', status:'review' },
];

/* Estado do filtro de reports ativo (persiste entre re-renders) */
let _admReportsActiveFilter = 'all';

function renderAdminReports(filter = 'all') {
  _admReportsActiveFilter = filter;
  const list = document.getElementById('admReportList');
  if (!list) return;
  let data = [...ADMIN_REPORTS];
  if (filter === 'urgent')   data = data.filter(r => r.severity === 'urgent');
  if (filter === 'review')   data = data.filter(r => r.severity === 'review');
  if (filter === 'resolved') { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">✅ Nenhum produto resolvido recente.</div>'; return; }

  list.innerHTML = data.map(r => `
    <div class="adm-report-card" id="admReport_${r.id}" data-rid="${r.id}">
      <div class="adm-report-severity sev-${r.severity}"></div>
      <div style="width:32px;height:32px;flex-shrink:0;"><wkz-product-image style="font-size:32px;" src="${r.img||''}" emoji="${r.emoji}" alt="${r.name}"></wkz-product-image></div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;margin-bottom:3px;">${r.name}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:5px;display:flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> ${r.store}</div>
        <div style="font-size:12px;display:flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><strong style="color:#F59E0B;">Motivo:</strong> <span style="color:var(--muted);">${r.reason}</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> ${r.reports} denúncia${r.reports > 1 ? 's' : ''} recebida${r.reports > 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
        ${r.severity === 'urgent' ? `<button class="adm-btn-takedown" data-action="takedown" data-rid="${r.id}">Remover</button>` : ''}
        <button class="adm-btn-view" data-action="investigate" data-rid="${r.id}">Investigar</button>
        <button class="adm-btn-view" data-action="notify" data-rid="${r.id}" data-store="${r.store.replace(/"/g,'&quot;')}">Notificar Loja</button>
      </div>
    </div>`).join('');

  /* Delegação de eventos — evita qualquer problema de aspas em onclick inline */
  list.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const rid    = btn.dataset.rid;
    const report = ADMIN_REPORTS.find(r => r.id === rid);
    if (!report) return;
    if (action === 'takedown')   admTakedown(rid, report.name);
    if (action === 'investigate') showToast('🔍 Abrindo investigação: ' + report.name);
    if (action === 'notify')      admNotifyStore(rid, report.name, report.store);
  };
}

function admTakedown(id, name) {
  const idx = ADMIN_REPORTS.findIndex(r => r.id === id);
  if (idx === -1) return;
  ADMIN_REPORTS.splice(idx, 1);

  const card = document.getElementById('admReport_' + id);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    card.style.overflow = 'hidden';
    card.style.height = card.offsetHeight + 'px';
    setTimeout(() => { card.style.height = '0'; card.style.padding = '0'; card.style.margin = '0'; }, 100);
    setTimeout(() => {
      card.remove();
      /* Re-renderiza com filtro ativo para garantir consistência */
      renderAdminReports(_admReportsActiveFilter);
    }, 600);
  } else {
    renderAdminReports(_admReportsActiveFilter);
  }
  admSyncReportBadge();
  admAuditAdd('🚫', 'Produto "' + name + '" removido por violação de política', 'Admin WeKz');
  showToast('🚫 Produto "' + name + '" removido da plataforma. Loja notificada e penalizada.');
}

function admNotifyStore(id, name, store) {
  const report = ADMIN_REPORTS.find(r => r.id === id);
  if (report) report.notified = true;
  admAuditAdd('🏪', 'Loja "' + store + '" notificada sobre produto "' + name + '"', 'Admin WeKz');
  showToast('📨 Loja "' + store + '" notificada para defesa do produto "' + name + '".');
}

function admInvestigate(id, name) {
  showToast('🔍 Abrindo investigação: ' + name);
}

/* ── Kz Wisdom para Admin ── */

/* ── 4.3: Banner Kz + Nav Hook (adm-mode) ────────────────────────────────
   KZ_ADMIN_MSGS, refreshAdminKzMsg, renderAdminKzBanner, e o nav hook
   legítimo que alterna a classe adm-mode ao navegar.
   BACKDOOR REMOVIDO (Patch de Segurança / BUG-ADM01): ver nota inline.
   Origem monólito: linhas 39296–39363 + 39421–39432 (backdoor
   39364–39420 deliberadamente excluído)
   ─────────────────────────────────────────────────────────────────────── */
const KZ_ADMIN_MSGS = [
  'Meus sensores detectam <strong>7 lojas</strong> aguardando aprovação. Revise os documentos antes das 18h para manter o SLA de 24h!',
  '<em>Alerta de saúde:</em> Faturamento bruto deste mês está <strong>+23,4% acima</strong> do esperado. Ótimo sinal para o Q2!',
  'Atenção, Gestor! <strong>3 produtos com denúncias urgentes</strong> requerem ação imediata. O tempo médio de resolução atual é de 18h.',
  'Dica operacional: a <strong>taxa de chargeback</strong> caiu para 0,8%. Abaixo de 1% é excelente — manter o rigor no KYC dos vendedores!',
  'Radar WeKz ativo: <strong>Eletrônicos domina 72%</strong> do GMV este mês. Considere campanhas de diversificação em Moda e Casa.',
  'Gestão eficiente detectada! <strong>98,7% de uptime</strong> este mês. Os servidores estão em plena forma, Gestor.',
  'Análise de risco: <strong>2 vendedores</strong> apresentam padrão suspeito de pedidos em curto período. Revisão preventiva recomendada.',
  'Novo módulo ativo! <strong>4 fornecedores</strong> aguardam verificação de conta no painel B2B. Revise CNPJ/documentos internacionais para manter o SLA.',
  'Destaque B2B: <strong>18 fornecedores Premium</strong> ativos este mês geraram <strong>R$ 1,24M</strong> em volume atacado. Comissão B2B acumulada: R$ 43.533.',
];

function refreshAdminKzMsg() {
  const msg = KZ_ADMIN_MSGS[Math.floor(Math.random() * KZ_ADMIN_MSGS.length)];
  const el = document.getElementById('admKzMsg');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => {
      el.innerHTML = msg;
      el.style.opacity = '1';
      el.style.transition = 'opacity 0.3s';
      if (typeof kzPlaySound === 'function') kzPlaySound('message');
    }, 200);
  }
}

// [KZ-ILLUS] Fallback seguro: getKzSVG() não existe neste módulo (é
// específico do wkz-buyer.js), então se a imagem falhar aqui a gente só
// esconde graciosamente — não pior do que o comportamento original
// (o div ficava vazio quando getKzSVG não estava disponível).
function _wkzAdminKzImgError(imgEl) {
  if (imgEl) imgEl.style.display = 'none';
}

function renderAdminKzBanner() {
  // Injeta o mascote Kz
  // [KZ-ILLUS] mesma exceção já aprovada: ilustração raster com fallback
  // automático pro sprite SVG (#kz-mascot-full) via _wkzAdminKzImgError()
  // se a imagem não carregar.
  const mascotEl = document.getElementById('admKzMascot');
  if (mascotEl) {
    // FIX: estava width:100%;height:100% — sem um pai com dimensão
    // definida isso renderiza no tamanho intrínseco da imagem (enorme),
    // fazendo o mascote "vazar" pela tela. Tamanho fixo resolve.
    mascotEl.innerHTML = '<img src="../shared/assets/mascot/monitoramento.png" '
      + 'alt="Kz monitorando a plataforma" style="display:block;width:44px;height:44px;object-fit:cover;object-position:center top;border-radius:10px;flex-shrink:0;" '
      + 'onerror="_wkzAdminKzImgError(this)">';
  }

  // Saudação por hora do dia
  const hour = new Date().getHours();
  let greet;
  if      (hour >= 5  && hour < 12) greet = 'Bom dia, Gestor!';
  else if (hour >= 12 && hour < 18) greet = 'Boa tarde, Gestor!';
  else if (hour >= 18 && hour < 22) greet = 'Boa noite, Gestor!';
  else                               greet = 'Olá, Gestor insone!';

  const greetEl = document.getElementById('admKzGreeting');
  if (greetEl) greetEl.textContent = greet;

  // Mensagem inicial
  const msg = KZ_ADMIN_MSGS[Math.floor(Math.random() * KZ_ADMIN_MSGS.length)];
  const msgEl = document.getElementById('admKzMsg');
  if (msgEl) msgEl.innerHTML = msg;

  // Som de chegada da mensagem do Kz
  if (typeof kzPlaySound === 'function') setTimeout(() => kzPlaySound('message'), 300);

  // Preenche nome do admin na sidebar
  const admUserName = document.getElementById('admUserName');
  if (admUserName) admUserName.textContent = window.currentAdminUser.nome;
  const admUserAvatar = document.getElementById('admUserAvatar');
  if (admUserAvatar) admUserAvatar.textContent = window.currentAdminUser.avatar;
}

/* ══════════════════════════════════════════════════════════════
   FIX BUG-ADM01: DEV BYPASS removido.
   Acesso dev ao painel admin via dois métodos discretos:
     Desktop : URL hash  →  adicionar #wkz-dev-admin à URL
     Mobile  : 5 toques rápidos no rodapé (elemento .kz-footer-brand)
   Nenhum dado de credencial em plaintext no source.
   Para produção: remover este bloco inteiro e integrar /api/auth/admin.
   ══════════════════════════════════════════════════════════════ */


/* NOTA (Sprint M4 — Patch de Segurança / BUG-ADM01): o backdoor
   _wkzDevAdminActivate() (hash #wkz-dev-admin + 5 toques no rodapé)
   foi DELIBERADAMENTE EXCLUÍDO daqui — o próprio monólito já
   documentava: 'Para produção: remover este bloco inteiro e integrar
   /api/auth/admin.' Manter isso na versão modular reintroduziria uma
   porta de acesso não autenticado ao painel admin. O nav hook abaixo
   (wkzAdminPageHook) é legítimo e foi mantido — só alterna a classe
   CSS adm-mode ao navegar, não concede acesso. */
window.registerNavHook(function wkzAdminPageHook(id) {
  if (id === 'admin-dashboard') {
    /* MapsTo já ativou page-admin-dashboard; aqui só lidamos com adm-mode */
    document.body.classList.add('adm-mode');
    var adminPage = document.getElementById('page-admin-dashboard');
    if (adminPage) { adminPage.scrollTop = 0; }
    if (typeof renderAdminKzBanner === 'function') setTimeout(renderAdminKzBanner, 80);
  } else {
    /* Ao navegar para qualquer outra página, restaura o chrome normal */
    document.body.classList.remove('adm-mode');
  }
});

/* ── 4.4: Broadcast + Segurança/Fraude + Configurações ───────────────────
   COMM_HISTORY, COMM_TEMPLATES, sendBroadcast, renderCommHistory,
   FRAUD_REPORTS, AUDIT_LOG, SUSPECT_ACCOUNTS, admAuditAdd,
   KZ_RADAR_ALERTS, renderKzRadar, renderSecurityPanel,
   resolveFraudReport, secSuspendAccount/ViewAccount/Action,
   cfgToggle, updateRate, saveRates/Limits, kzFxGuard*, kzUpdateIntlShipping.
   Origem monólito: linhas 39436–39975
   ─────────────────────────────────────────────────────────────────────── */
const COMM_HISTORY = [
  { icon:'🔧', title:'Manutenção programada', msg:'Sistema ficará fora do ar das 02h às 04h no dia 25/05.', audience:'Todos', canal:'Push + Banner', date:'20/05 — 09:14', reach:'318K' },
  { icon:'🎉', title:'Semana WeKz — até 60% OFF!', msg:'Promoções exclusivas em todas as categorias. Não perca!', audience:'Compradores', canal:'Push + E-mail', date:'18/05 — 10:00', reach:'305K' },
  { icon:'✨', title:'Novo painel do vendedor v2.0', msg:'Atualizamos seu painel com relatórios e insights de IA.', audience:'Vendedores', canal:'E-mail + Push', date:'15/05 — 08:30', reach:'12,8K' },
  { icon:'⚠️', title:'Alerta: novas regras de CNPJ', msg:'A partir de 01/06 todos os vendedores devem validar CNPJ.', audience:'Vendedores', canal:'E-mail + Banner', date:'12/05 — 14:00', reach:'12,8K' },
];

const COMM_TEMPLATES = {
  manutencao: { title:'Manutenção programada — [DATA] às [HH]h', msg:'Nossa plataforma ficará temporariamente indisponível para manutenção. Agradecemos a compreensão!' },
  promoçao:   { title:'🎉 [NOME DA PROMOÇÃO] — até [X]% OFF!', msg:'Aproveite ofertas exclusivas em toda a plataforma. Promoção válida até [DATA]!' },
  novidade:   { title:'✨ Novidade: [NOME DA FEATURE]', msg:'Lançamos [descrição]. Acesse agora e descubra todas as melhorias!' },
  alerta:     { title:'⚠️ Aviso importante para [PÚBLICO]', msg:'[DESCREVA O ALERTA DE FORMA CLARA E OBJETIVA].' },
};

function setAudience(aud, btn) {
  document.querySelectorAll('.adm-aud-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function applyTemplate(key) {
  const tpl = COMM_TEMPLATES[key];
  if (!tpl) return;
  const ti = document.getElementById('commTitle');
  const bi = document.getElementById('commBody');
  if (ti) { ti.value = tpl.title; updatePreview(); }
  if (bi) { bi.value = tpl.msg; updateCommChars(); updatePreview(); }
  showToast('📋 Template "' + key + '" aplicado!');
}

function updateCommChars() {
  const ta = document.getElementById('commBody');
  const cc = document.getElementById('commChars');
  if (!ta || !cc) return;
  const len = ta.value.length;
  cc.textContent = len + ' / 280';
  cc.style.color = len > 260 ? '#EF4444' : len > 220 ? '#F59E0B' : 'var(--muted)';
}

function updatePreview() {
  const ti = document.getElementById('commTitle');
  const bi = document.getElementById('commBody');
  const pt = document.getElementById('prevTitle');
  const pm = document.getElementById('prevMsg');
  if (pt) pt.textContent = (ti && ti.value) ? ti.value : 'Título do comunicado';
  if (pm) pm.textContent = (bi && bi.value) ? bi.value : 'Sua mensagem aparecerá aqui...';
}

// Bind live preview
document.addEventListener('DOMContentLoaded', function() {
  const ti = document.getElementById('commTitle');
  const bi = document.getElementById('commBody');
  if (ti) ti.addEventListener('input', updatePreview);
  if (bi) {
    bi.addEventListener('input', function() { updateCommChars(); updatePreview(); });
  }
});

function sendBroadcast() {
  /* FIX Sprint M5 (Hardening): rate limit de 3 broadcasts por 5 minutos.
     Este é o ponto mais sensível a spam de todo o app — um broadcast
     atinge a base inteira de usuários (até "318K" pela estimativa de
     alcance abaixo), então o limite é bem mais rígido que o de login. */
  if (typeof wkzRateLimit === 'function' && !wkzRateLimit('admin_broadcast', 3, 300000)) {
    showToast('⚠️ Limite de comunicados atingido (3 a cada 5 min). Aguarde antes de enviar outro.');
    return;
  }

  const ti = document.getElementById('commTitle');
  const bi = document.getElementById('commBody');
  const btn = document.getElementById('commSendBtn');
  const title = ti ? ti.value.trim() : '';
  const msg   = bi ? bi.value.trim() : '';
  if (!title) { showToast('⚠️ Preencha o título do comunicado.'); return; }
  if (!msg)   { showToast('⚠️ Escreva a mensagem antes de enviar.'); return; }

  const audEl = document.querySelector('.adm-aud-btn.active');
  const audText = audEl ? audEl.textContent.trim() : 'Todos';
  // Extrai somente o label sem a contagem
  const audience = audText.replace(/\s*\(.*\)/, '').trim();

  // Canal selecionado
  const channels = [];
  if (document.getElementById('chPush')   && document.getElementById('chPush').checked)   channels.push('Push');
  if (document.getElementById('chEmail')  && document.getElementById('chEmail').checked)   channels.push('E-mail');
  if (document.getElementById('chBanner') && document.getElementById('chBanner').checked)  channels.push('Banner');
  const canal = channels.length ? channels.join(' + ') : 'Push';

  // Alcance estimado baseado na audiência ativa
  const reachMap = { 'Todos':'318K', 'Vendedores':'12,8K', 'Compradores':'305K' };
  const reach = reachMap[audience] || '—';

  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="adm-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Enviando...'; }

  setTimeout(function() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) + ' — ' + now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    COMM_HISTORY.unshift({ icon:'📣', title, msg, audience, canal, date: dateStr, reach });
    if (ti) ti.value = '';
    if (bi) bi.value = '';
    updatePreview(); updateCommChars();
    renderCommHistory();
    admAuditAdd('📣', 'Comunicado "' + title + '" enviado para ' + audience + ' (' + reach + ')', 'Admin WeKz');
    showToast('✅ Comunicado enviado para ' + audience + ' · ~' + reach + ' usuários!');
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="adm-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar Comunicado'; }
  }, 1200);
}

function renderCommHistory() {
  const el = document.getElementById('commHistory');
  if (!el) return;
  el.innerHTML = COMM_HISTORY.map(h => `
    <div class="adm-comm-hist-item">
      <div class="adm-comm-hist-icon" style="font-size:0;display:flex;align-items:center;justify-content:center;">${admGetIconSVG(h.icon)}</div>
      <div class="adm-comm-hist-body">
        <div class="adm-comm-hist-title">${h.title}</div>
        <div class="adm-comm-hist-meta"><span style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;">${admGetIconSVG('cal')}</span> ${h.date} · ${h.canal} · ${h.audience}</div>
      </div>
      <div class="adm-comm-hist-badge">~${h.reach}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   SEGURANÇA — JS
   ══════════════════════════════════════════════════════════════ */

/* ── SVG icon map para audit log e comunicados ── */
function admGetIconSVG(key) {
  const icons = {
    '✅': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    '🚫': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    '📣': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    '⚙️': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    '🔒': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    '👤': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    '🏪': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    '🔐': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="#22C55E"/></svg>',
    '🔧': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    '🎉': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    '✨': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5z"/><path d="M5 14l.85 2 2 .85-2 .85L5 20l-.85-2-2-.85 2-.85z"/></svg>',
    '⚠️': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    '🏭': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a2 2 0 002 2h16a2 2 0 002-2V8l-7 5V8l-7 5V4H2v16z"/><line x1="17" y1="18" x2="17.01" y2="18" stroke-width="3"/><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="3"/><line x1="7" y1="18" x2="7.01" y2="18" stroke-width="3"/></svg>',
    '⭐': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    'cal': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  };
  return icons[key] || '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
}

/* FIX Sprint M4: FRAUD_REPORTS NÃO é redeclarado aqui — já vive em
   wkz-core.js (movido no Sprint M3, compartilhado com o formulário
   "Reportar uma Fraude" de wkz-legal.html). Como wkz-core.js carrega
   ANTES deste arquivo, todo código abaixo que usa FRAUD_REPORTS lê o
   MESMO array declarado lá — sem redeclaração, sem SyntaxError. */

const AUDIT_LOG = [
  { time:'14:37', icon:'✅', desc:'Loja "TechParts Direct" aprovada', actor:'Admin WeKz' },
  { time:'13:55', icon:'🚫', desc:'Produto #P4421 removido por violação de política', actor:'Admin WeKz' },
  { time:'13:12', icon:'📣', desc:'Comunicado "Manutenção programada" enviado para 318K usuários', actor:'Admin WeKz' },
  { time:'12:40', icon:'⚙️', desc:'Taxa de comissão "Moda" alterada de 10% → 12%', actor:'Admin WeKz' },
  { time:'11:28', icon:'🔒', desc:'IP 103.55.xx.xx bloqueado temporariamente (47 tentativas)', actor:'Sistema' },
  { time:'10:05', icon:'👤', desc:'Conta #U9032 suspensa por chargeback acima do limite', actor:'Sistema' },
  { time:'09:18', icon:'🏪', desc:'Loja "PetLife Store" — solicitação de documentos enviada', actor:'Admin WeKz' },
  { time:'08:45', icon:'🔐', desc:'Login do administrador — IP: 187.xx.xx.xx (dispositivo conhecido)', actor:'Sistema' },
];

const SUSPECT_ACCOUNTS = [
  { avatar:'V', name:'Vendedor #V8821 — LojaTeste99', detail:'23 pedidos cancelados em 40 min · Risco: fraude por cancelamento', score:94, scoreLabel:'Risco' },
  { avatar:'C', name:'Comprador #U9032 — MarceloF', detail:'3 chargebacks em 7 dias · Ticket médio suspeito: R$ 4.200', score:78, scoreLabel:'Risco' },
  { avatar:'V', name:'Vendedor #V7710 — SpeedSell BR', detail:'87 avaliações negativas em 30 dias · Tasa de devolução: 34%', score:61, scoreLabel:'Risco' },
];

/* ── Adiciona entrada em tempo real ao audit log ── */
function admAuditAdd(icon, desc, actor) {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  AUDIT_LOG.unshift({ time, icon, desc, actor });
  if (AUDIT_LOG.length > 20) AUDIT_LOG.pop(); // mantém os 20 mais recentes
  /* Re-renderiza o log se o painel de segurança estiver visível */
  const logEl = document.getElementById('admAuditLog');
  if (logEl && logEl.closest('#adm-seguranca') && logEl.closest('#adm-seguranca').style.display !== 'none') {
    renderSecurityPanel();
  }
}

// ══════════════════════════════════════════════════════════
// KZ RADAR DE RISCOS — Alertas Preditivos de Fraude/Anomalias
// ══════════════════════════════════════════════════════════
const KZ_RADAR_ALERTS = [
  {
    id: 'RAD001',
    level: 'critical',
    icon: '🌐',
    title: 'Variação atípica de IPs de acesso detectada',
    detail: '47 logins do vendedor GadgetDiscount BR originaram-se de 12 países distintos nas últimas 3h — padrão consistente com credential stuffing ou VPN hopping.',
    timestamp: 'há 2 min',
    actions: ['Investigar', 'Bloquear Temporariamente']
  },
  {
    id: 'RAD002',
    level: 'high',
    icon: '💸',
    title: 'Tentativas de saques consecutivos suspeitos',
    detail: 'BeautySecret Store realizou 4 solicitações de saque em 18 minutos, totalizando R$ 19.200 — volume 340% acima da média histórica da loja.',
    timestamp: 'há 11 min',
    actions: ['Investigar', 'Bloquear Temporariamente']
  },
  {
    id: 'RAD003',
    level: 'medium',
    icon: '⚖️',
    title: 'Comportamento suspeito no chat tripartite de disputas',
    detail: 'Comprador USER-2291 enviou mensagens idênticas em 6 disputas abertas simultaneamente — possível fraude organizada ou abuso de política de reembolso.',
    timestamp: 'há 28 min',
    actions: ['Investigar', 'Bloquear Temporariamente']
  }
];

const KZ_RADAR_COLORS = {
  critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', dot: '#EF4444', label: 'CRÍTICO' },
  high:     { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', dot: '#F59E0B', label: 'ALTO' },
  medium:   { bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)', dot: '#7C3AED', label: 'MÉDIO' }
};

function renderKzRadar() {
  const container = document.getElementById('kzRadarAlerts');
  if (!container) return;

  container.innerHTML = KZ_RADAR_ALERTS.map(alert => {
    const c = KZ_RADAR_COLORS[alert.level];
    return `
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:12px;transition:all 0.2s;" data-radar-id="${alert.id}">
        <div style="flex-shrink:0;margin-top:2px;">
          <div style="width:8px;height:8px;background:${c.dot};border-radius:50%;margin:0 auto 4px;animation:kzRadarPulse 1.4s ease-in-out infinite;box-shadow:0 0 8px ${c.dot};"></div>
          <div style="font-size:16px;text-align:center;">${alert.icon}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:9px;font-weight:700;letter-spacing:1px;color:${c.dot};text-transform:uppercase;background:rgba(0,0,0,0.2);padding:1px 6px;border-radius:3px;">${c.label}</span>
            <span style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;color:var(--text);">${alert.title}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:8px;">${alert.detail}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:10px;color:var(--muted);">⏱ ${alert.timestamp}</span>
            ${alert.actions.map((a, i) => `<button onclick="kzRadarAction('${alert.id}','${a}')" style="font-size:10px;font-weight:600;padding:4px 10px;border-radius:5px;cursor:pointer;border:1px solid ${i===0?'rgba(0,180,171,0.4)':'rgba(239,68,68,0.4)'};background:${i===0?'rgba(0,180,171,0.1)':'rgba(239,68,68,0.08)'};color:${i===0?'var(--teal)':'#EF4444'};transition:all 0.2s;">${a}</button>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  // Update timestamp
  const timeEl = document.getElementById('kzRadarTime');
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

function kzRadarAction(id, action) {
  const alert = KZ_RADAR_ALERTS.find(a => a.id === id);
  if (!alert) return;
  if (action === 'Bloquear Temporariamente') {
    admAuditAdd('🔒', `Kz Radar: Bloqueio temporário acionado para alerta ${id} — ${alert.title}`, 'Kz AI · Admin');
    showToast('🛡️ Kz AI: Bloqueio temporário acionado. Equipe de segurança notificada.');
    // Remove from radar visually
    const card = document.querySelector('[data-radar-id="' + id + '"]');
    if (card) { card.style.opacity='0.35'; card.style.pointerEvents='none'; }
  } else {
    admAuditAdd('🔍', `Kz Radar: Investigação iniciada para alerta ${id} — ${alert.title}`, 'Kz AI · Admin');
    showToast('🔍 Kz AI: Investigação registrada no log de auditoria.');
  }
}

function renderSecurityPanel() {
  // Kz Risk Radar
  renderKzRadar();
  // Reportes de fraude de usuários
  renderFraudReports();
  // Audit log
  const logEl = document.getElementById('admAuditLog');
  if (logEl) {
    logEl.innerHTML = AUDIT_LOG.map(r => `
      <div class="adm-audit-row">
        <div class="adm-audit-time">${r.time}</div>
        <div class="adm-audit-icon" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;">${admGetIconSVG(r.icon)}</div>
        <div>
          <div class="adm-audit-desc">${r.desc}</div>
          <div class="adm-audit-actor">${r.actor}</div>
        </div>
      </div>`).join('');
  }
  // Suspect list — com botões de ação
  const suspEl = document.getElementById('admSuspectList');
  if (suspEl) {
    suspEl.innerHTML = SUSPECT_ACCOUNTS.map((s, i) => `
      <div class="adm-suspect-card" id="admSuspect_${i}">
        <div class="adm-suspect-avatar">${s.avatar}</div>
        <div class="adm-suspect-info">
          <div class="adm-suspect-name">${s.name}</div>
          <div class="adm-suspect-detail">${s.detail}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="adm-sec-btn adm-sec-btn-block" onclick="secSuspendAccount(${i})">Suspender</button>
            <button class="adm-sec-btn adm-sec-btn-view" onclick="secViewAccount(${i})">Ver Detalhes</button>
          </div>
        </div>
        <div>
          <div class="adm-suspect-score" style="color:${s.score >= 80 ? '#EF4444' : s.score >= 60 ? '#F59E0B' : '#22C55E'}">${s.score}</div>
          <div class="adm-suspect-score-label">${s.scoreLabel}</div>
        </div>
      </div>`).join('');
  }
}

function renderFraudReports() {
  const list = document.getElementById('admFraudReportsList');
  const countEl = document.getElementById('fraudReportsCount');
  if (countEl) countEl.textContent = FRAUD_REPORTS.filter(r => r.status !== 'resolvida').length;
  if (!list) return;
  if (!FRAUD_REPORTS.length) {
    list.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">Nenhum reporte de fraude recebido.</div>';
    return;
  }
  list.innerHTML = [...FRAUD_REPORTS]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(r => `
    <div class="adm-sec-alert" style="border-left-color:${r.status === 'resolvida' ? '#22C55E' : '#EF4444'};">
      <div class="adm-sec-alert-dot" style="background:${r.status === 'resolvida' ? '#22C55E' : '#EF4444'};"></div>
      <div class="adm-sec-alert-body">
        <div class="adm-sec-alert-title">${r.type}</div>
        <div class="adm-sec-alert-detail">${r.details}</div>
        <div class="adm-sec-alert-time">${r.id} · ${formatLogTime(r.createdAt)}</div>
      </div>
      <div class="adm-sec-alert-actions">
        ${r.status === 'resolvida'
          ? '<span style="font-size:10px;color:#22C55E;font-weight:700;white-space:nowrap;">Resolvido</span>'
          : `<button class="adm-sec-btn" style="background:rgba(0,180,171,0.12);color:var(--teal);border:1px solid rgba(0,180,171,0.3);" onclick="resolveFraudReport('${r.id}')">Marcar Resolvido</button>`}
      </div>
    </div>`).join('');
}

function resolveFraudReport(id) {
  const r = FRAUD_REPORTS.find(x => x.id === id);
  if (!r) return;
  r.status = 'resolvida';
  admAuditAdd('🛡️', `Reporte de fraude ${id} marcado como resolvido`, 'Admin WeKz');
  renderFraudReports();
}

/* ── Recebe o envio do formulário "Reportar uma Fraude" (pg-antifraude) ── */
window.submitFraudReport = function(btn) {
  const box = btn.closest('.report-box');
  if (!box) return;
  const select = box.querySelector('select');
  const textarea = box.querySelector('textarea');
  const details = (textarea.value || '').trim();

  if (!details) {
    showToast('Descreva o que aconteceu antes de enviar o reporte.');
    textarea.focus();
    return;
  }

  const id = 'FR-' + Date.now().toString().slice(-6);
  FRAUD_REPORTS.unshift({
    id,
    type: select.value,
    details,
    status: 'recebida',
    createdAt: new Date().toISOString(),
  });

  admAuditAdd('🚨', `Novo reporte de fraude recebido (${select.value}) — ${id}`, 'Cliente');
  renderFraudReports();

  textarea.value = '';
  select.selectedIndex = 0;
  showToast('Reporte enviado ao time anti-fraude. Protocolo: ' + id);
};


function secSuspendAccount(idx) {
  const s = SUSPECT_ACCOUNTS[idx];
  if (!s) return;
  const card = document.getElementById('admSuspect_' + idx);
  if (card) {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 400);
  }
  SUSPECT_ACCOUNTS.splice(idx, 1);
  admAuditAdd('👤', 'Conta ' + s.name + ' suspensa por atividade suspeita', 'Admin WeKz');
  showToast('🚫 Conta ' + s.name + ' suspensa. Acesso bloqueado imediatamente.');
}

function secViewAccount(idx) {
  const s = SUSPECT_ACCOUNTS[idx];
  if (!s) return;
  showToast('🔍 Abrindo detalhes: ' + s.name + ' · Score de risco: ' + s.score);
}

function secAction(action, target) {
  const msgs = {
    block:   '🚫 Vendedor #' + target + ' bloqueado. Análise iniciada.',
    blockip: '🔒 IP ' + target + '.xx.xx bloqueado por 24h.',
    view:    '🔍 Abrindo detalhes do alerta...',
  };
  showToast(msgs[action] || '✅ Ação executada.');
  /* Remove o card do alerta que originou a ação */
  if (action === 'block' || action === 'blockip') {
    const btn = event && event.target ? event.target.closest('.adm-sec-alert') : null;
    if (btn) {
      btn.style.transition = 'all 0.4s ease';
      btn.style.opacity = '0';
      btn.style.height = btn.offsetHeight + 'px';
      btn.style.overflow = 'hidden';
      setTimeout(() => { btn.style.height = '0'; btn.style.padding = '0'; btn.style.margin = '0'; }, 100);
      setTimeout(() => btn.remove(), 600);
    }
    if (action === 'block')   admAuditAdd('🔒', 'Vendedor #' + target + ' bloqueado temporariamente', 'Admin WeKz');
    if (action === 'blockip') admAuditAdd('🔒', 'IP ' + target + '.xx.xx bloqueado por 24h', 'Sistema');
  }
}

/* ══════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — JS
   ══════════════════════════════════════════════════════════════ */
function cfgToggle(feature, input) {
  if (feature === 'maintenance' && input.checked) {
    window._wkzConfirm(
      'Todos os usuários serão redirecionados para a página de manutenção enquanto o modo estiver ativo.',
      {
        title: 'Ativar modo manutenção?',
        icon: '🔧',
        variant: 'warning',
        confirmLabel: 'Ativar',
        cancelLabel: 'Cancelar',
      }
    ).then(function(confirmed) {
      if (!confirmed) { input.checked = false; return; }
      admAuditAdd('🔧', 'Modo manutenção ATIVADO', 'Admin WeKz');
      showToast('🔧 Modo manutenção ATIVADO. Usuários vendo página de manutenção.');
    });
    return; /* sai antes do else — a lógica continua na Promise */
  } else if (feature === 'maintenance') {
    admAuditAdd('✅', 'Modo manutenção desativado — plataforma online', 'Admin WeKz');
    showToast('✅ Modo manutenção desativado. Plataforma online.');
  } else {
    const labels = { flash:'Flash Sales', boost:'WeKz Boost', newstores:'Novos cadastros', pix:'PIX', kz:'Kz IA' };
    const label = labels[feature] || feature;
    admAuditAdd('⚙️', label + (input.checked ? ' ativado' : ' desativado'), 'Admin WeKz');
    showToast((input.checked ? '✅ ' : '🔴 ') + label + (input.checked ? ' ativado.' : ' desativado.'));
  }
}

function updateRate(cat, input) {
  const row = input.closest('.adm-rate-row');
  if (row) {
    const valEl = row.querySelector('.adm-rate-val');
    if (valEl) valEl.textContent = input.value + '%';
  }
}

function saveRates() {
  admAuditAdd('⚙️', 'Taxas de comissão por categoria atualizadas', 'Admin WeKz');
  showToast('💾 Taxas de comissão salvas com sucesso!');
}

function saveLimits() {
  admAuditAdd('⚙️', 'Limites operacionais da plataforma atualizados', 'Admin WeKz');
  showToast('💾 Limites operacionais salvos com sucesso!');
}

/* ══════════════════════════════════════════════════════════════
   📈 KZ FX GUARD — Gestão de Spread/Risco Cambial
   Valores de spread por moeda lidos do painel admin e aplicados
   dinamicamente na função kzFormatPrice() do motor LANG_CURRENCY.
   ══════════════════════════════════════════════════════════════ */

// Estado global dos spreads — inicializado com os defaults do painel
window.KZ_FX_SPREADS = {
  EUR: 1.5,
  USD: 1.5,
  BRL: 0.0,
  JPY: 2.0,
  CNY: 2.0,
  INR: 2.5,
  RUB: 3.0
};

function kzFxGuardReadInputs() {
  const map = { EUR:'fxSpreadEUR', USD:'fxSpreadUSD', BRL:'fxSpreadBRL', JPY:'fxSpreadJPY', CNY:'fxSpreadCNY', INR:'fxSpreadINR', RUB:'fxSpreadRUB' };
  Object.entries(map).forEach(([curr, id]) => {
    const el = document.getElementById(id);
    if (el) {
      const val = Math.min(10, Math.max(0, parseFloat(el.value) || 0));
      window.KZ_FX_SPREADS[curr] = val;
    }
  });
}

function kzFxGuardPreview() {
  // Ao alterar qualquer input, atualiza os spreads em tempo real
  // sem precisar salvar — o preview na PDP reflete imediatamente se estiver aberta
  kzFxGuardReadInputs();
  // Re-aplica localização na PDP se estiver visível
  if (typeof kzSyncFromHeader === 'function') {
    const lang = document.getElementById('langSelect')?.value || 'pt';
    const curr = document.getElementById('currencySelect')?.value || 'BRL';
    kzSyncFromHeader(lang, curr);
  }
}

function kzFxGuardSave() {
  kzFxGuardReadInputs();
  const entries = Object.entries(window.KZ_FX_SPREADS)
    .map(([c, v]) => `${c}: +${v}%`).join(' · ');
  admAuditAdd('📈', `Kz FX Guard — Spreads cambiais actualizados: ${entries}`, 'Admin WeKz');
  showToast('📈 Kz FX Guard: Spreads aplicados! Preços internacionais actualizados.');
  // Força re-render da PDP se visível
  if (typeof kzSyncFromHeader === 'function') {
    const lang = document.getElementById('langSelect')?.value || 'pt';
    const curr = document.getElementById('currencySelect')?.value || 'BRL';
    kzSyncFromHeader(lang, curr);
  }
}

/* ══════════════════════════════════════════════════════════════
   🚢 KZ GLOBAL EXPRESS — Estimador de Logística Internacional
   Atualizado dinamicamente quando lang/currency muda no header.
   Exibe frete estimado, destino e confirmação de isenção alfandegária.
   ══════════════════════════════════════════════════════════════ */

// Tabela de estimativas por moeda/idioma (valores na moeda local)
window.KZ_INTL_SHIPPING = {
  EUR: { icon:'🚢', city:'Europa',        cost:'€ 8,90',   days:'12–18',  carrier:'Kz Global Express',   customs:'Sem taxas retidas pela WeKz',   flag:'🇪🇺' },
  USD: { icon:'✈️', city:'Estados Unidos', cost:'$ 9.50',   days:'10–16',  carrier:'Kz AirFreight Pro',   customs:'Declared value protected',       flag:'🇺🇸' },
  JPY: { icon:'🚢', city:'Tóquio',        cost:'¥ 1.800',  days:'14–20',  carrier:'Kz Global Express',   customs:'関税なし（WeKz保証）',              flag:'🇯🇵' },
  CNY: { icon:'🚢', city:'Xangai',        cost:'元 65',    days:'8–14',   carrier:'Kz ChinaRoute',       customs:'无需担心关税，WeKz全额承保',        flag:'🇨🇳' },
  INR: { icon:'✈️', city:'Mumbai',        cost:'₹ 780',    days:'14–22',  carrier:'Kz AirFreight Pro',   customs:'No customs held — WeKz covers',  flag:'🇮🇳' },
  RUB: { icon:'🚢', city:'Moscovo',       cost:'₽ 890',    days:'18–28',  carrier:'Kz Global Express',   customs:'Без таможенных удержаний',        flag:'🇷🇺' },
  BRL: null // mercado doméstico — oculta o estimador
};

// Versão localizada da linha de texto por idioma
window.KZ_INTL_SHIP_LABEL = {
  PT: (d) => `Envio estimado para <strong>${d.city}</strong>: <strong>${d.cost}</strong> via ${d.carrier} · ${d.days} dias úteis · <em>${d.customs}</em>`,
  EN: (d) => `Estimated delivery to <strong>${d.city}</strong>: <strong>${d.cost}</strong> via ${d.carrier} · ${d.days} business days · <em>${d.customs}</em>`,
  ES: (d) => `Envío estimado a <strong>${d.city}</strong>: <strong>${d.cost}</strong> vía ${d.carrier} · ${d.days} días hábiles · <em>${d.customs}</em>`,
  JA: (d) => `<strong>${d.city}</strong>への配送見積: <strong>${d.cost}</strong> (${d.carrier}) · ${d.days}営業日 · <em>${d.customs}</em>`,
  ZH: (d) => `预计发货至<strong>${d.city}</strong>: <strong>${d.cost}</strong> — ${d.carrier} · ${d.days}个工作日 · <em>${d.customs}</em>`,
  DE: (d) => `Versand nach <strong>${d.city}</strong>: <strong>${d.cost}</strong> via ${d.carrier} · ${d.days} Werktage · <em>${d.customs}</em>`,
  RU: (d) => `Доставка в <strong>${d.city}</strong>: <strong>${d.cost}</strong> — ${d.carrier} · ${d.days} рабочих дней · <em>${d.customs}</em>`,
  HI: (d) => `<strong>${d.city}</strong> तक डिलीवरी: <strong>${d.cost}</strong> — ${d.carrier} · ${d.days} कार्य दिवस · <em>${d.customs}</em>`
};

/* ── 4.5: Kz IA Admin Copilot ─────────────────────────────────────────────
   KZ_IA_RESPONSES, admKzIaGetResponse, admKzIaAddBubble, admKzIaSend,
   admKzIaQuick, initAdmKzIaPanel.
   Origem monólito: linhas 39976–40165
   ─────────────────────────────────────────────────────────────────────── */

function kzUpdateIntlShipping(kzLang, kzCurr) {
  const el    = document.getElementById('kzIntlShipping');
  const textEl = document.getElementById('kzIntlShippingText');
  if (!el || !textEl) return;

  const data = window.KZ_INTL_SHIPPING[kzCurr];

  // BRL ou moeda sem dados = mercado doméstico; oculta estimador
  if (!data) {
    el.classList.remove('kz-ship-visible');
    return;
  }

  const labelFn = window.KZ_INTL_SHIP_LABEL[kzLang] || window.KZ_INTL_SHIP_LABEL['PT'];

  // Atualiza ícone e texto
  const iconEl = el.querySelector('.kz-ship-icon');
  if (iconEl) iconEl.textContent = data.icon;
  textEl.innerHTML = labelFn(data);

  // Mostra com animação (reflow trick para re-disparar a animação)
  el.classList.remove('kz-ship-visible');
  void el.offsetWidth;
  el.classList.add('kz-ship-visible');
}

/* ══════════════════════════════════════════════════════════════
   KZ IA CHAT — PAINEL ADMIN
   Sistema de chat inteligente usando AudioContext + respostas
   contextuais simuladas. Espelha comportamento do painel do vendedor.
   ══════════════════════════════════════════════════════════════ */

/* Banco de respostas contextuais do Kz para o painel admin */
const KZ_IA_RESPONSES = {
  faturamento: [
    'Meus sensores financeiros estão ativos! 📊 O <strong>GMV de Maio 2025 é R$ 4.872.340</strong>, com alta de +23,4% em relação a Abril. A receita líquida WeKz está em <strong>R$ 389.787</strong> (margem 8%). Excelente performance — <em>Eletrônicos domina 72%</em> do volume.',
    'Análise de faturamento concluída! 💰 Maio está <strong>+23,4% acima do mês anterior</strong>. Total de <strong>38.491 pedidos</strong> processados. O ticket médio é R$ 126,58 — <em>acima da meta de R$ 120</em>.',
  ],
  lojas: [
    'Escaneando lojas pendentes... 🏪 Atualmente <strong>7 lojas aguardam aprovação</strong>: 5 pendentes de revisão e 2 com documentação incompleta. Recomendo priorizar <em>GlowBeauty Shop</em> e <em>PetLife Store</em> que estão há mais de 48h sem resposta.',
    'Radar de lojas ativo! 🔍 <strong>12.847 lojas ativas</strong> no período. Das 7 pendentes, 2 apresentam documentação incompleta — enviar e-mail automático de solicitação é a ação recomendada.',
  ],
  seguranca: [
    'Auditoria de segurança iniciada! 🔒 Tenho <strong>2 alertas ativos</strong>: 1 tentativa de acesso com credenciais inválidas (IP: 192.168.x.x) e 1 padrão suspeito de pedidos repetitivos. <em>Score de risco: 7.2/10</em> — ação preventiva recomendada.',
    'Sensores de segurança detectaram atividade incomum! ⚠️ <strong>2 contas suspeitas</strong> identificadas com padrão de fraude (múltiplos pedidos em curto período). Uptime da plataforma: <strong>98,7%</strong> nos últimos 30 dias.',
  ],
  analise: [
    'Análise completa da plataforma WeKz — Maio 2025: 📈 GMV: <strong>R$ 4.87M (+23,4%)</strong> · Net Revenue: <strong>R$ 389K (+19,1%)</strong> · Pedidos: <strong>38.491 (+5,9%)</strong> · Lojas ativas: <strong>12.847</strong> · NPS médio: <strong>4.89/5.0</strong> · Uptime: <strong>98,7%</strong>. Status geral: <em>Plataforma saudável!</em>',
    'Visão 360° do ecossistema WeKz detectada! 🌐 Destaques: <strong>Eletrônicos lidera com R$ 3,5M</strong> em GMV. Taxa de chargeback em <strong>0,8%</strong> (abaixo do limite de 1%). <em>3 produtos com denúncias urgentes</em> aguardam moderação. Recomendo ação antes das 18h.',
  ],
  moderacao: [
    'Moderação de produtos: escaneando base de dados... 🚨 <strong>3 produtos com denúncias urgentes</strong> identificados: Smartphone Xclone (8 reportes), Tênis Supreme XLR (12 reportes — uso de marca), Suplemento "Emagrece Já" (5 reportes — alegações médicas). Ação de takedown recomendada nos 3.',
    'Radar de denúncias ativo! ⚠️ <strong>15 produtos em análise</strong> neste ciclo: 3 urgentes, 12 em revisão. <em>Tênis Supreme XLR Ultra</em> lidera com 12 reportes de uso indevido de marca registrada — prioridade máxima.',
  ],
  default: [
    'Lince Cibernético a postos! 🐱 Pode perguntar sobre faturamento, lojas pendentes, segurança, moderação de produtos ou qualquer métrica da plataforma. Estou monitorando o ecossistema WeKz em tempo real.',
    'Sensores ativados! Ao seu dispor, Gestor. 🎯 Tenho acesso a todos os dados do painel — faturamento, aprovações, segurança, comunicados e configurações. O que deseja analisar?',
    'Centro de Comando WeKz operacional! 🛡️ Maio 2025 está com <strong>performance acima da meta</strong> em todos os KPIs principais. GMV +23,4%, NPS 4.89, Uptime 98,7%. Alguma área específica para investigar?',
  ],
};

/* Estado do chat IA admin */
let admKzIaHistory = [];

/* Detecta contexto da pergunta e retorna resposta */
function admKzIaGetResponse(question) {
  const q = question.toLowerCase();
  let bank;
  if (/fatura|gmv|receita|revenue|vendas|dinheiro|financ/.test(q))       bank = KZ_IA_RESPONSES.faturamento;
  else if (/loja|store|aprova|pendente|cadastr/.test(q))                  bank = KZ_IA_RESPONSES.lojas;
  else if (/segur|alert|hack|fraude|suspeito|risco|bloqu/.test(q))        bank = KZ_IA_RESPONSES.seguranca;
  else if (/análise|analise|geral|completa|plataforma|overview|360/.test(q)) bank = KZ_IA_RESPONSES.analise;
  else if (/modera|denúncia|denuncia|produto|report|falso|marca/.test(q)) bank = KZ_IA_RESPONSES.moderacao;
  else                                                                     bank = KZ_IA_RESPONSES.default;
  return bank[Math.floor(Math.random() * bank.length)];
}

/* Insere uma bolha na área de mensagens */
function admKzIaAddBubble(text, isMe, avatarLabel) {
  const area = document.getElementById('admKzIaMessages');
  if (!area) return;

  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const wrap = document.createElement('div');
  wrap.className = 'adm-kzia-bubble-wrap' + (isMe ? ' me' : '');

  if (isMe) {
    wrap.innerHTML = `
      <div class="adm-kzia-bubble-avatar me-avatar">${avatarLabel || 'A'}</div>
      <div>
        <div class="adm-kzia-bubble me">${text}</div>
        <div class="adm-kzia-bubble-time">${time}</div>
      </div>`;
  } else {
    const kzSvg = typeof getKzSVG === 'function' ? getKzSVG(22) : '🐱';
    wrap.innerHTML = `
      <div class="adm-kzia-bubble-avatar">${kzSvg}</div>
      <div>
        <div class="adm-kzia-bubble">${text}</div>
        <div class="adm-kzia-bubble-time">${time}</div>
      </div>`;
  }

  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

/* Indicador de digitação */
function admKzIaShowTyping() {
  const area = document.getElementById('admKzIaMessages');
  if (!area) return null;
  const typing = document.createElement('div');
  typing.className = 'adm-kzia-bubble-wrap';
  typing.id = 'admKzIaTyping';
  const kzSvg = typeof getKzSVG === 'function' ? getKzSVG(22) : '🐱';
  typing.innerHTML = `
    <div class="adm-kzia-bubble-avatar">${kzSvg}</div>
    <div class="adm-kzia-typing"><span></span><span></span><span></span></div>`;
  area.appendChild(typing);
  area.scrollTop = area.scrollHeight;
  return typing;
}

/* Envia mensagem do admin */
function admKzIaSend() {
  const input = document.getElementById('admKzIaInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const adminAvatar = (window.currentAdminUser && window.currentAdminUser.avatar) || 'A';
  admKzIaAddBubble(text, true, adminAvatar);
  admKzIaHistory.push({ role: 'user', text });
  input.value = '';
  input.disabled = true;

  // Typing indicator
  const typing = admKzIaShowTyping();

  // Simulated response delay (800–1400ms)
  const delay = 800 + Math.random() * 600;
  setTimeout(() => {
    if (typing) typing.remove();
    const response = admKzIaGetResponse(text);
    admKzIaAddBubble(response, false);
    admKzIaHistory.push({ role: 'kz', text: response });
    if (typeof kzPlaySound === 'function') kzPlaySound('message');
    input.disabled = false;
    input.focus();
  }, delay);
}

/* Chip de ação rápida */
function admKzIaQuick(question) {
  const input = document.getElementById('admKzIaInput');
  if (input) { input.value = question; }
  admKzIaSend();
}

/* Inicializa o painel Kz IA: injeta avatar e mensagem de boas-vindas */
function initAdmKzIaPanel() {
  // Avatar no header do painel
  const avatarEl = document.getElementById('admKzIaAvatar');
  if (avatarEl && typeof getKzSVG === 'function') {
    avatarEl.innerHTML = getKzSVG(48);
  }

  // Limpa histórico anterior
  const area = document.getElementById('admKzIaMessages');
  if (!area || area.children.length > 0) return; // já inicializado

  // Mensagem de boas-vindas do Kz
  const hour = new Date().getHours();
  let greet;
  if      (hour >= 5  && hour < 12) greet = 'Bom dia, Gestor';
  else if (hour >= 12 && hour < 18) greet = 'Boa tarde, Gestor';
  else if (hour >= 18 && hour < 22) greet = 'Boa noite, Gestor';
  else                               greet = 'Olá, Gestor insone';

  const welcome = `<strong>${greet}!</strong> Lince Cibernético online. 🐱 Estou monitorando a plataforma WeKz em tempo real. Posso analisar <em>faturamento</em>, <em>lojas pendentes</em>, <em>segurança</em>, <em>moderação</em> e muito mais. O que deseja investigar?`;
  admKzIaAddBubble(welcome, false);
  if (typeof kzPlaySound === 'function') setTimeout(() => kzPlaySound('message'), 200);
}


/* ════════════════════════════════════════════════════════════════
   MÓDULO 1 — MEDIAÇÃO DE DISPUTAS
   ════════════════════════════════════════════════════════════════ */


/* ── 4.6: Disputas + Saques + Patches de Integração ──────────────────────
   ADMIN_DISPUTES (com análise automática da Kz IA embutida no chat,
   who:'kz'), renderDisputas, openDisputaChat, renderDisputaChat,
   admResolveDispute, ADMIN_PAYOUTS, renderSaques, admApprovePayout,
   admHoldPayout, syncOverviewKPIs (a REAL — usa d.severity/s.solicitado
   e atualiza kpiDisputasAtivas/kpiVolumeRetido, não a versão fabricada
   descartada), patches de integração entre os módulos acima.
   Origem monólito: linhas 40166–40859
   ─────────────────────────────────────────────────────────────────────── */
const ADMIN_DISPUTES = [
  {
    id: '#WKZ-9105', severity: 'escalated',
    title: 'Produto não entregue após 22 dias',
    motivo: 'Produto não entregue',
    valor: 'R$ 1.249,90', prazo: '3 dias',
    buyer: { name: 'Lucas M.', id: '#U3821', avatar: 'L' },
    seller: { name: 'TechNova Store', id: '#S1142', avatar: 'T' },
    msgs: [
      { who: 'buyer',  text: 'Comprei há 22 dias e nada chegou. O código de rastreio não atualiza desde o dia 3.', time: '10:21' },
      { who: 'seller', text: 'O produto foi enviado conforme prazo. Os Correios estão com atraso na minha região.', time: '10:45' },
      { who: 'buyer',  text: 'Já abri reclamação nos Correios e disseram que o objeto não consta no sistema deles.', time: '11:02' },
      { who: 'kz',     text: '⚡ Análise automática: rastreamento inativo há 19 dias. Probabilidade de extravio: 87%. Recomendo reembolso total ao comprador.', time: '11:03' },
    ]
  },
  {
    id: '#WKZ-9088', severity: 'open',
    title: 'Smartwatch chegou com defeito na tela',
    motivo: 'Produto com defeito',
    valor: 'R$ 489,00', prazo: '7 dias',
    buyer: { name: 'Fernanda K.', id: '#U7703', avatar: 'F' },
    seller: { name: 'GadgetDiscount BR', id: '#S0881', avatar: 'G' },
    msgs: [
      { who: 'buyer',  text: 'A tela veio com uma linha horizontal morta. Tirei fotos e vídeo assim que abri a caixa.', time: '14:33' },
      { who: 'seller', text: 'Pode ser dano no transporte. Solicito que o produto seja devolvido para análise técnica.', time: '15:10' },
      { who: 'kz',     text: '📊 Histórico desta loja: 3 disputas similares nos últimos 60 dias. Padrão identificado.', time: '15:11' },
    ]
  },
  {
    id: '#WKZ-9072', severity: 'open',
    title: 'Recebi produto diferente do anunciado',
    motivo: 'Produto diferente do anúncio',
    valor: 'R$ 312,00', prazo: '5 dias',
    buyer: { name: 'Roberto A.', id: '#U5512', avatar: 'R' },
    seller: { name: 'ModaFusion BR', id: '#S2290', avatar: 'M' },
    msgs: [
      { who: 'buyer',  text: 'Pedi tamanho GG cor preta e veio M cor cinza. É completamente diferente do que anunciei.', time: '09:14' },
      { who: 'seller', text: 'Houve uma troca no estoque. Podemos fazer a reenvio do item correto com prazo de 5 dias.', time: '09:52' },
    ]
  },
  {
    id: '#WKZ-9067', severity: 'open',
    title: 'Estorno não processado após cancelamento',
    motivo: 'Estorno não realizado',
    valor: 'R$ 2.180,00', prazo: '2 dias',
    buyer: { name: 'Camila S.', id: '#U1029', avatar: 'C' },
    seller: { name: 'EleteQ Plus', id: '#S3371', avatar: 'E' },
    msgs: [
      { who: 'buyer',  text: 'Cancelei o pedido há 12 dias. O sistema confirmou o cancelamento mas o estorno ainda não caiu.', time: '16:05' },
      { who: 'kz',     text: '🔍 Verificando: cancelamento confirmado em 10/05. Estorno ainda pendente no gateway. Ação admin necessária.', time: '16:06' },
    ]
  },
  {
    id: '#WKZ-8998', severity: 'resolved',
    title: 'Perfume chegou lacrado mas vazio',
    motivo: 'Produto adulterado',
    valor: 'R$ 890,00', prazo: '—',
    buyer: { name: 'Patricia N.', id: '#U8834', avatar: 'P' },
    seller: { name: 'BeautySecret Store', id: '#S4410', avatar: 'B' },
    msgs: [
      { who: 'buyer',  text: 'O frasco chegou lacrado mas completamente vazio. Claramente adulterado antes do envio.', time: '08:30' },
      { who: 'kz',     text: '🚨 Alerta de fraude grave detectado. Loja já tem denúncia ativa de produto adulterado.', time: '08:31' },
      { who: 'admin',  text: '✅ Reembolso total de R$ 890,00 aprovado. Loja notificada e penalidade aplicada (30% do saldo retido).', time: '09:45' },
    ]
  },
];

let _activeDisputaId = null;
let _disputasActiveFilter = 'all';

/* ── Render lista de disputas ── */
function renderDisputas(filter) {
  _disputasActiveFilter = filter || _disputasActiveFilter;
  const list = document.getElementById('disputasList');
  if (!list) return;

  let data = ADMIN_DISPUTES;
  if (_disputasActiveFilter !== 'all') data = data.filter(d => d.severity === _disputasActiveFilter);

  // Subtítulo dinâmico
  const open = ADMIN_DISPUTES.filter(d => d.severity !== 'resolved').length;
  const esc  = ADMIN_DISPUTES.filter(d => d.severity === 'escalated').length;
  const sub = document.getElementById('disputasSubtitle');
  if (sub) sub.textContent = `${open} dispute${open !== 1 ? 's' : ''} em aberto · ${esc} escalada${esc !== 1 ? 's' : ''} · ação imediata requerida`;

  // Badge nav
  const badge = document.getElementById('navBadgeDisputas');
  if (badge) badge.textContent = open;

  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted);">✅ Nenhuma disputa nesta categoria.</div>';
    return;
  }

  list.innerHTML = data.map(d => `
    <div class="adm-disputa-card sev-${d.severity}" id="admDisputa_${d.id}">
      <div class="adm-disputa-header" onclick="openDisputaChat('${d.id}')">
        <div class="adm-disputa-id-badge sev-${d.severity}">${d.id}</div>
        <div class="adm-disputa-meta">
          <div class="adm-disputa-title">${d.title}</div>
          <div class="adm-disputa-info">
            <span class="adm-disputa-info-chip">👤 ${d.buyer.name} ${d.buyer.id}</span>
            <span style="color:var(--border);">vs</span>
            <span class="adm-disputa-info-chip">🏪 ${d.seller.name} ${d.seller.id}</span>
            <span class="adm-disputa-info-chip">💰 ${d.valor}</span>
            <span class="adm-disputa-info-chip">⏱ Prazo: ${d.prazo}</span>
            <span class="adm-disputa-info-chip">${d.msgs.length} msg${d.msgs.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="adm-disputa-motivo"><strong>Motivo:</strong> <span style="color:var(--muted);">${d.motivo}</span></div>
        </div>
        <div class="adm-disputa-btns">
          <button class="adm-btn-view" onclick="event.stopPropagation();openDisputaChat('${d.id}')">💬 Chat</button>
          ${d.severity !== 'resolved' ? `<button class="adm-btn-refund" onclick="event.stopPropagation();admResolveDispute('${d.id}','refund_buyer')" style="font-size:11px;padding:7px 10px;">↩ Reembolsar</button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function filterDisputas(filter, btn) {
  document.querySelectorAll('#adm-disputas .adm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDisputas(filter);
}

/* ── Abre modal de chat tripartite ── */
function openDisputaChat(id) {
  const d = ADMIN_DISPUTES.find(x => x.id === id);
  if (!d) return;
  _activeDisputaId = id;

  document.getElementById('disputaChatTitle').textContent = `Disputa ${d.id} — ${d.motivo}`;
  document.getElementById('disputaChatSub').textContent   = `${d.buyer.name} vs ${d.seller.name} · Valor: ${d.valor}`;
  document.getElementById('disputaChatModal').style.display = 'flex';

  // Partes
  document.getElementById('disputaChatParties').innerHTML = `
    <div class="adm-party-card buyer">
      <div class="adm-party-avatar">${d.buyer.avatar}</div>
      <div class="adm-party-name">${d.buyer.name}</div>
      <div class="adm-party-role">Comprador</div>
    </div>
    <div class="adm-party-vs">VS</div>
    <div class="adm-party-card seller">
      <div class="adm-party-avatar">${d.seller.avatar}</div>
      <div class="adm-party-name">${d.seller.name}</div>
      <div class="adm-party-role">Lojista</div>
    </div>`;

  // Mensagens
  renderDisputaChat(d);

  // Botões de resolução
  const actionsEl = document.getElementById('disputaChatActions');
  if (d.severity !== 'resolved') {
    actionsEl.innerHTML = `
      <button class="adm-btn-refund"  onclick="admResolveDispute('${d.id}','refund_buyer')">↩ Reembolsar Comprador (100%)</button>
      <button class="adm-btn-release" onclick="admResolveDispute('${d.id}','release_seller')">✅ Liberar para Lojista</button>
      <button class="adm-btn-partial" onclick="admResolveDispute('${d.id}','partial_split')">⚖️ Divisão Parcial (50/50)</button>`;
  } else {
    actionsEl.innerHTML = `<div style="padding:4px 0;color:#22C55E;font-size:13px;font-weight:600;">✅ Disputa já resolvida.</div>`;
  }
}

function renderDisputaChat(d) {
  const chatEl = document.getElementById('disputaChatMessages');
  if (!chatEl) return;
  chatEl.innerHTML = d.msgs.map(m => {
    const isAdmin = m.who === 'admin';
    const isKz    = m.who === 'kz';
    const cls     = isKz ? 'msg-kz' : `msg-${m.who}`;
    const avMap   = { buyer: d.buyer.avatar, seller: d.seller.avatar, admin: '🛡', kz: '' };
    const av      = isKz ? (typeof getKzSVG === 'function' ? getKzSVG(18) : '🐱') : avMap[m.who];
    /* FIX XSS (auditoria M5): m.text vem direto de um <textarea> (ver
       sendDisputaMsg) sem nenhuma sanitização — sem escapeHtml(), um
       comprador ou vendedor mal-intencionado poderia injetar HTML/JS
       que executaria na sessão do Admin ao abrir a disputa. */
    return `
      <div class="adm-chat-msg ${cls}">
        <div class="adm-chat-avatar">${av}</div>
        <div>
          <div class="adm-chat-bubble">${escapeHtml(m.text)}</div>
          <div class="adm-chat-meta">${isKz ? '🤖 Kz IA' : isAdmin ? '🛡️ Admin WeKz' : m.who === 'buyer' ? '👤 ' + d.buyer.name : '🏪 ' + d.seller.name} · ${m.time}</div>
        </div>
      </div>`;
  }).join('');
  chatEl.scrollTop = chatEl.scrollHeight;
}

function sendDisputaMsg() {
  /* FIX Sprint M5 (Hardening): rate limit de 20 mensagens por minuto —
     generoso o bastante para uma conversa real, mas barra flood/spam
     automatizado no chat de disputas. */
  if (typeof wkzRateLimit === 'function' && !wkzRateLimit('disputa_msg', 20, 60000)) {
    showToast('⚠️ Muitas mensagens em pouco tempo. Aguarde um instante.');
    return;
  }

  const input  = document.getElementById('disputaChatInput');
  const sendAs = document.getElementById('disputaSendAs');
  if (!input || !_activeDisputaId) return;
  const text = input.value.trim();
  if (!text) return;

  const d = ADMIN_DISPUTES.find(x => x.id === _activeDisputaId);
  if (!d) return;

  const whoMap  = { admin: 'admin', buyer: 'buyer', seller: 'seller' };
  const who     = whoMap[sendAs ? sendAs.value : 'admin'] || 'admin';
  const time    = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  d.msgs.push({ who, text, time });
  input.value = '';
  renderDisputaChat(d);
  if (who === 'admin') admAuditAdd('💬', `Mensagem enviada na Disputa ${d.id}`, 'Admin WeKz');
}

function closeDisputaChat() {
  document.getElementById('disputaChatModal').style.display = 'none';
  _activeDisputaId = null;
}

/* ── Resolve disputa ── */
function admResolveDispute(id, resolution) {
  const d = ADMIN_DISPUTES.find(x => x.id === id);
  if (!d || d.severity === 'resolved') return;

  const msgs = {
    refund_buyer:   { toast: `↩ Reembolso de ${d.valor} aprovado para ${d.buyer.name}.`, audit: `Disputa ${id} resolvida — Reembolso total ao comprador (${d.valor})` },
    release_seller: { toast: `✅ Valor de ${d.valor} liberado para ${d.seller.name}.`, audit: `Disputa ${id} resolvida — Valor liberado ao lojista (${d.valor})` },
    partial_split:  { toast: `⚖️ Divisão 50/50 aplicada na Disputa ${id}.`, audit: `Disputa ${id} resolvida — Divisão parcial 50/50 (${d.valor})` },
  };

  const m = msgs[resolution];
  if (!m) return;

  d.severity = 'resolved';
  const time = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  d.msgs.push({ who: 'admin', text: `✅ Resolução: ${m.toast}`, time });

  admAuditAdd('⚖️', m.audit, 'Admin WeKz');
  showToast(m.toast);
  closeDisputaChat();
  renderDisputas(_disputasActiveFilter);

  // Propaga o veredito para o painel do vendedor e para a Central de
  // Disputas do comprador — fecha o ciclo trilateral (comprador ↔
  // vendedor ↔ admin) para disputas abertas através do fluxo do comprador.
  const verdictMap = {
    refund_buyer:   { sellerLabel: '✓ Favorável ao Comprador (reembolso total)', sellerColor: '#22C55E', buyerKey: 'buyer',   buyerText: `✅ Veredito a seu favor — Reembolso de ${d.valor} processado em 2 dias úteis.` },
    release_seller: { sellerLabel: '✓ Favorável ao Vendedor',                    sellerColor: '#22C55E', buyerKey: 'seller',  buyerText: `🏪 Veredito favorável ao vendedor — Valor de ${d.valor} liberado à loja.` },
    partial_split:  { sellerLabel: '◐ Resolução Parcial (divisão 50/50)',        sellerColor: '#F59E0B', buyerKey: 'partial', buyerText: `⚖️ Resolução parcial — Divisão de 50/50 sobre ${d.valor}.` },
  };
  const vm = verdictMap[resolution];
  if (vm) {
    if (typeof wkzPropagateResolutionToSeller === 'function') {
      wkzPropagateResolutionToSeller(id, vm.sellerLabel, vm.sellerColor);
    }
    if (typeof window.cpUpdateDisputeVerdict === 'function') {
      window.cpUpdateDisputeVerdict(id, vm.buyerKey, vm.buyerText);
    }
    /* SINCRONIA P2/P3: notifica o comprador com push + atualiza CP_ORDERS */
    if (typeof wkzNotifyBuyerDisputeVerdict === 'function') {
      wkzNotifyBuyerDisputeVerdict(id, resolution, vm.buyerText, d.valor);
    }
  }

  // Atualiza badge
  const badge = document.getElementById('navBadgeDisputas');
  const open  = ADMIN_DISPUTES.filter(x => x.severity !== 'resolved').length;
  if (badge) badge.textContent = open;

  // Kz IA registra a ação
  admKzIaHistory && admKzIaHistory.push({ role: 'system', text: `Disputa ${id} resolvida: ${resolution}` });
}

/* ── Kz monitora disputas (chip animado) ── */
function initDisputasKzMonitor() {
  const iconEl = document.getElementById('disputasKzChipIcon');
  const msgEl  = document.getElementById('disputasKzChipMsg');
  if (!iconEl || !msgEl) return;
  if (typeof getKzSVG === 'function') iconEl.innerHTML = getKzSVG(16);
  const msgs = [
    'Monitorando padrões de fraude nas disputas...',
    `${ADMIN_DISPUTES.filter(d => d.severity === 'escalated').length} disputa(s) escalada(s) requerem ação imediata`,
    'Análise de risco em andamento · 3 lojas sob observação',
    'Kz detectou padrão suspeito em GadgetDiscount BR',
  ];
  let i = 0;
  msgEl.textContent = msgs[0];
  setInterval(() => { i = (i + 1) % msgs.length; msgEl.textContent = msgs[i]; }, 4000);
}

/* ════════════════════════════════════════════════════════════════
   MÓDULO 2 — SAQUES / PAYOUTS
   ════════════════════════════════════════════════════════════════ */

const ADMIN_PAYOUTS = [
  { id: 'SW-001', avatar: 'T', loja: 'TechNova Store',     lojaId: '#S1142', saldo: 18420.00, solicitado: 12000.00, comissao: 8,   data: '23/05 · 08:14', status: 'pending',  risco: 'low'  },
  { id: 'SW-002', avatar: 'G', loja: 'GadgetDiscount BR',  lojaId: '#S0881', saldo:  4280.00, solicitado:  4000.00, comissao: 10,  data: '22/05 · 17:42', status: 'hold',     risco: 'high' },
  { id: 'SW-003', avatar: 'M', loja: 'ModaFusion BR',      lojaId: '#S2290', saldo:  9110.00, solicitado:  6500.00, comissao: 12,  data: '22/05 · 14:05', status: 'pending',  risco: 'low'  },
  { id: 'SW-004', avatar: 'E', loja: 'EleteQ Plus',        lojaId: '#S3371', saldo: 31200.00, solicitado: 20000.00, comissao: 8,   data: '21/05 · 11:30', status: 'pending',  risco: 'med'  },
  { id: 'SW-005', avatar: 'B', loja: 'BeautySecret Store', lojaId: '#S4410', saldo:  2900.00, solicitado:  2900.00, comissao: 15,  data: '20/05 · 09:22', status: 'hold',     risco: 'high' },
  { id: 'SW-006', avatar: 'N', loja: 'NutriShop Brasil',   lojaId: '#S5501', saldo:  7650.00, solicitado:  5000.00, comissao: 10,  data: '19/05 · 16:50', status: 'approved', risco: 'low'  },
  { id: 'SW-007', avatar: 'P', loja: 'PetLife Store',      lojaId: '#S6622', saldo:  3300.00, solicitado:  2500.00, comissao: 10,  data: '19/05 · 13:11', status: 'approved', risco: 'low'  },
  { id: 'SW-008', avatar: 'F', loja: 'FashionKing BR',     lojaId: '#S7743', saldo:  5800.00, solicitado:  4200.00, comissao: 12,  data: '18/05 · 10:44', status: 'pending',  risco: 'low'  },
];

let _saquesActiveFilter = 'all';
let _activeSaqueId = null;

function fmtBRL(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSaques(filter) {
  _saquesActiveFilter = filter || _saquesActiveFilter;
  const tbody = document.getElementById('saquesTableBody');
  if (!tbody) return;

  let data = ADMIN_PAYOUTS;
  if (_saquesActiveFilter !== 'all') data = data.filter(s => s.status === _saquesActiveFilter);

  // KPI summary
  const pending  = ADMIN_PAYOUTS.filter(s => s.status === 'pending');
  const totalPend = pending.reduce((acc, s) => acc + s.solicitado, 0);
  const sumEl = document.getElementById('saquesSummary');
  if (sumEl) sumEl.innerHTML = `
    <div class="adm-saques-kpi"><div class="adm-saques-kpi-val">${pending.length}</div><div class="adm-saques-kpi-label">Pendentes</div></div>
    <div class="adm-saques-kpi"><div class="adm-saques-kpi-val">${fmtBRL(totalPend)}</div><div class="adm-saques-kpi-label">A Liberar</div></div>
    <div class="adm-saques-kpi"><div class="adm-saques-kpi-val">${ADMIN_PAYOUTS.filter(s => s.status === 'hold').length}</div><div class="adm-saques-kpi-label">Retidos</div></div>`;

  // Subtítulo
  const sub = document.getElementById('saquesSubtitle');
  if (sub) sub.textContent = `${pending.length} saques pendentes · Total a liberar: ${fmtBRL(totalPend)}`;

  // Badge nav
  const badge = document.getElementById('navBadgeSaques');
  if (badge) badge.textContent = pending.length;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted);">✅ Nenhum saque nesta categoria.</td></tr>`;
    return;
  }

  const statusLabel = { pending: 'Pendente', hold: 'Retido', approved: 'Aprovado' };
  const riscoColor  = { low: '#22C55E', med: '#F59E0B', high: '#EF4444' };

  tbody.innerHTML = data.map(s => {
    const comissaoVal    = s.solicitado * (s.comissao / 100);
    const liquido        = s.solicitado - comissaoVal;
    const taxaExpress    = 0.03; // 3% de taxa de antecipação expressa
    const liquidoExpress = liquido * (1 - taxaExpress);
    const taxaValBRL     = fmtBRL(liquido * taxaExpress);
    return `
      <tr onclick="openSaqueDetail('${s.id}')">
        <td>
          <div class="adm-saque-loja">
            <div class="adm-saque-loja-avatar">${s.avatar}</div>
            <div>
              <div class="adm-saque-loja-name">${s.loja}</div>
              <div class="adm-saque-loja-id">${s.lojaId}</div>
            </div>
          </div>
        </td>
        <td><div class="adm-saque-val-main">${fmtBRL(s.saldo)}</div></td>
        <td>
          <div class="adm-saque-val-main">${fmtBRL(s.solicitado)}</div>
          ${s.risco === 'high' ? '<div class="adm-saque-val-sub" style="color:#EF4444;">⚠️ Risco alto</div>' : s.risco === 'med' ? '<div class="adm-saque-val-sub" style="color:#F59E0B;">⚠️ Verificar</div>' : ''}
        </td>
        <td><span class="adm-saque-comissao">${fmtBRL(comissaoVal)} <span style="font-size:10px;font-weight:500;color:var(--muted);">(${s.comissao}%)</span></span></td>
        <td><span class="adm-saque-liquido">${fmtBRL(liquido)}</span></td>
        <td onclick="event.stopPropagation()">
          ${s.status !== 'approved' ? `
          <div class="adm-antecipar-cell">
            <div class="adm-antecipar-info">
              <span class="adm-antecipar-val">${fmtBRL(liquidoExpress)}</span>
              <span class="adm-antecipar-fee">−3% · desc. ${taxaValBRL}</span>
            </div>
            <button class="adm-btn-antecipar" onclick="admAnteciparSaque('${s.id}')">⚡ Antecipar</button>
          </div>` : '<span style="color:var(--muted);font-size:12px;">—</span>'}
        </td>
        <td style="color:var(--muted);font-size:12px;">${s.data}</td>
        <td><span class="adm-saque-status ${s.status}">${statusLabel[s.status]}</span></td>
        <td>
          <div class="adm-saque-action-btns" onclick="event.stopPropagation()">
            ${s.status !== 'approved' ? `<button class="adm-btn-approve" style="padding:6px 12px;font-size:12px;" onclick="event.stopPropagation();admApprovePayout('${s.id}')">✅ Aprovar</button>` : ''}
            ${s.status === 'pending'  ? `<button class="adm-btn-reject"  style="padding:6px 12px;font-size:12px;" onclick="event.stopPropagation();admHoldPayout('${s.id}')">🔒 Reter</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function filterSaques(filter, btn) {
  document.querySelectorAll('#adm-saques .adm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSaques(filter);
}

/* ── Aprovar saque ── */
function admApprovePayout(id) {
  const s = ADMIN_PAYOUTS.find(x => x.id === id);
  if (!s || s.status === 'approved') return;
  const comissaoVal = s.solicitado * (s.comissao / 100);
  const liquido     = s.solicitado - comissaoVal;
  s.status = 'approved';
  admAuditAdd('💰', `Saque ${id} aprovado — ${s.loja}: ${fmtBRL(liquido)} líquido liberado (comissão WeKz: ${fmtBRL(comissaoVal)})`, 'Admin WeKz');
  showToast(`✅ Saque ${id} aprovado! ${fmtBRL(liquido)} transferido para ${s.loja}.`);
  renderSaques(_saquesActiveFilter);
}

/* ── Reter saque ── */
function admHoldPayout(id) {
  const s = ADMIN_PAYOUTS.find(x => x.id === id);
  if (!s || s.status !== 'pending') return;
  s.status = 'hold';
  admAuditAdd('🔒', `Saque ${id} retido para análise — ${s.loja} (${fmtBRL(s.solicitado)})`, 'Admin WeKz');
  showToast(`🔒 Saque ${id} retido para análise. Loja notificada.`);
  renderSaques(_saquesActiveFilter);
}

/* ── Modal de detalhe ── */
function openSaqueDetail(id) {
  const s = ADMIN_PAYOUTS.find(x => x.id === id);
  if (!s) return;
  _activeSaqueId = id;
  const comissaoVal = s.solicitado * (s.comissao / 100);
  const liquido     = s.solicitado - comissaoVal;
  const riscoTxt    = { low: '✅ Baixo', med: '⚠️ Médio', high: '🚨 Alto' };
  const statusLabel = { pending: 'Pendente', hold: 'Retido', approved: 'Aprovado' };

  document.getElementById('saqueDetailTitle').textContent = `Saque ${s.id} — ${s.loja}`;
  document.getElementById('saqueDetailBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Lojista</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;">${s.loja}</div>
        <div style="font-size:12px;color:var(--muted);">${s.lojaId} · Solicitado em ${s.data}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Risco</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;">${riscoTxt[s.risco]}</div>
        <div style="font-size:12px;color:var(--muted);">Status atual: ${statusLabel[s.status]}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Saldo total loja</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:var(--text);">${fmtBRL(s.saldo)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Valor solicitado</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:var(--text);">${fmtBRL(s.solicitado)}</div>
      </div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Comissão WeKz (${s.comissao}%)</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#F59E0B;">${fmtBRL(comissaoVal)}</div>
      </div>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Líquido a pagar</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#22C55E;">${fmtBRL(liquido)}</div>
      </div>
    </div>`;

  const approveBtn = document.getElementById('saqueDetailApprove');
  const holdBtn    = document.getElementById('saqueDetailHold');
  if (approveBtn) { approveBtn.onclick = () => { admApprovePayout(id); closeSaqueDetail(); }; approveBtn.disabled = s.status === 'approved'; }
  if (holdBtn)    { holdBtn.onclick    = () => { admHoldPayout(id);    closeSaqueDetail(); }; holdBtn.disabled    = s.status !== 'pending'; }

  document.getElementById('saqueDetailModal').style.display = 'flex';
}

function closeSaqueDetail() {
  document.getElementById('saqueDetailModal').style.display = 'none';
  _activeSaqueId = null;
}

/* ════════════════════════════════════════════════════════════════
   INTEGRAÇÃO KZ IA — respostas sobre disputas e saques
   ════════════════════════════════════════════════════════════════ */
(function patchKzIaForNewModules() {
  const _origGetResponse = window.admKzIaGetResponse;
  window.admKzIaGetResponse = function(question) {
    const q = question.toLowerCase();

    /* ── Disputas ── */
    if (/disputa|mediação|mediac|reembolso|chargeback|cliente.*loja|comprador.*loja/.test(q)) {
      const open = ADMIN_DISPUTES.filter(d => d.severity !== 'resolved').length;
      const esc  = ADMIN_DISPUTES.filter(d => d.severity === 'escalated').length;
      const resolved = ADMIN_DISPUTES.filter(d => d.severity === 'resolved').length;
      return `⚖️ <strong>Central de Disputas:</strong> há <em>${open} disputas ativas</em> (${esc} escaladas, ${resolved} resolvidas).<br><br>🚨 Atenção às escaladas: <strong>#WKZ-9105</strong> (produto não entregue — 22 dias, ${ADMIN_DISPUTES[0].buyer.name}) e <strong>#WKZ-9067</strong> (estorno de R$ 2.180 pendente há 12 dias). Recomendo ação imediata.<br><br>🔍 GadgetDiscount BR tem padrão recorrente de disputas — considero monitoramento elevado.`;
    }

    /* ── Saques ── */
    if (/saque|payout|pagamento.*loja|liberar.*valor|transferência|financeiro/.test(q)) {
      const pending    = ADMIN_PAYOUTS.filter(s => s.status === 'pending');
      const totalPend  = pending.reduce((a, s) => a + s.solicitado, 0);
      const highRisk   = ADMIN_PAYOUTS.filter(s => s.risco === 'high');
      return `💳 <strong>Fila de Saques:</strong> ${pending.length} saques pendentes totalizando <em>${fmtBRL(totalPend)}</em>.<br><br>⚠️ ${highRisk.length} saque(s) com <strong>risco alto</strong>: ${highRisk.map(s => s.loja + ' (' + fmtBRL(s.solicitado) + ')').join(', ')}. Recomendo reter para análise antes de liberar.<br><br>✅ Saques de baixo risco (TechNova, ModaFusion, FashionKing) podem ser liberados imediatamente.`;
    }

    /* ── Fraude ── */
    if (/fraude|suspeito|risco|segurança|anomalia/.test(q)) {
      const highRisk = ADMIN_PAYOUTS.filter(s => s.risco === 'high').map(s => s.loja);
      const escDisp  = ADMIN_DISPUTES.filter(d => d.severity === 'escalated').map(d => d.seller.name);
      return `🚨 <strong>Radar de Fraude — Kz Lince Cibernético:</strong><br><br>🔴 Lojas em alerta máximo: <strong>${[...new Set([...highRisk, ...escDisp])].join(', ')}</strong>.<br><br>🔍 GadgetDiscount BR: 3 disputas de defeito + saque de alto risco simultâneos — padrão consistente com fraude estruturada.<br><br>🔐 BeautySecret Store: saque com 100% do saldo + disputa de produto adulterado em aberto. Bloqueio preventivo recomendado.`;
    }

    return _origGetResponse ? _origGetResponse(question) : `Não encontrei dados específicos para sua pergunta. Tente perguntar sobre <em>disputas</em>, <em>saques</em>, <em>faturamento</em> ou <em>segurança</em>.`;
  };
})();

/* ── Hook unificado: inicializa todos os módulos ao trocar de aba ── */
(function patchSwitchAdminTabAll() {
  const _orig = window.switchAdminTab;
  window.switchAdminTab = function(tab, el) {
    if (_orig) _orig(tab, el);
    setTimeout(admNavFadeInit, 60);
    if (tab === 'kz-ia')   setTimeout(initAdmKzIaPanel, 60);
    if (tab === 'disputas') setTimeout(() => { renderDisputas('all'); initDisputasKzMonitor(); }, 60);
    if (tab === 'saques')   setTimeout(() => renderSaques('all'), 60);
    if (tab === 'overview') setTimeout(() => syncOverviewKPIs(false), 60);
  };
})();

/* ════════════════════════════════════════════════════════════════
   KPIs DINÂMICOS — Disputas & Volume Retido
   Lê ADMIN_DISPUTES e ADMIN_PAYOUTS em tempo real.
   syncOverviewKPIs(flash) → atualiza DOM + animação opcional.
   ════════════════════════════════════════════════════════════════ */
function syncOverviewKPIs(flash) {
  if (typeof ADMIN_DISPUTES === 'undefined' || typeof ADMIN_PAYOUTS === 'undefined') return;

  /* ── Disputas abertas ── */
  const openDisputas = ADMIN_DISPUTES.filter(d => d.severity !== 'resolved').length;
  const escDisputas  = ADMIN_DISPUTES.filter(d => d.severity === 'escalated').length;

  const numEl  = document.getElementById('kpiDisputasAtivas');
  const escEl  = document.getElementById('kpiDisputasEsc');
  const cardD  = document.getElementById('kpiCardDisputas');
  if (numEl) {
    numEl.textContent = openDisputas;
    // Cor adaptativa: 0 = verde, >0 = vermelho
    numEl.className = 'adm-kpi-num ' + (openDisputas === 0 ? 'adm-kpi-ok' : 'adm-kpi-danger');
  }
  if (escEl) {
    escEl.textContent = escDisputas > 0 ? `⚠ ${escDisputas} escalada${escDisputas > 1 ? 's' : ''}` : '';
  }

  /* ── Volume retido (pending + hold) ── */
  const retidos   = ADMIN_PAYOUTS.filter(s => s.status === 'pending' || s.status === 'hold');
  const volRetido = retidos.reduce((acc, s) => acc + s.solicitado, 0);
  const holdCount = ADMIN_PAYOUTS.filter(s => s.status === 'hold').length;
  const pendCount = ADMIN_PAYOUTS.filter(s => s.status === 'pending').length;

  const volEl   = document.getElementById('kpiVolumeRetido');
  const subEl   = document.getElementById('kpiSaquesCount');
  const cardR   = document.getElementById('kpiCardRetido');
  if (volEl) {
    volEl.textContent = volRetido > 0
      ? 'R$ ' + volRetido.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : 'R$ 0';
    volEl.className = 'adm-kpi-num ' + (volRetido === 0 ? 'adm-kpi-ok' : 'adm-kpi-warn');
  }
  if (subEl) {
    const parts = [];
    if (pendCount > 0) parts.push(`${pendCount} pendente${pendCount > 1 ? 's' : ''}`);
    if (holdCount > 0) parts.push(`${holdCount} retido${holdCount > 1 ? 's' : ''}`);
    subEl.textContent = parts.length ? parts.join(' · ') : 'Nenhum saque pendente';
  }

  /* ── Animação flash ── */
  if (flash) {
    [{ card: cardD, num: numEl }, { card: cardR, num: volEl }].forEach(({ card, num }) => {
      if (card)  { card.classList.remove('kpi-flash');   void card.offsetWidth;   card.classList.add('kpi-flash'); }
      if (num)   { num.classList.remove('kpi-num-pop');  void num.offsetWidth;    num.classList.add('kpi-num-pop'); }
      if (card)  setTimeout(() => card.classList.remove('kpi-flash'),   1100);
      if (num)   setTimeout(() => num.classList.remove('kpi-num-pop'),  650);
    });
  }
}

/* Popula KPIs assim que ADMIN_DISPUTES e ADMIN_PAYOUTS estiverem prontos */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => syncOverviewKPIs(false), 400);
});

/* ════════════════════════════════════════════════════════════════
   PATCH — admResolveDispute: sincroniza KPIs ao fechar disputa
   ════════════════════════════════════════════════════════════════ */
(function patchResolveDispute() {
  const _orig = window.admResolveDispute;
  window.admResolveDispute = function(id, resolution) {
    if (_orig) _orig(id, resolution);
    setTimeout(() => syncOverviewKPIs(true), 80);
  };
})();

/* ════════════════════════════════════════════════════════════════
   PATCH — admApprovePayout / admHoldPayout: sincroniza KPIs
   ════════════════════════════════════════════════════════════════ */
(function patchPayoutActions() {
  const _origApprove = window.admApprovePayout;
  const _origHold    = window.admHoldPayout;

  window.admApprovePayout = function(id) {
    if (_origApprove) _origApprove(id);
    setTimeout(() => syncOverviewKPIs(true), 80);
  };
  window.admHoldPayout = function(id) {
    if (_origHold) _origHold(id);
    setTimeout(() => syncOverviewKPIs(true), 80);
  };
})();

/* ════════════════════════════════════════════════════════════════
   CHAT TRIPARTITE — Anexo de prova visual
   handleDisputaAttach(input): lê imagem, injeta balão + audit log
   ════════════════════════════════════════════════════════════════ */
function handleDisputaAttach(input) {
  if (!input.files || !input.files[0] || !_activeDisputaId) {
    input.value = '';
    return;
  }
  const file = input.files[0];
  if (!file.type.startsWith('image/')) {
    showToast('⚠️ Apenas imagens são aceitas como prova visual.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const imgSrc = e.target.result; // base64 dataURL
    const d = ADMIN_DISPUTES.find(x => x.id === _activeDisputaId);
    if (!d) return;

    const sendAs  = document.getElementById('disputaSendAs');
    const whoMap  = { admin: 'admin', buyer: 'buyer', seller: 'seller' };
    const who     = whoMap[(sendAs && sendAs.value) || 'buyer'] || 'buyer';
    const time    = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fname   = file.name.length > 24 ? file.name.slice(0, 21) + '…' : file.name;

    /* Insere mensagem com imgSrc. FIX XSS (auditoria M5): sem tags HTML
       embutidas aqui — fname vem de file.name (nome do arquivo), também
       é entrada controlada pelo usuário. Como renderDisputaChat agora
       escapa m.text sempre, manter <em> aqui só mostraria a tag literal
       em vez de itálico — texto plano evita o conflito. */
    d.msgs.push({ who, text: `📎 Prova visual: ${fname}`, imgSrc, time });

    /* Re-renderiza chat */
    renderDisputaChat(d);

    /* Audit log */
    const whoLabel = { admin: 'Admin WeKz', buyer: d.buyer.name, seller: d.seller.name };
    admAuditAdd(
      '📎',
      `Prova visual anexada na Disputa ${d.id} por ${whoLabel[who] || who} — arquivo: ${fname}`,
      whoLabel[who] || who
    );

    showToast(`📎 Imagem "${fname}" adicionada ao histórico da Disputa ${d.id}.`);
    input.value = ''; // reset para permitir re-upload do mesmo arquivo
  };
  reader.readAsDataURL(file);
}

/* ════════════════════════════════════════════════════════════════
   PATCH — renderDisputaChat: suporte a m.imgSrc (balão de imagem)
   ════════════════════════════════════════════════════════════════ */
(function patchRenderDisputaChat() {
  window.renderDisputaChat = function(d) {
    const chatEl = document.getElementById('disputaChatMessages');
    if (!chatEl) return;
    chatEl.innerHTML = d.msgs.map(m => {
      const isAdmin = m.who === 'admin';
      const isKz    = m.who === 'kz';
      const cls     = isKz ? 'msg-kz' : `msg-${m.who}`;
      const avMap   = { buyer: d.buyer.avatar, seller: d.seller.avatar, admin: '🛡', kz: '' };
      const av      = isKz
        ? (typeof getKzSVG === 'function' ? getKzSVG(18) : '🐱')
        : avMap[m.who];

      /* Conteúdo do balão: texto + imagem opcional */
      const imgHtml = m.imgSrc ? `
        <div class="adm-chat-img-wrap">
          <img class="adm-chat-img-preview" src="${m.imgSrc}"
            alt="Prova visual"
            onclick="this.requestFullscreen && this.requestFullscreen()"
            title="Clique para ampliar">
          <div class="adm-chat-img-badge">PROVA</div>
        </div>` : '';

      const authorLabel = isKz
        ? '🤖 Kz IA'
        : isAdmin
          ? '🛡️ Admin WeKz'
          : m.who === 'buyer'
            ? '👤 ' + d.buyer.name
            : '🏪 ' + d.seller.name;

      return `
        <div class="adm-chat-msg ${cls}">
          <div class="adm-chat-avatar">${av}</div>
          <div>
            <div class="adm-chat-bubble">${escapeHtml(m.text)}${imgHtml}</div>
            <div class="adm-chat-meta">${authorLabel} · ${m.time}</div>
          </div>
        </div>`;
    }).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  };
})();

/* ── 4.7: Sistema de Disputa Trilateral (cross-module) ───────────────────
   wkzNotifySellerNewDispute, wkzCreateTrilateralDispute,
   wkzPropagateResolutionToSeller, wkzNotifyBuyerDisputeVerdict,
   wkzBuyerConfirmReceived, wkzSellerUpdateOrderStatus. Deliberadamente
   deixadas de fora de wkz-buyer.js (M2) e wkz-seller.js (M3) — leem
   CP_DISPUTES (já em wkz-core.js) e ADMIN_DISPUTES (aqui) — pertencem
   ao Admin, que é quem efetivamente orquestra a resolução.
   Origem monólito: linhas 33061–33341 (pulando filterProducts,
   33172–33186, já extraída em wkz-seller.js no M3)
   ─────────────────────────────────────────────────────────────────────── */
function wkzNotifySellerNewDispute(orderId, productName, buyerName, reason, dateStr) {
  var list = document.getElementById('sellerDisputesList');
  if (!list) return;

  var card = document.createElement('div');
  card.setAttribute('data-dispute-status', 'open');
  card.setAttribute('data-order-id', orderId); /* FIX: seletor robusto para enviarRespostaDisputa */
  card.style.cssText = 'background:var(--card);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:18px;';
  card.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
      '<div><div style="font-weight:700;">' + orderId + ' · ' + productName + ' · ' + buyerName + '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px;">Motivo: ' + reason + ' · Aberta: ' + dateStr + '</div></div>' +
      '<button class="btn-primary" style="font-size:12px;padding:8px 16px;" onclick="openDisputeReplyModal(\'' + orderId + '\',\'' + productName + '\',\'' + buyerName + '\',\'' + reason + '\',\'' + dateStr + '\')">Responder Agora</button>' +
    '</div>';
  list.insertBefore(card, list.firstChild);

  // Sincroniza contadores em todos os pontos do painel do vendedor
  var openCount = list.querySelectorAll('[data-dispute-status="open"]').length;
  var btnOpen = document.getElementById('df-disp-open');
  if (btnOpen) btnOpen.textContent = 'Abertas (' + openCount + ')';
  var countEl = document.getElementById('disputesOpenCount');
  if (countEl) countEl.textContent = openCount + (openCount === 1 ? ' disputa' : ' disputas');
  var statEl = document.getElementById('statValueDisputas');
  if (statEl) statEl.textContent = openCount;

  if (typeof showToast === 'function') showToast('🔔 Nova disputa recebida no painel do vendedor: ' + orderId);
}

/* ── wkzCreateTrilateralDispute ────────────────────────────────────────────
   Ponto único de entrada quando o COMPRADOR abre uma disputa. Sem isso,
   existiam 3 telas de disputa (comprador, vendedor, admin) com datasets
   e até esquemas de ID diferentes (#WKZ-xxxx vs DIS-xxx), nunca
   sincronizadas entre si. Esta função garante que a mesma disputa:
     1) aparece no painel do vendedor (Disputas → Abertas) — já existente;
     2) aparece na Central de Mediação do admin (ADMIN_DISPUTES), com a
        descrição do comprador como primeira mensagem do chat trilateral.
   opts: { orderId, productName, buyerName, reason, dateStr, valor, description }
─────────────────────────────────────────────────────────────────────────── */
function wkzCreateTrilateralDispute(opts) {
  // 1) Painel do vendedor
  if (typeof wkzNotifySellerNewDispute === 'function') {
    wkzNotifySellerNewDispute(opts.orderId, opts.productName, opts.buyerName, opts.reason, opts.dateStr);
  }

  // 2) Central de Mediação do admin
  if (typeof ADMIN_DISPUTES !== 'undefined') {
    var initials = (opts.buyerName || '?').trim().charAt(0).toUpperCase();
    ADMIN_DISPUTES.unshift({
      id: opts.orderId,
      severity: 'open',
      title: opts.reason + ' — ' + opts.productName,
      motivo: opts.reason,
      valor: opts.valor || '—',
      prazo: '5 dias',
      buyer: { name: opts.buyerName, id: '#NOVO', avatar: initials },
      seller: { name: 'Minha Loja Pro', id: '#SPRO01', avatar: 'M' },
      msgs: [
        { who: 'buyer', text: opts.description || ('Disputa aberta: ' + opts.reason), time: new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) }
      ]
    });
    if (typeof renderDisputas === 'function' && document.getElementById('disputasList')) {
      renderDisputas();
    }
    var navBadge = document.getElementById('navBadgeDisputas');
    if (navBadge) navBadge.textContent = ADMIN_DISPUTES.filter(function(d){ return d.severity !== 'resolved'; }).length;
  }
}

/* ── wkzPropagateResolutionToSeller ────────────────────────────────────────
   Quando o admin resolve uma disputa criada pelo comprador, move o card
   correspondente no painel do vendedor de "Abertas" para "Resolvidas",
   com o veredito aplicado. Disputas sem card no vendedor (disputas sem data-order-id matching,
   vendedor) simplesmente não encontram nada e a função não faz nada.
─────────────────────────────────────────────────────────────────────────── */
function wkzPropagateResolutionToSeller(disputeId, verdictLabel, verdictColor) {
  var list = document.getElementById('sellerDisputesList');
  if (!list) return;
  /* FIX: usar data-order-id (atributo explícito) em vez de textContent.indexOf()
     para encontrar o card — robusto e não depende de formatação de texto */
  var targetCard = list.querySelector('[data-order-id="' + disputeId + '"]');
  var cards = targetCard ? [targetCard] : list.querySelectorAll('[data-dispute-status="open"]');
  for (var i = 0; i < cards.length; i++) {
    if (!targetCard && cards[i].textContent.indexOf(disputeId) === -1) continue;
    cards[i].setAttribute('data-dispute-status', 'resolved');
    cards[i].style.border = '1px solid rgba(34,197,94,0.25)';
    var btn = cards[i].querySelector('button');
    if (btn) {
      var span = document.createElement('span');
      span.style.fontSize = '11px';
      span.style.fontWeight = '700';
      span.style.color = verdictColor;
      span.style.background = 'rgba(34,197,94,0.12)';
      span.style.padding = '6px 12px';
      span.style.borderRadius = '20px';
      span.textContent = verdictLabel;
      btn.replaceWith(span);
    }
    break;
  }
  var openCount = list.querySelectorAll('[data-dispute-status="open"]').length;
  var resolvedCount = list.querySelectorAll('[data-dispute-status="resolved"]').length;
  var btnOpen = document.getElementById('df-disp-open');
  if (btnOpen) btnOpen.textContent = 'Abertas (' + openCount + ')';
  var btnResolved = document.getElementById('df-disp-resolved');
  if (btnResolved) btnResolved.textContent = 'Resolvidas (' + resolvedCount + ')';
  var countEl = document.getElementById('disputesOpenCount');
  if (countEl) countEl.textContent = openCount + (openCount === 1 ? ' disputa' : ' disputas');
  var statEl = document.getElementById('statValueDisputas');
  if (statEl) statEl.textContent = openCount;
}


/* NOTA: filterProducts() (linhas 33172-33186 do monólito, entre
   wkzPropagateResolutionToSeller e wkzNotifyBuyerDisputeVerdict) foi
   pulada aqui de propósito — já extraída corretamente para
   wkz-seller.js no Sprint M3 (filtra #myProductsList do vendedor, não
   é função do Admin). */
function wkzNotifyBuyerDisputeVerdict(orderId, verdict, verdictText, valor) {
  /* 1 — Atualiza status do pedido em _WKZ_ORDERS */
  if (window._WKZ_ORDERS) {
    var go = window._WKZ_ORDERS.find(function(o) { return o.id === orderId; });
    if (go) {
      go.disputeVerdict = verdict;
      if (verdict === 'refund_buyer') { go.status = 'cancelled'; go.disputeStatus = 'resolved_buyer'; }
      else if (verdict === 'release_seller') { go.status = 'delivered'; go.disputeStatus = 'resolved_seller'; }
      else { go.disputeStatus = 'resolved_partial'; }
    }
  }

  /* 2 — Atualiza CP_ORDERS no painel do comprador */
  if (window.CP_ORDERS) {
    var co = window.CP_ORDERS.find(function(o) { return o.id === orderId; });
    if (co) {
      if (verdict === 'refund_buyer') {
        co.status = 'cancelled';
        co.statusLabel = '↩ Reembolso aprovado';
        co.progress = 100;
      } else if (verdict === 'release_seller') {
        co.status = 'delivered';
        co.statusLabel = '\u2713 Entregue · Disputa encerrada';
        co.progress = 100;
        co.activeStep = 4;
      } else {
        co.status = 'partial';
        co.statusLabel = '\u2696\uFE0F Resolução parcial';
        co.progress = 100;
      }
    }
    if (typeof renderOrders === 'function') renderOrders();
  }

  /* 3 — Atualiza CP_DISPUTES com o veredito (via cpUpdateDisputeVerdict já existente) */
  if (typeof window.cpUpdateDisputeVerdict === 'function') {
    var buyerKey = verdict === 'refund_buyer' ? 'buyer' : (verdict === 'release_seller' ? 'seller' : 'partial');
    window.cpUpdateDisputeVerdict(orderId, buyerKey, verdictText);
  }

  /* 4 — Notificação push ao comprador */
  var pushTitle, pushMsg, pushType;
  if (verdict === 'refund_buyer') {
    pushTitle = '\u2705 Disputa resolvida a seu favor!';
    pushMsg   = 'Pedido ' + orderId + ' — ' + verdictText;
    pushType  = 'success';
  } else if (verdict === 'release_seller') {
    pushTitle = '\u2696\uFE0F Veredito da sua disputa';
    pushMsg   = 'Pedido ' + orderId + ' — ' + verdictText;
    pushType  = 'info';
  } else {
    pushTitle = '\u2696\uFE0F Resolução parcial';
    pushMsg   = 'Pedido ' + orderId + ' — ' + verdictText;
    pushType  = 'warning';
  }
  if (typeof wkzShowPush === 'function') {
    wkzShowPush(pushTitle, pushMsg, pushType, 9000);
  }
}

/* ══════════════════════════════════════════════════════════════════
   wkzBuyerConfirmReceived — SINCRONIA TRILATERAL: RECEBIMENTO
   Comprador confirma recebimento → libera pagamento ao vendedor (KPI),
   pedido vai para "Entregue", notificação ao comprador.
   ══════════════════════════════════════════════════════════════════ */
function wkzBuyerConfirmReceived(orderId) {
  /* 1 — Atualiza status em _WKZ_ORDERS */
  var orderValue = 0;
  if (window._WKZ_ORDERS) {
    var go = window._WKZ_ORDERS.find(function(o) { return o.id === orderId; });
    if (go) { go.status = 'delivered'; go.confirmedAt = new Date().toISOString(); orderValue = go.amount || 0; }
  }

  /* 2 — Atualiza CP_ORDERS: pedido vai para "Entregue e Confirmado" */
  var svgCheckGreen = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>';
  if (window.CP_ORDERS) {
    var co = window.CP_ORDERS.find(function(o) { return o.id === orderId; });
    if (co) {
      co.status      = 'delivered';
      co.statusLabel = svgCheckGreen + ' Entregue e Confirmado';
      co.progress    = 100;
      co.activeStep  = 4;
      co.confirmedAt = new Date().toISOString();
    }
    if (typeof renderOrders === 'function') renderOrders();
  }

  /* 3 — KPI do vendedor: atualiza "Aguardando saque" */
  var kpiEl = document.getElementById('kpiAguardandoSaque') || document.querySelector('[data-kpi="aguardando-saque"]');
  if (kpiEl && orderValue > 0) {
    var curr = parseFloat((kpiEl.textContent || '0').replace(/[^0-9,]/g,'').replace(',','.')) || 0;
    var novo = curr + orderValue * 0.92;
    kpiEl.textContent = 'R$ ' + novo.toLocaleString('pt-BR', {minimumFractionDigits:2});
  }

  /* 4 — Atualiza linha na tabela do Vendedor para "Concluído" */
  document.querySelectorAll('#ordersTableBody tr, #sellerOrdersList tr').forEach(function(row) {
    if (row.textContent.indexOf(orderId) !== -1) {
      var sp = row.querySelector('[class*="order-status"]');
      if (sp) {
        sp.className = 'order-status status-paid';
        sp.innerHTML = svgCheckGreen + 'Concluído';
      }
    }
  });

  /* 5 — Push notification e toast */
  if (typeof wkzShowPush === 'function') {
    wkzShowPush('\u2705 Recebimento confirmado!', 'Obrigado! Que tal deixar uma avaliação para o vendedor?', 'success', 6000);
  }
  if (typeof showToast === 'function') {
    showToast('\u2705 Recebimento de ' + orderId + ' confirmado! Pagamento liberado ao vendedor.');
  }

  /* 6 — Abre avaliação automaticamente (se modal existir) */
  setTimeout(function() {
    var reviewModal = document.getElementById('wkzReviewModal');
    if (reviewModal) reviewModal.classList.add('open');
    else if (typeof showToast === 'function') showToast('\u2B50 Avalie sua compra! Sua opinião ajuda outros compradores.');
  }, 1400);
}

/* ── wkzSellerUpdateOrderStatus: API unificadora para mudança de status pelo vendedor ── */
function wkzSellerUpdateOrderStatus(orderId, newStatus, extra) {
  extra = extra || {};
  if (newStatus === 'shipped') {
    wkzSellerConfirmDispatch(orderId, extra.trackingCode || _etqGenTracking(orderId), extra.carrier || 'Correios PAC', null);
  } else if (newStatus === 'cancelled') {
    if (window._WKZ_ORDERS) {
      var go = window._WKZ_ORDERS.find(function(o) { return o.id === orderId; });
      if (go) { go.status = 'cancelled'; go.cancelReason = extra.cancelReason || 'Cancelado pelo vendedor'; }
    }
    if (window.CP_ORDERS) {
      var co = window.CP_ORDERS.find(function(o) { return o.id === orderId; });
      if (co) { co.status = 'cancelled'; co.statusLabel = '\u2715 Cancelado'; co.progress = 0; }
      if (typeof renderOrders === 'function') renderOrders();
    }
    if (typeof wkzShowPush === 'function') {
      wkzShowPush('\u274C Pedido Cancelado', 'Seu pedido ' + orderId + ' foi cancelado. Motivo: ' + (extra.cancelReason || 'Vendedor cancelou o pedido.'), 'error', 8000);
    }
    if (typeof showToast === 'function') showToast('Pedido ' + orderId + ' cancelado e comprador notificado.');
  } else if (newStatus === 'preparing') {
    if (window._WKZ_ORDERS) {
      var go2 = window._WKZ_ORDERS.find(function(o) { return o.id === orderId; });
      if (go2) go2.status = 'preparing';
    }
    if (typeof wkzShowPush === 'function') {
      wkzShowPush('\uD83D\uDD27 Pedido em Preparação', 'Seu pedido ' + orderId + ' está sendo preparado!', 'info', 6000);
    }
  }
}

// ─── MISSING AUTH / REGISTER / SELLER FUNCTIONS ───

// Toggle password visibility

/* ── 4.8: Kz Dispute Copilot ──────────────────────────────────────────────
   Achado durante a auditoria de onclick do HTML: activateKzDisputeCopilot()
   é chamada pelo botão do modal de disputa, mas não fazia parte de
   nenhuma das 7 sub-etapas anteriores — IIFE separado no monólito.
   COPILOT_VERDICTS (base de conhecimento por motivo, com confiança % e
   referências ao CDC), activateKzDisputeCopilot, getKzSvgSmall.
   Origem monólito: linhas 41610–41771
   ─────────────────────────────────────────────────────────────────────── */
(function() {
  /* Base de conhecimento de pareceres por motivo */
  const COPILOT_VERDICTS = {
    'Produto não entregue': {
      verdict: 'refund_buyer',
      confidence: 92,
      icon: '📦',
      recLabel: 'Recomendação: Reembolsar Comprador',
      summary: 'O comprador relatou <strong>não recebimento do produto</strong> após prazo máximo de entrega. O lojista não apresentou código de rastreio válido ou comprovante de envio com data auditável.',
      reason: 'Sem prova de entrega verificável, os Termos WeKz determinam reembolso integral ao comprador. Clique em <em>↩ Reembolsar Comprador</em> para encerrar.',
      btnClass: 'btn-refund',
      btnLabel: '↩ Aplicar Reembolso',
      btnAction: 'refund_buyer',
    },
    'Produto com defeito': {
      verdict: 'refund_buyer',
      confidence: 85,
      icon: '🔧',
      recLabel: 'Recomendação: Reembolsar Comprador',
      summary: 'O comprador apresentou <strong>evidências de defeito</strong> no produto recebido. As fotos anexadas indicam discrepância com a descrição original do anúncio.',
      reason: 'Produto defeituoso configura violação da garantia legal (CDC Art. 18). Recomendo reembolso total e abertura de investigação no lojista.',
      btnClass: 'btn-refund',
      btnLabel: '↩ Aplicar Reembolso',
      btnAction: 'refund_buyer',
    },
    'Produto diferente do anunciado': {
      verdict: 'refund_buyer',
      confidence: 88,
      icon: '🖼️',
      recLabel: 'Recomendação: Reembolsar Comprador',
      summary: 'O produto recebido <strong>não corresponde ao anúncio</strong>. O comprador forneceu fotos comparativas e o lojista não contestou com documentação válida.',
      reason: 'Publicidade enganosa viola os Termos de Uso WeKz §4.2. Reembolso total ao comprador é a resolução recomendada.',
      btnClass: 'btn-refund',
      btnLabel: '↩ Aplicar Reembolso',
      btnAction: 'refund_buyer',
    },
    'Estorno não autorizado': {
      verdict: 'release_seller',
      confidence: 79,
      icon: '💳',
      recLabel: 'Recomendação: Liberar para o Lojista',
      summary: 'A análise do histórico indica que o <strong>lojista cumpriu a entrega</strong> no prazo, com rastreio confirmado. O estorno parece ser uma contestação indevida no cartão de crédito.',
      reason: 'Com entrega comprovada, o lojista tem direito ao recebimento. Recomendo liberar o valor e registrar alerta de possível chargeback fraudulento neste comprador.',
      btnClass: 'btn-release',
      btnLabel: '✅ Liberar ao Lojista',
      btnAction: 'release_seller',
    },
    'Arrependimento de compra': {
      verdict: 'refund_buyer',
      confidence: 95,
      icon: '↩️',
      recLabel: 'Recomendação: Reembolsar (Prazo Legal)',
      summary: 'O comprador solicitou <strong>cancelamento dentro de 7 dias</strong> após o recebimento, exercendo o direito de arrependimento previsto no CDC.',
      reason: 'Art. 49 do CDC garante direito de arrependimento em 7 dias para compras online. Produto não utilizado — reembolso integral obrigatório.',
      btnClass: 'btn-refund',
      btnLabel: '↩ Aplicar Reembolso',
      btnAction: 'refund_buyer',
    },
  };

  const DEFAULT_VERDICT = {
    verdict: 'partial_split',
    confidence: 71,
    icon: '⚖️',
    recLabel: 'Análise Inconclusiva — Divisão Sugerida',
    summary: 'O Kz analisou as mensagens e identificou <strong>argumentos válidos em ambos os lados</strong>. Não há evidência suficiente para determinar culpa exclusiva.',
    reason: 'Sugiro divisão 50/50 como resolução equilibrada. Ambas as partes devem ser notificadas por e-mail sobre a decisão.',
    btnClass: 'btn-refund',
    btnLabel: '⚖️ Aplicar Divisão 50/50',
    btnAction: 'partial_split',
  };

  function getKzSvgSmall(size) {
    size = size || 28;
    return typeof getKzSVG === 'function' ? getKzSVG(size)
      : `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none"><ellipse cx="32" cy="38" rx="18" ry="14" fill="#1A2540"/><polygon points="18,28 12,14 22,22" fill="#00B4AB"/><polygon points="46,28 52,14 42,22" fill="#7C3AED"/><ellipse cx="32" cy="30" rx="14" ry="12" fill="#1E2D4A"/><ellipse cx="27" cy="28" rx="3.5" ry="3.5" fill="#06B6D4"/><ellipse cx="37" cy="28" rx="3.5" ry="3.5" fill="#06B6D4"/><ellipse cx="27" cy="28" rx="1.5" ry="1.5" fill="#0F172A"/><ellipse cx="37" cy="28" rx="1.5" ry="1.5" fill="#0F172A"/><path d="M28 33 Q32 36 36 33" stroke="#00B4AB" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
  }

  window.activateKzDisputeCopilot = function() {
    if (!_activeDisputaId) return;
    const d = ADMIN_DISPUTES.find(x => x.id === _activeDisputaId);
    if (!d) return;

    const wrap = document.getElementById('kzCopilotPanelWrap');
    if (!wrap) return;

    /* Mostra thinking state */
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="kz-copilot-panel" id="kzCopilotPanel">
        <div class="kz-copilot-header">
          <div>${getKzSvgSmall(32)}</div>
          <div class="kz-copilot-header-text">
            <div class="kz-copilot-label">✨ Kz Dispute Copilot · Análise em Progresso</div>
            <div class="kz-copilot-title">Lince Cibernético está analisando o caso...</div>
          </div>
          <button class="kz-copilot-close" onclick="closeKzCopilot()">✕</button>
        </div>
        <div class="kz-copilot-thinking">
          <div class="kz-copilot-dots"><span></span><span></span><span></span></div>
          Processando ${d.msgs.length} mensagens · Avaliando evidências · Consultando jurisprudência WeKz...
        </div>
      </div>`;

    /* Audit log */
    admAuditAdd('🤖', `Kz Copilot acionado na Disputa ${d.id} — análise de ${d.msgs.length} msg(s) em andamento`, 'Admin WeKz');

    /* Simula delay da IA (1.8s) */
    setTimeout(function() {
      const vd = COPILOT_VERDICTS[d.motivo] || DEFAULT_VERDICT;
      const verdictCls = vd.verdict === 'release_seller' ? 'verdict-seller' : 'verdict-buyer';

      const panel = document.getElementById('kzCopilotPanel');
      if (!panel) return;
      panel.innerHTML = `
        <div class="kz-copilot-header">
          <div>${getKzSvgSmall(32)}</div>
          <div class="kz-copilot-header-text">
            <div class="kz-copilot-label">✨ Kz Dispute Copilot · Parecer Gerado</div>
            <div class="kz-copilot-title">Análise: Disputa ${d.id} — ${d.motivo}</div>
          </div>
          <button class="kz-copilot-close" onclick="closeKzCopilot()">✕</button>
        </div>
        <div class="kz-copilot-summary">
          ${vd.icon} ${vd.summary}<br><br>${vd.reason}
        </div>
        <div class="kz-copilot-verdict ${verdictCls}">
          <div class="kz-copilot-verdict-icon">${vd.icon}</div>
          <div class="kz-copilot-verdict-body">
            <div class="kz-copilot-verdict-rec">${vd.recLabel}</div>
            <div class="kz-copilot-verdict-text">Confiança do Kz: <strong>${vd.confidence}%</strong> · baseado em ${d.msgs.length} msg(s) e política WeKz §4</div>
          </div>
          <button class="kz-copilot-verdict-btn ${vd.btnClass}" onclick="admResolveDispute('${d.id}','${vd.btnAction}');closeKzCopilot();">${vd.btnLabel}</button>
        </div>
        <div class="kz-copilot-conf">
          <span>Confiança</span>
          <div class="kz-copilot-conf-bar"><div class="kz-copilot-conf-fill" id="copilotConfFill" style="width:0%"></div></div>
          <span>${vd.confidence}%</span>
        </div>`;

      /* Anima barra de confiança */
      setTimeout(() => {
        const fill = document.getElementById('copilotConfFill');
        if (fill) fill.style.width = vd.confidence + '%';
      }, 80);

      admAuditAdd('✨', `Kz Copilot emitiu parecer na Disputa ${d.id}: ${vd.recLabel} (confiança ${vd.confidence}%)`, 'Kz IA');
    }, 1800);
  };

  window.closeKzCopilot = function() {
    const wrap = document.getElementById('kzCopilotPanelWrap');
    if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
  };

  /* Fecha o copilot quando o modal de disputa fechar */
  const _origCloseDisputaChat = window.closeDisputaChat;
  window.closeDisputaChat = function() {
    window.closeKzCopilot && window.closeKzCopilot();
    if (_origCloseDisputaChat) _origCloseDisputaChat();
  };
})();
