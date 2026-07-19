/* ══════════════════════════════════════════════════════════════════════
   WKZ-FLASHSALE-MODAL.JS
   Componente: WKZ Flash Sale Modal
   Extensão isolada — segue o princípio Zero Rewrite: nenhuma função
   existente (renderFlash, renderFlashHero, renderProducts, tick,
   showPage, getKzSVG, btnFeedback, WkzBus...) é alterada ou
   substituída. Este arquivo apenas LÊ essas funções/variáveis quando
   disponíveis (com guarda defensiva) e CRIA extensões novas.

   Carregar depois de: wkz-bus.js, wkz-core.js, wkz-buyer.js
   (precisa de FLASH_END, getKzSVG, showPage e WkzBus se existirem —
   mas funciona com fallback mesmo se algum deles faltar).

   Funções expostas (API pública do componente):
     wkzFlashSaleModal()   -> constrói o DOM do modal (idempotente)
     openFlashSaleModal()  -> abre e dispara a sequência de animação
     closeFlashSaleModal() -> fecha e limpa listeners/intervals
     startFlashCountdown() -> inicia o contador HH:MM:SS do modal
     animateKzEntrance()   -> dispara a entrada do mascote KZ

   v1.2 — Changelog desta revisão:
     Tarefa 1: botão fechar agora fica FORA do wrapper com scroll
               (.wkz-fsm-scroll), então nunca mais "some" ao rolar.
     Tarefa 2: gatilhos automáticos (scroll 50% / exit intent) com
               sessionStorage, + seção de Produto Isca configurável.
     Tarefa 3: paleta neon fixa (exceção de tokens só deste modal,
               ver bloco "EXCEÇÃO DE TOKENS" abaixo) + placa/raios
               separados removidos — a arte já traz tudo embutido.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Estado interno do componente (privado, prefixo _wkzFsm) ──────────── */
var _wkzFsmCountdownInterval = null;
var _wkzFsmSocialInterval = null;
var _wkzFsmPrevFocus = null;
var _wkzFsmFallbackEnd = null;
var _wkzFsmAutoListenersRemoved = false;
var _wkzFsmScrollTicking = false;

/* ── EXCEÇÃO ARQUITETÔNICA — mascote em <img> (só este modal) ─────────
   O sprite SVG único (#kz-mascot-full / getKzSVG) continua sendo a
   identidade oficial do Kz em todo o resto do site. Aqui, e SOMENTE
   aqui, a arte "hero" da campanha (alta-fidelidade, com efeitos de
   luz/textura que um SVG simplificado não reproduz) é carregada via
   <img>. Troque WKZ_FSM_MASCOT_IMG_URL pelo asset final hospedado —
   pode ser sobrescrita ANTES de este script carregar, sem editar o
   arquivo:
     <script>window.WKZ_FSM_MASCOT_IMG_URL = "./flash-sale.png";</script>
   Se a imagem falhar, _wkzFsmMascotImgError() troca automaticamente
   para o sprite SVG #kz-mascot-full — o modal nunca fica quebrado. */
var WKZ_FSM_MASCOT_IMG_URL = window.WKZ_FSM_MASCOT_IMG_URL || './flash-sale.png';
function _wkzFsmMascotImgError(imgEl) {
  if (!imgEl) return;
  imgEl.onerror = null;
  var fallback = document.createElement('span');
  fallback.className = 'wkz-fsm-mascot-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.innerHTML = (typeof getKzSVG === 'function')
    ? getKzSVG(150)
    : '<svg width="150" height="150" viewBox="0 0 100 100" class="kz-svg" role="img" aria-label="Kz, o Lince Cibernético"><use href="#kz-mascot-full"/></svg>';
  if (imgEl.parentNode) imgEl.parentNode.replaceChild(fallback, imgEl);
}

