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
   ══════════════════════════════════════════════════════════════════════ */

/* ── Estado interno do componente (privado, prefixo _wkzFsm) ──────────── */
var _wkzFsmCountdownInterval = null;
var _wkzFsmSocialInterval = null;
var _wkzFsmPrevFocus = null;
var _wkzFsmFallbackEnd = null;

/* ── EXCEÇÃO ARQUITETÔNICA (só para este modal — ver relatório) ───────
   O mascote SVG único (#kz-mascot-full / getKzSVG) continua sendo a
   identidade oficial do Kz em todo o resto do site. Aqui, e SOMENTE
   aqui, a "arte hero" da campanha Flash Sale (pose com óculos+raios
   neon+placa, alta-fidelidade, com efeitos de luz/textura que um SVG
   simplificado não reproduz) é carregada como raster via <img>.
   Troque WKZ_FSM_MASCOT_IMG_URL pelo asset final hospedado — pode ser
   sobrescrita ANTES de este script carregar, sem editar o arquivo:
     <script>window.WKZ_FSM_MASCOT_IMG_URL = "/assets/kz-flash-sale.png";</script>
   Se a imagem falhar (404, offline, placeholder ainda não trocado),
   _wkzFsmMascotImgError() troca automaticamente para o sprite SVG
   #kz-mascot-full — o modal nunca fica quebrado. */
var WKZ_FSM_MASCOT_IMG_URL = window.WKZ_FSM_MASCOT_IMG_URL || "./flash-sale.png";
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

