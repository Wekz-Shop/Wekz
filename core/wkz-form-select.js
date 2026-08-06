/* ════════════════════════════════════════════════════════
   WKZ FORM SELECT — motor único e compartilhado
   Converte todo <select class="form-select"> num botão com o visual
   WeKz (funciona igual em modo claro e escuro, porque usa as mesmas
   variáveis de tema/CSS que o resto do site) em vez do picker nativo
   do sistema operacional/navegador.

   [ORIGEM] Até a v2.9.33 este bloco só existia dentro de wkz-buyer.js,
   copiado e colado (nunca) em wkz-seller.js/wkz-admin.js/wkz-legal.html.
   Resultado: todo <select> fora do buyer renderizava o picker NATIVO do
   Android/Chrome (fundo escuro genérico, sem a cara da WeKz), e
   loadSubcats() em wkz-seller.js já chamava initFormSelects() como se ela
   existisse — só que ela nunca tinha sido carregada ali, o que gerava um
   erro de JS (ReferenceError) toda vez que alguém escolhia uma categoria
   no formulário "Anunciar Produto".

   Agora este arquivo é a ÚNICA fonte do mecanismo. Ele é incluído via
   <script src="../core/wkz-form-select.js"> em TODAS as páginas que têm
   <select>: buyer, seller, admin e legal. Qualquer ajuste futuro no
   comportamento do select customizado só precisa ser feito aqui.

   Requer (já presentes em wkz-styles-full.css, carregado por todas as
   páginas): .wkz-form-select-btn, .wkz-panel, .wkz-panel-header,
   .wkz-panel-list, .wkz-panel-item, .wkz-panel-backdrop.

   Integração opcional: se a página também tiver o painel de
   moeda/idioma da topbar (função _closePanel(), definida hoje só em
   wkz-buyer.js), ele é fechado ao abrir um select para os dois painéis
   nunca ficarem abertos ao mesmo tempo. Em páginas sem esse recurso
   (seller/admin/legal ainda não têm seletor de moeda/idioma funcional —
   ver observação separada), a chamada é pulada com segurança.
   ════════════════════════════════════════════════════════ */
let _wkzFormOpenPanel = null;
let _wkzFormBackdrop  = null;
let _wkzFSCounter     = 0; // contador global → IDs únicos e estáveis

function _closeFormPanel() {
  if(_wkzFormOpenPanel){ _wkzFormOpenPanel.classList.remove('open'); _wkzFormOpenPanel = null; }
  if(_wkzFormBackdrop){ _wkzFormBackdrop.remove(); _wkzFormBackdrop = null; }
  document.querySelectorAll('.wkz-form-select-btn.panel-open').forEach(b => b.classList.remove('panel-open'));
}