/* ── TAREFA 2 — Produto Isca (Hero Product) ────────────────────────────
   Edição manual e rápida: troque os campos abaixo a qualquer momento.
   image: pode ser uma URL do GitHub (mesma pasta do flash-sale.png)
   ou, para testar agora, um placeholder tipo https://picsum.photos/...

   productIndex: ÍNDICE REAL do produto em products[] (array já usado
   pelo resto do site). Quando definido e válido, nome/imagem/preços
   passam a vir DIRETO do catálogo real (os campos abaixo viram só
   fallback caso o índice não exista) — evita a isca mostrar um preço
   desatualizado. Pra descobrir o índice: abra o DevTools no site e
   rode `products.findIndex(p => p.n.includes("nome do produto"))`.

   buyAction: o que "Comprar Agora" faz quando productIndex é real:
     'product' (padrão) → mesmo padrão já usado no botão "Comprar" dos
                cards de produto: abre a PDP real com openProduct(i)
                + toast "Redirecionando para compra..."
     'cart'    → adiciona direto no carrinho com addToCart(i)
   Sem productIndex válido, cai no fallback productUrl/pg-flash. */
var wkzFsmHeroProduct = {
  productIndex: 0,       // 0 = primeiro produto do catálogo — troque pelo índice do produto que quer destacar
  buyAction: 'product',  // 'product' ou 'cart'
  name: 'Smartphone Ultra Pro 5G 256GB',
  image: 'https://picsum.photos/seed/wkz-flash-hero/240/240',
  oldPrice: 'R$ 5.999,00',
  flashPrice: 'R$ 3.499,00',
  discountLabel: '-42%',
  productUrl: null,      // fallback se productIndex não existir: nome de página (showPage) ou URL externa
  onBuyClick: null       // opcional: function(product){ ... } — se definida, tem prioridade total
};

/* Rotação automática OPCIONAL por janela de horário (0-23h, 24 = meia-noite).
   Deixe a lista vazia ([]) para desativar e usar sempre wkzFsmHeroProduct
   acima. Se preenchida, o primeiro item cuja janela contém a hora atual
   substitui o produto — dá pra trocar a isca de manhã/tarde/noite sem
   precisar de backend. */
var wkzFsmHeroProductSchedule = [
  // Exemplo (descomente e ajuste para ativar):
  // { startHour: 0,  endHour: 12, product: { productIndex: 3, buyAction: 'product', name: 'Fone Bluetooth ANC Pro', image: 'https://picsum.photos/seed/wkz-manha/240/240', oldPrice: 'R$ 399,00', flashPrice: 'R$ 219,00', discountLabel: '-45%' } },
  // { startHour: 12, endHour: 24, product: { productIndex: 7, buyAction: 'cart', name: 'Smartwatch Ultra 2', image: 'https://picsum.photos/seed/wkz-tarde/240/240', oldPrice: 'R$ 899,00', flashPrice: 'R$ 549,00', discountLabel: '-39%' } }
];

/* Resolve o produto ativo (agenda > padrão) e, se productIndex apontar
   para um item real de products[], sobrepõe nome/imagem/preços com os
   dados reais do catálogo — a isca nunca fica com preço desatualizado. */
function _wkzFsmResolveHeroProduct() {
  var base = wkzFsmHeroProduct;
  if (wkzFsmHeroProductSchedule && wkzFsmHeroProductSchedule.length) {
    var h = new Date().getHours();
    for (var i = 0; i < wkzFsmHeroProductSchedule.length; i++) {
      var slot = wkzFsmHeroProductSchedule[i];
      if (slot && slot.product && h >= slot.startHour && h < slot.endHour) { base = slot.product; break; }
    }
  }

  if (typeof base.productIndex === 'number' && typeof products !== 'undefined' && products && products[base.productIndex]) {
    var p = products[base.productIndex];
    var hasOldPrice = typeof p.op === 'number' && p.op > p.p;
    return {
      productIndex: base.productIndex,
      buyAction: base.buyAction || 'product',
      name: p.n || base.name,
      image: p.img || base.image,
      oldPrice: hasOldPrice ? (typeof formatPrice === 'function' ? formatPrice(p.op) : ('R$ ' + p.op)) : base.oldPrice,
      flashPrice: typeof formatPrice === 'function' ? formatPrice(p.p) : ('R$ ' + p.p),
      discountLabel: p.off ? ('-' + Math.floor(p.off) + '%') : base.discountLabel,
      productUrl: base.productUrl,
      onBuyClick: base.onBuyClick
    };
  }
  return base;
}