/* ── SVG inline (sem emojis, mesmo padrão visual dos demais ícones) ──── */
function _wkzFsmIcon(name) {
  var icons = {
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    bolt: '<polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>',
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
 * independente das demais (pode ser chamada isoladamente para
 * "pré-aquecer" o DOM antes de abrir).
 */
function wkzFlashSaleModal() {
  if (document.getElementById('wkzFlashSaleOverlay')) return document.getElementById('wkzFlashSaleOverlay');

  var overlay = document.createElement('div');
  overlay.id = 'wkzFlashSaleOverlay';
  overlay.className = 'wkz-fsm-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML =
    '<div class="wkz-fsm-modal" id="wkzFsmModal" role="dialog" aria-modal="true" ' +
    'aria-labelledby="wkzFsmTitle" aria-describedby="wkzFsmSubtitle" tabindex="-1">' +
      '<div class="wkz-fsm-modal-glow" aria-hidden="true"></div>' +
      '<button type="button" class="wkz-fsm-close" id="wkzFsmCloseBtn" aria-label="Fechar Flash Sale">' + _wkzFsmIcon('close') + '</button>' +

      '<div class="wkz-fsm-stage" id="wkzFsmStage">' +
        '<div class="wkz-fsm-bolts" aria-hidden="true">' +
          '<svg viewBox="0 0 340 140" fill="none">' +
            '<path class="wkz-fsm-bolt-path" d="M40 20 L70 55 L52 55 L84 100" stroke-width="3" stroke-linecap="round" fill="none"/>' +
            '<path class="wkz-fsm-bolt-path" d="M300 15 L270 50 L288 50 L256 95" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '</svg>' +
        '</div>' +
        '<div class="wkz-fsm-sign" id="wkzFsmSign">' +
          '<span class="wkz-fsm-sign-icon">' + _wkzFsmIcon('bolt') + '</span>' +
          '<span class="wkz-fsm-sign-text">FLASH SALE</span>' +
        '</div>' +
        '<div class="wkz-fsm-mascot" id="wkzFsmMascot">' +
          '<img id="wkzFsmMascotImg" class="wkz-fsm-mascot-img" src="' + WKZ_FSM_MASCOT_IMG_URL + '" ' +
          'alt="Kz, o Lince Cibernético segurando a placa Flash Sale" draggable="false" ' +
          'onerror="_wkzFsmMascotImgError(this)" />' +
          '<span class="wkz-fsm-mascot-shine" aria-hidden="true"></span>' +
        '</div>' +
      '</div>' +

      '<div class="wkz-fsm-body">' +
        '<h2 class="wkz-fsm-title" id="wkzFsmTitle">FLASH SALE WKZ</h2>' +
        '<p class="wkz-fsm-subtitle" id="wkzFsmSubtitle">As melhores ofertas selecionadas pelo KZ estão disponíveis por tempo limitado.</p>' +

        '<div class="wkz-fsm-countdown" aria-live="polite" aria-atomic="true">' +
          '<div class="wkz-fsm-count-block"><span id="wkzFsmCh">00</span><label>h</label></div>' +
          '<span class="wkz-fsm-count-sep">:</span>' +
          '<div class="wkz-fsm-count-block"><span id="wkzFsmCm">00</span><label>min</label></div>' +
          '<span class="wkz-fsm-count-sep">:</span>' +
          '<div class="wkz-fsm-count-block"><span id="wkzFsmCs">00</span><label>seg</label></div>' +
        '</div>' +

        '<div class="wkz-fsm-benefits">' +
          '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('truck') + '</span><span>Frete Grátis</span></div>' +
          '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('cashback') + '</span><span>Cashback</span></div>' +
          '<div class="wkz-fsm-benefit-card"><span class="wkz-fsm-benefit-icon">' + _wkzFsmIcon('card') + '</span><span>Parcelamento</span></div>' +
        '</div>' +

        '<div class="wkz-fsm-social">' + _wkzFsmIcon('users') +
          '<span><strong id="wkzFsmSocialCount">0</strong> pessoas comprando agora</span>' +
        '</div>' +

        '<div class="wkz-fsm-cta-row">' +
          '<button type="button" class="wkz-fsm-cta-primary" id="wkzFsmPrimaryBtn">' + _wkzFsmIcon('bolt') + ' Explorar Ofertas</button>' +
          '<button type="button" class="wkz-fsm-cta-secondary" id="wkzFsmSecondaryBtn">Continuar navegando</button>' +
        '</div>' +
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

  return overlay;
}

/**
 * animateKzEntrance()
 * Dispara a sequência de animação do mascote (corrida, bounce,
 * oscilação da placa, raios e brilho nos óculos) apenas ligando a
 * classe de estado — toda a coreografia é resolvida via CSS/keyframes
 * em wkz-flashsale-modal.css. Função independente: pode ser chamada
 * de novo a qualquer momento para "re-tocar" a entrada.
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
 * Se FLASH_END não existir (módulo carregado isoladamente), cria um
 * fallback local de 3h só para o modal não quebrar.
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

/* ── Prova social animada (número sobe até 1.284 e depois oscila) ─────── */
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
      /* fase 2: pequena oscilação contínua, como o padrão já usado em animateViewers() */
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
 * Ponto de entrada público principal. Garante que o DOM existe,
 * escurece a tela, agenda a entrada do mascote (150ms), liga o
 * contador e a prova social, e ativa acessibilidade (ESC, backdrop,
 * focus trap, foco inicial no card).
 */
function openFlashSaleModal() {
  var overlay = wkzFlashSaleModal();
  if (!overlay) return;

  _wkzFsmPrevFocus = document.activeElement;

  /* 1. Escurecer a tela */
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  document.addEventListener('keydown', _wkzFsmKeydownHandler);
  overlay.addEventListener('click', _wkzFsmOverlayClickHandler);

  /* 2-7. Entrada do mascote + placa + raios + brilho, após 150ms */
  setTimeout(animateKzEntrance, 150);

  /* 8. O contador inicia */
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
 * Fecha o modal e desfaz TUDO que foi ligado em openFlashSaleModal():
 * listeners de teclado/click e os dois intervals (contador e prova
 * social) — sem isso o componente vazaria memória a cada abertura.
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
   INTEGRAÇÃO — pontos de disparo
   Apenas ADITIVO: liga onclick/addEventListener em elementos que hoje
   não têm nenhum comportamento de clique (o chip "FLASH SALE" do
   header do Hero e da Strip), sem tocar renderFlash()/renderFlashHero().
   Também expõe um evento de barramento para módulos futuros abrirem o
   modal sem acoplamento direto (ex.: seller/admin broadcast).
   ══════════════════════════════════════════════════════════════════════ */
function _wkzFsmWireTriggers() {
  /* Banner Flash (home) — chip "FLASH SALE" dentro da Flash Sale Strip */
  var stripLabel = document.querySelector('.flash-label');
  if (stripLabel && !stripLabel.hasAttribute('data-wkz-fsm-wired')) {
    stripLabel.setAttribute('data-wkz-fsm-wired', '1');
    stripLabel.style.cursor = 'pointer';
    stripLabel.addEventListener('click', function () { openFlashSaleModal(); });
  }

  /* Hero — chip "FLASH SALE" no header do bloco flashHeroSection */
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

  /* Botão Flash Sale — qualquer elemento marcado explicitamente pelo integrador */
  var explicitTriggers = document.querySelectorAll('[data-wkz-flashsale-trigger]');
  explicitTriggers.forEach(function (t) {
    if (t.hasAttribute('data-wkz-fsm-wired')) return;
    t.setAttribute('data-wkz-fsm-wired', '1');
    t.addEventListener('click', function () { openFlashSaleModal(); });
  });
}

/* Eventos futuros — qualquer módulo pode pedir a abertura via WkzBus,
   sem precisar conhecer wkz-buyer.js nem este arquivo diretamente. */
if (typeof window.WkzBus !== 'undefined' && window.WkzBus) {
  window.WkzBus.on('flashsale:trigger:open', function () { openFlashSaleModal(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _wkzFsmWireTriggers);
} else {
  _wkzFsmWireTriggers();
}

/* Expõe globalmente (consistente com o restante do wkz-buyer.js) */
window.wkzFlashSaleModal = wkzFlashSaleModal;
window.openFlashSaleModal = openFlashSaleModal;
window.closeFlashSaleModal = closeFlashSaleModal;
window.startFlashCountdown = startFlashCountdown;
window.animateKzEntrance = animateKzEntrance;
