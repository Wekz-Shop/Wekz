/* ════════════════════════════════════════════════════════════════════════
   wkz-flashsale-modal.js — WKZ Flash Sale Modal
   Extensão ISOLADA (Princípio Zero Rewrite):
   - NÃO modifica renderFlash(), renderFlashHero(), renderFlashPage(),
     showPage(), tick() ou qualquer outro fluxo existente.
   - Só CRIA: wkzFlashSaleModal(), openFlashSaleModal(), closeFlashSaleModal(),
     startFlashCountdown(), animateKzEntrance() — todas independentes.
   - Reaproveita getKzSVG() (definido em wkz-buyer.js) e, se presente,
     o relógio global FLASH_END (mesmo definido em wkz-buyer.js) — sem
     redeclará-los.
   Carregar DEPOIS de wkz-core.js e wkz-buyer.js em wkz-buyer.html.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Estado interno do módulo — nunca vaza para o escopo global,
     evitando colisão com variáveis de wkz-buyer.js/wkz-core.js. */
  var _fsmCountdownInterval = null;
  var _fsmSocialInterval    = null;
  var _fsmEscHandler        = null;
  var _fsmTrapHandler       = null;
  var _fsmLastFocused       = null;
  var _fsmRemovalTimeout    = null;

  /* ── wkzFlashSaleModal(): constrói (ou reaproveita) o DOM do modal ── */
  function wkzFlashSaleModal() {
    var existing = document.getElementById('wkzFlashSaleModal');
    if (existing) return existing;

    var mascotSvg = (typeof window.getKzSVG === 'function') ? window.getKzSVG(104) : '';

    var overlay = document.createElement('div');
    overlay.id = 'wkzFlashSaleModal';
    /* classe "modal-overlay" reaproveita o display:none/flex já definido em
       wkz-styles-full.css (linha ~4797) — nenhuma regra nova de exibição
       precisa ser criada; "wkz-fsm-overlay" só adiciona fade/scale por cima. */
    overlay.className = 'modal-overlay wkz-fsm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'wkzFsmTitle');
    overlay.setAttribute('aria-describedby', 'wkzFsmDesc');

    overlay.innerHTML =
      '<div class="wkz-fsm-box" role="document">' +
        '<button type="button" class="wkz-fsm-close" aria-label="Fechar" onclick="closeFlashSaleModal()">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +

        '<div class="wkz-fsm-stage" id="wkzFsmStage">' +
          '<div class="wkz-fsm-bolts" aria-hidden="true">' +
            '<svg class="wkz-fsm-bolt wkz-fsm-bolt-1" viewBox="0 0 24 24" width="30" height="30" fill="#06B6D4"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>' +
            '<svg class="wkz-fsm-bolt wkz-fsm-bolt-2" viewBox="0 0 24 24" width="22" height="22" fill="#7C3AED"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>' +
          '</div>' +
          '<div class="wkz-fsm-mascot" id="wkzFsmMascot">' + mascotSvg + '</div>' +
          '<div class="wkz-fsm-placard" id="wkzFsmPlacard">' +
            '<span class="wkz-fsm-placard-bolt" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="#FFD166"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg></span>' +
            '<span>FLASH SALE</span>' +
          '</div>' +
        '</div>' +

        '<h2 id="wkzFsmTitle" class="wkz-fsm-title">FLASH SALE WKZ</h2>' +
        '<p id="wkzFsmDesc" class="wkz-fsm-subtitle">As melhores ofertas selecionadas pelo KZ estão disponíveis por tempo limitado.</p>' +

        '<div class="wkz-fsm-countdown" role="timer" aria-live="polite" aria-atomic="true">' +
          '<div class="wkz-fsm-cd-unit"><span id="wkzFsmH">00</span><small>h</small></div>' +
          '<span class="wkz-fsm-cd-sep">:</span>' +
          '<div class="wkz-fsm-cd-unit"><span id="wkzFsmM">00</span><small>min</small></div>' +
          '<span class="wkz-fsm-cd-sep">:</span>' +
          '<div class="wkz-fsm-cd-unit"><span id="wkzFsmS">00</span><small>seg</small></div>' +
        '</div>' +

        '<div class="wkz-fsm-benefits">' +
          '<div class="wkz-fsm-benefit">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
            '<span>Frete Grátis</span>' +
          '</div>' +
          '<div class="wkz-fsm-benefit">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2v-7"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>' +
            '<span>Cashback</span>' +
          '</div>' +
          '<div class="wkz-fsm-benefit">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            '<span>Parcelamento</span>' +
          '</div>' +
        '</div>' +

        '<div class="wkz-fsm-social" aria-live="polite">' +
          '<span class="wkz-fsm-social-dot" aria-hidden="true"></span>' +
          '<span id="wkzFsmSocialCount">0</span>&nbsp;pessoas comprando agora' +
        '</div>' +

        '<div class="wkz-fsm-actions">' +
          '<button type="button" class="btn-flash-buy wkz-fsm-cta" onclick="closeFlashSaleModal();setTimeout(function(){ if (typeof showPage===\'function\') showPage(\'pg-flash\'); },220);">' +
            '<span class="btn-label">Explorar Ofertas</span>' +
          '</button>' +
          '<button type="button" class="wkz-fsm-secondary" onclick="closeFlashSaleModal()">Continuar navegando</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    /* Clique no backdrop fecha (só quando o alvo é o próprio overlay) */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeFlashSaleModal();
    });

    return overlay;
  }

  /* ── animateKzEntrance(): dispara a sequência exata do documento ──
     1. tela já escurece via .open (display:flex) + .wkz-fsm-visible (fade)
     2. após 150ms, mascote entra correndo pela esquerda
     3–7. placa, bounce, oscilação, raios e brilho — orquestrados via
     animation-delay no CSS (wkz-flashsale-modal.css), todos disparados
     pela mesma classe .wkz-fsm-run.
     8. contador inicia ao fim da animação de entrada do mascote. */
  function animateKzEntrance(overlay) {
    var stage  = overlay.querySelector('#wkzFsmStage');
    var mascot = overlay.querySelector('#wkzFsmMascot');
    if (!stage) { startFlashCountdown(); return; }

    setTimeout(function () {
      stage.classList.add('wkz-fsm-run');
    }, 150);

    if (mascot) {
      var onEntranceEnd = function (e) {
        if (e.animationName === 'wkzFsmRunIn') {
          mascot.removeEventListener('animationend', onEntranceEnd);
          startFlashCountdown();
        }
      };
      mascot.addEventListener('animationend', onEntranceEnd);
      /* Rede de segurança: se por qualquer motivo animationend não disparar
         (ex.: aba em background pausando animações), o contador ainda inicia. */
      setTimeout(function () {
        if (!_fsmCountdownInterval) startFlashCountdown();
      }, 1400);
    } else {
      startFlashCountdown();
    }
  }

  /* ── startFlashCountdown(): reaproveita FLASH_END (wkz-buyer.js) quando
     disponível — mesma "hora zero" do resto do site — com fallback próprio
     e independente caso o modal seja usado fora do contexto do buyer. ── */
  function startFlashCountdown() {
    if (_fsmCountdownInterval) return; /* já rodando — evita intervals duplicados */

    var end;
    if (typeof window.FLASH_END !== 'undefined' && window.FLASH_END instanceof Date) {
      end = window.FLASH_END;
    } else {
      end = new Date(Date.now() + 3 * 60 * 60 * 1000); /* fallback: 3h, mesmo padrão do site */
    }

    function paint() {
      var diff = end - new Date();
      if (diff <= 0) diff = 0;
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      var eh = document.getElementById('wkzFsmH'); if (eh) eh.textContent = String(h).padStart(2, '0');
      var em = document.getElementById('wkzFsmM'); if (em) em.textContent = String(m).padStart(2, '0');
      var es = document.getElementById('wkzFsmS'); if (es) es.textContent = String(s).padStart(2, '0');
    }

    paint();
    _fsmCountdownInterval = setInterval(paint, 1000);
    _startFsmSocialProof();
  }

  /* Número animado de prova social — isolado, com intervalo próprio limpo no close() */
  function _startFsmSocialProof() {
    var el = document.getElementById('wkzFsmSocialCount');
    if (!el) return;
    var target  = 1284;
    var current = target - 40;

    function step() {
      current += Math.floor(Math.random() * 3);
      if (current > target) current = target - Math.floor(Math.random() * 6);
      el.textContent = current.toLocaleString('pt-BR');
    }
    step();
    _fsmSocialInterval = setInterval(step, 2200);
  }

  function _fsmFocusableEls(box) {
    var nodeList = box.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return Array.prototype.filter.call(nodeList, function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  /* ── openFlashSaleModal(): ponto de entrada público ── */
  function openFlashSaleModal() {
    var overlay = wkzFlashSaleModal();
    var box     = overlay.querySelector('.wkz-fsm-box');
    var stage   = overlay.querySelector('#wkzFsmStage');

    /* Reset defensivo: permite reabrir o modal do zero mesmo se uma
       instância anterior não tiver sido removida a tempo do DOM. */
    if (stage) stage.classList.remove('wkz-fsm-run');
    if (_fsmCountdownInterval) { clearInterval(_fsmCountdownInterval); _fsmCountdownInterval = null; }
    if (_fsmSocialInterval)    { clearInterval(_fsmSocialInterval);    _fsmSocialInterval    = null; }
    if (_fsmRemovalTimeout)    { clearTimeout(_fsmRemovalTimeout);     _fsmRemovalTimeout    = null; }

    _fsmLastFocused = document.activeElement;

    overlay.classList.add('open');
    /* rAF garante que o browser registre o estado inicial (opacity:0) antes
       de aplicar wkz-fsm-visible, senão a transição de fade não roda. */
    requestAnimationFrame(function () {
      overlay.classList.add('wkz-fsm-visible');
    });

    document.body.style.overflow = 'hidden'; /* trava scroll do fundo */

    var closeBtn = overlay.querySelector('.wkz-fsm-close');
    if (closeBtn) closeBtn.focus();

    /* Acessibilidade: ESC fecha */
    _fsmEscHandler = function (e) {
      if (e.key === 'Escape') closeFlashSaleModal();
    };
    document.addEventListener('keydown', _fsmEscHandler);

    /* Acessibilidade: Focus Trap dentro do modal */
    _fsmTrapHandler = function (e) {
      if (e.key !== 'Tab') return;
      var focusables = _fsmFocusableEls(box);
      if (!focusables.length) return;
      var first = focusables[0];
      var last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', _fsmTrapHandler);

    animateKzEntrance(overlay);
  }

  /* ── closeFlashSaleModal(): limpa TUDO (intervals, listeners) antes de
     remover o nó do DOM — sem memory leaks. ── */
  function closeFlashSaleModal() {
    var overlay = document.getElementById('wkzFlashSaleModal');
    if (!overlay) return;

    overlay.classList.remove('wkz-fsm-visible');
    overlay.classList.remove('open');

    if (_fsmCountdownInterval) { clearInterval(_fsmCountdownInterval); _fsmCountdownInterval = null; }
    if (_fsmSocialInterval)    { clearInterval(_fsmSocialInterval);    _fsmSocialInterval    = null; }
    if (_fsmEscHandler)  { document.removeEventListener('keydown', _fsmEscHandler);  _fsmEscHandler  = null; }
    if (_fsmTrapHandler) { document.removeEventListener('keydown', _fsmTrapHandler); _fsmTrapHandler = null; }

    document.body.style.overflow = '';

    if (_fsmRemovalTimeout) clearTimeout(_fsmRemovalTimeout);
    _fsmRemovalTimeout = setTimeout(function () {
      var el = document.getElementById('wkzFlashSaleModal');
      if (el && el.parentNode) el.parentNode.removeChild(el);
      _fsmRemovalTimeout = null;
    }, 320); /* aguarda a transição de saída (fade/scale) antes de remover do DOM */

    if (_fsmLastFocused && typeof _fsmLastFocused.focus === 'function') {
      _fsmLastFocused.focus();
    }
    _fsmLastFocused = null;
  }

  /* ── Exposição pública (INTEGRAÇÃO) ── */
  window.wkzFlashSaleModal   = wkzFlashSaleModal;
  window.openFlashSaleModal  = openFlashSaleModal;
  window.closeFlashSaleModal = closeFlashSaleModal;
  window.startFlashCountdown = startFlashCountdown;
  window.animateKzEntrance   = animateKzEntrance;

})();