function _wkzFsmBuildHeroProductHTML(product) {
  if (!product) return '';
  var discount = product.discountLabel
    ? '<span class="wkz-fsm-hero-product-discount">' + product.discountLabel + '</span>'
    : '';
  return (
    '<div class="wkz-fsm-hero-product" id="wkzFsmHeroProduct">' +
      '<div class="wkz-fsm-hero-product-media">' +
        '<img src="' + product.image + '" alt="' + product.name + '" loading="lazy" ' +
        'onerror="this.closest(\'.wkz-fsm-hero-product\').classList.add(\'wkz-fsm-hero-product-noimg\')" />' +
        discount +
      '</div>' +
      '<div class="wkz-fsm-hero-product-info">' +
        '<span class="wkz-fsm-hero-product-tag">' + _wkzFsmIcon('bolt') + ' Oferta Relâmpago</span>' +
        '<p class="wkz-fsm-hero-product-name">' + product.name + '</p>' +
        '<div class="wkz-fsm-hero-product-prices">' +
          '<span class="wkz-fsm-hero-product-old">' + product.oldPrice + '</span>' +
          '<span class="wkz-fsm-hero-product-flash">' + product.flashPrice + '</span>' +
        '</div>' +
        '<button type="button" class="wkz-fsm-hero-product-cta" id="wkzFsmHeroProductBtn">Comprar Agora</button>' +
      '</div>' +
    '</div>'
  );
}

