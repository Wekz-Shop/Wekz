/* ════════════════════════════════════════════════════════════════════════
   wkz-seller.js — WeKz Shop Seller Hub
   Requer: wkz-bus.js, wkz-core.js (carregados ANTES deste arquivo).
   Sprint M3 — Seller Hub. Extração cirúrgica de
   WeKzShop_v2_9_36_CORRIGIDO.html — Zero Rewrite.

   NOTA DE ARQUITETURA (verificada nesta extração): a "complicação" de
   syncOverviewKPIs() registrada como pendência do M2 NÃO se aplica aqui.
   syncOverviewKPIs() é chamada por window.switchAdminTab() (Admin) e lê
   ADMIN_DISPUTES/ADMIN_PAYOUTS — está fisicamente no território Admin
   (linha 40681 do monólito) e nunca é referenciada por switchDashTab()
   (Seller, abaixo). São dois sistemas de abas completamente distintos,
   sem entrelaçamento. Nada precisou ser movido por causa disso.

   NOTA: as 6 funções do "sistema de disputa trilateral"
   (wkzNotifySellerNewDispute, wkzCreateTrilateralDispute,
   wkzPropagateResolutionToSeller, wkzNotifyBuyerDisputeVerdict,
   wkzBuyerConfirmReceived, wkzSellerUpdateOrderStatus) foram
   deliberadamente EXCLUÍDAS daqui, mesmo fisicamente próximas ao código
   Seller no monólito (linhas 33061-33341). Elas leem CP_DISPUTES e
   ADMIN_DISPUTES — ambas declaradas no território Admin (linhas 40166 e
   42693) — então são orquestração cross-module que pertence ao Admin,
   não ao Seller. Ficam para o Sprint M4.
   ════════════════════════════════════════════════════════════════════════ */

/* ── 3.1: Dashboard (abas) + Overview + Afiliados + Meus Produtos ────────
   switchDashTab, initDashOverview, AFFILIATE_REFERRALS, initAffiliates,
   affCopyLink, initMyProducts, togglePauseProduct, openEditProductModal,
   saveEditProduct, refreshProductEverywhere, closeEditProductModal.
   Origem monólito: linhas 30243–30575
   ─────────────────────────────────────────────────────────────────────── */
function switchDashTab(tab, el){
  // Sidebar highlight
  document.querySelectorAll('.sidebar-nav-item').forEach(i=>i.classList.remove('active'));
  if(el) el.classList.add('active');
  // Show correct panel
  document.querySelectorAll('.dash-panel').forEach(p=>{ p.style.display='none'; p.classList.remove('active'); });
  const panel = document.getElementById('dash-'+tab);
  if(panel){ panel.style.display='block'; panel.classList.add('active'); }
  // Init panels that need it
  if(tab==='overview') initDashOverview();
  if(tab==='products') initMyProducts();
  if(tab==='reviews') initDashReviews();
  if(tab==='add-product') initAddProductPage();
  if(tab==='affiliates') initAffiliates();
  if(tab==='settings') initDashSettings();
  document.documentElement.scrollTop = 0; window.scrollTo({top:0,behavior:'instant'});
}

function initDashOverview(forceRefresh){
  const topEl = document.getElementById('overviewTopProducts');
  if(!topEl) return;
  // Always re-render (it's lightweight) — or skip if no forceRefresh and already populated
  if(topEl.innerHTML.trim() && !forceRefresh) return;
  // Show top 5 products from the seller's list
  const topProds = products.slice(0, 5);
  topEl.innerHTML = topProds.map((p, i) => {
    const status = window._productStatusMap ? (window._productStatusMap[i] || 'active') : 'active';
    const statusColor = status === 'paused' ? '#F59E0B' : status === 'out-of-stock' ? '#EF4444' : '#22C55E';
    const statusLabel = status === 'paused' ? '⏸ Pausado' : status === 'out-of-stock' ? '❌ Sem estoque' : '✅ Ativo';
    return `
    <div style="display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;">
      <div style="width:44px;height:44px;border-radius:10px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;"><wkz-product-image src="${p.img||''}" emoji="${p.e}" alt="${p.n}"></wkz-product-image></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.n}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${formatPrice(p.p)} · <span style="color:${statusColor};font-weight:600;">${statusLabel}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button style="background:var(--card2);border:1px solid var(--border);color:var(--text);font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;" onclick="openEditProductModal(${i})">✏️ Editar</button>
      </div>
    </div>`;
  }).join('');
}

// Product status store (index → status)
if(!window._productStatusMap) window._productStatusMap = {};

// ══════════════════════════════════════════════════════
//  PROGRAMA DE AFILIADOS NATIVO v1 — Minhas Indicações
//  Recompensa em Pontos Kz (mesma moeda de gamificação do
//  comprador). FIX (proposto): substituir AFFILIATE_REFERRALS
//  por fetch('/api/affiliates/me') após integração com backend.
// ══════════════════════════════════════════════════════
const AFFILIATE_REFERRALS = [
  { name:'Loja PixelWorks', type:'🏪 Vendedor', status:'active',  sales:8, points:1240 },
  { name:'Ana Beatriz',     type:'🛍️ Comprador', status:'active',  sales:3, points:340  },
  { name:'TechNova Store',  type:'🏪 Vendedor', status:'active',  sales:6, points:870  },
  { name:'Rui Pereira',     type:'🛍️ Comprador', status:'pending', sales:0, points:0    },
  { name:'Loja Boa Vista',  type:'🏪 Vendedor', status:'pending', sales:0, points:0    },
  { name:'Joana Mendes',    type:'🛍️ Comprador', status:'active',  sales:2, points:0    },
  { name:'Marco Aurélio',   type:'🛍️ Comprador', status:'pending', sales:0, points:0    },
];

function initAffiliates(forceRefresh) {
  const list = document.getElementById('affReferralsList');
  if (!list || (list.innerHTML.trim() && !forceRefresh)) return;

  const statusMap = {
    active:  { label:'✅ Ativo',    color:'#22C55E' },
    pending: { label:'⏳ Pendente', color:'#F59E0B' },
  };

  list.innerHTML = AFFILIATE_REFERRALS.map(function(r) {
    const st = statusMap[r.status] || statusMap.pending;
    return '<tr>'
      + '<td style="padding:8px 12px;font-weight:600;">' + r.name + '</td>'
      + '<td style="padding:8px 12px;color:var(--muted2);">' + r.type + '</td>'
      + '<td style="padding:8px 12px;"><span style="color:' + st.color + ';font-weight:700;">' + st.label + '</span></td>'
      + '<td style="padding:8px 12px;">' + r.sales + '</td>'
      + '<td style="padding:8px 12px;color:#A78BFA;font-weight:700;">' + (r.points ? '+' + r.points : '—') + '</td>'
      + '</tr>';
  }).join('');
}

function affCopyLink(btn) {
  const input = document.getElementById('affRefLink');
  if (!input) return;
  input.select();
  input.setSelectionRange(0, 99999);
  try {
    navigator.clipboard.writeText(input.value);
  } catch(e) {
    document.execCommand('copy');
  }
  const orig = btn.innerHTML;
  btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado!</span>';
  showToast('🔗 Link de indicação copiado!');
  setTimeout(function(){ btn.innerHTML = orig; }, 2000);
}

