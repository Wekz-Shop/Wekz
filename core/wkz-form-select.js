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
  const icon       = btnEl.dataset.icon  || '📋';
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

/* Mapa de ícones por label */
const _WKZ_FS_ICONS = {
  'Tipo de Vendedor':'🏪','Tipo de Fornecedor':'🏭','Categoria Principal':'🗂️',
  'Categoria':'🗂️','Subcategoria':'📂','País de Operação':'🌍','País de Origem':'🌍',
  'País de destino':'🌍','Volume mensal':'📦','Capacidade Mensal':'📊',
  'Chave Pix':'🔑','Banco':'🏦','Ciclo de Repasse':'🔄','Tipo de documento':'🪪',
  'Parcelas':'💳','Prazo de envio':'🚚','Garantia':'🛡️','Faturamento':'💰',
  'Volume de Negócios':'💰','Tipo de solicitação':'📋','Suporte':'🎧',
  'Moeda':'💲','Idioma':'🌐','Ordenar':'↕️','Motivo':'⚑','denúncia':'⚑',
  'enquadramento':'🧾','Formato':'📄','Estado':'📍','País':'🌍','ocorrência':'⚑'
};
function _fsIcon(labelStr){
  for(const [k,v] of Object.entries(_WKZ_FS_ICONS)){
    if(labelStr.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '📋';
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
  });
}

document.addEventListener('DOMContentLoaded', initFormSelects);