/* ── SVG inline (sem emojis, mesmo padrão visual dos demais ícones) ──── */
function _wkzFsmIcon(name) {
  var icons = {
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    bolt: '<polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    cashback: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || '') + '</svg>';
}

/**
 * wkzFlashSaleModal()
 * Constrói o markup do modal e injeta no <body> (uma única vez).
 * Não faz nada se o modal já existir — função idempotente e
 * independente das demais.
 *
 * Estrutura (Tarefa 1 — fix do botão fechar):
 *   #wkzFsmModal (não rola)
 *     .wkz-fsm-close        <- FORA do wrapper de rolagem: fica fixo
 *     #wkzFsmScroll (rola)  <- só o conteúdo interno rola
 *       .wkz-fsm-layout (mascote + conteúdo)
 */
function wkzFlashSaleModal() {
  if (document.getElementById('wkzFlashSaleOverlay')) return document.getElementById('wkzFlashSaleOverlay');

  var heroProduct = _wkzFsmResolveHeroProduct();
  var heroProductHTML = _wkzFsmBuildHeroProductHTML(heroProduct);

  var visualHTML =
    '<div class="wkz-fsm-visual" id="wkzFsmStage">' +
      '<div class="wkz-fsm-visual-glow" aria-hidden="true"></div>' +
      '<div class="wkz-fsm-mascot" id="wkzFsmMascot">' +
        '<img id="wkzFsmMascotImg" class="wkz-fsm-mascot-img" src="' + WKZ_FSM_MASCOT_IMG_URL + '" ' +
        'alt="Kz, o Lince Cibernético segurando a placa Flash Sale" draggable="false" ' +
        'onerror="_wkzFsmMascotImgError(this)" />' +
        '<span class="wkz-fsm-mascot-shine" aria-hidden="true"></span>' +
      '</div>' +
    '</div>';

  var contentHTML =
    '<div class="wkz-fsm-content">' +
      '<span class="wkz-fsm-kicker">' + _wkzFsmIcon('bolt') + ' FLASH SALE</span>' +
      '<h2 class="wkz-fsm-title" id="wkzFsmTitle">WKZ</h2>' +
      '<p class="wkz-fsm-subtitle" id="wkzFsmSubtitle">As melhores ofertas selecionadas pelo KZ estão disponíveis por tempo limitado.</p>' +

      '<div class="wkz-fsm-countdown" aria-live="polite" aria-atomic="true">' +
        '<div class="wkz-fsm-count-block"><span id="wkzFsmCh">00</span><label>Horas</label></div>' +
        '<span class="wkz-fsm-count-sep">:</span>' +
        '<div class="wkz-fsm-count-block"><span id="wkzFsmCm">00</span><label>Minutos</label></div>' +
        '<span class="wkz-fsm-count-sep">:</span>' +
        '<div class="wkz-fsm-count-block"><span id="wkzFsmCs">00</span><label>Segundos</label></div>' +
      '</div>' +

      '<div class="wkz-fsm-social">' + _wkzFsmIcon('users') +
        '<span><strong id="wkzFsmSocialCount">0</strong> pessoas comprando agora</span>' +
        '<span class="wkz-fsm-social-pulse" aria-hidden="true"></span>' +
      '</div>' +

      heroProductHTML +

      '<div class="wkz-fsm-benefits">' +
        '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('truck') + '</span>' +
          '<span class="wkz-fsm-benefit-text"><strong>Frete Grátis</strong><em>Acima de R$150</em></span></div>' +
        '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('cashback') + '</span>' +
          '<span class="wkz-fsm-benefit-text"><strong>Cashback</strong><em>Dinheiro de volta</em></span></div>' +
        '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('card') + '</span>' +
          '<span class="wkz-fsm-benefit-text"><strong>Parcelamento</strong><em>Até 12x sem juros</em></span></div>' +
      '</div>' +

      '<div class="wkz-fsm-cta-row">' +
        '<button type="button" class="wkz-fsm-cta-primary" id="wkzFsmPrimaryBtn">Explorar Ofertas ' + _wkzFsmIcon('arrow') + '</button>' +
        '<button type="button" class="wkz-fsm-cta-secondary" id="wkzFsmSecondaryBtn">Continuar navegando</button>' +
      '</div>' +

      '<div class="wkz-fsm-trust">' + _wkzFsmIcon('shield') +
        '<span>Compra segura, transparente e protegida pelo <strong>KZ</strong></span>' +
      '</div>' +
    '</div>';

  var overlay = document.createElement('div');
  overlay.id = 'wkzFlashSaleOverlay';
  overlay.className = 'wkz-fsm-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML =
    '<div class="wkz-fsm-modal" id="wkzFsmModal" role="dialog" aria-modal="true" ' +
    'aria-label="Flash Sale WKZ — oferta por tempo limitado" aria-describedby="wkzFsmSubtitle" tabindex="-1">' +
      '<div class="wkz-fsm-modal-glow" aria-hidden="true"></div>' +
      '<button type="button" class="wkz-fsm-close" id="wkzFsmCloseBtn" aria-label="Fechar Flash Sale">' + _wkzFsmIcon('close') + '</button>' +
      '<div class="wkz-fsm-scroll" id="wkzFsmScroll">' +
        '<div class="wkz-fsm-layout">' + visualHTML + contentHTML + '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  /* Wiring interno — só precisa ser feito uma vez, no momento da criação */
  var closeBtn = document.getElementById('wkzFsmCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeFlashSaleModal);

  var secondaryBtn = document.getElementById('wkzFsmSecondaryBtn');
  if (secondaryBtn) secondaryBtn.addEventListener('click', closeFlashSaleModal);

  var primaryBtn = document.getElementById('wkzFsmPrimaryBtn');
  if (primaryBtn) {
    primaryBtn.addEventListener('click', function () {
      closeFlashSaleModal();
      setTimeout(function () {
        if (typeof showPage === 'function') showPage('pg-flash');
        if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
          window.WkzBus.emit('flashsale:cta:explore', {});
        }
      }, 260);
    });
  }

  var heroBtn = document.getElementById('wkzFsmHeroProductBtn');
  if (heroBtn) {
    heroBtn.addEventListener('click', function () {
      var product = _wkzFsmResolveHeroProduct();
      if (typeof product.onBuyClick === 'function') { product.onBuyClick(product); return; }

      var hasRealProduct = typeof product.productIndex === 'number'
        && typeof products !== 'undefined' && products && products[product.productIndex];

      closeFlashSaleModal();
      setTimeout(function () {
        if (hasRealProduct && product.buyAction === 'cart') {
          if (typeof addToCart === 'function') addToCart(product.productIndex);
        } else if (hasRealProduct) {
          /* mesmo padrão já usado no botão "Comprar" dos cards de produto */
          if (typeof openProduct === 'function') openProduct(product.productIndex);
          if (typeof showToast === 'function') showToast('Redirecionando para compra...');
        } else if (product.productUrl && typeof showPage === 'function') {
          showPage(product.productUrl);
        } else if (product.productUrl) {
          window.location.href = product.productUrl;
        } else if (typeof showPage === 'function') {
          showPage('pg-flash'); // fallback: productIndex ainda não aponta pra um produto real
        }
        if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
          window.WkzBus.emit('flashsale:hero-product:buy', { product: product });
        }
      }, 260);
    });
  }

  return overlay;
}