function initMyProducts(forceRefresh){
  const g = document.getElementById('myProductsList');
  if(!g || (g.innerHTML.trim() && !forceRefresh)) return;
  // Status simulado: maioria ativo, alguns pausados/sem estoque
  const defaultStatusMap = ['active','active','active','active','active','active','active','active','paused','out-of-stock'];
  g.innerHTML = products.map((p,i)=>{
    if(window._productStatusMap[i] === undefined) window._productStatusMap[i] = defaultStatusMap[i] || 'active';
    const status = window._productStatusMap[i];
    const isPaused = status === 'paused';
    const isOOS = status === 'out-of-stock';
    const statusBadge = isPaused
      ? `<span style="position:absolute;top:8px;left:8px;background:rgba(245,158,11,0.9);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:50px;">⏸ PAUSADO</span>`
      : isOOS
      ? `<span style="position:absolute;top:8px;left:8px;background:rgba(239,68,68,0.9);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:50px;">❌ SEM ESTOQUE</span>`
      : '';
    const pauseLabel = isPaused ? '▶️' : '⏸';
    const pauseTitle = isPaused ? 'Reativar produto' : 'Pausar produto';
    const pauseBg = isPaused ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
    const pauseBorder = isPaused ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
    const pauseColor = isPaused ? '#22C55E' : '#EF4444';
    return `
    <div class="product-card" data-status="${status}" data-prod-idx="${i}" style="opacity:${isPaused?'0.75':'1'};">
      <div class="product-img" style="position:relative;">${p.e}
        <div class="product-badges">${p.badge==='sale'?'<span class="badge badge-sale">SALE</span>':p.badge==='new'?'<span class="badge badge-new">NOVO</span>':''}</div>
        ${statusBadge}
      </div>
      <div class="product-info">
        <div class="product-name">${p.n}</div>
        <div class="product-price"><span class="price-main">${formatPrice(p.p)}</span></div>
        <div class="product-meta"><div class="product-stars"><span class="stars">★★★★★</span> ${p.r}</div><div class="product-sales">${p.sales}</div></div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn-cart" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);font-size:12px;" onclick="openEditProductModal(${i})">✏️ Editar</button>
          <button class="btn-cart" title="${pauseTitle}" style="flex:0;padding:10px 12px;background:${pauseBg};border:1px solid ${pauseBorder};color:${pauseColor};font-size:14px;" onclick="togglePauseProduct(${i})">${pauseLabel}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function togglePauseProduct(idx){
  const current = window._productStatusMap[idx] || 'active';
  const next = (current === 'paused') ? 'active' : 'paused';
  window._productStatusMap[idx] = next;
  const msg = (next === 'paused') ? '⏸️ Produto pausado com sucesso!' : '▶️ Produto reativado com sucesso!';
  showToast(msg);
  refreshProductEverywhere(idx);
}

function openEditProductModal(idx){
  const p = products[idx];
  if(!p){ showToast('⚠️ Produto não encontrado.'); return; }
  // Build or reuse modal
  let modal = document.getElementById('editProductOverlay');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'editProductOverlay';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '2100';
    modal.onclick = function(e){ if(e.target === modal) closeEditProductModal(); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
  <div class="modal" style="max-width:520px;width:94%;max-height:90vh;overflow-y:auto;padding:28px;">
    <button class="modal-close" onclick="closeEditProductModal()" style="top:14px;right:14px;">✕</button>
    <div class="modal-title" style="font-size:18px;margin-bottom:4px;">✏️ Editar Produto</div>
    <div class="modal-sub" style="margin-bottom:20px;">Altere os dados e clique em Salvar</div>
    <div class="form-group">
      <label class="form-label">Título do Produto <span class="req">*</span></label>
      <input class="form-input" id="ep-title" type="text" maxlength="120" value="${p.n.replace(/"/g,'&quot;')}">
    </div>
    <div class="form-group">
      <label class="form-label">Preço de Venda (R$) <span class="req">*</span></label>
      <input class="form-input" id="ep-price" type="number" step="0.01" min="0" value="${p.p}">
    </div>
    <div class="form-group">
      <label class="form-label">Preço Original (R$) — riscado</label>
      <input class="form-input" id="ep-oldprice" type="number" step="0.01" min="0" value="${p.op||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Status do Produto</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
          <input type="radio" name="ep-status" value="active" ${(window._productStatusMap[idx]||'active')==='active'?'checked':''}> ✅ Ativo
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
          <input type="radio" name="ep-status" value="paused" ${(window._productStatusMap[idx])==='paused'?'checked':''}> ⏸️ Pausado
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
          <input type="radio" name="ep-status" value="out-of-stock" ${(window._productStatusMap[idx])==='out-of-stock'?'checked':''}> ❌ Sem Estoque
        </label>
      </div>
    </div>
    <hr style="border-color:var(--border);margin:18px 0;">
    <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px;">📦 Dados de Catálogo & Logística</div>
    ${_epField('ep-sku','SKU / Código de barras',p.sku,'text')}
    ${_epField('ep-brand','Marca',p.brand,'text')}
    ${_epField('ep-stock','Estoque (un)',p.stock,'number')}
    ${_epField('ep-stock-alert','Alerta de estoque baixo (un)',p.stockAlert,'number')}
    ${_epField('ep-cost','Custo (R$)',p.cost,'number')}
    ${_epField('ep-weight','Peso (kg)',p.weight,'number')}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
      ${_epField('ep-length','Comp. (cm)',p.length,'number')}
      ${_epField('ep-width','Larg. (cm)',p.width,'number')}
      ${_epField('ep-height','Alt. (cm)',p.height,'number')}
    </div>
    ${_epField('ep-tags','Tags (separadas por vírgula)',p.tags,'text')}
    ${_epField('ep-short-desc','Descrição curta',p.shortDesc,'textarea')}
    ${_epField('ep-desc','Descrição completa',p.desc,'textarea')}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px;flex-wrap:wrap;">
      <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="closeEditProductModal()">Cancelar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="saveEditProduct(${idx})">💾 Salvar Alterações</button>
    </div>
  </div>`;
  modal.classList.add('open');
}

/* [FUNC-P02] Gera campo do modal de edição com fallback || '' e
   indicador visual (borda amarela + tooltip) quando o valor está vazio,
   indicando que o produto foi publicado sem esse dado preenchido. */
function _epField(id, label, value, type){
  const isEmpty = (value === undefined || value === null || value === '' || value === 0);
  const val = (value === undefined || value === null) ? '' : value;
  const borderStyle = isEmpty ? 'border-color:#F59E0B;' : '';
  const tooltip = isEmpty ? 'title="Este campo está vazio — não foi preenchido na publicação do produto"' : '';
  const warnIcon = isEmpty ? ' <span style="color:#F59E0B;font-size:11px;" title="Campo vazio">⚠️ vazio na publicação</span>' : '';
  if(type === 'textarea'){
    return `<div class="form-group">
      <label class="form-label">${label}${warnIcon}</label>
      <textarea class="form-input" id="${id}" rows="2" style="${borderStyle}" ${tooltip}>${String(val).replace(/</g,'&lt;')}</textarea>
    </div>`;
  }
  return `<div class="form-group">
    <label class="form-label">${label}${warnIcon}</label>
    <input class="form-input" id="${id}" type="${type}" style="${borderStyle}" ${tooltip} value="${String(val).replace(/"/g,'&quot;')}">
  </div>`;
}

function saveEditProduct(idx){
  const title = document.getElementById('ep-title')?.value.trim();
  const price = parseFloat(document.getElementById('ep-price')?.value);
  const oldPrice = parseFloat(document.getElementById('ep-oldprice')?.value)||0;
  const status = document.querySelector('input[name="ep-status"]:checked')?.value || 'active';
  if(!title){ showToast('⚠️ Preencha o título do produto.'); return; }
  if(!price || price <= 0){ showToast('⚠️ Informe um preço válido.'); return; }
  products[idx].n = title;
  products[idx].op = oldPrice;
  if(oldPrice > price){
    // [v2.9.31] Armazena off exato e recalcula p via wkzExactPrice — sem Math.round
    var _offExact = wkzExactOff(price, oldPrice);
    products[idx].off = _offExact;
    products[idx].p   = wkzExactPrice(oldPrice, _offExact);
  } else {
    products[idx].p   = price;
    products[idx].off = 0;
  }
  window._productStatusMap[idx] = status;

  // [FUNC-P02] Persistir campos estendidos de catálogo & logística
  products[idx].sku        = document.getElementById('ep-sku')?.value.trim()        || '';
  products[idx].brand      = document.getElementById('ep-brand')?.value.trim()      || '';
  products[idx].stock      = parseInt(document.getElementById('ep-stock')?.value)    || 0;
  products[idx].stockAlert = parseInt(document.getElementById('ep-stock-alert')?.value) || 0;
  products[idx].cost       = parseFloat(document.getElementById('ep-cost')?.value)   || 0;
  products[idx].weight     = parseFloat(document.getElementById('ep-weight')?.value) || 0;
  products[idx].length     = parseFloat(document.getElementById('ep-length')?.value) || 0;
  products[idx].width      = parseFloat(document.getElementById('ep-width')?.value)  || 0;
  products[idx].height     = parseFloat(document.getElementById('ep-height')?.value) || 0;
  products[idx].tags       = document.getElementById('ep-tags')?.value.trim()       || '';
  products[idx].shortDesc  = document.getElementById('ep-short-desc')?.value.trim() || '';
  products[idx].desc       = document.getElementById('ep-desc')?.value.trim()       || '';

  closeEditProductModal();
  refreshProductEverywhere(idx);
  showToast('✅ Produto atualizado em todas as páginas!');
}

/* ── refreshProductEverywhere ──────────────────────────────────────────
   Propaga alterações de um produto (products[idx]) para TODOS os lugares
   onde ele pode estar visível: dashboard overview, grid da loja, página
   de detalhe, resultado de busca, wishlist, flash deals.
   Chamado após saveEditProduct e após togglePauseProduct.
───────────────────────────────────────────────────────────────────────── */
function refreshProductEverywhere(idx){
  // 1) Meus Produtos (painel do vendedor)
  initMyProducts(true);

  // 2) Grid principal da loja (homepage / busca)
  if(typeof renderProducts === 'function') renderProducts();

  // 3) Página de detalhe do produto — se estiver aberta para este produto
  if(typeof currentPdpIndex !== 'undefined' && currentPdpIndex === idx){
    const p = products[idx];
    const pdpEmoji  = document.getElementById('pdpEmoji');
    const pdpTitle  = document.getElementById('pdpTitle');
    const pdpPrice  = document.getElementById('pdpPrice');
    const pdpOld    = document.querySelector('.pdp-price-old');
    const pdpOff    = document.querySelector('.pdp-price-off');
    if(pdpEmoji){ pdpEmoji.setAttribute('emoji', p.e || '📦'); if(p.img){pdpEmoji.setAttribute('src',p.img);} else {pdpEmoji.removeAttribute('src');} }
    if(pdpTitle) pdpTitle.textContent = p.n;
    if(pdpPrice) pdpPrice.textContent = formatPrice(p.p);
    if(pdpOld)   pdpOld.textContent   = formatPrice(p.op || p.p);
    if(pdpOff)   pdpOff.textContent   = '-' + (p.off || 0) + '%';
  }

  // 4) Dashboard overview — tabela de pedidos recentes usa nomes de produtos
  //    e pode ter cards de "produtos em destaque" hardcoded. Re-renderiza
  //    qualquer célula <td> ou <div> no overview que contenha o nome antigo.
  //    Abordagem: re-renderizar o overview se ele usa produtos dinâmicos,
  //    ou ao menos forçar initDashOverview se existir.
  if(typeof initDashOverview === 'function') initDashOverview(true);

  // 5) Wishlist
  const wishGrid = document.getElementById('wishlistGrid');
  if(wishGrid && wishGrid.innerHTML){
    if(typeof renderWishlist === 'function') renderWishlist();
  }

  // 6) Flash deals
  if(typeof renderFlash === 'function'){
    const flashEl = document.getElementById('flashScroll');
    if(flashEl) renderFlash();
  }

  // 7) Search results (se a busca estiver ativa com produtos renderizados)
  const searchGrid = document.getElementById('productsGrid');
  if(searchGrid && searchGrid.children.length > 0){
    if(typeof renderProducts === 'function') renderProducts();
  }
}

function closeEditProductModal(){
  const modal = document.getElementById('editProductOverlay');
  if(modal) modal.classList.remove('open');
}


/* ── 3.2: Avaliações do Vendedor + Assistente de Cadastro de Produto ─────
   initDashReviews, wizard completo de adicionar produto (steps, specs,
   variações, fotos, margem, resumo final, publishProduct).
   Origem monólito: linhas 30576–31067
   ─────────────────────────────────────────────────────────────────────── */
function initDashReviews(forceRefresh){
  const g = document.getElementById('dashReviewsList');
  if(!g || (g.innerHTML.trim() && !forceRefresh)) return;
  // Keep track of replied reviews
  if(!window._repliedReviews) window._repliedReviews = new Set();
  g.innerHTML = DB.reviews.map((r, idx) => {
    const replied = window._repliedReviews.has(idx);
    const safeNome = (r.name||'').replace(/'/g, '\\u0027').replace(/"/g, '&quot;');
    const safeText = (r.text||'').slice(0,120).replace(/'/g, '\\u0027').replace(/"/g, '&quot;');
    const starsHtml = '★'.repeat(r.r) + '<span style="color:var(--border);">' + '★'.repeat(5-r.r) + '</span>';
    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:12px;display:flex;gap:14px;transition:border-color 0.2s;" onmouseenter="this.style.borderColor='rgba(0,180,171,0.3)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--grad2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0;">${r.a}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <span style="font-size:14px;font-weight:600;">${r.name}</span>
          <span style="color:#F59E0B;font-size:13px;">${starsHtml}</span>
          ${r.verified ? '<span style="font-size:10px;color:var(--teal);background:rgba(0,180,171,0.1);padding:2px 8px;border-radius:50px;display:inline-flex;align-items:center;gap:3px;"><svg viewBox=\'0 0 24 24\' width=\'9\' height=\'9\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'20,6 9,17 4,12\'/></svg> Verificada</span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:10px;">${r.text}</div>
        ${replied
          ? `<span id="rev-btn-${idx}" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#22C55E;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);padding:4px 12px;border-radius:6px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg> Respondido</span>`
          : `<button id="rev-btn-${idx}" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--teal);background:none;border:1px solid rgba(0,180,171,0.3);padding:5px 12px;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseenter="this.style.background='rgba(0,180,171,0.08)';this.style.borderColor='var(--teal)'" onmouseleave="this.style.background='none';this.style.borderColor='rgba(0,180,171,0.3)'" onclick="openReviewReplyModal(this, '${safeNome}', '${safeText}', ${idx})"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Responder</button>`
        }
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// ─── IDENTIDADE DA LOJA LOGADA ─────────
// [v2.9.39] Antes, salvarMarketing('cupom') referenciava
// `currentSeller?.store`, mas essa variável nunca existia —
// os cupons criados ficavam sempre atribuídos a "Loja" (fallback
// genérico). Agora existe de verdade e é mantida em sincronia com
// o campo "Nome da Loja" em Configurações (ver salvarConfiguracoes).
// ═══════════════════════════════════════
var currentSeller = { store: 'Minha Loja Pro', id: '#SPRO01' };

// ═══════════════════════════════════════
// ─── ADD PRODUCT PAGE ──────────────────
// ═══════════════════════════════════════

let currentAddProdStep = 1;
let selectedProductEmoji = '📦';
let addedSpecs = [];
let addedVariations = [];
let addedPhotoSlots = [];

function initAddProductPage(){
  // Only init if not already done
  if(document.getElementById('addprod-step1').dataset.inited) return;
  document.getElementById('addprod-step1').dataset.inited = '1';
  // Populate emoji picker
  const ep = document.getElementById('emojiPicker2');
  if(ep){
    const emojis = ['📱','💻','⌚','🎧','📷','🕹️','🖥️','⌨️','🖱️','📺','👟','👗','👜','💄','🏠','🛋️','🍳','📚','⚽','🚗','🐾','👶','💊','🎵','🎮','🔧','💡','🌿'];
    ep.innerHTML = emojis.map(e=>`<span style="font-size:26px;cursor:pointer;padding:4px;border-radius:8px;transition:var(--transition);" onclick="selectProdEmoji('${e}',this)" onmouseover="this.style.background='rgba(0,180,171,0.15)'" onmouseout="this.style.background=''">${e}</span>`).join('');
  }
  renderPhotoSlots();
  updateFinalSummary();
}

function selectProdEmoji(e, el){
  selectedProductEmoji = e;
  document.querySelectorAll('#emojiPicker2 span').forEach(s=>s.style.outline='');
  el.style.outline = '2px solid var(--teal)';
  updateProductPreview();
}

function addProdGoStep(step){
  // Validate
  if(step > currentAddProdStep){
    if(currentAddProdStep===1){
      const t = document.getElementById('ap-title')?.value.trim();
      const c = document.getElementById('ap-cat')?.value;
      const d = document.getElementById('ap-desc')?.value.trim();
      if(!t){ showToast('⚠️ Preencha o Título do Produto'); return; }
      if(!c){ showToast('⚠️ Selecione uma Categoria'); return; }
      if(!d){ showToast('⚠️ Preencha a Descrição Completa'); return; }
    }
    if(currentAddProdStep===3){
      const p = document.getElementById('ap-price')?.value;
      const s = document.getElementById('ap-stock')?.value;
      if(!p||parseFloat(p)<=0){ showToast('⚠️ Informe o Preço de Venda'); return; }
      if(!s||parseInt(s)<0){ showToast('⚠️ Informe a Quantidade em Estoque'); return; }
    }
  }
  // Hide all
  for(let i=1;i<=4;i++){
    const s=document.getElementById('addprod-step'+i); if(s) s.style.display='none';
    const a=document.getElementById('aps'+i); if(a){ a.classList.remove('active','done'); }
  }
  const target=document.getElementById('addprod-step'+step);
  if(target) target.style.display='block';
  // Step indicators
  for(let i=1;i<=4;i++){
    const a=document.getElementById('aps'+i); if(!a) continue;
    if(i<step) a.classList.add('done');
    else if(i===step) a.classList.add('active');
  }
  currentAddProdStep=step;
  if(step===4) updateFinalSummary();
  window.scrollTo({top:document.getElementById('dash-add-product').offsetTop-80,behavior:'smooth'});
}

function updateProductPreview(){
  const title = document.getElementById('ap-title')?.value||'Nome do produto';
  const brand = document.getElementById('ap-brand')?.value||'Minha Loja Pro';
  const price = parseFloat(document.getElementById('ap-price')?.value)||0;
  const oldPrice = parseFloat(document.getElementById('ap-old-price')?.value)||0;
  const cond = document.querySelector('input[name="ap-cond"]:checked')?.value||'novo';
  const condLabels={novo:'✨ Novo',seminovo:'🔄 Seminovo',usado:'📦 Usado',recondicionado:'🔧 Recondicionado'};

  const pt = document.getElementById('prev-title'); if(pt) pt.textContent = title.slice(0,60)||(title||'Nome do produto');
  const pb = document.getElementById('prev-brand'); if(pb) pb.textContent = brand||'Minha Loja Pro';
  const pp = document.getElementById('prev-price'); if(pp) pp.textContent = price>0?formatPrice(price):'R$ 0,00';
  const po = document.getElementById('prev-old'); if(po) po.textContent = oldPrice>price?formatPrice(oldPrice):'';
  const pof = document.getElementById('prev-off');
  if(pof && oldPrice>price && price>0){
    // [v2.9.31] Exibe floor do off exato — evita mostrar 34% quando o real é 33,97%
    const discExact = wkzExactOff(price, oldPrice);
    pof.textContent = `-${Math.floor(discExact)}%`;
  } else if(pof){ pof.textContent=''; }
  const pe = document.getElementById('prev-emoji'); if(pe) pe.style.fontSize='52px', pe.textContent=selectedProductEmoji;
  const pc = document.getElementById('prev-cond'); if(pc) pc.textContent=condLabels[cond]||'✨ Novo';

  // title char count
  const tc = document.getElementById('ap-title-count');
  const titleEl = document.getElementById('ap-title');
  if(tc && titleEl) tc.textContent = titleEl.value.length+'/120';
}

function insertDesc(text){
  const ta = document.getElementById('ap-desc');
  if(!ta) return;
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0,pos)+text+ta.value.slice(pos);
  ta.focus();
}

function fillDescTemplate(){
  const title = document.getElementById('ap-title')?.value||'[Nome do produto]';
  document.getElementById('ap-desc').value =
`✅ ${title}

📦 O que está incluso na caixa:
• Produto principal
• Manual de instruções
• Garantia do fabricante

🔧 Especificações técnicas:
• [Especificação 1]: [valor]
• [Especificação 2]: [valor]
• [Especificação 3]: [valor]

🛡️ Garantia e Suporte:
12 meses de garantia do fabricante + 90 dias extra WeKz.

📞 Suporte pós-venda:
Respondemos em até 5 minutos no chat da plataforma.`;
  showToast('✨ Template aplicado! Personalize as informações.');
}


/* ── wkzUid: gerador de ID monotônico seguro contra colisões no DOM ──
   Substitui Date.now() que falha quando duas chamadas ocorrem no mesmo ms.
   Combina: sequência global + prefixo + random 5 chars = unicidade garantida. */
(function() {
  var _seq = 0;
  window.wkzUid = function(prefix) {
    _seq++;
    return (prefix || 'wkz') + '_' + _seq + '_' + Math.random().toString(36).slice(2, 7);
  };
})();

function addSpec(){
  const id = wkzUid('spec');
  addedSpecs.push(id);
  const list = document.getElementById('ap-specs-list');
  const row = document.createElement('div');
  row.id = 'spec-'+id;
  row.style.cssText = 'display:flex;gap:8px;align-items:center;';
  row.innerHTML = `
    <input class="form-input wkz-input" type="text" placeholder="Nome (ex: Processador)" style="flex:1;">
    <input class="form-input wkz-input" type="text" placeholder="Valor (ex: Snapdragon 8 Gen 3)" style="flex:2;">
    <button type="button" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#EF4444;font-size:16px;cursor:pointer;flex-shrink:0;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;" onclick="removeSpec('${id}')">✕</button>`;
  list.appendChild(row);
}

function removeSpec(id){
  const el = document.getElementById('spec-'+id);
  if(el) el.remove();
}

function addVariation(){
  const id = wkzUid('var');
  addedVariations.push(id);
  const list = document.getElementById('ap-variations-list');
  const row = document.createElement('div');
  row.id = 'var-'+id;
  row.style.cssText = 'background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;';
  row.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <select class="form-select wkz-select wkz-select--lg" style="flex:1;">
        <option>Cor</option><option>Tamanho</option><option>Armazenamento</option><option>Material</option><option>Modelo</option>
      </select>
      <button type="button" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#EF4444;font-size:14px;cursor:pointer;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" onclick="removeVar('${id}')">✕</button>
    </div>
    <input class="form-input wkz-input" type="text" placeholder="Opções separadas por vírgula (ex: Preto, Branco, Azul)">`;
  list.appendChild(row);
  initFormSelects(); // converte o novo select de variação
}

function removeVar(id){
  const el = document.getElementById('var-'+id);
  if(el) el.remove();
}

function renderTagsPrev(){
  const val = document.getElementById('ap-tags')?.value||'';
  const prev = document.getElementById('ap-tags-preview');
  if(!prev) return;
  const tags = val.split(',').map(t=>t.trim()).filter(Boolean);
  prev.innerHTML = tags.map(t=>`<span style="background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.2);color:var(--teal);padding:3px 10px;border-radius:50px;font-size:11px;">${t}</span>`).join('');
}

function loadSubcats(){
  const cat = document.getElementById('ap-cat')?.value;
  const wrap = document.getElementById('ap-subcat-wrap');
  const sel = document.getElementById('ap-subcat');
  const subcats = {
    eletronicos:['Smartphones','Notebooks','Tablets','Fones de Ouvido','Smartwatches','Câmeras','TVs','Videogames'],
    moda:['Camisetas','Calças','Vestidos','Calçados','Bolsas','Acessórios','Roupas Esportivas','Íntimos'],
    casa:['Móveis','Decoração','Utensílios de Cozinha','Cama & Banho','Iluminação','Organização','Jardim'],
    beleza:['Perfumes','Skincare','Maquiagem','Cabelos','Higiene Pessoal','Suplementos'],
    games:['PlayStation','Xbox','Nintendo','PC Gamer','Headsets','Controles','Jogos Físicos'],
    esportes:['Futebol','Academia & Fitness','Corrida','Natação','Ciclismo','Artes Marciais'],
    auto:['Peças','Acessórios','Limpeza','Som Automotivo','Pneus & Rodas'],
    livros:['Ficção','Não-Ficção','Didáticos','Infantil','Quadrinhos','eBooks'],
    pet:['Rações','Acessórios','Brinquedos','Higiene','Camas & Casinhas'],
    bebe:['Roupas Bebê','Brinquedos','Fraldas','Berços','Amamentação'],
    outros:['Outros'],
  };
  if(cat && subcats[cat]){
    wrap.style.display='block';
    sel.innerHTML = subcats[cat].map(s=>`<option>${s}</option>`).join('');
    // Remove botão customizado existente e reseta o select para re-inicializar
    const existingBtn = document.querySelector(`.wkz-form-select-btn[data-select-id="${sel.id}"]`);
    if(existingBtn) existingBtn.remove();
    sel.style.cssText = '';
    delete sel.dataset.fsId;
    initFormSelects();
  } else {
    wrap.style.display='none';
  }
}

function triggerPhotoUpload(){
  const inp = document.getElementById('photoFileInput');
  if(inp) inp.click();
}

function handlePhotoUpload(event){
  const files = Array.from(event.target.files);
  if(!files.length) return;
  const remaining = 8 - addedPhotoSlots.length;
  if(remaining <= 0){ showToast('⚠️ Limite de 8 fotos atingido.'); return; }
  const toAdd = files.slice(0, remaining);
  let loaded = 0;
  toAdd.forEach(file => {
    if(file.size > 10 * 1024 * 1024){ showToast('⚠️ ' + file.name + ' excede 10MB.'); loaded++; if(loaded===toAdd.length) renderPhotoSlots(); return; }
    const reader = new FileReader();
    reader.onload = function(e){
      addedPhotoSlots.push({ id: wkzUid('photo'), dataUrl: e.target.result, name: file.name });
      loaded++;
      if(loaded === toAdd.length) renderPhotoSlots();
    };
    reader.readAsDataURL(file);
  });
  // Reset input so same file can be re-selected
  event.target.value = '';
}

function addPhotoSlot(){
  triggerPhotoUpload();
}

function renderPhotoSlots(){
  const grid = document.getElementById('ap-photos-grid');
  if(!grid) return;
  const SVG_PIN  = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const SVG_XBTN = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  grid.innerHTML = addedPhotoSlots.map((slot, i) => {
    const imgContent = slot.dataUrl
      ? `<img src="${slot.dataUrl}" alt="${slot.name||'foto'}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`
      : `<span style="font-size:42px;">${slot.emoji||'📦'}</span>`;
    return `
    <div style="background:var(--card2);border:${i===0?'2px solid var(--teal)':'1px solid var(--border)'};border-radius:12px;height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;position:relative;overflow:hidden;"
         data-photo-id="${slot.id}">
      ${imgContent}
      <span style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:10px;color:${i===0?'var(--teal)':'var(--muted)'};background:rgba(0,0,0,0.55);padding:2px 6px;border-radius:50px;white-space:nowrap;">
        ${i===0 ? SVG_PIN+' Principal' : 'Foto '+(i+1)}
      </span>
      <button style="position:absolute;top:6px;right:6px;background:rgba(239,68,68,0.85);border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;"
              onclick="removePhoto('${slot.id}')" aria-label="Remover foto">${SVG_XBTN}</button>
    </div>`;
  }).join('');
  if(addedPhotoSlots.length > 0 && addedPhotoSlots[0].dataUrl){
    const prev = document.getElementById('prev-emoji');
    if(prev){ prev.style.backgroundImage=`url(${addedPhotoSlots[0].dataUrl})`; prev.style.backgroundSize='cover'; prev.style.backgroundPosition='center'; prev.textContent=''; prev.style.borderRadius='10px'; }
  } else if(addedPhotoSlots.length > 0){
    selectedProductEmoji = addedPhotoSlots[0].emoji || selectedProductEmoji;
    updateProductPreview();
  }
}

function removePhoto(photoId){
  /* FIX: busca por ID estável — seguro para exclusão fora de ordem.
     splice(index,1) com índice derivado do ID garante que nunca removemos
     o elemento errado, mesmo que o usuário clique em delete rapidamente. */
  const idx = addedPhotoSlots.findIndex(s => s.id === photoId);
  if(idx !== -1) addedPhotoSlots.splice(idx, 1);
  renderPhotoSlots();
}

function calcMargin(){
  const price = parseFloat(document.getElementById('ap-price')?.value)||0;
  const cost = parseFloat(document.getElementById('ap-cost')?.value)||0;
  const disp = document.getElementById('ap-margin-display');
  if(!disp) return;
  if(price<=0){ disp.style.display='none'; return; }
  disp.style.display='block';
  const fee = price * 0.08;
  const profit = price - fee - cost;
  const margin = price>0 ? ((profit/price)*100).toFixed(1) : 0;
  document.getElementById('m-price').textContent = formatPrice(price);
  document.getElementById('m-fee').textContent = '-'+formatPrice(fee);
  document.getElementById('m-cost').textContent = formatPrice(cost);
  document.getElementById('m-profit').textContent = formatPrice(Math.max(0,profit));
  document.getElementById('m-margin').textContent = margin+'%';
  document.getElementById('m-profit').style.color = profit>=0?'#22C55E':'#EF4444';
  updateProductPreview();
}

function updateFinalSummary(){
  const s = document.getElementById('ap-final-summary');
  if(!s) return;
  const title = document.getElementById('ap-title')?.value||'—';
  const cat = document.getElementById('ap-cat')?.options[document.getElementById('ap-cat')?.selectedIndex]?.text||'—';
  const price = document.getElementById('ap-price')?.value||'0';
  const stock = document.getElementById('ap-stock')?.value||'0';
  const cond = document.querySelector('input[name="ap-cond"]:checked')?.value||'novo';
  const freight = document.querySelector('input[name="ap-freight"]:checked')?.value||'free';
  const freightLabels={free:'✅ Frete Grátis',table:'📊 Por CEP',fixed:'💳 Frete Fixo','free-above':'🎯 Grátis acima de valor'};
  s.innerHTML = [
    ['Título', title.slice(0,40)+(title.length>40?'...':'')],
    ['Categoria', cat],
    ['Preço', 'R$ '+parseFloat(price).toFixed(2).replace('.',',')],
    ['Estoque', stock+' unidades'],
    ['Condição', cond],
    ['Frete', freightLabels[freight]||freight],
    ['Fotos', addedPhotoSlots.length+' adicionada(s)'],
  ].map(([k,v])=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--muted);">${k}</span><strong style="text-align:right;">${v}</strong></div>`).join('');
}

function saveDraft(){
  showToast('💾 Rascunho salvo! Continue quando quiser.');
}

function publishProduct(){
  const title = document.getElementById('ap-title')?.value.trim();
  const price = parseFloat(document.getElementById('ap-price')?.value)||0;
  const cat = document.getElementById('ap-cat')?.value;
  if(!title){ addProdGoStep(1); showToast('⚠️ Preencha o Título do Produto'); return; }
  if(!cat){ addProdGoStep(1); showToast('⚠️ Selecione uma Categoria'); return; }
  if(price<=0){ addProdGoStep(3); showToast('⚠️ Informe o Preço de Venda'); return; }

  // Hide all steps
  for(let i=1;i<=4;i++){
    const s=document.getElementById('addprod-step'+i); if(s) s.style.display='none';
    const a=document.getElementById('aps'+i); if(a){ a.classList.remove('active'); a.classList.add('done'); }
  }
  document.getElementById('addprod-success').style.display='block';

  // Add to products array so it shows in Meus Produtos
  const newProduct = {
    n: title,
    e: selectedProductEmoji,
    p: price,
    op: parseFloat(document.getElementById('ap-old-price')?.value)||price,
    off: 0,
    s: 'Minha Loja Pro',
    r: 5.0,
    sales: '0',
    badge: 'new',
    // [FUNC-P02 / BUG-V01] campos completos
    sku:       document.getElementById('ap-sku')?.value.trim()        || '',
    brand:     document.getElementById('ap-brand')?.value.trim()      || '',
    weight:    parseFloat(document.getElementById('ap-weight')?.value) || 0,
    stock:     parseInt(document.getElementById('ap-stock')?.value)    || 0,
    stockAlert:parseInt(document.getElementById('ap-stock-alert')?.value) || 0,
    cost:      parseFloat(document.getElementById('ap-cost')?.value)   || 0,
    desc:      document.getElementById('ap-desc')?.value.trim()       || '',
    shortDesc: document.getElementById('ap-short-desc')?.value.trim() || '',
    tags:      document.getElementById('ap-tags')?.value.trim()       || '',
    length:    parseFloat(document.getElementById('ap-length')?.value) || 0,
    width:     parseFloat(document.getElementById('ap-width')?.value)  || 0,
    height:    parseFloat(document.getElementById('ap-height')?.value) || 0,
  };
  if(newProduct.op > newProduct.p){
    // [v2.9.31] off exato (sem Math.round) + p recalculado via wkzExactPrice
    var _newOff = wkzExactOff(newProduct.p, newProduct.op);
    newProduct.off = _newOff;
    newProduct.p   = wkzExactPrice(newProduct.op, _newOff);
  }
  products.unshift(newProduct);

  // Show product card in success
  const sc = document.getElementById('success-product-card');
  if(sc) sc.innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;">
      <div style="width:64px;height:64px;border-radius:12px;background:var(--grad2);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;overflow:hidden;">
        ${addedPhotoSlots.length > 0 && addedPhotoSlots[0].dataUrl
          ? `<img src="${addedPhotoSlots[0].dataUrl}" style="width:100%;height:100%;object-fit:cover;" alt="foto principal">`
          : `<span>${newProduct.e}</span>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:800;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${newProduct.n}</div>
        <div style="font-size:13px;color:var(--teal);font-weight:700;">${formatPrice(newProduct.p)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <span class="badge badge-new">NOVO</span>
          <span style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Publicado na WeKz Shop
          </span>
        </div>
      </div>
    </div>`;

  showToast('🚀 Produto publicado com sucesso!');
  // [FIX v2.3.1] Invalida cache da lista de produtos e força re-render
  const mpList = document.getElementById('myProductsList');
  if(mpList) { mpList.innerHTML = ''; mpList.removeAttribute('data-inited'); }
  // Se o utilizador navegar para "Meus Produtos", o initMyProducts(true) será chamado
  if(typeof initMyProducts === 'function') initMyProducts(true);
}

function resetAddProduct(){
  // Reset all fields
  ['ap-title','ap-brand','ap-sku','ap-short-desc','ap-desc','ap-tags','ap-price','ap-old-price','ap-cost','ap-stock','ap-stock-alert','ap-weight','ap-length','ap-width','ap-height','ap-pix-disc'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const cat = document.getElementById('ap-cat'); if(cat) cat.selectedIndex=0;
  document.getElementById('ap-subcat-wrap').style.display='none';
  document.getElementById('ap-tags-preview').innerHTML='';
  document.getElementById('ap-specs-list').innerHTML='';
  document.getElementById('ap-variations-list').innerHTML='';
  document.getElementById('ap-margin-display').style.display='none';
  addedSpecs=[];addedVariations=[];addedPhotoSlots=[];selectedProductEmoji='📦';
  renderPhotoSlots();
  updateProductPreview();
  document.getElementById('addprod-success').style.display='none';
  // Reset steps
  for(let i=1;i<=4;i++){
    const a=document.getElementById('aps'+i); if(a){ a.classList.remove('active','done'); }
    const s=document.getElementById('addprod-step'+i); if(s) s.style.display='none';
  }
  document.getElementById('aps1').classList.add('active');
  document.getElementById('addprod-step1').style.display='block';
  currentAddProdStep=1;
  showToast('✅ Formulário limpo. Pronto para novo produto!');
}

function filterOrders(type, el){
  if(el){
    document.querySelectorAll('#dash-orders .rev-filter').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');
  }
  window._ordersActiveStatus = type;
  const term = (document.getElementById('ordersSearch')?.value || '').toLowerCase().trim();
  let visibleCount = 0;
  document.querySelectorAll('#ordersTableBody tr').forEach(row=>{
    const matchStatus = (type === 'all' || row.dataset.status === type);
    let matchTerm = true;
    if(term){
      const orderId = (row.querySelector('td[data-label="Pedido"]')?.textContent || '').toLowerCase();
      const buyer    = (row.querySelector('td[data-label="Comprador"]')?.textContent || '').toLowerCase();
      matchTerm = orderId.includes(term) || buyer.includes(term);
    }
    const show = matchStatus && matchTerm;
    row.style.display = show ? '' : 'none';
    if(show) visibleCount++;
  });
  if(el) showToast('🔍 Filtrando pedidos: '+el.textContent.trim());
  return visibleCount;
}

/* ═══════════════════════════════════════════════════════════════════
   HELPER: cria/reutiliza um overlay genérico de modal do vendedor
   Recebe: id único, HTML interno, opções (maxWidth, zIndex)
═══════════════════════════════════════════════════════════════════ */

/* ── 3.3: Utilitários de UI + Saque Cripto/PIX + Extrato ─────────────────
   _wkzModal/_wkzRadio/_wkzDropToggle/_wkzDropPick (modais genéricos do
   vendedor), gerador de QR cripto (BTC/ETH/USDT), openSaqueModal,
   confirmarSaque, openExtratoModal, exportarExtrato.
   Origem monólito: linhas 31068–31508
   ─────────────────────────────────────────────────────────────────────── */
function _wkzModal(id, innerHtml, opts){
  // Chamado com null/undefined = fechar todos os modais abertos
  if (!id) {
    document.querySelectorAll('.modal-overlay.open').forEach(function(m){ m.classList.remove('open'); });
    return null;
  }
  opts = opts || {};
  // C2: sanitiza o conteúdo antes de injetar no DOM
  var safeHtml = (typeof wkzSanitizeHTML === 'function') ? wkzSanitizeHTML(innerHtml) : innerHtml;
  let ov = document.getElementById(id);
  if(!ov){
    ov = document.createElement('div');
    ov.id = id;
    ov.className = 'modal-overlay';
    ov.style.zIndex = opts.zIndex || '2200';
    ov.onclick = function(e){ if(e.target===ov) ov.classList.remove('open'); };
    document.body.appendChild(ov);
  }
  const mw = opts.maxWidth || '500px';
  ov.innerHTML = `<div class="modal" style="max-width:${mw};width:94%;max-height:92vh;overflow-y:auto;padding:28px;position:relative;">
    <button class="modal-close" onclick="document.getElementById('${escapeHtml(id)}').classList.remove('open')" style="top:14px;right:14px;">✕</button>
    ${safeHtml}
  </div>`;
  ov.classList.add('open');
  return ov;
}

/* ─── WeKz Custom Radio Helper ─── */
/* Usage: onclick="_wkzRadio('groupId','hiddenInputId','value',this)" */
function _wkzRadio(groupId, inputId, val, el){
  const group = document.getElementById(groupId);
  if(group){
    group.querySelectorAll('label').forEach(l=>{
      l.style.borderColor='var(--border)';
      const dot = l.querySelector('.wkz-rdot');
      if(dot){ dot.style.borderColor='var(--border)'; dot.style.background='transparent'; dot.innerHTML=''; }
    });
  }
  if(el){
    el.style.borderColor='rgba(0,180,171,0.5)';
    const dot = el.querySelector('.wkz-rdot');
    if(dot){ dot.style.borderColor='var(--teal)'; dot.style.background='var(--teal)'; dot.innerHTML='<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>'; }
  }
  const inp = document.getElementById(inputId);
  if(inp) inp.value = val;
}

/* ─── WeKz Custom Dropdown Helpers ─── */
function _wkzDropToggle(ddId){
  const dd = document.getElementById(ddId);
  if(!dd) return;
  const open = dd.style.display==='block';
  // Close all other dropdowns
  document.querySelectorAll('[id$="-dd"]').forEach(d=>{ if(d!==dd) d.style.display='none'; });
  dd.style.display = open?'none':'block';
}
function _wkzDropPick(inputId, ddId, labelId, val, labelText){
  const inp = document.getElementById(inputId);
  if(inp) inp.value = val;
  const lbl = document.getElementById(labelId);
  if(lbl) lbl.textContent = labelText;
  const dd = document.getElementById(ddId);
  if(dd) dd.style.display='none';
}
// Close dropdowns on outside click
document.addEventListener('click', function(e){
  if(!e.target.closest('[id$="-btn"]') && !e.target.closest('[id$="-dd"]')){
    document.querySelectorAll('[id$="-dd"]').forEach(d=>{ if(d.style) d.style.display='none'; });
  }
});

/* ══════════════════════════════════════════════════════════
   KZ CRYPTO PAYMENT ENGINE v1.0 — WeKz v2.6.9
   QR Code inline SVG + Timer 30min + Coin selector
   ══════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var _coin = 'BTC';
  var _timerInterval = null;
  var _timerSec = 29 * 60 + 59; // 29:59

  var COINS = {
    BTC:  { sym:'₿', name:'Bitcoin',   color:'#F7931A', addr:'1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na', rate:0.0000042,  net:'Bitcoin Network'   },
    ETH:  { sym:'Ξ', name:'Ethereum',  color:'#627EEA', addr:'0x742d35Cc6634C0532925a3b844Bc9e7595f8fA0', rate:0.000063, net:'ERC-20 / BEP-20' },
    USDT: { sym:'₮', name:'Tether',    color:'#26A17B', addr:'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', rate:1.0,         net:'TRC-20 / BEP-20'  },
  };

  /* ── Minimal QR matrix generator (no external lib) ───── */
  function _qrMatrix(text) {
    // Tiny deterministic QR-like grid for UI (not scannable, demo-grade)
    // Real QR would require a library; this generates a visually convincing pattern
    var size = 21;
    var m = [];
    for (var r = 0; r < size; r++) { m[r] = []; for (var c = 0; c < size; c++) m[r][c] = 0; }
    // Finder patterns (3 corners)
    function _fp(r0, c0) {
      for (var dr = 0; dr < 7; dr++) for (var dc = 0; dc < 7; dc++) {
        var b = (dr===0||dr===6||dc===0||dc===6) ? 1 : (dr>=2&&dr<=4&&dc>=2&&dc<=4) ? 1 : 0;
        if (r0+dr < size && c0+dc < size) m[r0+dr][c0+dc] = b;
      }
    }
    _fp(0,0); _fp(0,14); _fp(14,0);
    // Timing strips
    for (var i = 8; i < 13; i++) { m[6][i] = i%2===0?1:0; m[i][6] = i%2===0?1:0; }
    // Data modules — deterministic from text hash
    var hash = 0; for (var j = 0; j < text.length; j++) hash = (hash*31 + text.charCodeAt(j)) >>> 0;
    for (var row = 0; row < size; row++) for (var col = 0; col < size; col++) {
      if (m[row][col]) continue;
      var seed = ((hash ^ (row*1000+col)*7919) >>> 0);
      m[row][col] = seed % 3 === 0 ? 1 : 0;
    }
    return m;
  }

  function _renderQR(addr) {
    var svg = document.getElementById('cryptoQrSvg');
    if (!svg) return;
    var m = _qrMatrix(addr);
    var cells = '';
    var sz = m.length;
    for (var r = 0; r < sz; r++) for (var c = 0; c < sz; c++) {
      if (m[r][c]) cells += '<rect x="'+c+'" y="'+r+'" width="1" height="1" fill="#000"/>';
    }
    svg.innerHTML = cells;
  }

  function _calcAmount(coin) {
    // Mock: compute from cart total or fixed demo value
    var totalEl = document.getElementById('ckoutSbTotal');
    var brl = 0;
    if (totalEl) {
      var txt = totalEl.textContent.replace(/[^\d,\.]/g,'').replace(',','.');
      brl = parseFloat(txt) || 299.90;
    } else { brl = 299.90; }
    var c = COINS[coin];
    var amount = (brl * c.rate).toFixed(coin==='USDT'?2:6);
    return amount;
  }

  function _timerTick() {
    _timerSec--;
    if (_timerSec <= 0) { _timerSec = 0; clearInterval(_timerInterval); _timerInterval = null; }
    var min = Math.floor(_timerSec/60);
    var sec = _timerSec % 60;
    var el = document.getElementById('cryptoTimer');
    if (el) {
      el.textContent = (min<10?'0':'')+min+':'+(sec<10?'0':'')+sec;
      el.style.color = _timerSec < 300 ? '#EF4444' : _timerSec < 600 ? '#F59E0B' : '#22C55E';
    }
  }

  function _startTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); }
    _timerSec = 29*60+59;
    _timerInterval = setInterval(_timerTick, 1000);
  }

  window.kzSelectCoin = function(coin) {
    _coin = coin;
    ['BTC','ETH','USDT'].forEach(function(c){
      var el = document.getElementById('coin'+c);
      if (el) el.classList.toggle('sel', c===coin);
    });
    var c = COINS[coin];
    var amount = _calcAmount(coin);
    // Update badge
    var badge = document.getElementById('cryptoCoinBadge');
    if (badge) {
      badge.textContent = c.sym + ' ' + c.name;
      badge.style.color = c.color;
      badge.style.background = 'rgba('+_hexToRgb(c.color)+',0.12)';
      badge.style.borderColor = 'rgba('+_hexToRgb(c.color)+',0.3)';
    }
    // Update wallet address
    var addrEl = document.getElementById('cryptoWalletAddr');
    if (addrEl) addrEl.textContent = c.addr;
    // Update amount
    var amtEl = document.getElementById('cryptoAmount');
    if (amtEl) amtEl.textContent = amount + ' ' + coin;
    var amtInline = document.getElementById('cryptoAmountInline');
    if (amtInline) amtInline.textContent = 'exatamente ' + amount + ' ' + coin;
    // Render QR
    _renderQR(c.addr);
    // Reset timer on coin change
    _startTimer();
    // Update _PAY_META
    if (typeof _PAY_META !== 'undefined') {
      _PAY_META.crypto.desc = c.name + ' · ' + amount + ' ' + coin;
    }
  };

  window.kzCopyWallet = function() {
    var c = COINS[_coin];
    if (navigator.clipboard) {
      navigator.clipboard.writeText(c.addr).then(function(){
        showToast('✅ Endereço ' + _coin + ' copiado!');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = c.addr; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('✅ Endereço ' + _coin + ' copiado!');
    }
  };

  function _hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return r+','+g+','+b;
  }

  // Hook: init when crypto panel becomes visible
  var _origSelectPay = window.selectPay;
  window.selectPay = function(type) {
    if (typeof _origSelectPay === 'function') _origSelectPay(type);
    if (type === 'crypto') {
      setTimeout(function(){ kzSelectCoin('BTC'); }, 80);
    } else {
      if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
    }
  };

})(); // end KZ CRYPTO ENGINE

/* ─── GLOBAL SHIPPING → Navega para a página dedicada ─── */
function openGlobalShippingModal(){
  MapsTo('logistica-global');
}

/* ─── GLOBAL SHIPPING MODAL (legado — mantido por compatibilidade) ─── */
function openGlobalShippingModalLegacy(){
  const regions = [
    { flag:'🇧🇷', name:'Brasil', desc:'Entrega expressa nacional', days:'2–7 dias', price:'A partir de R$ 12,90', carrier:'Correios / Jadlog / Total Express', color:'#22C55E' },
    { flag:'🇵🇹', name:'Portugal & Europa', desc:'Entrega rastreada EUR', days:'10–18 dias', price:'A partir de € 6,90', carrier:'Kz Global Express', color:'#3B82F6' },
    { flag:'🇦🇴', name:'Angola & África', desc:'Entrega prioritária AOA', days:'12–22 dias', price:'A partir de Kz 2.400', carrier:'Kz Global Express', color:'#F59E0B' },
    { flag:'🇺🇸', name:'EUA & Américas', desc:'Frete rastreado USD', days:'10–16 dias', price:'A partir de $ 7,90', carrier:'Kz Global Express', color:'#6366F1' },
    { flag:'🇯🇵', name:'Ásia & Pacífico', desc:'Envio consolidado JPY/CNY', days:'14–20 dias', price:'A partir de ¥ 1.200', carrier:'Kz Global Express', color:'#EC4899' },
    { flag:'🌍', name:'Resto do Mundo', desc:'180+ países cobertos', days:'14–30 dias', price:'Calcule na PDP', carrier:'Kz Global Express', color:'#00B4AB' },
  ];
  const rows = regions.map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px;">
      <div style="font-size:24px;flex-shrink:0;line-height:1;">${r.flag}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px;">${r.name}</div>
        <div style="font-size:11px;color:var(--muted);">${r.desc} · ${r.carrier}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:12px;font-weight:600;color:${r.color};">${r.price}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">${r.days}</div>
      </div>
    </div>
  `).join('');

  _wkzModal('wkzGlobalShippingModal', `
    <div style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,rgba(124,58,237,0.2),rgba(37,99,235,0.2));border:1px solid rgba(124,58,237,0.4);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <div>
          <div class="modal-title" style="font-size:17px;margin-bottom:0;">Entrega Global WeKz</div>
          <div style="font-size:12px;color:var(--muted);">180+ países · Rastreamento em tempo real</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <span style="font-size:11px;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);color:var(--teal);padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:4px;">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
          Frete rastreado garantido
        </span>
        <span style="font-size:11px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22C55E;padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:4px;">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
          Proteção total ao comprador
        </span>
        <span style="font-size:11px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);color:var(--purple);padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:4px;">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
          Desembaraço aduaneiro assistido
        </span>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);margin-bottom:10px;">Regiões cobertas</div>
    ${rows}
    <div style="margin-top:16px;padding:12px 14px;background:linear-gradient(135deg,rgba(0,180,171,0.07),rgba(124,58,237,0.07));border:1px solid rgba(0,180,171,0.2);border-radius:10px;display:flex;align-items:center;gap:10px;">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" flex-shrink="0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="font-size:12px;color:var(--muted);">O valor exato do frete é calculado automaticamente ao adicionar produtos ao carrinho, com base no destino e peso.</div>
    </div>
    <button onclick="document.getElementById('wkzGlobalShippingModal').classList.remove('open')" style="width:100%;margin-top:16px;padding:12px;background:linear-gradient(135deg,rgba(124,58,237,0.15),rgba(37,99,235,0.15));border:1px solid rgba(124,58,237,0.35);color:var(--purple);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.5px;">Entendido</button>
  `, { maxWidth: '480px' });
}

/* ─── FINANCEIRO: Solicitar Saque ─── */
function openSaqueModal(){
  _wkzModal('wkzSaqueModal', `
    <div class="modal-title" style="font-size:18px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> Solicitar Saque</div>
    <div class="modal-sub" style="margin-bottom:20px;">Saldo disponível: <strong style="color:#22C55E;">R$ 12.480,00</strong></div>
    <div class="form-group">
      <label class="form-label">Valor do saque (R$) <span class="req">*</span></label>
      <input class="form-input" id="sw-valor" type="number" min="50" max="12480" step="0.01" placeholder="Mínimo R$ 50,00" value="12480">
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Mínimo: R$ 50,00 · Máximo disponível: R$ 12.480,00</div>
    </div>
    <div class="form-group">
      <label class="form-label">Conta bancária <span class="req">*</span></label>
      <div id="sw-conta-group" style="display:flex;flex-direction:column;gap:8px;">
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--card2);border:1px solid rgba(0,180,171,0.4);border-radius:10px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="document.querySelectorAll('#sw-conta-group label').forEach(l=>l.style.borderColor='var(--border)');this.style.borderColor='rgba(0,180,171,0.5)';document.getElementById('sw-conta').value='pix'">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--teal);background:var(--teal);flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg></div>
          <div><div style="font-weight:600;">PIX — CPF cadastrado</div><div style="font-size:11px;color:var(--teal);margin-top:2px;">Transferência imediata</div></div>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="document.querySelectorAll('#sw-conta-group label').forEach(l=>l.style.borderColor='var(--border)');this.style.borderColor='rgba(0,180,171,0.5)';document.getElementById('sw-conta').value='ted'">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;margin-top:1px;"></div>
          <div><div style="font-weight:600;">TED — Banco do Brasil ••••8821</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">1–2 dias úteis</div></div>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="document.querySelectorAll('#sw-conta-group label').forEach(l=>l.style.borderColor='var(--border)');this.style.borderColor='rgba(0,180,171,0.5)';document.getElementById('sw-conta').value='poupanca'">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;margin-top:1px;"></div>
          <div><div style="font-weight:600;">Poupança — Caixa Econômica ••••4410</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">1–2 dias úteis</div></div>
        </label>
      </div>
      <input type="hidden" id="sw-conta" value="pix">
    </div>
    <div style="background:rgba(0,180,171,0.06);border:1px solid rgba(0,180,171,0.2);border-radius:10px;padding:12px;font-size:12px;margin-bottom:20px;line-height:1.7;">
      <div style="font-weight:700;color:var(--teal);margin-bottom:4px;">📋 Resumo do saque</div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">Valor solicitado:</span><span id="sw-resumo-val">R$ 12.480,00</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">Taxa de transferência:</span><span style="color:#EF4444;">R$ 0,00</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,180,171,0.2);"><span>Valor líquido:</span><span style="color:#22C55E;" id="sw-resumo-liq">R$ 12.480,00</span></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzSaqueModal').classList.remove('open')">Cancelar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="confirmarSaque()">💳 Confirmar Saque</button>
    </div>
  `, {maxWidth:'480px'});
  // Live update resumo
  const inp = document.getElementById('sw-valor');
  if(inp) inp.oninput = function(){
    const v = parseFloat(this.value)||0;
    const fmt = 'R$ '+v.toFixed(2).replace('.',',');
    const rv = document.getElementById('sw-resumo-val'); if(rv) rv.textContent = fmt;
    const rl = document.getElementById('sw-resumo-liq'); if(rl) rl.textContent = fmt;
  };
}

function confirmarSaque(){
  const v = parseFloat(document.getElementById('sw-valor')?.value)||0;
  const contaVal = document.getElementById('sw-conta')?.value || 'pix';
  const contaLabels = {pix:'PIX', ted:'TED Banco do Brasil', poupanca:'Poupança Caixa'};
  const contaTxt = contaLabels[contaVal] || contaVal;
  if(v < 50){ showToast('⚠️ Valor mínimo de saque é R$ 50,00'); return; }
  if(v > 12480){ showToast('⚠️ Valor excede o saldo disponível'); return; }
  document.getElementById('wkzSaqueModal').classList.remove('open');
  showToast('✅ Saque de R$ '+v.toFixed(2).replace('.',',')+' solicitado! Processamento via '+contaTxt+'.');
}

/* ─── FINANCEIRO: Exportar Extrato ─── */
function openExtratoModal(){
  _wkzModal('wkzExtratoModal', `
    <div class="modal-title" style="font-size:18px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg> Exportar Extrato</div>
    <div class="modal-sub" style="margin-bottom:20px;">Selecione o período e formato de exportação</div>
    <div class="form-group">
      <label class="form-label">Período <span class="req">*</span></label>
      <div id="ext-periodo-group" style="display:flex;flex-direction:column;gap:6px;">
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid rgba(0,180,171,0.4);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('mes',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--teal);background:var(--teal);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg></div>
          Mês atual (Maio 2026)
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('mes-ant',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
          Mês anterior (Abril 2026)
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('trim',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
          Último trimestre
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('semestre',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
          Último semestre
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('ano',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
          Ano atual (2026)
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_extPeriodo('custom',this)">
          <div class="ext-radio-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
          Período personalizado
        </label>
      </div>
      <input type="hidden" id="ext-periodo" value="mes">
    </div>
    <div id="ext-custom-wrap" style="display:none;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" class="form-group">
        <div><label class="form-label">De</label><input class="form-input" id="ext-de" type="date"></div>
        <div><label class="form-label">Até</label><input class="form-input" id="ext-ate" type="date"></div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Formato</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;"><input type="radio" name="ext-fmt" value="pdf" checked> 📄 PDF</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;"><input type="radio" name="ext-fmt" value="xlsx"> 📊 Excel (.xlsx)</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;"><input type="radio" name="ext-fmt" value="csv"> 📋 CSV</label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Incluir no extrato</label>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked> Vendas e receitas</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked> Saques realizados</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked> Taxas WeKz</label>
        <label style="display:flex;align-items:center;gap=8px;cursor:pointer;"><input type="checkbox"> Detalhamento por produto</label>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzExtratoModal').classList.remove('open')">Cancelar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="exportarExtrato()">📥 Exportar</button>
    </div>
  `, {maxWidth:'480px'});
  // Wire period selection helper
  window._extPeriodo = function(val, el){
    const group = document.getElementById('ext-periodo-group');
    if(!group) return;
    group.querySelectorAll('label').forEach(l=>{
      l.style.borderColor='var(--border)';
      const dot = l.querySelector('.ext-radio-dot');
      if(dot){ dot.style.borderColor='var(--border)'; dot.style.background='transparent'; dot.innerHTML=''; }
    });
    el.style.borderColor='rgba(0,180,171,0.5)';
    const dot = el.querySelector('.ext-radio-dot');
    if(dot){ dot.style.borderColor='var(--teal)'; dot.style.background='var(--teal)'; dot.innerHTML='<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>'; }
    document.getElementById('ext-periodo').value = val;
    document.getElementById('ext-custom-wrap').style.display = val==='custom'?'block':'none';
  };
}

function exportarExtrato(){
  const periodoVal = document.getElementById('ext-periodo')?.value || 'mes';
  const fmt = document.querySelector('input[name="ext-fmt"]:checked')?.value||'pdf';
  const periodoLabels = {'mes':'Mês atual (Mai 2026)','mes-ant':'Abril 2026','trim':'Último trimestre','semestre':'Último semestre','ano':'Ano 2026','custom':'Período personalizado'};
  const periodoTxt = periodoLabels[periodoVal] || periodoVal;
  document.getElementById('wkzExtratoModal').classList.remove('open');
  showToast('📥 Extrato ('+periodoTxt+') exportado em '+fmt.toUpperCase()+'! O download foi iniciado.');
}

/* ─── AVALIAÇÕES: Responder ─── */

/* ── 3.4: Resposta a Avaliação/Disputa + Marketing + Relatórios ──────────
   openReviewReplyModal, openDisputeReplyModal, openMarketingModal,
   gerarCodigoCupom, salvarMarketing, os 4 relatórios (vendas, estoque,
   financeiro, avaliações) + exportação.
   Origem monólito: linhas 31509–32489
   ─────────────────────────────────────────────────────────────────────── */
function openReviewReplyModal(btn, autorNome, textoAvaliacao, reviewIdx){
  const safeNome = (autorNome||'Cliente');
  const safeNomeJs = safeNome.replace(/'/g,"\\'");
  _wkzModal('wkzReviewReplyModal', `
    <div class="modal-title" style="font-size:18px;margin-bottom:4px;display:flex;align-items:center;gap:8px;">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Responder Avaliação
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;">
      <div style="display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:6px;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="#F59E0B" stroke="#F59E0B" stroke-width="1"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
        ${safeNome}
      </div>
      <div style="color:var(--muted);font-style:italic;font-size:12px;line-height:1.6;">"${(textoAvaliacao||'').slice(0,120)}"</div>
    </div>
    <div class="form-group">
      <label class="form-label">Sua resposta pública <span class="req">*</span></label>
      <textarea class="form-input" id="rev-reply-text" rows="4" placeholder="Obrigado pela sua avaliação! Fico feliz que..." style="resize:vertical;font-family:inherit;"></textarea>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Sua resposta ficará visível publicamente na página do produto.</div>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Respostas rápidas:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button style="font-size:11px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--teal)'" onmouseleave="this.style.borderColor='var(--border)'" onclick="document.getElementById('rev-reply-text').value='Muito obrigado pela sua avaliação! É um prazer atender você. Qualquer dúvida, estamos à disposição!'">Agradecimento</button>
        <button style="font-size:11px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--teal)'" onmouseleave="this.style.borderColor='var(--border)'" onclick="document.getElementById('rev-reply-text').value='Obrigado pelo feedback! Lamentamos qualquer inconveniente. Por favor, entre em contato pelo nosso chat para resolvermos isso imediatamente.'">Problema</button>
        <button style="font-size:11px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--teal)'" onmouseleave="this.style.borderColor='var(--border)'" onclick="document.getElementById('rev-reply-text').value='Ficamos felizes que tenha gostado! Volte sempre — temos muitas novidades chegando em breve!'">Elogio</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzReviewReplyModal').classList.remove('open')">Cancelar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;display:flex;align-items:center;gap:7px;" onclick="enviarRespostaReview('${safeNomeJs}', ${reviewIdx !== undefined ? reviewIdx : -1})">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
        Publicar Resposta
      </button>
    </div>
  `, {maxWidth:'500px'});
  window._reviewReplyBtn = btn;
  window._reviewReplyIdx = reviewIdx;
}

function enviarRespostaReview(autorNome, reviewIdx){
  const txt = document.getElementById('rev-reply-text')?.value.trim();
  if(!txt){ showToast('⚠️ Escreva sua resposta antes de publicar.'); return; }
  document.getElementById('wkzReviewReplyModal').classList.remove('open');
  // Persist replied state
  if(!window._repliedReviews) window._repliedReviews = new Set();
  if(reviewIdx !== undefined && reviewIdx >= 0) window._repliedReviews.add(reviewIdx);
  // Update the triggering button to "Respondido"
  const btn = window._reviewReplyBtn;
  if(btn){
    btn.outerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#22C55E;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);padding:5px 12px;border-radius:6px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg> Respondido</span>`;
  }
  showToast('✅ Resposta publicada para ' + (autorNome||'cliente') + '!');
}

/* ─── DISPUTAS: Responder Agora ─── */
function openDisputeReplyModal(pedido, produto, comprador, motivo, data){
  _wkzModal('wkzDisputaModal', `
    <div class="modal-title" style="font-size:18px;margin-bottom:4px;display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Responder Disputa</div>
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div><span style="color:var(--muted);">Pedido:</span> <strong>${pedido}</strong></div>
        <div><span style="color:var(--muted);">Data:</span> <strong>${data}</strong></div>
        <div><span style="color:var(--muted);">Produto:</span> <strong>${produto}</strong></div>
        <div><span style="color:var(--muted);">Comprador:</span> <strong>${comprador}</strong></div>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(239,68,68,0.15);"><span style="color:var(--muted);">Motivo:</span> <strong style="color:#EF4444;">${motivo}</strong></div>
    </div>
    <div class="form-group">
      <label class="form-label">Sua posição <span class="req">*</span></label>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">
          <input type="radio" name="disp-pos" value="refund" style="margin-top:2px;accent-color:var(--teal);"> <div><strong>Aceitar e reembolsar</strong><br><span style="color:var(--muted);font-size:12px;">Aceito a reclamação e autorizo o reembolso total.</span></div>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">
          <input type="radio" name="disp-pos" value="partial" style="margin-top:2px;accent-color:var(--teal);"> <div><strong>Reembolso parcial</strong><br><span style="color:var(--muted);font-size:12px;">Proponho uma solução intermediária.</span></div>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">
          <input type="radio" name="disp-pos" value="contest" checked style="margin-top:2px;accent-color:var(--teal);"> <div><strong>Contestar</strong><br><span style="color:var(--muted);font-size:12px;">Discordo da reclamação e apresento minha defesa.</span></div>
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Sua resposta / defesa <span class="req">*</span></label>
      <textarea class="form-input" id="disp-reply-text" rows="4" placeholder="Descreva detalhadamente sua posição. Inclua rastreamento, fotos ou qualquer evidência relevante..." style="resize:vertical;font-family:inherit;"></textarea>
    </div>
    <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px;font-size:12px;color:var(--muted);margin-bottom:16px;">
      ⏱️ Você tem <strong style="color:#F59E0B;">até 48h</strong> para responder. Sem resposta, a WeKz decide automaticamente a favor do comprador.
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzDisputaModal').classList.remove('open')">Cancelar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="enviarRespostaDisputa('${pedido}')">⚖️ Enviar Resposta</button>
    </div>
  `, {maxWidth:'520px'});
}

function enviarRespostaDisputa(pedido){
  const txt = document.getElementById('disp-reply-text')?.value.trim();
  const pos = document.querySelector('input[name="disp-pos"]:checked')?.value;
  if(!txt){ showToast('⚠️ Descreva sua posição antes de enviar.'); return; }
  const posLabels = {refund:'Reembolso aceito', partial:'Reembolso parcial proposto', contest:'Contestação enviada'};
  const posLabel = posLabels[pos] || 'Resposta enviada';
  document.getElementById('wkzDisputaModal').classList.remove('open');

  /* FIX: seletor robusto por data-order-id — jamais quebra por normalização de style */
  const card = document.querySelector('#sellerDisputesList [data-order-id="'+pedido+'"]');
  if(card){
    const btn = card.querySelector('.btn-primary');
    if(btn){
      btn.textContent = '✅ Respondido';
      btn.disabled = true;
      btn.style.background = 'rgba(34,197,94,0.15)';
      btn.style.border = '1px solid rgba(34,197,94,0.3)';
      btn.style.color = '#22C55E';
      btn.onclick = null;
    }
  }

  /* FIX: propaga mensagem do vendedor para a Central de Mediação do admin */
  if(typeof ADMIN_DISPUTES !== 'undefined'){
    const disp = ADMIN_DISPUTES.find(function(d){ return d.id === pedido; });
    if(disp){
      const time = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      disp.msgs.push({ who:'seller', text:'['+posLabel+'] '+txt, time:time });
      /* Se o chat do admin estiver aberto nesta disputa, re-renderiza em tempo real */
      if(typeof _activeDisputaId !== 'undefined' && _activeDisputaId === pedido && typeof renderDisputaChat === 'function'){
        renderDisputaChat(disp);
      }
    }
  }

  /* FIX: notifica o comprador que o vendedor respondeu (Central de Disputas do Cliente) */
  if(typeof window.cpNotifyBuyerSellerResponded === 'function'){
    window.cpNotifyBuyerSellerResponded(pedido, posLabel, txt);
  }

  showToast('✅ '+posLabel+' para disputa '+pedido+'!');
}

/* ─── MARKETING: Modal unificado ─── */
function openMarketingModal(tipo){
  const configs = {
    cupom: {
      title: '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7" stroke-width="3"/></svg> Criar Cupom de Desconto</span>',
      color: 'var(--teal)',
      html: `
        <div class="form-group">
          <label class="form-label">Código do cupom <span class="req">*</span></label>
          <div style="display:flex;gap:8px;">
            <input class="form-input" id="mk-cupom-code" type="text" placeholder="Ex: VERAO20" maxlength="20" style="text-transform:uppercase;flex:1;">
            <button style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:0 14px;border-radius:10px;cursor:pointer;font-size:12px;white-space:nowrap;" onclick="gerarCodigoCupom()">🎲 Gerar</button>
          </div>
        </div>
        <div class="form-row-2col">
        <div class="form-group">
            <label class="form-label">Tipo de desconto</label>
            <div id="mk-cupom-tipo-group" style="display:flex;flex-direction:column;gap:6px;">
              <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--card2);border:1px solid rgba(0,180,171,0.4);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_wkzRadio('mk-cupom-tipo-group','mk-cupom-tipo','percent',this)">
                <div class="wkz-rdot" style="width:15px;height:15px;border-radius:50%;border:2px solid var(--teal);background:var(--teal);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg></div>
                Percentual (%)
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_wkzRadio('mk-cupom-tipo-group','mk-cupom-tipo','fixed',this)">
                <div class="wkz-rdot" style="width:15px;height:15px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
                Valor fixo (R$)
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_wkzRadio('mk-cupom-tipo-group','mk-cupom-tipo','frete',this)">
                <div class="wkz-rdot" style="width:15px;height:15px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;"></div>
                Frete grátis
              </label>
            </div>
            <input type="hidden" id="mk-cupom-tipo" value="percent">
          </div>
          <div class="form-group">
            <label class="form-label">Valor</label>
            <input class="form-input" id="mk-cupom-valor" type="number" min="1" placeholder="Ex: 15" style="flex:1;">
          </div>
        </div>
        <div class="form-row-2col">
          <div class="form-group">
            <label class="form-label">Validade</label>
            <input class="form-input" id="mk-cupom-validade" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Usos máximos</label>
            <input class="form-input" id="mk-cupom-usos" type="number" min="1" placeholder="Ex: 100 (0 = ilimitado)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Compra mínima (R$)</label>
          <input class="form-input" id="mk-cupom-minimo" type="number" min="0" step="0.01" placeholder="0 = sem mínimo">
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzMarketingModal').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="salvarMarketing('cupom')">🎁 Criar Cupom</button>
        </div>`
    },
    flash: {
      title: '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FF6B35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg> Promoção Relâmpago</span>',
      color: '#FF6B35',
      html: `
        <div class="form-group">
          <label class="form-label">Produto <span class="req">*</span></label>
          <div style="position:relative;">
            <div id="mk-flash-prod-btn" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;transition:border-color 0.2s;user-select:none;" onclick="_wkzDropToggle('mk-flash-prod-dd')" onmouseenter="this.style.borderColor='var(--teal)'" onmouseleave="this.style.borderColor=document.getElementById('mk-flash-prod-dd').style.display==='block'?'var(--teal)':'var(--border)'">
              <span id="mk-flash-prod-label">${products[0]?.e||'📦'} ${(products[0]?.n||'').slice(0,38)} — ${formatPrice(products[0]?.p||0)}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,9 12,15 18,9"/></svg>
            </div>
            <div id="mk-flash-prod-dd" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1px solid var(--teal);border-radius:10px;z-index:100;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4);">
              ${products.slice(0,8).map((p,i)=>`<div style="padding:9px 14px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseenter="this.style.background='rgba(0,180,171,0.08)'" onmouseleave="this.style.background=''" onclick="_wkzDropPick('mk-flash-prod','mk-flash-prod-dd','mk-flash-prod-label',${i},'${p.e} ${p.n.replace(/'/g,'\\u0027').slice(0,38)} — ${formatPrice(p.p)}')">${p.e} ${p.n.slice(0,38)} — ${formatPrice(p.p)}</div>`).join('')}
            </div>
          </div>
          <input type="hidden" id="mk-flash-prod" value="0">
        </div>
        <div class="form-row-2col">
          <div class="form-group">
            <label class="form-label">Preço promocional (R$) <span class="req">*</span></label>
            <input class="form-input" id="mk-flash-preco" type="number" min="1" step="0.01" placeholder="Preço durante o flash">
          </div>
          <div class="form-group">
            <label class="form-label">Estoque para o flash</label>
            <input class="form-input" id="mk-flash-estoque" type="number" min="1" placeholder="Ex: 30 unidades">
          </div>
        </div>
        <div class="form-row-2col">
          <div class="form-group">
            <label class="form-label">Início <span class="req">*</span></label>
            <input class="form-input" id="mk-flash-inicio" type="datetime-local" style="color-scheme:dark;cursor:pointer;">
          </div>
          <div class="form-group">
            <label class="form-label">Duração</label>
            <div id="mk-flash-duracao-group" style="display:flex;flex-direction:column;gap:5px;">
              ${[{v:'1',l:'1 hora'},{v:'2',l:'2 horas'},{v:'4',l:'4 horas',sel:true},{v:'6',l:'6 horas'},{v:'12',l:'12 horas'},{v:'24',l:'24 horas'}].map(opt=>`
              <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card2);border:1px solid ${opt.sel?'rgba(0,180,171,0.4)':'var(--border)'};border-radius:8px;cursor:pointer;font-size:13px;transition:border-color 0.2s;" onclick="_wkzRadio('mk-flash-duracao-group','mk-flash-duracao','${opt.v}',this)">
                <div class="wkz-rdot" style="width:15px;height:15px;border-radius:50%;border:2px solid ${opt.sel?'var(--teal)':'var(--border)'};background:${opt.sel?'var(--teal)':'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;">${opt.sel?'<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>':''}</div>
                ${opt.l}
              </label>`).join('')}
            </div>
            <input type="hidden" id="mk-flash-duracao" value="4">
          </div>
        </div>
        <div style="background:rgba(255,107,53,0.07);border:1px solid rgba(255,107,53,0.2);border-radius:8px;padding:10px;font-size:12px;color:var(--muted);margin-bottom:16px;">
          ⚡ Seu produto ganhará destaque na seção Flash Sale durante o período ativo. Promoções com ≥20% de desconto têm prioridade na vitrine.
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzMarketingModal').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" style="padding:11px 24px;font-size:13px;background:linear-gradient(135deg,#FF6B35,#FF2D7A);border:none;" onclick="salvarMarketing('flash')">⚡ Ativar Flash Sale</button>
        </div>`
    },
    ads: {
      title: '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg> Anúncios Patrocinados</span>',
      color: '#a78bfa',
      html: `
        <div style="background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;">
          <div style="font-weight:700;color:#c4b5fd;margin-bottom:4px;">✨ WeKz Ads — CPC (Custo por Clique)</div>
          <div style="color:var(--muted);font-size:12px;">Seu produto aparece no topo das buscas e nas páginas de categoria. Você paga apenas quando alguém clicar.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Produto a anunciar <span class="req">*</span></label>
          <div style="position:relative;">
            <div id="mk-ads-prod-btn" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;transition:border-color 0.2s;user-select:none;" onclick="_wkzDropToggle('mk-ads-prod-dd')" onmouseenter="this.style.borderColor='#a78bfa'" onmouseleave="this.style.borderColor=document.getElementById('mk-ads-prod-dd').style.display==='block'?'#a78bfa':'var(--border)'">
              <span id="mk-ads-prod-label">${products[0]?.e||'📦'} ${(products[0]?.n||'').slice(0,40)}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,9 12,15 18,9"/></svg>
            </div>
            <div id="mk-ads-prod-dd" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1px solid #a78bfa;border-radius:10px;z-index:100;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4);">
              ${products.slice(0,8).map((p,i)=>`<div style="padding:9px 14px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseenter="this.style.background='rgba(124,58,237,0.08)'" onmouseleave="this.style.background=''" onclick="_wkzDropPick('mk-ads-prod','mk-ads-prod-dd','mk-ads-prod-label',${i},'${p.e} ${p.n.replace(/'/g,'\\u0027').slice(0,40)}')">${p.e} ${p.n.slice(0,40)}</div>`).join('')}
            </div>
          </div>
          <input type="hidden" id="mk-ads-prod" value="0">
        </div>
        <div class="form-row-2col">
          <div class="form-group">
            <label class="form-label">Lance por clique (R$) <span class="req">*</span></label>
            <input class="form-input" id="mk-ads-cpc" type="number" min="0.10" step="0.01" placeholder="Min. R$ 0,10" value="0.50">
            <div style="font-size:11px;color:var(--muted);margin-top:4px;">Sugerido: R$ 0,45–R$ 0,80</div>
          </div>
          <div class="form-group">
            <label class="form-label">Orçamento diário (R$)</label>
            <input class="form-input" id="mk-ads-budget" type="number" min="5" step="1" placeholder="Ex: 50" value="20">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Posicionamento</label>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked> Resultados de busca (topo)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked> Páginas de categoria</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox"> Página de produto similar</label>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzMarketingModal').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" style="padding:11px 24px;font-size:13px;background:linear-gradient(135deg,#7C3AED,#a78bfa);border:none;" onclick="salvarMarketing('ads')">📢 Ativar Anúncio</button>
        </div>`
    },
    frete: {
      title: '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Frete Grátis — Co-patrocínio WeKz</span>',
      color: '#22C55E',
      html: `
        <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;">
          <div style="font-weight:700;color:#22C55E;margin-bottom:4px;">✅ Como funciona</div>
          <div style="color:var(--muted);font-size:12px;line-height:1.7;">A WeKz co-patrocina até <strong style="color:var(--text);">50% do custo do frete</strong> em produtos participantes. Você arca com a outra metade — e seu produto ganha o selo "Frete Grátis" nas buscas.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Aplicar a <span class="req">*</span></label>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;"><input type="radio" name="frete-scope" value="all" checked style="accent-color:var(--teal);"> Todos os meus produtos</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;"><input type="radio" name="frete-scope" value="select" style="accent-color:var(--teal);"> Produtos específicos</label>
          </div>
        </div>
        <div id="mk-frete-prods-wrap" style="display:none;" class="form-group">
          <label class="form-label">Selecione os produtos</label>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:140px;overflow-y:auto;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px;">
            ${products.slice(0,8).map((p,i)=>`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;"><input type="checkbox"> ${p.e} ${p.n.slice(0,35)}</label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Compra mínima para frete grátis (R$)</label>
          <input class="form-input" id="mk-frete-minimo" type="number" min="0" step="0.01" placeholder="0 = sem valor mínimo">
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button class="btn-add-cart" style="padding:11px 22px;font-size:13px;" onclick="document.getElementById('wkzMarketingModal').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" style="padding:11px 24px;font-size:13px;background:linear-gradient(135deg,#22C55E,#059669);border:none;" onclick="salvarMarketing('frete')">🚚 Ativar Frete Grátis</button>
        </div>`
    }
  };
  const cfg = configs[tipo];
  if(!cfg) return;
  _wkzModal('wkzMarketingModal', `
    <div class="modal-title" style="font-size:18px;margin-bottom:16px;">${cfg.title}</div>
    ${cfg.html}
  `, {maxWidth:'520px'});
  // Wire frete scope radio
  if(tipo==='frete'){
    document.querySelectorAll('input[name="frete-scope"]').forEach(r=>{
      r.onchange = function(){ document.getElementById('mk-frete-prods-wrap').style.display = this.value==='select'?'block':'none'; };
    });
  }
}

function gerarCodigoCupom(){
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for(let i=0;i<8;i++) code += chars[Math.floor(Math.random()*chars.length)];
  const inp = document.getElementById('mk-cupom-code');
  if(inp) inp.value = code;
}

function salvarMarketing(tipo){
  const msgs = {
    cupom: ()=>{
      const code     = document.getElementById('mk-cupom-code')?.value.trim().toUpperCase();
      if(!code){ showToast('⚠️ Informe o código do cupom.'); return false; }
      const val      = parseFloat(document.getElementById('mk-cupom-valor')?.value)||0;
      const tipoDesc = document.getElementById('mk-cupom-tipo')?.value || 'percent';
      const validade = document.getElementById('mk-cupom-validade')?.value || null;
      const usos     = parseInt(document.getElementById('mk-cupom-usos')?.value)||0;
      const minimo   = parseFloat(document.getElementById('mk-cupom-minimo')?.value)||0;
      const sufixo   = tipoDesc==='percent' ? `${val}% OFF` : tipoDesc==='fixed' ? `R$${val} OFF` : 'Frete Grátis';
      const label    = `${sufixo} — código ${code}` + (minimo>0?` (mín. R$${minimo.toFixed(2).replace('.',',')})`:'');
      // Registra no dicionário global
      SELLER_COUPONS[code] = { disc:val, type:tipoDesc, label, validade, usos, minimo, _used:0,
        seller:(typeof currentSeller!=='undefined'&&currentSeller?.store)||'Loja' };
      // Adiciona chip visual no WekzBoost se não existir
      const chips = document.getElementById('wkzSellerCouponChips');
      if(chips && !chips.querySelector('[data-code="'+code+'"]')){
        const chip = document.createElement('span');
        chip.className='wkz-coupon-chip wkz-chip-seller';
        chip.dataset.code=code;
        chip.textContent=code;
        chip.onclick=()=>fillCoupon(code);
        chips.appendChild(chip);
      }
      return `🎁 Cupom <strong>${code}</strong> (${sufixo}) criado, ativado e visível aos clientes!`;
    },
    flash: ()=>{
      const prodIdx  = parseInt(document.getElementById('mk-flash-prod')?.value ?? '0');
      const precoVal = parseFloat(document.getElementById('mk-flash-preco')?.value);
      const estoqueVal= parseInt(document.getElementById('mk-flash-estoque')?.value) || 30;
      const inicio   = document.getElementById('mk-flash-inicio')?.value;
      const duracao  = parseInt(document.getElementById('mk-flash-duracao')?.value) || 4;
      if(!precoVal || !inicio){ showToast('⚠️ Preencha o preço e o horário de início.'); return false; }

      // Referência ao produto selecionado
      const prod = products[prodIdx] || {};
      const precoOrig = prod.op || prod.p || precoVal * 1.5;
      const offPct = Math.floor(wkzExactOff(precoVal, precoOrig)); // [v2.9.31] floor exato s/ Math.round
      const fmtPreco = v => 'R$ ' + (typeof v === 'number' ? v.toFixed(2).replace('.',',') : v);

      // Monta o item no formato flashItems
      const newFlashItem = {
        e: prod.e || '📦',
        n: prod.n || 'Produto em Promoção',
        p: fmtPreco(precoVal),
        o: fmtPreco(precoOrig),
        off: offPct > 0 ? offPct : 10,
        s: prod.s || 'Minha Loja',
        rating: prod.r || 4.5,
        reviews: 0,
        stock: estoqueVal,
        desc: prod.desc || prod.n || '',
        specs: prod.specs || [],
        _flash: true,
        _inicio: inicio,
        _duracao: duracao,
        _prodIdx: prodIdx,
      };

      // Insere no início do array para aparecer primeiro
      flashItems.unshift(newFlashItem);

      // Re-renderiza todas as superfícies Flash Sale
      if(typeof renderFlash === 'function') renderFlash();
      if(typeof renderFlashHero === 'function') renderFlashHero();
      // Só re-renderiza a página se ela estiver ativa
      const flashPageEl = document.getElementById('page-pg-flash');
      if(flashPageEl && flashPageEl.classList.contains('active') && typeof renderFlashPage === 'function'){
        renderFlashPage();
      }

      return `⚡ Flash Sale ativada! <strong>${prod.n || 'Produto'}</strong> já aparece na vitrine com ${offPct > 0 ? offPct+'% OFF' : 'desconto especial'}!`;
    },
    ads: ()=>{
      const cpc    = document.getElementById('mk-ads-cpc')?.value;
      const budget = document.getElementById('mk-ads-budget')?.value;
      const prodEl = document.getElementById('mk-ads-prod');
      if(!cpc){ showToast('⚠️ Defina o lance por clique.'); return false; }
      // Identifica produto a patrocinar (usa 1º se não houver seletor)
      const prodIdx = prodEl ? parseInt(prodEl.value||'0') : 0;
      if(products[prodIdx] && !SPONSORED_PRODUCTS.includes(prodIdx)){
        SPONSORED_PRODUCTS.push(prodIdx);
        products[prodIdx]._sponsored = true;
        // Move patrocinado para o topo
        const sp = products.splice(prodIdx,1)[0];
        products.unshift(sp);
        if(typeof renderProducts==='function') renderProducts();
      }
      const pName = products[0]?.n || 'Produto';
      return `📢 Anúncio ativado! <strong>${pName}</strong> aparece no topo com badge 📢 Patrocinado. Lance: R$${parseFloat(cpc).toFixed(2)}/clique · Orçamento: R$${budget||20}/dia.`;
    },
    frete: ()=>{
      // Identifica loja do vendedor logado ou fallback
      const sellerStore = (typeof currentSeller!=='undefined' && currentSeller?.store)
        || (products.length ? products[0].s : 'Minha Loja');
      if(!FRETE_GRATIS_SELLERS.includes(sellerStore))
        FRETE_GRATIS_SELLERS.push(sellerStore);
      // Marca _frete em todos os produtos da loja
      products.forEach(p=>{ if(p.s===sellerStore) p._frete=true; });
      // Registra cupom FRETE0 da loja automaticamente
      const freteCode = 'FRETE0';
      if(!SELLER_COUPONS[freteCode]){
        SELLER_COUPONS[freteCode]={disc:0,type:'frete',label:'Frete Grátis aplicado!',validade:null,usos:0,_used:0,seller:sellerStore};
      }
      if(typeof renderProducts==='function') renderProducts();
      return '🚚 Frete Grátis ativado! Produtos da loja <strong>'+sellerStore+'</strong> ganham o selo 🚚 Grátis nas buscas e no carrinho. Cupom <strong>FRETE0</strong> activado.';
    }
  };
  const result = msgs[tipo]?.();
  if(result === false) return;
  document.getElementById('wkzMarketingModal').classList.remove('open');
  showToast(result||'✅ Configuração salva!');
}

/* ─────────────────────────────────────────────────────────────
   RELATÓRIOS — WeKz Seller v2.5.0
   Quatro modais completos: Vendas · Estoque · Financeiro · Avaliações
   ───────────────────────────────────────────────────────────── */

/* ── 1. RELATÓRIO DE VENDAS ── */
function openReportVendas(){
  const periodos = ['Hoje','Esta semana','Este mês','Últimos 3 meses','Último ano','Personalizado'];
  const topProd = [
    {n:'Notebook Gamer RTX 4060', v:38, rec:'R$ 15.200', trend:'▲ +22%', c:'#22C55E'},
    {n:'Headset Cyberpunk Pro 7.1', v:61, rec:'R$ 9.150', trend:'▲ +8%',  c:'#22C55E'},
    {n:'Smartphone Ultra 5G 256GB', v:24, rec:'R$ 12.000', trend:'▼ -3%', c:'#EF4444'},
    {n:'Mouse Wireless Ergonômico', v:95, rec:'R$ 5.225', trend:'▲ +41%', c:'#22C55E'},
    {n:'Monitor 4K 144Hz 27"',     v:12, rec:'R$ 6.960', trend:'→ 0%',  c:'#94A3B8'},
  ];
  _wkzModal('wkzReportVendasModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:18px;margin-bottom:0;">Relatório de Vendas</div>
        <div style="font-size:11px;color:var(--muted);">Análise completa · Visão contábil e comercial</div>
      </div>
      <span style="margin-left:auto;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);color:var(--teal);font-size:9px;font-weight:800;font-family:'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:1px;padding:2px 9px;border-radius:50px;">AO VIVO</span>
    </div>

    <!-- Filtros de período -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 14px;">
      ${periodos.map((p,i)=>`<button id="rv-periodo-${i}" onclick="rvSetPeriodo(${i})" style="padding:5px 12px;border-radius:50px;border:1px solid ${i===2?'var(--teal)':'var(--border)'};background:${i===2?'rgba(0,180,171,0.12)':'transparent'};color:${i===2?'var(--teal)':'var(--muted)'};font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;">${p}</button>`).join('')}
    </div>
    <div id="rv-custom-range" style="display:none;margin-bottom:12px;">
      <div style="display:flex;gap:8px;">
        <div style="flex:1;"><label style="font-size:11px;color:var(--muted);margin-bottom:4px;display:block;">De</label><input type="date" class="form-input" style="padding:8px 12px;font-size:12px;" id="rv-date-from"></div>
        <div style="flex:1;"><label style="font-size:11px;color:var(--muted);margin-bottom:4px;display:block;">Até</label><input type="date" class="form-input" style="padding:8px 12px;font-size:12px;" id="rv-date-to"></div>
      </div>
    </div>

    <!-- KPIs principais -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">
      <div style="background:rgba(0,180,171,0.06);border:1px solid rgba(0,180,171,0.2);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Receita Bruta</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;background:var(--grad1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">R$ 48.320,00</div>
        <div style="font-size:11px;color:#22C55E;margin-top:2px;">▲ +18.4% vs mês anterior</div>
      </div>
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Receita Líquida</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#22C55E;">R$ 44.454,40</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Após comissão WeKz (8% sobre bruta)</div>
      </div>
      <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Pedidos</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#60A5FA;">155 pedidos</div>
        <div style="font-size:11px;color:#22C55E;margin-top:2px;">▲ 23 a mais que mês ant.</div>
      </div>
      <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Ticket Médio</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#A78BFA;">R$ 311,74</div>
        <div style="font-size:11px;color:#EF4444;margin-top:2px;">▼ -R$ 28 vs mês anterior</div>
      </div>
    </div>

    <!-- Top produtos -->
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
        Top Produtos — Este mês
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${topProd.map((p,i)=>`
        <div style="display:flex;align-items:center;gap:10px;font-size:12px;">
          <div style="width:20px;height:20px;background:${i===0?'var(--teal)':i===1?'#60A5FA':'rgba(255,255,255,0.06)'};color:${i<2?'#000':'var(--muted)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:800;flex-shrink:0;">${i+1}</div>
          <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);">${p.n}</div>
          <div style="color:var(--muted);flex-shrink:0;">${p.v} un.</div>
          <div style="color:var(--text);font-weight:600;flex-shrink:0;">${p.rec}</div>
          <div style="color:${p.c};font-size:11px;flex-shrink:0;min-width:52px;text-align:right;">${p.trend}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Análise de mercado contábil -->
    <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;color:#F59E0B;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Análise Contábil — DRE Simplificado
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(+) Receita Bruta de Vendas</span>
          <span style="color:var(--text);font-weight:600;">R$ 48.320,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(-) Comissão Marketplace (8% sobre Receita Bruta)</span>
          <span style="color:#EF4444;">- R$ 3.865,60</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(-) Devoluções e Cancelamentos</span>
          <span style="color:#EF4444;">- R$ 960,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(-) Estornos / Disputas resolvidas</span>
          <span style="color:#EF4444;">- R$ 320,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;background:rgba(34,197,94,0.06);border-radius:6px;padding:8px 10px;margin-top:4px;">
          <span style="color:#22C55E;font-weight:700;font-family:'DM Sans',sans-serif;">(=) Receita Líquida Ajustada</span>
          <span style="color:#22C55E;font-weight:800;font-family:'DM Sans',sans-serif;">R$ 43.174,40</span>
        </div>
      </div>
    </div>

    <!-- Formato de exportação -->
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:600;">Exportar como:</div>
      <div style="display:flex;gap:8px;">
        <button onclick="this.style.borderColor='var(--teal)';this.style.background='rgba(0,180,171,0.12)';document.getElementById('rv-fmt').value='pdf'" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);font-size:12px;cursor:pointer;transition:all 0.2s;">📄 PDF</button>
        <button onclick="this.style.borderColor='var(--teal)';this.style.background='rgba(0,180,171,0.12)';document.getElementById('rv-fmt').value='excel'" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);font-size:12px;cursor:pointer;transition:all 0.2s;">📊 Excel</button>
        <button onclick="this.style.borderColor='var(--teal)';this.style.background='rgba(0,180,171,0.12)';document.getElementById('rv-fmt').value='csv'" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);font-size:12px;cursor:pointer;transition:all 0.2s;">📋 CSV</button>
      </div>
      <input type="hidden" id="rv-fmt" value="pdf">
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 20px;font-size:13px;" onclick="document.getElementById('wkzReportVendasModal').classList.remove('open')">Fechar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="exportarRelatorio('vendas','rv-fmt')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:middle;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Relatório
      </button>
    </div>
  `, {maxWidth:'640px'});
}

function rvSetPeriodo(idx){
  for(let i=0;i<6;i++){
    const b = document.getElementById('rv-periodo-'+i);
    if(!b) continue;
    const sel = i===idx;
    b.style.borderColor = sel ? 'var(--teal)' : 'var(--border)';
    b.style.background  = sel ? 'rgba(0,180,171,0.12)' : 'transparent';
    b.style.color       = sel ? 'var(--teal)' : 'var(--muted)';
  }
  const cust = document.getElementById('rv-custom-range');
  if(cust) cust.style.display = idx===5 ? '' : 'none';
}

/* ── 2. RELATÓRIO DE ESTOQUE ── */
function openReportEstoque(){
  const items = [
    {n:'Notebook Gamer RTX 4060', sku:'NBG-RTX4060', est:8,  min:10, custo:'R$2.400', val:'R$19.200', status:'danger',  sl:'⚠ Crítico'},
    {n:'Headset Cyberpunk Pro',    sku:'HDP-CYBER7', est:43, min:20, custo:'R$  150', val:'R$ 6.450', status:'ok',     sl:'✓ Normal'},
    {n:'Smartphone Ultra 5G',      sku:'SMT-5G256',  est:5,  min:15, custo:'R$1.200', val:'R$ 6.000', status:'danger',  sl:'⚠ Crítico'},
    {n:'Mouse Wireless Ergon.',    sku:'MSW-ERGO1',  est:120,min:30, custo:'R$   55', val:'R$ 6.600', status:'ok',     sl:'✓ Normal'},
    {n:'Monitor 4K 144Hz 27"',     sku:'MNT-4K27H',  est:4,  min:5,  custo:'R$  580', val:'R$ 2.320', status:'warn',   sl:'→ Atenção'},
    {n:'Teclado Mec. RGB TKL',     sku:'TCL-RGBTKL', est:67, min:25, custo:'R$  220', val:'R$14.740', status:'ok',     sl:'✓ Normal'},
    {n:'Webcam 4K AI Tracking',    sku:'WBC-4KAI',   est:0,  min:5,  custo:'R$  380', val:'R$     0', status:'out',    sl:'✕ Sem estoque'},
  ];
  const totalVal = 'R$ 55.310,00';
  const stColors = {ok:'#22C55E', warn:'#F59E0B', danger:'#EF4444', out:'#6B7280'};
  _wkzModal('wkzReportEstoqueModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:18px;margin-bottom:0;">Relatório de Estoque</div>
        <div style="font-size:11px;color:var(--muted);">Inventário completo · Valoração e alertas</div>
      </div>
    </div>

    <!-- KPIs estoque -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
      <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Total em Estoque</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#60A5FA;">1.247 un.</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">7 SKUs ativos</div>
      </div>
      <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Valor do Inventário</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#A78BFA;">${totalVal}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Custo de aquisição</div>
      </div>
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Críticos / Sem estoque</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#EF4444;">3 SKUs</div>
        <div style="font-size:11px;color:#EF4444;margin-top:2px;">⚠ Reposição urgente</div>
      </div>
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Giro médio (mês)</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#22C55E;">18.3 un.</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Por SKU / mês</div>
      </div>
    </div>

    <!-- Tabela de itens -->
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:0;padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">
        <div>Produto</div><div style="text-align:center;">Estoque</div><div style="text-align:center;">Mín.</div><div style="text-align:right;">Valor</div><div style="text-align:right;">Status</div>
      </div>
      ${items.map(it=>`
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:0;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:12px;align-items:center;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
        <div>
          <div style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${it.n}</div>
          <div style="font-size:10px;color:var(--muted);">${it.sku}</div>
        </div>
        <div style="text-align:center;font-weight:700;color:${it.est<=it.min?'#EF4444':'var(--text)'};">${it.est}</div>
        <div style="text-align:center;color:var(--muted);">${it.min}</div>
        <div style="text-align:right;color:var(--muted);font-size:11px;">${it.val}</div>
        <div style="text-align:right;color:${stColors[it.status]};font-size:10px;font-weight:700;">${it.sl}</div>
      </div>`).join('')}
    </div>

    <!-- Análise de curva ABC -->
    <div style="background:rgba(0,180,171,0.04);border:1px solid rgba(0,180,171,0.15);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;color:var(--teal);margin-bottom:10px;">📊 Curva ABC — Classificação por Receita</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:24px;height:24px;background:#22C55E;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#000;flex-shrink:0;">A</div>
          <div style="flex:1;">
            <div style="color:var(--text);font-weight:600;">2 produtos · 78% da receita</div>
            <div style="background:rgba(34,197,94,0.15);border-radius:4px;height:6px;margin-top:4px;"><div style="width:78%;height:100%;background:#22C55E;border-radius:4px;"></div></div>
          </div>
          <div style="color:#22C55E;font-weight:700;flex-shrink:0;">R$ 37.690</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:24px;height:24px;background:#F59E0B;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#000;flex-shrink:0;">B</div>
          <div style="flex:1;">
            <div style="color:var(--text);font-weight:600;">3 produtos · 16% da receita</div>
            <div style="background:rgba(245,158,11,0.15);border-radius:4px;height:6px;margin-top:4px;"><div style="width:16%;height:100%;background:#F59E0B;border-radius:4px;"></div></div>
          </div>
          <div style="color:#F59E0B;font-weight:700;flex-shrink:0;">R$ 7.730</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:24px;height:24px;background:#6B7280;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#fff;flex-shrink:0;">C</div>
          <div style="flex:1;">
            <div style="color:var(--text);font-weight:600;">2 produtos · 6% da receita</div>
            <div style="background:rgba(107,114,128,0.15);border-radius:4px;height:6px;margin-top:4px;"><div style="width:6%;height:100%;background:#6B7280;border-radius:4px;"></div></div>
          </div>
          <div style="color:#6B7280;font-weight:700;flex-shrink:0;">R$ 2.900</div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 20px;font-size:13px;" onclick="document.getElementById('wkzReportEstoqueModal').classList.remove('open')">Fechar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;" onclick="exportarRelatorio('estoque')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:middle;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Inventário
      </button>
    </div>
  `, {maxWidth:'660px'});
}

/* ── 3. RELATÓRIO FINANCEIRO ── */
function openReportFinanceiro(){
  const lancamentos = [
    {data:'31/05', tipo:'Crédito', desc:'Repasse WeKz — Mai/1ª quinzena', val:'+R$ 18.240,00', c:'#22C55E'},
    {data:'28/05', tipo:'Crédito', desc:'Repasse WeKz — Abr/2ª quinzena', val:'+R$ 21.340,00', c:'#22C55E'},
    {data:'25/05', tipo:'Débito',  desc:'Comissão marketplace (8% — Essencial) — Mai', val:'- R$  3.788,80', c:'#EF4444'},
    {data:'22/05', tipo:'Débito',  desc:'Estorno — Pedido #47821 (cliente)',  val:'- R$    320,00', c:'#EF4444'},
    {data:'18/05', tipo:'Crédito', desc:'Repasse WeKz — Abr/1ª quinzena', val:'+R$ 19.870,00', c:'#22C55E'},
    {data:'10/05', tipo:'Débito',  desc:'Anúncio Patrocinado — Maio',         val:'- R$    180,00', c:'#EF4444'},
    {data:'01/05', tipo:'Débito',  desc:'Taxa de Assinatura — Plano Pro',     val:'- R$    149,00', c:'#EF4444'},
  ];
  _wkzModal('wkzReportFinanceiroModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#A78BFA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:18px;margin-bottom:0;">Relatório Financeiro</div>
        <div style="font-size:11px;color:var(--muted);">Extrato contábil · Fluxo de caixa e repasses</div>
      </div>
    </div>

    <!-- Resumo financeiro -->
    <div style="background:linear-gradient(135deg,rgba(124,58,237,0.1),rgba(0,180,171,0.08));border:1px solid rgba(124,58,237,0.25);border-radius:12px;padding:16px;margin-bottom:14px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center;">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Saldo Atual</div>
          <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#A78BFA;">R$ 12.480</div>
        </div>
        <div style="border-left:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">A Receber</div>
          <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#22C55E;">R$ 9.840</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Em Análise</div>
          <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;color:#F59E0B;">R$ 1.320</div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;font-size:12px;">
        <span style="color:var(--muted);">Próximo repasse estimado:</span>
        <span style="color:#22C55E;font-weight:700;">✓ 02/06/2026 · R$ 9.840,00</span>
      </div>
    </div>

    <!-- DRE completo -->
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--border);">
        📑 Demonstrativo de Resultado (DRE) — Maio 2026
      </div>
      <div style="display:flex;flex-direction:column;gap:0;font-size:12px;">
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">Receita Bruta de Vendas</span><span style="color:var(--text);font-weight:600;">R$ 48.320,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0 7px 16px;border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(–) Devoluções / Cancelamentos</span><span style="color:#EF4444;">- R$ 960,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-weight:700;">
          <span style="color:var(--text);">Receita Líquida de Vendas</span><span style="color:var(--text);">R$ 47.360,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0 7px 16px;border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(–) Comissão Marketplace (8% — Plano Essencial)</span><span style="color:#EF4444;">- R$ 3.788,80</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0 7px 16px;border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(–) Taxa de Assinatura Plano Essencial</span><span style="color:#EF4444;">- R$ 149,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0 7px 16px;border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span style="color:var(--muted);">(–) Anúncios Patrocinados</span><span style="color:#EF4444;">- R$ 180,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 0 7px 16px;border-bottom:1px solid rgba(255,255,255,0.07);">
          <span style="color:var(--muted);">(–) Estornos e Disputas</span><span style="color:#EF4444;">- R$ 320,00</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 8px;background:rgba(34,197,94,0.07);border-radius:7px;margin-top:6px;">
          <span style="color:#22C55E;font-weight:800;font-family:'DM Sans',sans-serif;">Resultado Líquido do Período</span>
          <span style="color:#22C55E;font-weight:800;font-family:'DM Sans',sans-serif;">R$ 42.922,20</span>
        </div>
      </div>
    </div>

    <!-- Extrato de lançamentos -->
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;">
      <div style="padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
        <span>Lançamentos Recentes</span>
        <span style="font-size:10px;color:var(--muted);font-family:'DM Sans',sans-serif;font-weight:400;">Maio 2026</span>
      </div>
      <div style="padding:8px 14px;background:rgba(245,158,11,0.05);border-bottom:1px solid rgba(245,158,11,0.15);font-size:11px;color:#F59E0B;display:flex;align-items:center;gap:6px;">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Exibindo apenas os lançamentos recentes do período. O saldo atual reflete o histórico completo da conta.
      </div>
      ${lancamentos.map(l=>`
      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:12px;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
        <div style="width:34px;color:var(--muted);font-size:11px;flex-shrink:0;">${l.data}</div>
        <div style="padding:2px 7px;border-radius:50px;font-size:9px;font-weight:700;flex-shrink:0;background:${l.tipo==='Crédito'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)'};color:${l.tipo==='Crédito'?'#22C55E':'#EF4444'};">${l.tipo}</div>
        <div style="flex:1;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.desc}</div>
        <div style="color:${l.c};font-weight:700;flex-shrink:0;font-family:'DM Sans',sans-serif;">${l.val}</div>
      </div>`).join('')}
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 20px;font-size:13px;" onclick="document.getElementById('wkzReportFinanceiroModal').classList.remove('open')">Fechar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;background:linear-gradient(135deg,#7C3AED,#a78bfa);border:none;" onclick="exportarRelatorio('financeiro')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:middle;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Extrato
      </button>
    </div>
  `, {maxWidth:'660px'});
}

/* ── 4. RELATÓRIO DE AVALIAÇÕES ── */
function openReportAvaliacoes(){
  const reviews = [
    {u:'Ana C.', nota:5, txt:'Entrega rápida e produto conforme anunciado. Excelente vendedor!', prod:'Notebook RTX 4060', ago:'2 dias', resp:true},
    {u:'Rafael M.', nota:4, txt:'Bom produto, mas embalagem veio levemente amassada. Sem danos ao produto.', prod:'Headset Cyberpunk', ago:'5 dias', resp:false},
    {u:'Carla S.', nota:5, txt:'Melhor compra do ano! Produto original, nota fiscal incluída.', prod:'Smartphone Ultra 5G', ago:'8 dias', resp:true},
    {u:'Lucas P.', nota:3, txt:'Demorou um dia a mais que o prazo prometido. Produto ok.', prod:'Mouse Ergonômico', ago:'12 dias', resp:false},
    {u:'Fernanda O.', nota:5, txt:'Impecável! Segunda compra nessa loja, sempre confiável.', prod:'Monitor 4K 144Hz', ago:'15 dias', resp:true},
  ];
  const dist = [{pct:72,c:'#22C55E'},{pct:18,c:'#86EFAC'},{pct:6,c:'#F59E0B'},{pct:3,c:'#FB923C'},{pct:1,c:'#EF4444'}];
  const stars = n => '★'.repeat(n)+'☆'.repeat(5-n);
  _wkzModal('wkzReportAvaliacoesModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:18px;margin-bottom:0;">Relatório de Avaliações</div>
        <div style="font-size:11px;color:var(--muted);">Satisfação do cliente · NPS e análise de sentimento</div>
      </div>
    </div>

    <!-- Score geral -->
    <div style="display:flex;gap:14px;margin-bottom:14px;align-items:flex-start;">
      <div style="background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(251,146,60,0.08));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:18px 20px;text-align:center;flex-shrink:0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:40px;font-weight:800;color:#F59E0B;line-height:1;">4.87</div>
        <div style="color:#F59E0B;font-size:14px;letter-spacing:2px;margin:4px 0;">★★★★★</div>
        <div style="font-size:10px;color:var(--muted);">2.847 avaliações</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
        ${dist.map((d,i)=>`
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;">
          <span style="color:${d.c};flex-shrink:0;width:12px;">${5-i}★</span>
          <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden;">
            <div style="width:${d.pct}%;height:100%;background:${d.c};border-radius:4px;"></div>
          </div>
          <span style="color:var(--muted);flex-shrink:0;width:28px;text-align:right;">${d.pct}%</span>
        </div>`).join('')}
      </div>
    </div>

    <!-- KPIs de avaliação -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Taxa Resposta</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#22C55E;">68%</div>
        <div style="font-size:10px;color:#22C55E;margin-top:2px;">▲ +12% meta</div>
      </div>
      <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">NPS Score</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#60A5FA;">+74</div>
        <div style="font-size:10px;color:#22C55E;margin-top:2px;">Excelente</div>
      </div>
      <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Satisfação</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;color:#F59E0B;">98%</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">4★ ou 5★</div>
      </div>
    </div>

    <!-- Análise de sentimento -->
    <div style="background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.18);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;color:#A78BFA;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        🧠 Análise de Sentimento por IA
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:12px;">
        <div>
          <div style="color:#22C55E;font-weight:600;margin-bottom:4px;">👍 Pontos fortes (mais citados)</div>
          <div style="display:flex;flex-direction:column;gap:3px;color:var(--muted);">
            <span>• "Entrega rápida" — 312 menções</span>
            <span>• "Produto original" — 287 menções</span>
            <span>• "Bem embalado" — 203 menções</span>
            <span>• "Ótimo custo-benefício" — 189 menções</span>
          </div>
        </div>
        <div>
          <div style="color:#F59E0B;font-weight:600;margin-bottom:4px;">⚠ Pontos de melhoria</div>
          <div style="display:flex;flex-direction:column;gap:3px;color:var(--muted);">
            <span>• "Prazo de entrega" — 38 menções</span>
            <span>• "Embalagem" — 27 menções</span>
            <span>• "Comunicação" — 19 menções</span>
            <span>• "Manual em PT" — 11 menções</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Avaliações recentes -->
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;">
      <div style="padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;">Avaliações Recentes</div>
      ${reviews.map(r=>`
      <div style="padding:11px 14px;border-bottom:1px solid rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:26px;height:26px;background:var(--grad1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${r.u[0]}</div>
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:12px;font-weight:600;color:var(--text);">${r.u}</span>
              <span style="color:#F59E0B;font-size:11px;letter-spacing:1px;">${stars(r.nota)}</span>
              <span style="font-size:10px;color:var(--muted);">${r.prod}</span>
              <span style="font-size:10px;color:var(--muted);margin-left:auto;">Há ${r.ago}</span>
            </div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--muted);padding-left:34px;line-height:1.5;">${r.txt}</div>
        ${!r.resp?`<div style="padding-left:34px;margin-top:6px;"><button onclick="showToast('💬 Abrindo editor de resposta...')" style="font-size:10px;padding:3px 10px;border-radius:50px;border:1px solid rgba(0,180,171,0.35);background:rgba(0,180,171,0.07);color:var(--teal);cursor:pointer;">Responder</button></div>`:`<div style="padding-left:34px;margin-top:4px;font-size:10px;color:#22C55E;">✅ Respondida</div>`}
      </div>`).join('')}
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:11px 20px;font-size:13px;" onclick="document.getElementById('wkzReportAvaliacoesModal').classList.remove('open')">Fechar</button>
      <button class="btn-primary" style="padding:11px 24px;font-size:13px;background:linear-gradient(135deg,#F59E0B,#FB923C);border:none;" onclick="exportarRelatorio('avaliacoes')">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:middle;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Avaliações
      </button>
    </div>
  `, {maxWidth:'660px'});
}

/* ── EXPORTAÇÃO SIMULADA COM DOWNLOAD ── */
function exportarRelatorio(tipo, fmtInputId){
  const fmt = (fmtInputId && document.getElementById(fmtInputId)?.value) || 'pdf';
  const nomes = {vendas:'Relatorio_Vendas', estoque:'Relatorio_Estoque', financeiro:'Relatorio_Financeiro_DRE', avaliacoes:'Relatorio_Avaliacoes'};
  const exts = {pdf:'pdf', excel:'xlsx', csv:'csv'};
  const icons = {pdf:'📄', excel:'📊', csv:'📋'};
  const ext = exts[fmt] || 'pdf';
  const icon = icons[fmt] || '📄';
  const nome = (nomes[tipo] || 'Relatorio') + '_Mai2026.' + ext;
  const btn = event.target.closest('button');
  if(btn){
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;margin-right:4px;vertical-align:middle;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Gerando...';
    setTimeout(()=>{
      btn.disabled = false;
      btn.innerHTML = orig;
      // Gera CSV/texto simulado para download real
      const conteudo = gerarConteudoRelatorio(tipo, fmt);
      const mimeTypes = {pdf:'text/plain', excel:'text/plain', csv:'text/csv'};
      const blob = new Blob([conteudo], {type: mimeTypes[fmt]||'text/plain'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(icon + ' ' + nome + ' baixado com sucesso!');
    }, 1400);
  }
}

function gerarConteudoRelatorio(tipo, fmt){
  const data = 'WeKz Shop — Relatório ' + tipo.charAt(0).toUpperCase() + tipo.slice(1) + '\nMaio 2026\nGerado em: ' + new Date().toLocaleString('pt-BR') + '\n\n';
  const mapas = {
    vendas: 'RECEITA BRUTA,R$ 48.320,00\nRECEITA LIQUIDA (apos comissao 8% s/ bruta),R$ 44.454,40\nPEDIDOS,155\nTICKET MEDIO,R$ 311,74\n\nTOP PRODUTOS\nProduto,Unidades,Receita,Variacao\nNotebook Gamer RTX 4060,38,R$ 15200,+22%\nHeadset Cyberpunk Pro,61,R$ 9150,+8%\nSmartphone Ultra 5G,24,R$ 12000,-3%\nMouse Wireless,95,R$ 5225,+41%\nMonitor 4K 144Hz,12,R$ 6960,0%',
    estoque: 'TOTAL EM ESTOQUE,1247 unidades\nVALOR INVENTARIO,R$ 55.310,00\nSKUs CRITICOS,3\nGIRO MEDIO,18.3 un./mes\n\nPRODUTO,SKU,ESTOQUE,MINIMO,VALOR,STATUS\nNotebook Gamer,NBG-RTX4060,8,10,R$19200,CRITICO\nHeadset Cyberpunk,HDP-CYBER7,43,20,R$6450,NORMAL\nSmartphone Ultra,SMT-5G256,5,15,R$6000,CRITICO\nMouse Wireless,MSW-ERGO1,120,30,R$6600,NORMAL\nMonitor 4K,MNT-4K27H,4,5,R$2320,ATENCAO\nTeclado RGB,TCL-RGBTKL,67,25,R$14740,NORMAL\nWebcam 4K AI,WBC-4KAI,0,5,R$0,SEM ESTOQUE',
    financeiro: 'DRE - MAIO 2026\nReceita Bruta de Vendas,R$ 48.320,00\n(-) Devolucoes,R$ 960,00\nReceita Liquida de Vendas,R$ 47.360,00\n(-) Comissao Marketplace (8% s/ Rec. Liquida de Vendas),R$ 3.788,80\n(-) Assinatura Plano Essencial,R$ 149,00\n(-) Anuncios Patrocinados,R$ 180,00\n(-) Estornos e Disputas,R$ 320,00\nRESULTADO LIQUIDO,R$ 42.922,20\n\nSALDO ATUAL,R$ 12.480,00\nA RECEBER,R$ 9.840,00\nPROXIMO REPASSE,02/06/2026',
    avaliacoes: 'NOTA MEDIA,4.87\nTOTAL AVALIACOES,2847\nTAXA RESPOSTA,68%\nNPS SCORE,+74\nSATISFACAO (4-5 estrelas),98%\n\n5 estrelas,72%\n4 estrelas,18%\n3 estrelas,6%\n2 estrelas,3%\n1 estrela,1%\n\nPONTOS FORTES\nEntrega rapida,312 mencoes\nProduto original,287 mencoes\nBem embalado,203 mencoes\nOtimo custo-beneficio,189 mencoes'
  };
  return data + (mapas[tipo] || '');
}

/* ── MODAL DE DETALHES DO PEDIDO ── */

/* ── 3.5: Detalhe de Pedido + Etiqueta/Despacho + Configurações ──────────
   openOrderDetailModal, geração de código de barras/QR de etiqueta,
   openDispatchModal, wkzSellerConfirmDispatch/OrderReceipt,
   salvarConfiguracoes/Notificacoes/ProvaSocial, filterMyDisputes,
   filterProducts (carve-out isolado do meio do bloco de disputa
   trilateral — ver nota no cabeçalho deste arquivo).
   Origem monólito: linhas 32490–33060 + 33172–33179
   ─────────────────────────────────────────────────────────────────────── */
function openOrderDetailModal(id, produto, comprador, valor, status, data, endereco){
  const statusColors = {
    'Pago':    {bg:'rgba(34,197,94,0.12)',  c:'#22C55E'},
    'Enviado': {bg:'rgba(37,99,235,0.12)',  c:'#60A5FA'},
    'Pendente':{bg:'rgba(245,158,11,0.12)', c:'#F59E0B'},
    'Disputa': {bg:'rgba(239,68,68,0.12)',  c:'#EF4444'},
  };
  const sc = statusColors[status] || statusColors['Pendente'];
  const isSent    = status === 'Enviado';
  const isPago    = status === 'Pago';
  const isDisputa = status === 'Disputa';
  const valorNum  = parseFloat(valor.replace('R$ ','').replace(/\./g,'').replace(',','.'));
  const repasse   = (valorNum * 0.92).toLocaleString('pt-BR',{minimumFractionDigits:2});
  _wkzModal('wkzOrderDetailModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:17px;margin-bottom:0;">Detalhes do Pedido</div>
        <div style="font-size:12px;color:var(--teal);font-family:'DM Sans',sans-serif;font-weight:700;">${id}</div>
      </div>
      <div style="margin-left:auto;padding:4px 12px;border-radius:50px;background:${sc.bg};border:1px solid ${sc.c}44;font-size:11px;font-weight:700;color:${sc.c};">${status}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Produto</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${produto}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Qtd: 1 unidade</div>
      </div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Valor</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:800;background:var(--grad1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${valor}</div>
        <div style="font-size:11px;color:#22C55E;margin-top:3px;">Repasse: R$ ${repasse} (após 8%)</div>
      </div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Comprador</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${comprador}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Cliente verificado ✓</div>
      </div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Data do Pedido</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${data}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Prazo: até 5 dias úteis</div>
      </div>
    </div>
    <div style="background:rgba(0,180,171,0.05);border:1px solid rgba(0,180,171,0.18);border-radius:10px;padding:12px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px;">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:1px;flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Endereço de Entrega</div>
        <div style="font-size:13px;color:var(--text);">${endereco}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
      <button class="btn-add-cart" style="padding:10px 16px;font-size:12px;" onclick="document.getElementById('wkzOrderDetailModal').classList.remove('open')">Fechar</button>
      ${isDisputa ? '<button class="btn-primary" style="padding:10px 16px;font-size:12px;background:linear-gradient(135deg,#EF4444,#F97316);border:none;" onclick="document.getElementById(\'wkzOrderDetailModal\').classList.remove(\'open\')">⚖️ Ver Disputa</button>' : ''}
      ${isSent ? '<button class="btn-primary" style="padding:10px 16px;font-size:12px;" onclick="showToast(\'📋 Código de rastreio copiado!\')">📦 Copiar Rastreio</button>' : ''}
      ${isPago ? '<button class="btn-primary" style="padding:10px 16px;font-size:12px;" onclick="marcarEnviado(\''+id+'\',this)">🚚 Marcar como Enviado</button>' : ''}
    </div>
  `, {maxWidth:'560px'});
}

/* ═══════════════════════════════════════════════════════════════
   WKZ SHIPPING LABEL ENGINE — v2.6.1
   openEtiquetaModal(data) — abre modal com preview 100×150mm
   imprimirEtiqueta()      — dispara window.print() isolado
   ═══════════════════════════════════════════════════════════════ */

/**
 * Gera SVG de código de barras Code 128 simplificado (visual fiel).
 * Cada char é representado por 11 módulos; alternância claro/escuro.
 * @param {string} code  — string a codificar
 * @returns {string}     — innerHTML de <svg>
 */
function _etqBuildBarcode128(code) {
  // Tabela Code 128B — cada entry = 11 bits (1=barra, 0=espaço)
  const C128B = {
    ' ':11011001100,'!':11001101100,'"':11001100110,'#':10010011000,
    '$':10010001100,'%':10001001100,'&':10011001000,"'":10011000100,
    '(':10001100100,')':11001001000,'*':11001000100,'+':11000100100,
    ',':10110011100,'-':10011011100,'.':10011001110,'/':10111001100,
    '0':10011101100,'1':10011100110,'2':11001110010,'3':11001011100,
    '4':11001001110,'5':11011100100,'6':11001110100,'7':11101101110,
    '8':11101001100,'9':11100101100,':':11100100110,';':11101100100,
    '<':11100110100,'=':11100110010,'>':11011011000,'?':11011000110,
    '@':11000110110,'A':10100011000,'B':10001011000,'C':10001000110,
    'D':10110001000,'E':10001101000,'F':10001100010,'G':11010001000,
    'H':11000101000,'I':11000100010,'J':10110111000,'K':10110001110,
    'L':10001101110,'M':10111011000,'N':10111000110,'O':10001110110,
    'P':11101110110,'Q':11010001110,'R':11000101110,'S':11011101000,
    'T':11011100010,'U':11011101110,'V':11101011000,'W':11101000110,
    'X':11100010110,'Y':11010111000,'Z':11010001110,
    '0':10011101100,'1':10011100110,'2':11001110010,'3':11001011100,
    '4':11001001110,'5':11011100100,'6':11001110100,'7':11101101110,
    '8':11101001100,'9':11100101100
  };
  const startB = '11010010000';
  const stop   = '1100011101011';

  let bits = startB;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i].toUpperCase();
    // fallback: use numeric pattern for unknown chars
    const pattern = C128B[ch] || C128B[ch.replace(/[^0-9A-Z]/g,'')] || 11011001100;
    bits += pattern.toString();
  }
  bits += stop;

  const moduleW = 300 / bits.length;
  let rects = '';
  let dark = true;
  for (let i = 0; i < bits.length; i++) {
    const b = parseInt(bits[i]);
    if (b === 1) {
      rects += `<rect x="${(i * moduleW).toFixed(2)}" y="0" width="${(moduleW + 0.3).toFixed(2)}" height="50" fill="#000"/>`;
    }
    dark = !dark;
  }
  return rects;
}

/**
 * Gera SVG de QR Code visual (matrix 21×21) — determinístico via hash.
 * Não é um QR Code real/decodificável mas é visualmente idêntico.
 * Para produção, substituir por biblioteca qrcode.js.
 */
function _etqBuildQR(data) {
  // Gera uma matriz pseudo-aleatória mas determinística baseada em hash
  function hashCode(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  const SIZE = 21;
  const CELL = 1;
  let cells = '';

  // Finder patterns (cantos fixos — padrão real QR)
  function finder(ox, oy) {
    // borda exterior 7×7
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const edge = r===0||r===6||c===0||c===6;
      const inner = r>=2&&r<=4&&c>=2&&c<=4;
      if (edge || inner)
        cells += `<rect x="${(ox+c)*CELL}" y="${(oy+r)*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;
    }
  }
  finder(0,0); finder(14,0); finder(0,14);

  // Timing patterns
  for (let i = 8; i < 13; i++) {
    if (i%2===0) {
      cells += `<rect x="${i*CELL}" y="${6*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;
      cells += `<rect x="${6*CELL}" y="${i*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;
    }
  }

  // Dark module
  cells += `<rect x="${8*CELL}" y="${13*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;

  // Data area — determinístico
  const seed = hashCode(data);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      // Skip finder & timing zones
      const inFinder = (r<=7 && c<=7) || (r<=7 && c>=14) || (r>=14 && c<=7);
      const inTiming = (r===6 && c>=8 && c<=12) || (c===6 && r>=8 && r<=12);
      if (inFinder || inTiming) continue;

      const bit = (hashCode(data + r*100 + c) ^ (r*17 + c*31 + seed)) & 1;
      if (bit) cells += `<rect x="${c*CELL}" y="${r*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;
    }
  }

  return cells;
}

/**
 * Gera código de rastreio WeKz no padrão Correios BR.
 */
function _etqGenTracking(pedidoId) {
  const nums = pedidoId.replace(/\D/g,'').padStart(8,'0').slice(-8);
  return `WK${nums}BR`;
}

/**
 * Abre o modal de etiqueta de envio.
 * @param {Object} d — {id, produto, comprador, endereco, cidade, cep, peso, dims, valor, nfe}
 */
function openEtiquetaModal(d) {
  const isBb2 = d.modo === 'b2b';
  const tracking = _etqGenTracking(d.id);

  /* ── Campos comuns ── */
  document.getElementById('etqTrackNum').textContent   = tracking;
  document.getElementById('etqPedido').textContent     = d.id      || '—';
  document.getElementById('etqDestNome').textContent   = d.comprador|| '—';
  document.getElementById('etqDestEnd').textContent    = d.endereco || '—';
  document.getElementById('etqDestCidade').textContent = d.cidade   || '—';
  document.getElementById('etqDestCep').textContent    = (isBb2 ? 'Destino: ' : 'CEP: ') + (d.cep || '—');
  document.getElementById('etqPeso').textContent       = d.peso     || '—';
  document.getElementById('etqDims').textContent       = d.dims     || '—';
  document.getElementById('etqValor').textContent      = d.valor    || '—';
  document.getElementById('etqNfeKey').textContent     = d.nfe      || (isBb2 ? 'Invoice / Packing List — anexar externamente' : 'Declaração de Conteúdo — sem NF-e');
  document.getElementById('etqBarcodeNum').textContent = tracking;

  /* ── Remetente dinâmico ── */
  const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (isBb2) {
    _set('etqRemNome',   d.remNome   || 'Global Tech Imports Lda.');
    _set('etqRemEnd',    d.remEnd    || 'Rua da Electrónica, 42, Piso 2');
    _set('etqRemCidade', d.remCidade || 'Lisboa, Portugal');
    _set('etqRemCep',    'NIF: ' + (d.remNif || 'PT501234567'));
  } else {
    _set('etqRemNome',   'WeKz Shop — Centro de Distribuição');
    _set('etqRemEnd',    'Av. das Indústrias, 2.400 — Galpão B, Módulo 7');
    _set('etqRemCidade', 'São Paulo — SP');
    _set('etqRemCep',    'CEP: 04701-000');
  }

  /* ── Campos B2B extras ── */
  const b2bRow = document.getElementById('etqB2bRow');
  if (b2bRow) b2bRow.style.display = isBb2 ? 'flex' : 'none';
  if (isBb2) {
    _set('etqPoNum',    d.po       || '—');
    _set('etqNcmCode',  d.ncm      || '—');
    _set('etqVolumes',  d.volumes  || '—');
    _set('etqIncoterm', d.incoterm || 'EXW');
  }

  /* ── Visual: banda topo âmbar/teal ── */
  const headerBand = document.querySelector('.etq-header-band');
  if (headerBand) headerBand.classList.toggle('b2b-mode', isBb2);

  /* ── Label QR ── */
  const qrLabel = document.querySelector('.etq-qr-label');
  if (qrLabel) qrLabel.textContent = isBb2 ? 'QR Invoice' : 'QR NF-e';

  /* ── Subtítulo do modal ── */
  const subtitle = document.querySelector('.wkz-etq-subtitle');
  if (subtitle) subtitle.textContent = isBb2
    ? 'Etiqueta de Lote B2B · WeKz Hub · 100×150mm · Code 128'
    : 'Padrão logístico WeKz Shop · 100×150mm · Code 128';

  /* ── Rodapé legal dinâmico ── */
  const footer = document.getElementById('etqFooterText');
  if (footer) footer.innerHTML = isBb2
    ? '<strong>Envio B2B — Ecossistema WeKz Shop.</strong><br>'
      + 'Obrigatório anexar <strong>Invoice Comercial + Packing List + Certificado de Origem</strong> na parte externa do volume.<br>'
      + 'Hub WeKz Lisboa · Rua do Armazém, 100 · 1900-000 Lisboa, PT · suporte@wekzshop.com'
    : '<strong>Transportado via ecossistema WeKz Shop.</strong><br>'
      + 'Obrigatório anexar NF-e ou Declaração de Conteúdo na parte <strong>externa</strong> da embalagem.<br>'
      + 'Em caso de avaria ou extravio, acesse: <strong>wekzshop.com/disputas</strong> — CNPJ Remetente: 00.000.000/0001-00';

  /* ── Código de barras e QR ── */
  const barSvg = document.getElementById('etqBarcodeSvg');
  if (barSvg) barSvg.innerHTML = _etqBuildBarcode128(tracking);
  const qrSvg = document.getElementById('etqQrSvg');
  if (qrSvg) qrSvg.innerHTML = _etqBuildQR(d.nfe || d.po || d.id);

  /* ── Abrir modal ── */
  const ov = document.getElementById('wkzEtiquetaModalOv');
  if (ov) ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEtiquetaModal() {
  const ov = document.getElementById('wkzEtiquetaModalOv');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

/**
 * Imprime apenas a etiqueta via @media print.
 * CSS já garante que somente #wkzEtiquetaModalOv seja renderizado.
 */
function imprimirEtiqueta() {
  showToast('🖨️ Enviando etiqueta para a impressora...');
  setTimeout(() => { window.print(); }, 320);
}

/* ═══════════════════════════════════════════════════════════════ */

/* ── marcarEnviado: abre modal de despacho (delegação para wkzSellerConfirmDispatch) ── */
function marcarEnviado(pedidoId, btn) {
  // Fecha o modal de detalhe antes de abrir o modal de despacho
  var detailModal = document.getElementById('wkzOrderDetailModal');
  if (detailModal) detailModal.classList.remove('open');
  openDispatchModal(pedidoId);
}

/* ── openDispatchModal: modal para o vendedor informar código de rastreio ── */
function openDispatchModal(pedidoId) {
  var trkCode = _etqGenTracking(pedidoId);
  _wkzModal('wkzDispatchModal', `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);border-radius:11px;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      </div>
      <div>
        <div class="modal-title" style="font-size:17px;margin-bottom:0;">Confirmar Envio</div>
        <div style="font-size:12px;color:#06B6D4;font-family:'DM Sans',sans-serif;font-weight:700;">${pedidoId}</div>
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Código de Rastreio</label>
      <input id="wkzDispatchTrkInput" type="text" value="${trkCode}"
        style="width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;"
        placeholder="Ex: BR123456789BR" />
      <div style="font-size:11px;color:var(--muted);margin-top:5px;">Código gerado automaticamente — edite se necessário.</div>
    </div>
    <div style="margin-bottom:18px;">
      <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Transportadora</label>
      <select id="wkzDispatchCarrierSelect"
        style="width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--text);font-size:13px;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;">
        <option value="Correios PAC">Correios PAC</option>
        <option value="Correios SEDEX">Correios SEDEX</option>
        <option value="Jadlog">Jadlog</option>
        <option value="Loggi">Loggi</option>
        <option value="Total Express">Total Express</option>
        <option value="Melhor Envio">Melhor Envio</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn-add-cart" style="padding:10px 16px;font-size:12px;" onclick="document.getElementById('wkzDispatchModal').classList.remove('open')">Cancelar</button>
      <button class="btn-primary" style="padding:10px 20px;font-size:12px;" onclick="wkzSellerConfirmDispatch('${pedidoId}', document.getElementById('wkzDispatchTrkInput').value, document.getElementById('wkzDispatchCarrierSelect').value, this)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
        Confirmar Envio
      </button>
    </div>
  `, {maxWidth:'480px'});
}

/* ══════════════════════════════════════════════════════════════════
   wkzSellerConfirmDispatch — SINCRONIA TRILATERAL: DESPACHO
   Vendedor confirma envio → propaga status + rastreio ao Comprador,
   atualiza tabela do Vendedor e notifica Admin.
   ══════════════════════════════════════════════════════════════════ */
function wkzSellerConfirmDispatch(orderId, trackingCode, carrier, btn) {
  if (!trackingCode || !trackingCode.trim()) {
    showToast('⚠️ Informe o código de rastreio antes de confirmar.');
    return;
  }
  var trk = trackingCode.trim().toUpperCase();

  /* 1 — Atualiza _WKZ_ORDERS (estado global) */
  if (window._WKZ_ORDERS) {
    var go = window._WKZ_ORDERS.find(function(o) { return o.id === orderId; });
    if (go) { go.status = 'shipped'; go.trk = trk; go.carrier = carrier; }
  }

  /* 2 — Atualiza linha na tabela de Pedidos do Vendedor */
  var svgTruck = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
  /* Tabela compacta (sidebar quick-view) */
  document.querySelectorAll('#ordersTableBody tr, #sellerOrdersList tr').forEach(function(row) {
    if (row.textContent.indexOf(orderId) !== -1) {
      var statusCell = row.querySelector('[class*="order-status"]') || row.querySelector('td:nth-child(5) span') || row.querySelector('td span[class]');
      if (statusCell) {
        statusCell.className = 'order-status status-shipped';
        statusCell.innerHTML = svgTruck + 'Enviado';
      }
      /* Atualiza data-status da linha para filtros */
      row.setAttribute('data-status', 'shipped');
    }
  });
  /* Tabela completa de Pedidos do Vendedor (dash-orders) */
  document.querySelectorAll('[data-order-id="' + orderId + '"]').forEach(function(row) {
    var sp = row.querySelector('.order-status');
    if (sp) { sp.className = 'order-status status-shipped'; sp.innerHTML = svgTruck + 'Enviado'; }
  });

  /* 3 — Propaga ao painel do Comprador (CP_ORDERS em Meu Perfil) */
  if (window.CP_ORDERS) {
    var co = window.CP_ORDERS.find(function(o) { return o.id === orderId; });
    if (co) {
      co.status = 'shipping';
      co.statusLabel = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Enviado · ' + carrier;
      co.progress = 65;
      co.activeStep = 3;
      co.trk = trk;
      co.carrier = carrier;
    }
    /* Re-renderiza se a função existir (painel do comprador aberto) */
    if (typeof renderOrders === 'function') renderOrders();
  }

  /* 4 — Notificação push ao Comprador */
  if (typeof wkzShowPush === 'function') {
    wkzShowPush(
      '📦 Pedido Enviado!',
      'Seu pedido ' + orderId + ' foi despachado via ' + carrier + '. Rastreio: ' + trk,
      'success',
      8000
    );
  }

  /* 5 — Notifica Admin (atualiza status na Central de Mediação se existir) */
  var adminRow = document.querySelector('[data-dispute-id="' + orderId + '"]');
  if (adminRow) {
    var admStatus = adminRow.querySelector('.adm-status-badge');
    if (admStatus) admStatus.textContent = 'Despachado';
  }

  /* 6 — Fecha modal e exibe confirmação */
  var modal = document.getElementById('wkzDispatchModal');
  if (modal) modal.classList.remove('open');
  showToast('✅ Pedido ' + orderId + ' despachado! Comprador notificado. Rastreio: ' + trk);

  /* 7 — Atualiza botão na tabela para "Ver Rastreio" */
  document.querySelectorAll('button[onclick*="marcarEnviado(\'' + orderId + '\'"]').forEach(function(b) {
    b.textContent = '📍 Rastreio';
    b.onclick = function() { showToast('📦 Rastreio ' + orderId + ': ' + trk + ' (' + carrier + ')'); };
  });
}

/* ═══════════════════════════════════════════════════════════════
   wkzSellerConfirmOrderReceipt(orderId, btn)
   v2.9.35 — Fluxo de confirmação do vendedor:
     1º clique: "Confirmar Recebido"  → status "Em Preparação"
     2º clique: "Marcar como Enviado" → abre wkzDispatchModal
   Propaga ao _TRK_DATA (rastreio do comprador) e notifica via push.
   ═══════════════════════════════════════════════════════════════ */
function wkzSellerConfirmOrderReceipt(orderId, btn) {
  var svgBox = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px;"><path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

  /* ── 1. Atualiza status na linha da tabela ── */
  var row = btn ? btn.closest('tr') : document.querySelector('[data-order-id="' + orderId + '"]');
  if (row) {
    var statusSpan = row.querySelector('.order-status');
    if (statusSpan) {
      statusSpan.className = 'order-status';
      statusSpan.style.background = 'rgba(245,158,11,0.12)';
      statusSpan.style.color = '#F59E0B';
      statusSpan.innerHTML = svgBox + 'Em Preparação';
    }
    row.setAttribute('data-status', 'preparing');
    /* Troca botão → "Marcar como Enviado" */
    if (btn) {
      btn.style.background = 'rgba(37,99,235,0.12)';
      btn.style.borderColor = 'rgba(37,99,235,0.4)';
      btn.style.color = '#60A5FA';
      btn.textContent = '🚚 Marcar Enviado';
      btn.onclick = function() { marcarEnviado(orderId, btn); };
    }
  }

  /* ── 2. Atualiza _TRK_DATA → comprador vê "Vendedor confirmou" ── */
  var trkKey = orderId.replace('#','');
  if (typeof _TRK_DATA !== 'undefined' && _TRK_DATA[trkKey]) {
    var td = _TRK_DATA[trkKey];
    td.status      = 'preparing';
    td.statusLabel = 'Em Preparação';
    td.statusIcon  = '📦';
    td.bannerGrad  = 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)';
    td.progress    = 25;
    td.activeStep  = 1;
    /* Atualiza evento "Aguardando confirmação" → concluído */
    if (td.events && td.events[1]) {
      var now35 = new Date();
      var t35   = now35.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ' +
                  now35.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      td.events[1].title  = 'Pedido confirmado pelo vendedor';
      td.events[1].desc   = 'O vendedor recebeu e está preparando seu pedido para envio.';
      td.events[1].time   = t35;
      td.events[1].location = 'Loja WeKz';
      td.events[1].done   = true;
      td.events[1].active = true;
    }
    if (td.events && td.events[0]) { td.events[0].active = false; }
  }

  /* ── 3. Notifica o Comprador (push) ── */
  if (typeof wkzShowPush === 'function') {
    wkzShowPush(
      '✅ Vendedor Confirmou!',
      'Seu pedido ' + orderId + ' foi confirmado pelo vendedor e está em preparação.',
      'success',
      7000
    );
  }

  showToast('✅ Pedido ' + orderId + ' confirmado! Agora clique em "Marcar Enviado" ao despachar.');
}

/* ── CONFIGURAÇÕES DO VENDEDOR — SALVAR ── */
function salvarConfiguracoes(btn){
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Salvando...';
  const inputs = document.querySelectorAll('#dash-settings input, #dash-settings select, #dash-settings textarea');
  const saved = {};
  inputs.forEach(inp => { if(inp.id) saved[inp.id] = inp.value; });
  // [v2.9.39] Mantém currentSeller.store em sincronia com o nome digitado —
  // é essa referência que salvarMarketing('cupom') e o Kz Negotiator usam
  // para saber a qual loja um cupom/margem pertence.
  const nameInput = document.getElementById('sellerStoreNameInput');
  if (nameInput && nameInput.value.trim()) {
    currentSeller.store = nameInput.value.trim();
  }
  setTimeout(()=>{
    // SEC-01 [negócio — TODO]: configurações de vendedor a migrar para /api/seller/settings
    try { if(typeof wkzSecureStorage!=='undefined'){wkzSecureStorage.set('wkz_seller_settings',saved);}else{localStorage.setItem('wkz_seller_settings',JSON.stringify(saved));} } catch(e){}
    btn.disabled = false;
    btn.innerHTML = orig;
    showToast('✅ Configurações do vendedor salvas com sucesso!');
  }, 800);
}

function salvarNotificacoes(btn){
  const orig = btn.innerHTML;
  btn.disabled = true;
  const checks = document.querySelectorAll('#dash-settings input[type="checkbox"]');
  const prefs = {};
  checks.forEach(c => { if(c.id) prefs[c.id] = c.checked; });
  setTimeout(()=>{
    // SEC-01 [negócio — TODO]: preferências de notificação a migrar para /api/seller/notifications
    try { if(typeof wkzSecureStorage!=='undefined'){wkzSecureStorage.set('wkz_notif_prefs',prefs);}else{localStorage.setItem('wkz_notif_prefs',JSON.stringify(prefs));} } catch(e){}
    btn.disabled = false;
    btn.innerHTML = orig;
    showToast('🔔 Preferências de notificação atualizadas!');
  }, 600);
}

function salvarProvaSocial(btn){
  const toggle = document.getElementById('kzSocialProofToggle');
  const ativo = toggle ? toggle.checked : false;
  const orig = btn.innerHTML;
  btn.disabled = true;
  setTimeout(()=>{
    // SEC-01 [negócio — TODO]: estado da prova social a migrar para /api/seller/settings
    try { if(typeof wkzSecureStorage!=='undefined'){wkzSecureStorage.set('wkz_social_proof',{ativo,ts:Date.now()});}else{localStorage.setItem('wkz_social_proof',JSON.stringify({ativo,ts:Date.now()}));} } catch(e){}
    btn.disabled = false;
    btn.innerHTML = orig;
    // Sync the engine and update the badge immediately after saving
    if (window.kzSocialProofSync) window.kzSocialProofSync();
    if (window.kzSocialAdminStatus) window.kzSocialAdminStatus();
    showToast(ativo ? '📣 Prova social ativada e salva!' : '⏸ Prova social desativada e salva.');
  }, 700);
}

function toggleEnvioInternacional(ativo){
  showToast(ativo ? '🌍 Envio internacional habilitado! Configure as tarifas.' : '🇧🇷 Somente envios nacionais ativados.');
}

/* ── filterMyDisputes ──────────────────────────────────────────────────────
   Filtra as disputas no painel do VENDEDOR (#dash-disputes): abertas
   (exigem resposta em 48h), resolvidas (com veredito) e fechadas (sem
   necessidade de mediação). Único hub de disputas do vendedor.
   status — 'open' | 'resolved' | 'closed'
─────────────────────────────────────────────────────────────────────────── */
function filterMyDisputes(status, btn) {
  var panel = document.getElementById('dash-disputes');
  if (!panel) return;
  panel.querySelectorAll('.rev-filter').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  panel.querySelectorAll('[data-dispute-status]').forEach(function(item) {
    item.style.display = (item.dataset.disputeStatus === status) ? '' : 'none';
  });

  var warning = document.getElementById('disputesOpenWarning');
  if (warning) warning.style.display = (status === 'open') ? '' : 'none';

  var labels = { open: 'Abertas', resolved: 'Resolvidas', closed: 'Fechadas' };
  showToast('🔍 Exibindo disputas: ' + (labels[status] || status));
}

/* ── wkzNotifySellerNewDispute ─────────────────────────────────────────────
   Ponte entre a disputa aberta pelo comprador (Central de Disputas do
   Cliente, em "Meu Perfil") e o painel "Disputas" do vendedor. Sem essa
   ponte, as duas telas eram listas estáticas e desconectadas — o vendedor
   nunca via o que o comprador realmente abria. Insere o card na lista de
   "Abertas" com o botão "Responder Agora" já funcional.
─────────────────────────────────────────────────────────────────────────── */
function filterProducts(tipo, el){
  document.querySelectorAll('#dash-products .rev-filter').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#myProductsList .product-card').forEach(card=>{
    card.style.display = (tipo === 'all' || card.dataset.status === tipo) ? '' : 'none';
  });
  showToast('🔍 Filtrando produtos: '+el.textContent);
}

/* ── 3.6: Registro do Vendedor (multi-step) ──────────────────────────────
   validateCNPJ, sellerNextStep, sellerGoBack, sellerGoStep. Reconecta o
   que foi deliberadamente excluído de wkz-buyer.js no Sprint M2 (a aba
   "Ser Vendedor" do auth aponta pra cá via wkz-seller.html#auth-seller).
   Origem monólito: linhas 33520–33673
   ─────────────────────────────────────────────────────────────────────── */

// ─── SELLER MULTI-STEP ───
let currentSellerStep = 1;
// ─── CNPJ VALIDATION — FIX BUG-AUTH04 ───
// Algoritmo oficial de validação de dígito verificador do CNPJ.
function validateCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false; // rejeita 00000000000000 etc.
  const calc = function(s, n) {
    var t = 0, p = n;
    for (var i = 0; i < n - 1; i++) {
      t += parseInt(s[i]) * p--;
      if (p < 2) p = 9;
    }
    var r = t % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(cnpj, 13) === parseInt(cnpj[12]) &&
         calc(cnpj, 14) === parseInt(cnpj[13]);
}

function sellerNextStep(step){
  // ── FIX BUG-AUTH04: validação por etapa ──
  if(step === 1){
    const storeName = document.querySelector('#seller-step1 input[type="text"]')?.value.trim();
    if(!storeName){ showToast('⚠️ Informe o nome da sua loja para continuar'); return; }
  }
  if(step === 2){
    const cnpjRaw = (document.getElementById('sellerCnpj') || {}).value || '';
    const cnpjDigits = cnpjRaw.replace(/[^\d]/g, '');
    if(!cnpjRaw.trim()){
      showToast('⚠️ Informe o CNPJ / CPF / Documento Legal');
      document.getElementById('sellerCnpj')?.focus();
      return;
    }
    // Valida CNPJ (14 dígitos) — CPF (11 dígitos) apenas formata
    if(cnpjDigits.length === 14 && !validateCNPJ(cnpjRaw)){
      showToast('⚠️ CNPJ inválido — verifique os dígitos verificadores');
      document.getElementById('sellerCnpj')?.focus();
      return;
    }
  }
  // Hide all seller steps
  for(let i = 1; i <= 4; i++){
    const s = document.getElementById('seller-step'+i);
    if(s) s.style.display = 'none';
    const ss = document.getElementById('ss'+i);
    if(ss) ss.classList.remove('active','done');
  }
  const next = step + 1;
  const target = document.getElementById('seller-step'+next);
  if(target){ target.style.display = 'block'; target.style.animation = 'stepFadeIn 0.28s ease'; }

  // Update step indicators
  for(let i = 1; i <= 4; i++){
    const ss = document.getElementById('ss'+i);
    if(!ss) continue;
    if(i <= step) ss.classList.add('done');
    else if(i === next) ss.classList.add('active');
  }
  currentSellerStep = next;

  // If last step (4), show success after submit
  if(next === 4){
    showToast('📋 Quase lá! Finalize o KYC para abrir sua loja.');
  }
  document.documentElement.scrollTop = 0; window.scrollTo({top:0,behavior:'instant'});
}

function sellerGoBack(step){
  // Hide all seller steps
  for(let i = 1; i <= 4; i++){
    const s = document.getElementById('seller-step'+i);
    if(s) s.style.display = 'none';
    const ss = document.getElementById('ss'+i);
    if(ss) ss.classList.remove('active','done');
  }
  const target = document.getElementById('seller-step'+step);
  if(target) target.style.display = 'block';
  for(let i = 1; i <= 4; i++){
    const ss = document.getElementById('ss'+i);
    if(!ss) continue;
    if(i < step) ss.classList.add('done');
    else if(i === step) ss.classList.add('active');
  }
  currentSellerStep = step;
  document.documentElement.scrollTop = 0; window.scrollTo({top:0,behavior:'instant'});
}

async function finishSellerRegister(){
  // 1. Coleta de dados do formulário
  const payload = {
    storeName: document.querySelector('#seller-step1 input[type="text"]')?.value || '',
    storeType: document.querySelector('#seller-step1 select')?.value || '',
    documentId: document.querySelector('#seller-step2 input[type="text"]')?.value || '',
    payMode: document.querySelector('input[name="payMode"]:checked')?.value || 'pix',
  };

  // 2. Feedback visual de carregamento no botão
  const submitBtn = document.querySelector('#seller-step4 .btn-submit:last-child');
  const originalText = submitBtn ? submitBtn.textContent : '';
  if(submitBtn){
    submitBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;margin-right:8px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;"></span> Processando...';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
  }

  try {
    // 3. Simulação de delay de rede (substitua pelo fetch real quando tiver a API)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Quando tiver API real, substitua a linha acima por:
    // const response = await fetch('https://sua-api.com/api/seller/register', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload)
    // });
    // if (!response.ok) throw new Error('Erro ao registrar vendedor');

    // 4. Sucesso: esconder os passos e mostrar a tela final
    for(let i = 1; i <= 4; i++){
      const s = document.getElementById('seller-step'+i);
      if(s) s.style.display = 'none';
      const ss = document.getElementById('ss'+i);
      if(ss){ ss.classList.remove('active'); ss.classList.add('done'); }
    }

    const success = document.getElementById('seller-success');
    if(success){
      success.style.display = 'block';
      document.documentElement.scrollTop = 0; window.scrollTo({top: 0, behavior: 'instant'});
    } else {
      showToast('🎉 Loja criada! Em análise — aprovação em até 24h.');
    }

  } catch(error){
    console.error('Falha no registro KYC:', error);
    showToast('⚠️ Erro ao enviar os dados. Tente novamente mais tarde.');
  } finally {
    // 5. Restaurar o botão em caso de erro ou finalização
    if(submitBtn){
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  }
}

// Aliases used in HTML
/* NOTA (auditoria M3): regNextStep(step){ regGoStep(step+1); } foi removida
   daqui — é alias do fluxo de registro do BUYER (chama regGoStep, que só
   existe em wkz-buyer.js), vazou por estar na linha adjacente a
   sellerGoStep no monólito original (33670/33671). Não era referenciada
   em nenhum lugar de wkz-seller.html (confirmado via grep), então não
   causava crash — mas ficava como lixo cross-module solto no arquivo. */
function sellerGoStep(step){ sellerGoBack(step); }

// ── Máscara CPF/Documento ──

/* ════════════════════════════════════════════════════════════════════════
   BLOCOS ADICIONAIS — encontrados na auditoria final pré-push (após M3)
   ════════════════════════════════════════════════════════════════════════ */

/* ── Seller Premium — Modal Controller — origem 45419–45611 ── */
/* ══════════════════════════════════════════════════════════
   WeKz Seller Premium — Modal Controller (v2.3.2)
   ══════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _selectedPlan = null;
  var _selectedPayment = null;

  var PLANS = {
    starter:    { label: 'Starter',    price: 'R$49,90/mês',  commission: '8%',  days: '10', benefits: ['Comissão 8% ativada','Pagamento em 10 dias ativado','Badge Premium no perfil'] },
    pro:        { label: 'Pro',        price: 'R$129,90/mês', commission: '5%',  days: '7',  benefits: ['Comissão 5% ativada','Pagamento em 7 dias ativado','Anúncios patrocinados liberados','Badge Premium no perfil'] },
    enterprise: { label: 'Enterprise', price: 'R$299,90/mês', commission: '3%',  days: '3',  benefits: ['Comissão 3% ativada','Pagamento em 3 dias ativado','Gerente de conta dedicado','Badge Premium no perfil'] }
  };

  window.openPremiumPlansModal = function() {
    var overlay = document.getElementById('premiumPlansOverlay');
    if (!overlay) return;
    _selectedPlan = null;
    _selectedPayment = null;
    // Reset steps
    document.getElementById('premiumStep1').style.display = '';
    document.getElementById('premiumStep2').style.display = 'none';
    document.getElementById('premiumStep3').style.display = 'none';
    // Reset card selection
    ['starter','pro','enterprise'].forEach(function(p) {
      var card = document.getElementById('premiumPlanCard-' + p);
      if (card) {
        card.classList.remove('selected');
        card.style.borderColor = p === 'pro' ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)';
        card.style.boxShadow = '';
      }
    });
    overlay.style.display = 'flex';
    setTimeout(function() { overlay.style.opacity = '1'; }, 10);
  };

  window.closePremiumPlansModal = function() {
    var overlay = document.getElementById('premiumPlansOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  window.selectPremiumPlan = function(plan) {
    _selectedPlan = plan;
    var planData = PLANS[plan];
    if (!planData) return;

    // Visual feedback nos cards
    ['starter','pro','enterprise'].forEach(function(p) {
      var card = document.getElementById('premiumPlanCard-' + p);
      if (!card) return;
      card.classList.remove('selected');
      if (p === plan) {
        card.classList.add('selected');
        card.style.borderColor = p === 'pro' ? '#a78bfa' : (p === 'enterprise' ? 'rgba(6,182,212,0.7)' : 'rgba(0,180,171,0.7)');
        card.style.boxShadow = '0 0 20px rgba(124,58,237,0.25)';
      } else {
        card.style.borderColor = p === 'pro' ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)';
        card.style.boxShadow = '';
      }
    });

    // Preenche step 2
    var lbl = document.getElementById('premiumConfirmLabel');
    var prx = document.getElementById('premiumConfirmPrice');
    if (lbl) lbl.textContent = 'WeKz Seller ' + planData.label;
    if (prx) prx.textContent = planData.price;

    // Reseta cupom
    var couponInput = document.getElementById('premiumCouponInput');
    var couponMsg = document.getElementById('premiumCouponMsg');
    if (couponInput) couponInput.value = '';
    if (couponMsg) { couponMsg.style.display = 'none'; couponMsg.textContent = ''; }

    // Reseta seleção de pagamento
    _selectedPayment = null;
    ['pix','card'].forEach(function(pm) {
      var btn = document.getElementById('pm' + pm.charAt(0).toUpperCase() + pm.slice(1));
      if (btn) {
        btn.style.borderColor = pm === 'pix' ? 'rgba(0,180,171,0.35)' : 'rgba(255,255,255,0.1)';
        btn.style.background = pm === 'pix' ? 'rgba(0,180,171,0.1)' : 'rgba(255,255,255,0.04)';
      }
    });

    // Transição step 1 → step 2
    document.getElementById('premiumStep1').style.display = 'none';
    var s2 = document.getElementById('premiumStep2');
    s2.style.display = '';
    s2.style.animation = 'none';
    setTimeout(function() { s2.style.animation = 'kzPopIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both'; }, 10);
  };

  window.premiumGoBack = function() {
    document.getElementById('premiumStep2').style.display = 'none';
    document.getElementById('premiumStep1').style.display = '';
  };

  window.selectPremiumPayment = function(pm) {
    _selectedPayment = pm;
    var pmMap = { pix: 'Pix', card: 'Card' };
    ['Pix','Card'].forEach(function(k) {
      var btn = document.getElementById('pm' + k);
      if (!btn) return;
      var isPix = k === 'Pix';
      if (k === pmMap[pm]) {
        btn.style.borderColor = isPix ? 'rgba(0,180,171,0.9)' : '#a78bfa';
        btn.style.background = isPix ? 'rgba(0,180,171,0.22)' : 'rgba(124,58,237,0.15)';
        btn.style.boxShadow = '0 0 10px ' + (isPix ? 'rgba(0,180,171,0.2)' : 'rgba(124,58,237,0.2)');
      } else {
        btn.style.borderColor = isPix ? 'rgba(0,180,171,0.35)' : 'rgba(255,255,255,0.1)';
        btn.style.background = isPix ? 'rgba(0,180,171,0.1)' : 'rgba(255,255,255,0.04)';
        btn.style.boxShadow = '';
      }
    });
  };

  window.applyPremiumCoupon = function() {
    var input = document.getElementById('premiumCouponInput');
    var msg = document.getElementById('premiumCouponMsg');
    if (!input || !msg) return;
    var code = (input.value || '').trim().toUpperCase();
    if (!code) { showToast('Digite um código de cupom'); return; }
    var valid = { 'WKZPREMIUM20': '20% de desconto aplicado!', 'WKZBEM10': '10% de desconto aplicado!', 'SELLER50': 'R$50,00 de desconto aplicado!' };
    msg.style.display = 'block';
    if (valid[code]) {
      msg.textContent = '✓ ' + valid[code];
      msg.style.color = '#22C55E';
      showToast('🎟️ Cupom aplicado: ' + valid[code]);
    } else {
      msg.textContent = '✗ Cupom inválido ou expirado';
      msg.style.color = '#EF4444';
    }
  };

  window.confirmPremiumSubscription = function() {
    if (!_selectedPayment) {
      showToast('⚠️ Selecione uma forma de pagamento');
      // Highlight as opções de pagamento
      var pmSection = document.getElementById('pmPix');
      if (pmSection) {
        pmSection.style.animation = 'none';
        pmSection.parentElement.style.animation = 'none';
        setTimeout(function() {
          pmSection.parentElement.style.outline = '1.5px solid rgba(239,68,68,0.6)';
          pmSection.parentElement.style.borderRadius = '10px';
          setTimeout(function() { pmSection.parentElement.style.outline = ''; }, 1800); 
        }, 10);
      }
      return;
    }
    if (!_selectedPlan) return;

    var planData = PLANS[_selectedPlan];
    var btn = document.getElementById('premiumConfirmBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Processando...';
    }

    setTimeout(function() {
      // Preenche step 3
      var succMsg = document.getElementById('premiumSuccessMsg');
      if (succMsg) succMsg.innerHTML = 'Seu plano <strong style="color:var(--teal);">' + planData.label + '</strong> foi ativado com sucesso. Aproveite todos os benefícios!';
      var benefitsEl = document.getElementById('premiumSuccessBenefits');
      if (benefitsEl && planData.benefits) {
        benefitsEl.innerHTML = planData.benefits.map(function(b) {
          return '<div style="display:flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + b + '</div>';
        }).join('');
      }

      // Transição step 2 → step 3
      document.getElementById('premiumStep2').style.display = 'none';
      var s3 = document.getElementById('premiumStep3');
      s3.style.display = '';
      s3.style.animation = 'none';
      setTimeout(function() { s3.style.animation = 'kzPopIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both'; }, 10);

      // Restaura botão
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Assinar Agora'; }

      showToast('⭐ Plano Premium ' + planData.label + ' ativado!');
    }, 1600);
  };

  // Fechar com ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var overlay = document.getElementById('premiumPlansOverlay');
      if (overlay && overlay.style.display !== 'none') closePremiumPlansModal();
    }
  });

})();

/* ── WkzKYC — Verificação KYC/KYB do vendedor (Upload+OCR mock+CNPJ) ─────
   origem 47701–48013 ── */
var WkzKYC = (function() {
  'use strict';

  var state = {
    vendorId: 'VENDOR-001',
    kycStatus: 'not-started', // not-started, pending, under-review, approved, rejected
    documents: {},
    riskScore: null,
    timeline: [],
    ocrResults: {}
  };

  /**
   * Gera número de protocolo KYC
   * @returns {string} PROTO-KYC-YYYYMMDDhhmmss-HASH
   */
  function generateKYCProtocol() {
    var now = new Date();
    var datePart = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('');

    var hash = Math.random().toString(36).substr(2, 6).toUpperCase();
    return 'PROTO-KYC-' + datePart + '-' + hash;
  }

  /**
   * Simula OCR em documento
   * Retorna dados extraídos (mock)
   * @param {File} file
   * @param {string} docType - 'rg' | 'cnpj' | 'comprovante'
   * @returns {object}
   */
  function mockOCR(file, docType) {
    // Simulação de extração de dados
    var ocrData = {
      timestamp: Date.now(),
      fileName: file.name,
      fileSize: file.size,
      documentType: docType,
      confidence: Math.floor(85 + Math.random() * 15), // 85-100%
      extractedData: {}
    };

    if (docType === 'rg') {
      ocrData.extractedData = {
        nome: 'João da Silva Santos',
        cpf: '123.456.789-10',
        rg: '12.345.678-9',
        dataEmissao: '2015-03-22',
        dataValidade: '2035-03-21',
        estado: 'SP'
      };
    } else if (docType === 'cnpj') {
      ocrData.extractedData = {
        razaoSocial: 'Tech Store Ltda',
        cnpj: '12.345.678/0001-90',
        inscricaoEstadual: '123.456.789.012',
        dataConstituicao: '2018-05-15',
        naturezaJuridica: '206-2 - Sociedade Limitada',
        atividade: 'Comércio eletrônico de produtos eletrônicos'
      };
    } else if (docType === 'comprovante') {
      ocrData.extractedData = {
        endereco: 'Rua das Flores, 42 - Apartamento 12',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: '01310-100',
        dataComprovante: '2026-05-10',
        provedorServico: 'Eletropaulo'
      };
    }

    return ocrData;
  }

  /**
   * Valida CNPJ (simula API da Receita Federal)
   * @param {string} cnpj - formato "12.345.678/0001-90" ou "12345678000190"
   * @returns {object} { isValid, status, riskLevel, foundDate }
   */
  function validateCNPJ(cnpj) {
    // Remove formatação
    var clean = cnpj.replace(/\D/g, '');

    // Simula validação
    var isValid = /^\d{14}$/.test(clean) && clean !== '00000000000000';
    
    var riskLevel = 'baixo'; // 'baixo', 'médio', 'alto'
    var status = 'Ativa';

    // Mock: alguns CNPJs têm risco médio/alto
    if (clean.charAt(0) === '1') riskLevel = 'médio';
    if (clean.charAt(0) === '2') riskLevel = 'alto';

    return {
      isValid: isValid,
      cnpj: clean,
      status: status,
      riskLevel: riskLevel,
      foundDate: '2018-05-15',
      validatedAt: new Date().toLocaleString('pt-BR'),
      source: 'Receita Federal - Mock'
    };
  }

  /**
   * Calcula score de risco baseado em documentos e validações
   * @returns {object} { score: 0-100, level: 'baixo'|'médio'|'alto' }
   */
  function calculateRiskScore() {
    var score = 50; // baseline

    // Reduz risco se CNPJ válido
    if (state.documents.cnpj && state.documents.cnpj.validation.isValid) {
      score -= 15;
    }

    // Reduz risco se documentação completa
    if (state.documents.rg && state.documents.comprovante) {
      score -= 10;
    }

    // Aumenta risco se CNPJ recém-constituído
    var now = new Date();
    if (state.documents.cnpj) {
      var constDate = new Date(state.documents.cnpj.ocrData.extractedData.dataConstituicao);
      var daysDiff = (now - constDate) / (1000 * 60 * 60 * 24);
      if (daysDiff < 365) score += 20; // menos de 1 ano
    }

    score = Math.max(0, Math.min(100, score)); // Clamp 0-100

    var level = score <= 33 ? 'baixo' : (score <= 66 ? 'médio' : 'alto');

    return { score: score, level: level };
  }

  /**
   * Abre modal de upload KYC
   */
  function openKYCModal() {
    var html = '<div style="padding:20px;max-width:900px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">' +
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 15 10"/></svg>' +
        '<h2 style="font-size:18px;font-weight:700;color:var(--text);">Verificação KYC/KYB</h2>' +
      '</div>' +
      '<div style="background:rgba(34,197,94,0.08);border-left:4px solid #22C55E;padding:12px;border-radius:6px;margin-bottom:16px;font-size:12px;line-height:1.6;color:var(--muted);">' +
        '<strong style="color:var(--text);">O que é KYC?</strong> Know Your Customer (Conheça seu Cliente) é um processo de verificação de identidade e autenticidade. ' +
        'Benefícios: aumento de limite, badge de verificado, prioridade em suporte, desconto de 2% na comissão WeKz.' +
      '</div>' +
      '<form id="kycForm" style="display:flex;flex-direction:column;gap:16px;">' +
        // RG
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:.7px;">📄 RG ou CPF</label>' +
          '<div style="border:2px dashed rgba(34,197,94,0.3);border-radius:10px;padding:20px;text-align:center;background:rgba(34,197,94,0.04);cursor:pointer;" onclick="document.getElementById(\'kycRG\').click();" id="kycRGZone">' +
            '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:0 auto 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">Upload de RG ou CPF</div>' +
            '<div style="font-size:11px;color:var(--muted);">Frente e verso (JPG/PNG, máx 10MB)</div>' +
          '</div>' +
          '<input type="file" id="kycRG" style="display:none;" accept="image/*" onchange="wkzProcessKYCDocument(this, \'rg\')">' +
          '<div id="kycRGStatus" style="font-size:11px;color:var(--muted);margin-top:6px;"></div>' +
        '</div>' +
        // CNPJ
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:.7px;">🏢 CNPJ e Inscrição Estadual</label>' +
          '<div style="border:2px dashed rgba(34,197,94,0.3);border-radius:10px;padding:20px;text-align:center;background:rgba(34,197,94,0.04);cursor:pointer;" onclick="document.getElementById(\'kycCNPJ\').click();" id="kycCNPJZone">' +
            '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:0 auto 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">Upload de CNPJ</div>' +
            '<div style="font-size:11px;color:var(--muted);">Comprovante de inscrição (PDF/JPG, máx 10MB)</div>' +
          '</div>' +
          '<input type="file" id="kycCNPJ" style="display:none;" accept="image/*,.pdf" onchange="wkzProcessKYCDocument(this, \'cnpj\')">' +
          '<div id="kycCNPJStatus" style="font-size:11px;color:var(--muted);margin-top:6px;"></div>' +
        '</div>' +
        // Comprovante
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:.7px;">🏠 Comprovante de Residência/Sede</label>' +
          '<div style="border:2px dashed rgba(34,197,94,0.3);border-radius:10px;padding:20px;text-align:center;background:rgba(34,197,94,0.04);cursor:pointer;" onclick="document.getElementById(\'kycComp\').click();" id="kycCompZone">' +
            '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:0 auto 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">Upload de Comprovante</div>' +
            '<div style="font-size:11px;color:var(--muted);">Conta de água/luz/internet/telefone (máx 10MB)</div>' +
          '</div>' +
          '<input type="file" id="kycComp" style="display:none;" accept="image/*,.pdf" onchange="wkzProcessKYCDocument(this, \'comprovante\')">' +
          '<div id="kycCompStatus" style="font-size:11px;color:var(--muted);margin-top:6px;"></div>' +
        '</div>' +
        '<div style="background:rgba(245,158,11,0.08);border-left:4px solid #F59E0B;padding:12px;border-radius:6px;font-size:11px;color:var(--muted);line-height:1.6;">' +
          '⚠️ <strong>Seus documentos serão verificados em até 5 dias úteis.</strong> Mantenha seus dados sempre atualizados para não perder benefícios.' +
        '</div>' +
      '</form>' +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<button style="flex:1;background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;" onclick="wkzSubmitKYC();">' +
          '✓ Enviar para Verificação' +
        '</button>' +
        '<button style="flex:1;background:var(--card2);color:var(--text);border:1px solid var(--border);padding:12px;border-radius:8px;font-weight:700;cursor:pointer;" onclick="_wkzModal(null);">' +
          'Cancelar' +
        '</button>' +
      '</div>' +
    '</div>';

    _wkzModal('wkzKYCModal', html, { showClose: true });
  }

  return {
    generateProtocol: generateKYCProtocol,
    mockOCR: mockOCR,
    validateCNPJ: validateCNPJ,
    calculateRiskScore: calculateRiskScore,
    openModal: openKYCModal,
    getStatus: function() { return state.kycStatus; },
    getRiskScore: function() { return state.riskScore; },
    state: state
  };
})();

// ─────────────────────────────────────────────────────────────
// Funções globais para integração
window.wkzOpenKYCModal = function() {
  WkzKYC.openModal();
};

window.wkzProcessKYCDocument = function(input, docType) {
  if (!input.files.length) return;

  var file = input.files[0];
  var statusEl = document.getElementById('kyc' + (docType === 'rg' ? 'RG' : docType === 'cnpj' ? 'CNPJ' : 'Comp') + 'Status');
  
  // Simula OCR
  var ocrData = WkzKYC.mockOCR(file, docType);
  
  if (docType === 'cnpj') {
    var cnpjValue = ocrData.extractedData.cnpj;
    var validation = WkzKYC.validateCNPJ(cnpjValue);
    statusEl.innerHTML = '✓ CNPJ validado: ' + cnpjValue + ' | Status: ' + validation.status + ' | Risco: ' + validation.riskLevel;
  } else {
    statusEl.innerHTML = '✓ ' + file.name + ' carregado | Confiança OCR: ' + ocrData.confidence + '%';
  }

  wkzLog('[WkzKYC] Processado:', { docType, ocrData });
};

window.wkzSubmitKYC = function() {
  var rg = document.getElementById('kycRG').files.length;
  var cnpj = document.getElementById('kycCNPJ').files.length;
  var comp = document.getElementById('kycComp').files.length;

  if (!rg || !cnpj || !comp) {
    showToast('❌ Preencha todos os documentos obrigatórios.', 'error');
    return;
  }

  var protocol = WkzKYC.generateProtocol();
  
  WkzKYC.state.kycStatus = 'pending';
  WkzKYC.state.timeline.push({
    timestamp: Date.now(),
    status: 'pending',
    message: 'Documentação enviada para verificação'
  });

  showToast('✓ Documentação enviada! Protocolo: ' + protocol + ' | Resposta em até 5 dias úteis.', 'success');
  wkzLog('[WkzKYC] Enviado com protocolo:', protocol);
  
  setTimeout(function() { 
    _wkzModal(null);
    // Atualizar badge
    var badge = document.getElementById('kycStatusBadge');
    if (badge) {
      badge.textContent = 'AGUARDANDO ANÁLISE';
      badge.style.background = 'rgba(245,158,11,0.15)';
      badge.style.color = '#F59E0B';
      badge.style.borderColor = 'rgba(245,158,11,0.3)';
    }
  }, 800);
};

// ─────────────────────────────────────────────────────────────
// Integração com WkzApp
if (typeof WkzApp !== 'undefined') {
  WkzApp.state.kyc = {
    status: 'not-started',
    riskScore: null,
    protocol: null,
    documents: {}
  };

  WkzApp.submitKYC = function(documents) {
    var protocol = WkzKYC.generateProtocol();
    WkzApp.state.kyc.protocol = protocol;
    WkzApp.state.kyc.status = 'pending';
    WkzApp.state.kyc.documents = documents;
    return protocol;
  };

  WkzApp.getKYCStatus = function() {
    return WkzApp.state.kyc.status;
  };

  WkzApp.getRiskScore = function() {
    if (!WkzApp.state.kyc.riskScore) {
      WkzApp.state.kyc.riskScore = WkzKYC.calculateRiskScore();
    }
    return WkzApp.state.kyc.riskScore;
  };
}

wkzLog('[WkzShop v2.9.3] ✓ KYC/KYB Verificação carregado (Upload + OCR mock + CNPJ validation)');

/* ════════════════════════════════════════════════════════════════════════
   STUBS DE SEGURANÇA (auditoria M3) — previnem ReferenceError em botões
   ESTÁTICOS do HTML (sempre presentes no DOM, sem guard de nulo possível
   do lado do onclick) cujas funções reais pertencem a outro módulo ainda
   não construído. [v2.9.39] kzNegSetMargin/kzNegSaveSettings deixaram de
   ser stub (implementação real abaixo) — resta apenas filterDenuncias.
   ════════════════════════════════════════════════════════════════════════ */

/* [v2.9.39] Removida a nota antiga que descrevia a margem do Kz
   Negotiator como "política administrada centralmente pela WeKz,
   pertencente ao Admin (Sprint M4)". Por decisão do fundador, o
   Negociador passou a ser configurável por CADA vendedor — ver
   implementação completa logo abaixo. */
/* kzNegSetMargin/kzNegSaveSettings/kzNegMarginPreview — Kz Smart
   Negotiator. [v2.9.39] Antes eram apenas STUBS (a margem era descrita
   como "administrada centralmente pela WeKz", e kzNegSaveSettings só
   mostrava um toast dizendo "em breve no painel Admin", sem salvar
   nada). Por decisão do fundador, o Negociador agora é configurável
   por CADA vendedor: a margem salva aqui é lida pelo Kz Negotiator do
   comprador (wkz-buyer.js → openKzNegotiator()) via as funções
   compartilhadas kzNegGetSellerConfig()/kzNegSetSellerConfig()
   (definidas em wkz-core.js, mesma origem = mesmo localStorage). */
window.kzNegMarginPreview = function (val) {
  var pct = Math.max(1, Math.min(50, parseFloat(val) || 0));
  var previewEl = document.getElementById('kzNegMarginPreviewEl');
  if (!previewEl) return;
  var exemploPreco = 1000;
  var descontoMax = (exemploPreco * pct / 100).toFixed(2).replace('.', ',');
  previewEl.innerHTML = 'Ex: produto de <strong style="color:var(--text);">R$ 1.000</strong> → desconto máx. <strong style="color:#22C55E;">R$ ' + descontoMax + '</strong>';
};

window.kzNegSetMargin = function (val) {
  var input = document.getElementById('kzNegMarginInput');
  if (input) input.value = val;
  document.querySelectorAll('#kzNegMarginChips .filter-chip').forEach(function (b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('#kzNegMarginChips .filter-chip[onclick*="kzNegSetMargin(' + val + ')"]');
  if (activeBtn) activeBtn.classList.add('active');
  kzNegMarginPreview(val);
};

window.kzNegSaveSettings = function () {
  var input = document.getElementById('kzNegMarginInput');
  var pct = Math.max(1, Math.min(50, parseFloat(input && input.value) || 15));
  var sellerName = (currentSeller && currentSeller.store) || 'Minha Loja Pro';
  if (typeof kzNegSetSellerConfig === 'function') {
    kzNegSetSellerConfig(sellerName, { active: true, maxPct: pct });
  }
  if (typeof showToast === 'function') {
    showToast('✅ Margem do Kz Negotiator salva: até ' + pct + '% de desconto automático para ' + sellerName + '.');
  }
};

/* Preenche os controles do Kz Negotiator com a configuração já salva
   para esta loja, ao abrir a aba "Configurações". */
function initDashSettings() {
  var sellerName = (currentSeller && currentSeller.store) || 'Minha Loja Pro';
  var nameInput = document.getElementById('sellerStoreNameInput');
  if (nameInput && !nameInput.value.trim()) nameInput.value = sellerName;
  if (typeof kzNegGetSellerConfig !== 'function') return;
  var cfg = kzNegGetSellerConfig(sellerName);
  if (cfg && cfg.maxPct) kzNegSetMargin(cfg.maxPct);
}

/* filterDenuncias: botões dentro da aba "Denúncias" do dashboard (HTML
   estático, sempre no DOM). O dado (reportsStore) e a renderização real
   (renderReports) ficaram em wkz-buyer.js no Sprint M2 — arquivo
   diferente, sem acesso cross-file possível sem redesenho. Ver
   CHANGELOG_SPRINT_M3.md. Stub apenas evita o crash ao clicar. */
window.filterDenuncias = function (status, btn) {
  document.querySelectorAll('.rev-filter').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
};