function openFormSelect(btnEl) {
  // Toggle se já aberto
  if(btnEl.classList.contains('panel-open')){ _closeFormPanel(); return; }
  _closeFormPanel();
  if(typeof _closePanel === 'function') _closePanel(); // fecha painéis da topbar também, se existirem nesta página

  // O <select> oculto é guardado via data-select-id
  const selectId = btnEl.dataset.selectId;
  const selectEl = document.getElementById(selectId);
  if(!selectEl) return;

  const options    = Array.from(selectEl.options);
  const currentVal = selectEl.value;
  const icon       = btnEl.dataset.icon  || _FS_ICO.clipboard;
  const title      = btnEl.dataset.title || 'Selecione';
  const panelId    = 'wkzFSPanel_' + btnEl.dataset.fsId;

  // z-index dinâmico: sobe acima de qualquer modal aberto (CSS + inline)
  // Usa getComputedStyle para capturar z-index definido via CSS puro (ex: #report-modal-overlay z-index:9999)
  const _allZ = Array.from(document.querySelectorAll('*'))
    .filter(el => {
      const s = window.getComputedStyle(el);
      return s.position !== 'static' && s.display !== 'none' && s.visibility !== 'hidden';
    })
    .map(el => parseInt(window.getComputedStyle(el).zIndex) || 0);
  const topZ = Math.max(10000, ..._allZ) + 10;

  // Cria/recria painel
  let panel = document.getElementById(panelId);
  if(!panel){
    panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'wkz-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="wkz-panel-header">
      <span class="wkz-panel-header-icon">${icon}</span>
      <span class="wkz-panel-header-title">${title}</span>
    </div>
    <div class="wkz-panel-list">
      ${options.map((opt) => {
        const isActive = currentVal !== '' ? opt.value === currentVal : false;
        // Guarda o value no data-attr para recuperar depois
        const safeVal = opt.value.replace(/'/g,"&apos;");
        const safeText = opt.text.replace(/'/g,"&apos;");
        return `<div class="wkz-panel-item${isActive ? ' active' : ''}"
          data-val="${safeVal}" data-text="${safeText}"
          onclick="wkzFormSelectItem(this,'${panelId}')">
          <div class="wkz-panel-item-info">
            <div class="wkz-panel-item-code">${opt.text}</div>
          </div>
          <div class="wkz-panel-item-check">${isActive ? '✓' : ''}</div>
        </div>`;
      }).join('')}
    </div>`;

  // Posicionamento: abaixo do botão, ou acima se não couber
  const rect   = btnEl.getBoundingClientRect();
  const panelW = Math.max(rect.width, 260);
  let left = rect.left;
  if(left + panelW > window.innerWidth - 12) left = window.innerWidth - panelW - 12;
  if(left < 8) left = 8;
  const estH       = Math.min(options.length * 46 + 60, 380);
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const top        = spaceBelow >= estH ? rect.bottom + 6 : rect.top - estH - 6;
  panel.style.cssText = `top:${Math.max(8,top)}px;left:${left}px;width:${panelW}px;position:fixed;z-index:${topZ};`;

  // Backdrop transparente (fecha ao clicar fora)
  _wkzFormBackdrop = document.createElement('div');
  _wkzFormBackdrop.className = 'wkz-panel-backdrop';
  _wkzFormBackdrop.style.cssText = `position:fixed;inset:0;z-index:${topZ - 1};background:transparent;`;
  _wkzFormBackdrop.onclick = _closeFormPanel;
  document.body.appendChild(_wkzFormBackdrop);

  btnEl.classList.add('panel-open');
  _wkzFormOpenPanel = panel;
  requestAnimationFrame(() => panel.classList.add('open'));
}

function wkzFormSelectItem(itemEl, panelId) {
  const val  = itemEl.dataset.val;
  const text = itemEl.dataset.text;

  // Encontra o botão pelo panelId
  const fsId = panelId.replace('wkzFSPanel_','');
  const btn  = document.querySelector(`.wkz-form-select-btn[data-fs-id="${fsId}"]`);
  if(btn){
    const selectEl = document.getElementById(btn.dataset.selectId);
    if(selectEl){
      // Atualiza o <select> oculto e dispara change (para onchange handlers existentes)
      selectEl.value = val !== '' ? val : text;
      if(selectEl.value === '' && val === ''){
        // fallback: seleciona pelo texto
        const opt = Array.from(selectEl.options).find(o => o.text === text);
        if(opt) selectEl.selectedIndex = opt.index;
      }
      selectEl.dispatchEvent(new Event('change'));
    }
    // Atualiza label do botão
    const lbl = btn.querySelector('.fsb-label');
    lbl.textContent = text;
    lbl.classList.remove('placeholder');
  }

  // Atualiza visual dos itens do painel
  const panel = document.getElementById(panelId);
  if(panel){
    panel.querySelectorAll('.wkz-panel-item').forEach(it => {
      const active = it === itemEl;
      it.classList.toggle('active', active);
      it.querySelector('.wkz-panel-item-check').textContent = active ? '✓' : '';
    });
  }
  _closeFormPanel();
}

/* ════════════════════════════════════════════════════════════════════
   [FIX-emoji-audit v1.0] Ícones SVG (substituem os emojis nativos que
   ficavam ao lado do título de CADA select customizado do site inteiro —
   este ficheiro é compartilhado por comprador, vendedor e admin, então
   um único emoji trocado aqui já resolve todos os dropdowns de uma vez).
   Mesmo estilo visual do CP_ICO em wkz-core.js (Meu Perfil): traço único,
   sem preenchimento, 1em, para herdar o tamanho da fonte ao redor. As
   formas em si são um dicionário próprio (não reutilizam CP_ICO porque
   ele vive dentro de um IIFE fechado em wkz-core.js, sem acesso externo).
   ════════════════════════════════════════════════════════════════════ */
function _fsIco(paths) {
  return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;display:inline-block;flex-shrink:0;" aria-hidden="true">' + paths + '</svg>';
}
const _FS_ICO = {
  store:     _fsIco('<path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0"/><path d="M5 9v10h14V9"/>'),
  factory:   _fsIco('<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>'),
  folder:    _fsIco('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
  globe:     _fsIco('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>'),
  package:   _fsIco('<path d="M16.5 9.4L7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>'),
  barchart:  _fsIco('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
  key:       _fsIco('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  bank:      _fsIco('<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 21 7 3 7"/>'),
  sync:      _fsIco('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>'),
  idcard:    _fsIco('<rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><circle cx="8" cy="10" r="2"/><line x1="14" y1="9" x2="18" y2="9"/><line x1="14" y1="13" x2="18" y2="13"/><line x1="6" y1="16" x2="18" y2="16"/>'),
  card:      _fsIco('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  truck:     _fsIco('<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 00-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  shield:    _fsIco('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  money:     _fsIco('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  clipboard: _fsIco('<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'),
  headset:   _fsIco('<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>'),
  sort:      _fsIco('<polyline points="7 10 12 5 17 10"/><polyline points="7 14 12 19 17 14"/>'),
  flag:      _fsIco('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
  receipt:   _fsIco('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  file:      _fsIco('<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>'),
  mappin:    _fsIco('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'),
  warning:   _fsIco('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
};

/* Mapa de ícones por label — antes emoji, agora chaves de _FS_ICO acima.
   [FIX-emoji-audit v1.0] Único dicionário para todo <select> do site
   (compra, venda, admin); trocar aqui já resolve todos de uma vez. */
const _WKZ_FS_ICONS = {
  'Tipo de Vendedor':_FS_ICO.store,'Tipo de Fornecedor':_FS_ICO.factory,'Categoria Principal':_FS_ICO.folder,
  'Categoria':_FS_ICO.folder,'Subcategoria':_FS_ICO.folder,'País de Operação':_FS_ICO.globe,'País de Origem':_FS_ICO.globe,
  'País de destino':_FS_ICO.globe,'Volume mensal':_FS_ICO.package,'Capacidade Mensal':_FS_ICO.barchart,
  'Chave Pix':_FS_ICO.key,'Banco':_FS_ICO.bank,'Ciclo de Repasse':_FS_ICO.sync,'Tipo de documento':_FS_ICO.idcard,
  'Parcelas':_FS_ICO.card,'Prazo de envio':_FS_ICO.truck,'Transportadora':_FS_ICO.truck,'Garantia':_FS_ICO.shield,'Faturamento':_FS_ICO.money,
  'Volume de Negócios':_FS_ICO.money,'Tipo de solicitação':_FS_ICO.clipboard,'Suporte':_FS_ICO.headset,
  'Moeda':_FS_ICO.money,'Idioma':_FS_ICO.globe,'Ordenar':_FS_ICO.sort,'Motivo':_FS_ICO.flag,'denúncia':_FS_ICO.flag,
  'enquadramento':_FS_ICO.receipt,'Formato':_FS_ICO.file,'Estado':_FS_ICO.mappin,'País':_FS_ICO.globe,'ocorrência':_FS_ICO.flag,
  'página':_FS_ICO.file,'Tipo de Problema':_FS_ICO.warning,'Violação':_FS_ICO.flag
};
function _fsIcon(labelStr){
  for(const [k,v] of Object.entries(_WKZ_FS_ICONS)){
    if(labelStr.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return _FS_ICO.clipboard;
}

/* ─── Sincroniza o label do botão com o estado atual do <select> ───
   Usada tanto na conversão inicial quanto pelos hooks de value/
   selectedIndex/innerHTML abaixo. Também atualiza o item ativo no
   painel, se ele já tiver sido montado antes (evita o painel abrir
   mostrando o check na opção errada depois de um reset externo). */
function _wkzSyncFormSelectLabel(sel){
  const btn = document.querySelector(`.wkz-form-select-btn[data-select-id="${sel.id}"]`);
  if(!btn) return;
  const opt        = sel.options[sel.selectedIndex];
  const labelText  = opt ? opt.text : '';
  const isPlaceholder = opt && (
    labelText.toLowerCase().includes('selecione') ||
    labelText.toLowerCase().includes('selecionar') ||
    opt.value === ''
  );
  const lbl = btn.querySelector('.fsb-label');
  if(lbl){
    lbl.textContent = labelText || 'Selecione...';
    lbl.classList.toggle('placeholder', !!isPlaceholder);
  }
  const panelId = 'wkzFSPanel_' + btn.dataset.fsId;
  const panel = document.getElementById(panelId);
  if(panel){
    panel.querySelectorAll('.wkz-panel-item').forEach(it => {
      const active = it.dataset.val === sel.value;
      it.classList.toggle('active', active);
      const check = it.querySelector('.wkz-panel-item-check');
      if(check) check.textContent = active ? '✓' : '';
    });
  }
}

/* ─── Inicializa: converte select.form-select → botão customizado ─── */
function initFormSelects() {
  document.querySelectorAll('select.form-select').forEach((sel) => {
    // Pula se já foi convertido
    if(sel.dataset.fsId) return;
    // Pula selects de data se ainda não foram populados com opções reais
    if(['r1bDay','r1bMon','r1bYear'].includes(sel.id) && sel.options.length <= 1) return;

    // ID estável baseado em contador global
    const fsId = 'fs' + (++_wkzFSCounter);
    // Garante que o select tenha um id para referência
    if(!sel.id) sel.id = 'wkzSelEl_' + fsId;
    sel.dataset.fsId = fsId;

    const currentOpt    = sel.options[sel.selectedIndex];
    const labelText     = currentOpt ? currentOpt.text : '';
    const isPlaceholder = currentOpt && (
      labelText.toLowerCase().includes('selecione') ||
      labelText.toLowerCase().includes('selecionar') ||
      currentOpt.value === ''
    );

    // Descobre label e ícone pelo contexto
    const fg       = sel.closest('.form-group');
    const labelEl  = fg ? fg.querySelector('.form-label') : null;
    const labelStr = sel.dataset.title || (labelEl ? labelEl.textContent.trim().replace(/\*$/,'').trim() : 'Selecione');
    const icon     = sel.dataset.icon  || _fsIcon(labelStr);

    // Oculta o select original (mas mantém no DOM para onchange handlers)
    sel.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden;';

    // Cria o botão customizado
    const btn = document.createElement('button');
    btn.type  = 'button';
    // Repassa as variantes de tamanho/estilo do select (--sm, --lg, --searchbar,
    // --danger etc.) para o botão, para que ele herde o mesmo dimensionamento
    // e não vire sempre um botão "grande" width:100% independente do contexto
    // onde o <select> original estava (ex.: dentro da barra de busca).
    const variantClasses = Array.from(sel.classList).filter(c => c.startsWith('wkz-select--'));
    btn.className = ['wkz-form-select-btn', ...variantClasses].join(' ');
    btn.dataset.fsId     = fsId;
    btn.dataset.selectId = sel.id;
    btn.dataset.icon     = icon;
    btn.dataset.title    = labelStr;
    btn.innerHTML = `<span class="fsb-label${isPlaceholder ? ' placeholder' : ''}">${labelText || 'Selecione...'}</span><span class="fsb-caret">▾</span>`;
    btn.addEventListener('click', function(e){ e.preventDefault(); openFormSelect(this); });

    sel.parentNode.insertBefore(btn, sel);

    /* [FIX v? — label desatualizado] Mantém o label do botão sempre em
       sincronia com o <select> escondido, não importa COMO o valor muda:
       - pelo painel (wkzFormSelectItem, já atualizava o label na mão)
       - por código externo fazendo `sel.value = 'x'` direto (ex.: reset
         de filtro ao abrir uma categoria/loja nova)
       - por `sel.selectedIndex = n`
       - substituindo as <option> inteiras via innerHTML (ex.: lista de
         Estado/País populada depois, por renderCatOriginOptions())
       Antes disso, qualquer um desses três casos deixava o botão
       "congelado" mostrando um valor antigo até o usuário abrir o
       painel de novo. Interceptar o setter de value/selectedIndex cobre
       os dois primeiros; o MutationObserver cobre a troca de opções. */
    _wkzSyncFormSelectLabel(sel);
    try {
      const nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      const nativeIdxDesc   = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
      Object.defineProperty(sel, 'value', {
        get(){ return nativeValueDesc.get.call(sel); },
        set(v){ nativeValueDesc.set.call(sel, v); _wkzSyncFormSelectLabel(sel); },
        configurable: true
      });
      Object.defineProperty(sel, 'selectedIndex', {
        get(){ return nativeIdxDesc.get.call(sel); },
        set(v){ nativeIdxDesc.set.call(sel, v); _wkzSyncFormSelectLabel(sel); },
        configurable: true
      });
    } catch(e) { /* select de outro widget já ter sobrescrito value/selectedIndex — ignora, não quebra o resto */ }
    const mo = new MutationObserver(() => _wkzSyncFormSelectLabel(sel));
    mo.observe(sel, { childList: true, subtree: true });
  });
}

document.addEventListener('DOMContentLoaded', initFormSelects);