/**
 * animateKzEntrance()
 * Dispara a entrada do mascote (fade + scale + glow ambiente + brilho
 * nos óculos) apenas ligando a classe de estado — a coreografia é
 * resolvida via CSS/keyframes em wkz-flashsale-modal.css. Função
 * independente: pode ser chamada de novo a qualquer momento para
 * "re-tocar" a entrada.
 */
function animateKzEntrance() {
  var stage = document.getElementById('wkzFsmStage');
  if (!stage) return;
  /* reflow para permitir retrigger da animação se já estava ativa */
  stage.classList.remove('wkz-fsm-stage-active');
  void stage.offsetWidth;
  stage.classList.add('wkz-fsm-stage-active');
}

/**
 * startFlashCountdown()
 * Liga o contador HH:MM:SS do modal. Reaproveita a âncora FLASH_END
 * já usada por tick() (wkz-buyer.js) quando disponível — mesmo prazo
 * do banner/hero/página Flash Sale, sem duplicar a regra de negócio.
 * Se FLASH_END não existir, cria um fallback local de 3h.
 */
function startFlashCountdown() {
  var end = (typeof FLASH_END !== 'undefined' && FLASH_END)
    ? FLASH_END
    : (_wkzFsmFallbackEnd || (_wkzFsmFallbackEnd = new Date(Date.now() + 3 * 60 * 60 * 1000)));

  function tickFsm() {
    var diff = end - new Date();
    if (diff <= 0) diff = 0;
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    var ch = document.getElementById('wkzFsmCh'); if (ch) ch.textContent = String(h).padStart(2, '0');
    var cm = document.getElementById('wkzFsmCm'); if (cm) cm.textContent = String(m).padStart(2, '0');
    var cs = document.getElementById('wkzFsmCs'); if (cs) cs.textContent = String(s).padStart(2, '0');
  }

  tickFsm();
  if (_wkzFsmCountdownInterval) clearInterval(_wkzFsmCountdownInterval);
  _wkzFsmCountdownInterval = setInterval(tickFsm, 1000);
}

/* ── Prova social animada (número sobe até o alvo e depois oscila) ────── */
function _wkzFsmStartSocialProof() {
  var el = document.getElementById('wkzFsmSocialCount');
  if (!el) return;
  var target = 1284;
  var current = 0;
  var stepVal = Math.max(1, Math.round(target / 22));

  if (_wkzFsmSocialInterval) clearInterval(_wkzFsmSocialInterval);

  _wkzFsmSocialInterval = setInterval(function () {
    current += stepVal;
    if (current >= target) {
      current = target;
      el.textContent = current.toLocaleString('pt-BR');
      clearInterval(_wkzFsmSocialInterval);
      _wkzFsmSocialInterval = setInterval(function () {
        var cur = parseInt((el.textContent || '').replace(/\D/g, ''), 10) || target;
        var delta = Math.floor(Math.random() * 9) - 4;
        var next = Math.max(Math.floor(target * 0.85), Math.min(Math.floor(target * 1.15), cur + delta));
        el.textContent = next.toLocaleString('pt-BR');
      }, 3500);
      return;
    }
    el.textContent = current.toLocaleString('pt-BR');
  }, 35);
}

/* ── Acessibilidade: fechar no ESC + focus trap dentro do modal ───────── */
function _wkzFsmKeydownHandler(e) {
  if (e.key === 'Escape') { closeFlashSaleModal(); return; }
  if (e.key !== 'Tab') return;
  var modal = document.getElementById('wkzFsmModal');
  if (!modal) return;
  var focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function _wkzFsmOverlayClickHandler(e) {
  if (e.target && e.target.id === 'wkzFlashSaleOverlay') closeFlashSaleModal();
}

/**
 * openFlashSaleModal()
 * Ponto de entrada público principal.
 */
function openFlashSaleModal() {
  var overlay = wkzFlashSaleModal();
  if (!overlay) return;

  _wkzFsmPrevFocus = document.activeElement;

  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  document.addEventListener('keydown', _wkzFsmKeydownHandler);
  overlay.addEventListener('click', _wkzFsmOverlayClickHandler);

  setTimeout(animateKzEntrance, 150);

  startFlashCountdown();
  _wkzFsmStartSocialProof();

  var modal = document.getElementById('wkzFsmModal');
  if (modal) modal.focus();

  if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
    window.WkzBus.emit('flashsale:modal:open', {});
  }
  if (typeof kzPlaySound === 'function') kzPlaySound('boost_open');
}

/**
 * closeFlashSaleModal()
 * Fecha o modal e desfaz TUDO que foi ligado em openFlashSaleModal().
 */
function closeFlashSaleModal() {
  var overlay = document.getElementById('wkzFlashSaleOverlay');
  if (!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  document.removeEventListener('keydown', _wkzFsmKeydownHandler);
  overlay.removeEventListener('click', _wkzFsmOverlayClickHandler);

  if (_wkzFsmCountdownInterval) { clearInterval(_wkzFsmCountdownInterval); _wkzFsmCountdownInterval = null; }
  if (_wkzFsmSocialInterval) { clearInterval(_wkzFsmSocialInterval); _wkzFsmSocialInterval = null; }

  var stage = document.getElementById('wkzFsmStage');
  if (stage) stage.classList.remove('wkz-fsm-stage-active');

  if (_wkzFsmPrevFocus && typeof _wkzFsmPrevFocus.focus === 'function') {
    _wkzFsmPrevFocus.focus();
  }
  _wkzFsmPrevFocus = null;

  if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
    window.WkzBus.emit('flashsale:modal:close', {});
  }
}

/* ══════════════════════════════════════════════════════════════════════
   TAREFA 2 — GATILHOS AUTOMATIZADOS (scroll 50% / exit intent)
   Regra de negócio: abre sozinho no máximo 1x por sessão
   (sessionStorage), e só entra em cena se nenhum outro modal já
   estiver aberto. Abertura manual (clique no chip Flash/Hero/Strip)
   continua funcionando sempre, independente deste controle.
   ══════════════════════════════════════════════════════════════════════ */
var _wkzFsmSessionKey = 'wkzFsmAutoShown';

function _wkzFsmRemoveAutoTriggers() {
  if (_wkzFsmAutoListenersRemoved) return;
  _wkzFsmAutoListenersRemoved = true;
  window.removeEventListener('scroll', _wkzFsmOnScroll);
  document.removeEventListener('mouseout', _wkzFsmExitIntentHandler);
}

function _wkzFsmAutoTrigger(reason) {
  if (_wkzFsmAutoListenersRemoved) return;
  try {
    if (sessionStorage.getItem(_wkzFsmSessionKey)) { _wkzFsmRemoveAutoTriggers(); return; }
  } catch (e) { /* sessionStorage indisponível (modo privado etc.) — segue sem persistir */ }

  /* não empilha sobre o próprio modal já aberto nem sobre outro overlay
     que já tenha travado o scroll do body (ex.: WeKz Boost) */
  var overlay = document.getElementById('wkzFlashSaleOverlay');
  if (overlay && overlay.classList.contains('open')) return;
  if (document.body.style.overflow === 'hidden') return;

  _wkzFsmRemoveAutoTriggers();
  try { sessionStorage.setItem(_wkzFsmSessionKey, '1'); } catch (e) {}

  openFlashSaleModal();
  if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
    window.WkzBus.emit('flashsale:modal:autotrigger', { reason: reason });
  }
}

/* Regra 1a — 50% de rolagem da página (com throttle via requestAnimationFrame) */
function _wkzFsmCheckScroll() {
  var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
  var docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return;
  if (scrollTop / docHeight >= 0.5) _wkzFsmAutoTrigger('scroll-50');
}
function _wkzFsmOnScroll() {
  if (_wkzFsmScrollTicking) return;
  _wkzFsmScrollTicking = true;
  requestAnimationFrame(function () { _wkzFsmCheckScroll(); _wkzFsmScrollTicking = false; });
}

/* Regra 1b — Exit Intent (mouse sai pelo topo da janela, só desktop/mouse fino) */
function _wkzFsmExitIntentHandler(e) {
  if (e.relatedTarget || e.toElement) return;      // saiu para um elemento interno, não é exit-intent real
  if (e.clientY > 0) return;                        // só conta quando sai por CIMA da viewport
  _wkzFsmAutoTrigger('exit-intent');
}

function _wkzFsmInitAutoTriggers() {
  var alreadyShown = false;
  try { alreadyShown = !!sessionStorage.getItem(_wkzFsmSessionKey); } catch (e) {}
  if (alreadyShown) { _wkzFsmAutoListenersRemoved = true; return; } // nem liga os listeners à toa

  window.addEventListener('scroll', _wkzFsmOnScroll, { passive: true });

  /* Exit intent só faz sentido com mouse (dispositivo "fino"/desktop) */
  var isDesktopPointer = true;
  try { isDesktopPointer = window.matchMedia('(pointer: fine)').matches; } catch (e) {}
  if (isDesktopPointer) {
    document.addEventListener('mouseout', _wkzFsmExitIntentHandler);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   INTEGRAÇÃO — pontos de disparo manuais
   Apenas ADITIVO: liga onclick/addEventListener em elementos que hoje
   não têm nenhum comportamento de clique, sem tocar
   renderFlash()/renderFlashHero(). Também expõe um evento de barramento
   para módulos futuros abrirem o modal sem acoplamento direto.
   ══════════════════════════════════════════════════════════════════════ */
function _wkzFsmWireTriggers() {
  var stripLabel = document.querySelector('.flash-label');
  if (stripLabel && !stripLabel.hasAttribute('data-wkz-fsm-wired')) {
    stripLabel.setAttribute('data-wkz-fsm-wired', '1');
    stripLabel.style.cursor = 'pointer';
    stripLabel.addEventListener('click', function () { openFlashSaleModal(); });
  }

  var heroSection = document.getElementById('flashHeroSection');
  if (heroSection && !heroSection.hasAttribute('data-wkz-fsm-wired')) {
    var heroSpans = heroSection.querySelectorAll('span');
    for (var i = 0; i < heroSpans.length; i++) {
      if (heroSpans[i].textContent.trim() === 'FLASH SALE') {
        var heroChip = heroSpans[i].closest('div');
        if (heroChip) {
          heroSection.setAttribute('data-wkz-fsm-wired', '1');
          heroChip.style.cursor = 'pointer';
          heroChip.addEventListener('click', function () { openFlashSaleModal(); });
        }
        break;
      }
    }
  }

  var explicitTriggers = document.querySelectorAll('[data-wkz-flashsale-trigger]');
  explicitTriggers.forEach(function (t) {
    if (t.hasAttribute('data-wkz-fsm-wired')) return;
    t.setAttribute('data-wkz-fsm-wired', '1');
    t.addEventListener('click', function () { openFlashSaleModal(); });
  });
}

if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
  window.WkzBus.on('flashsale:trigger:open', function () { openFlashSaleModal(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    _wkzFsmWireTriggers();
    _wkzFsmInitAutoTriggers();
  });
} else {
  _wkzFsmWireTriggers();
  _wkzFsmInitAutoTriggers();
}

/* Expõe globalmente (consistente com o restante do wkz-buyer.js) */
window.wkzFlashSaleModal = wkzFlashSaleModal;
window.openFlashSaleModal = openFlashSaleModal;
window.closeFlashSaleModal = closeFlashSaleModal;
window.startFlashCountdown = startFlashCountdown;
window.animateKzEntrance = animateKzEntrance;
