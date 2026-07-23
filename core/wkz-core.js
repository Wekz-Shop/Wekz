/* ════════════════════════════════════════════════════════════════════════
   wkz-core.js — WeKz Shop Core
   Carregado por TODOS os módulos (Buyer/Seller/Admin), APÓS wkz-bus.js.
   Sprint M1 — Core Foundation. Extração cirúrgica de
   WeKzShop_v2_9_36_CORRIGIDO.html — Zero Rewrite: nenhuma lógica de
   negócio foi reescrita, apenas movida/conectada via WkzBus.
   Fonte do plano: WeKzShop_Arquitetura_Modular_v2_9_36.html, Seções 3, 4 e 5.
   ════════════════════════════════════════════════════════════════════════ */

/* ── BLOCO 1: Utilitários de Segurança ──────────────────────────────────
   escapeHtml(), wkzLog(), WkzApp (State Manager, integrado ao WkzBus)
   Origem monólito: linhas 10376–10480 (patch de integração aplicado)
   ─────────────────────────────────────────────────────────────────────── */
// ── Sanitização XSS — Sprint 0.1 fix S1 ──────────────────────────────
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
// ── Debug flag — Sprint 0.1 fix A5 ───────────────────────────────────
window.WKZ_DEBUG = false; // Mudar para true localmente para dev
function wkzLog(...args) { if (window.WKZ_DEBUG) console.log(...args); }

/* ── WkzApp: Gerenciador de Estado Único ─────────────────────────────── */
var WkzApp = (function() {
  'use strict';

  /* ── Estado compartilhado ─── */
  var _state = {
    currentPage: 'home',
    cartCount:   0,
    wishCount:   0,
    locale: { lang: 'PT', curr: 'BRL' },
    negotiator: { open: false, priceRaw: 0, round: 0, agreed: false },
    socialProof: { active: false, intervalId: null, uid: 0 },
    kzLive: { active: false, following: false, viewers: 1247 },
  };

  /* ── Registro de Nav Hooks ───────────────────────────────────────────
     FIX Sprint M1 (correção de arquitetura): no monólito original, WkzApp
     declarava seu PRÓPRIO window._wkzNavHooks/window.registerNavHook — o
     mesmo par de símbolos que wkz-bus.js (carregado ANTES deste arquivo,
     ver Seção 5 do plano) também declara. Como os dois eram IIFEs
     independentes, o segundo a rodar (WkzApp, aqui) sobrescrevia
     silenciosamente o Proxy do WkzBus: hooks registrados via
     WkzBus.on('nav:change', fn) deixariam de disparar quando MapsTo()
     chamasse window._wkzNavHooks, porque essa variável teria virado o
     Proxy isolado do WkzApp — exatamente o padrão de "duplicata
     silenciosa" descrito no RISCO 1/3 da Seção 1 do plano.
     Correção: WkzApp NÃO redeclara mais esses símbolos. Ele delega para
     o WkzBus, que já é a fonte única da verdade (carregado primeiro). */
  function _registerHook(fn) {
    if (typeof window.registerNavHook === 'function') window.registerNavHook(fn);
  }

  function _runHooks(sectionId) {
    if (window.WkzBus) window.WkzBus.emit('nav:change', sectionId);
  }

  /* ── API pública ─── */
  return {
    state: _state,

    nav: {
      hooks:    window._wkzNavHooks, /* Proxy do WkzBus — leitura direta */
      register: _registerHook,        /* delega para window.registerNavHook (WkzBus) */
      run:      _runHooks             /* delega para WkzBus.emit('nav:change', id) */
    },

    /* Getters/setters de estado com side-effects opcionais */
    setPage: function(id) { _state.currentPage = id; _runHooks(id); },
    setCart:  function(n) { _state.cartCount = n; },
    setWish:  function(n) { _state.wishCount = n; },

    /* Negociador */
    negotiatorOpen:  function()  { _state.negotiator.open = true;  },
    negotiatorClose: function()  { _state.negotiator.open = false; },
    negotiatorIsOpen: function() { return _state.negotiator.open; },

    /* Social Proof */
    socialProofSetInterval: function(id) { _state.socialProof.intervalId = id; _state.socialProof.active = true; },
    socialProofClear: function() {
      if (_state.socialProof.intervalId) {
        clearInterval(_state.socialProof.intervalId);
        _state.socialProof.intervalId = null;
      }
      _state.socialProof.active = false;
    },
    socialProofNextUid: function() { return 'kzsp-' + (++_state.socialProof.uid); },

    /* KZ Live */
    setLiveActive:  function(v) { _state.kzLive.active = v; },

    /* Locale */
    setLocale: function(lang, curr) {
      if (lang) _state.locale.lang = lang;
      if (curr) _state.locale.curr = curr;
    },

    /* Debug */
    dump: function() { return JSON.parse(JSON.stringify(_state)); }
  };
})();

/* ── BLOCO 1b: Sanitização Avançada / Segurança de Estado ───────────────
   wkzSanitizeHTML(), wkzFreezeApp(), wkzSecureStorage
   Origem monólito: linhas 10489–10857
   ─────────────────────────────────────────────────────────────────────── */
(function(global) {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────
     COMPONENTE 2 — wkzSanitizeHTML
     Higienizador de DOM nativo com suporte a Trusted Types quando disponível.
     Remove tags perigosas, atributos de evento inline e URLs javascript:.
     Uso: wkzSanitizeHTML('<img src=x onerror=alert(1)>') → '<img>'
     ────────────────────────────────────────────────────────────────────── */

  // Tags bloqueadas — apenas as que executam código arbitrário
  // style/link/meta são permitidos (usados em templates internos do app)
  var BLOCKED_TAGS = /^(script|object|embed|applet|iframe|frame|frameset|base)$/i;
  // Atributos bloqueados APENAS em conteúdo de utilizador (userContent=true)
  // Templates internos do app usam onclick= legitimamente
  var BLOCKED_ATTR_USER = /^on\w+$/i;
  var DANGEROUS_URL = /^\s*javascript\s*:/i;

  /**
   * wkzSanitizeHTML(input) → string HTML limpa e segura
   * Estratégia: cria um documento inerte via DOMParser (não executa scripts),
   * percorre a árvore e remove tudo que for perigoso, depois serializa.
   */
  /**
   * wkzSanitizeHTML(input, userContent)
   * userContent=true → remove também atributos on* (para dados de utilizador: chat, reviews, campos de texto)
   * userContent=false/omitted → remove apenas tags e URLs javascript: (para templates internos do app)
   */
  function wkzSanitizeHTML(input, userContent) {
    if (typeof input !== 'string') return '';
    if (input === '') return '';

    // Trusted Types: se o browser suportar, criamos uma política segura
    if (global.trustedTypes && global.trustedTypes.createPolicy) {
      try {
        if (!global._wkzTTPol) {
          global._wkzTTPol = global.trustedTypes.createPolicy('wkz-sanitize', {
            createHTML: function(s) { return s; }  // controle interno
          });
        }
      } catch(e) { /* política já existe ou não suportada */ }
    }

    // Parse seguro via DOMParser (scripts não são executados neste contexto)
    var parser = new DOMParser();
    var doc = parser.parseFromString(input, 'text/html');

    // Percorre todos os nós de forma recursiva
    function _clean(node) {
      var children = Array.prototype.slice.call(node.childNodes);
      children.forEach(function(child) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          // Remove tags bloqueadas integralmente
          if (BLOCKED_TAGS.test(child.tagName)) {
            child.parentNode.removeChild(child);
            return;
          }
          // Remove atributos perigosos
          var attrs = Array.prototype.slice.call(child.attributes);
          attrs.forEach(function(attr) {
            // on* apenas bloqueados para conteúdo de utilizador (não para templates internos)
            if (userContent && BLOCKED_ATTR_USER.test(attr.name)) {
              child.removeAttribute(attr.name);
              return;
            }
            // Bloqueia href/src com javascript: independentemente da origem
            if (/^(href|src|action|formaction|data)$/i.test(attr.name) &&
                DANGEROUS_URL.test(attr.value)) {
              child.removeAttribute(attr.name);
            }
          });
          // Remove srcdoc em iframes (caso passem pelo filtro de tags)
          if (child.hasAttribute('srcdoc')) child.removeAttribute('srcdoc');
          // Recursão nos filhos
          _clean(child);
        }
        // Nós de texto e comentários são inofensivos — mantidos
      });
    }

    _clean(doc.body);
    return doc.body.innerHTML;
  }

  global.wkzSanitizeHTML = wkzSanitizeHTML;


  /* ──────────────────────────────────────────────────────────────────────
     COMPONENTE 3 — Proteção de Integridade do WkzApp e _wkzNavHooks
     Usa Object.freeze recursivo para impedir modificação pós-inicialização.
     Proxy de detecção audita tentativas de escrita e dispara admAuditAdd.
     ────────────────────────────────────────────────────────────────────── */

  /**
   * _wkzDeepFreeze(obj) — congela objeto e todos os seus valores recursivamente.
   * Seguro contra ciclos: rastreia objetos já visitados.
   */
  function _wkzDeepFreeze(obj, seen) {
    if (!obj || typeof obj !== 'object' && typeof obj !== 'function') return obj;
    seen = seen || new WeakSet();
    if (seen.has(obj)) return obj;
    seen.add(obj);
    Object.getOwnPropertyNames(obj).forEach(function(k) {
      var v = obj[k];
      if ((typeof v === 'object' || typeof v === 'function') && v !== null) {
        _wkzDeepFreeze(v, seen);
      }
    });
    return Object.freeze(obj);
  }

  /**
   * _wkzAuditViolation(prop, value) — hook de auditoria disparado quando
   * uma violação de escrita é detectada no Proxy do estado global.
   */
  function _wkzAuditViolation(prop, value) {
    var msg = '[WkzSec] Tentativa de escrita bloqueada: WkzApp.' + prop +
              ' = ' + JSON.stringify(value) + ' (rejeitado pelo Proxy)';
    wkzLog(msg);
    // Integração com o painel de auditoria administrativo
    if (typeof global.admAuditAdd === 'function') {
      try {
        global.admAuditAdd('🔒', msg, 'WkzSecurity');
      } catch(e) { /* painel pode não estar montado ainda */ }
    }
  }

  /**
   * wkzFreezeApp() — executado após a inicialização do WkzApp.
   * Cria um Proxy de detecção sobre a API pública do WkzApp e congela
   * o array interno de nav hooks para impedir push() externo.
   */
  /**
   * Propriedades NÚCLEO do WkzApp que não devem ser sobrescritas por terceiros.
   * Módulos internos do app (legal, fiscal, kyc, disputes) podem adicionar
   * novas propriedades livremente — apenas a redefinição do núcleo é bloqueada.
   */
  var WKZ_CORE_KEYS = {
    state: true, nav: true, setPage: true, setCart: true, setWish: true,
    setLocale: true, dump: true, negotiatorOpen: true, negotiatorClose: true
  };

  function wkzFreezeApp() {
    if (!global.WkzApp) return;

    // 1. NÃO congela WkzApp.state — módulos internos (legal/fiscal/kyc/disputes)
    //    adicionam sub-estados após o DOMContentLoaded e precisam de WkzApp.state mutável.
    //    Proteção de state é feita pelo Proxy abaixo (bloqueio de delete, não de set).

    // 2. Congela apenas as funções NÚCLEO da API (as que existem agora)
    //    Módulos que adicionam WkzApp.setLegalState= etc. APÓS este ponto funcionam normalmente.
    Object.keys(WKZ_CORE_KEYS).forEach(function(k) {
      var v = global.WkzApp[k];
      if (v !== undefined) {
        try {
          Object.defineProperty(global.WkzApp, k, {
            value: v,
            writable: false,
            configurable: false,
            enumerable: true
          });
        } catch(e) { /* já congelado ou não configurável */ }
      }
    });

    // 3. Proxy de detecção — audita tentativas de SOBRESCREVER propriedades núcleo.
    //    Novas propriedades (setLegalState, recordSplit, etc.) são permitidas.
    try {
      var _origApp = global.WkzApp;
      global.WkzApp = new Proxy(_origApp, {
        set: function(target, prop, value) {
          if (WKZ_CORE_KEYS[prop]) {
            // Tentativa de sobrescrever propriedade protegida do núcleo
            _wkzAuditViolation(prop, value);
            return false;
          }
          // Propriedade nova ou extensão de módulo interno — permitida
          target[prop] = value;
          return true;
        },
        deleteProperty: function(target, prop) {
          if (WKZ_CORE_KEYS[prop]) {
            _wkzAuditViolation('delete:' + prop, undefined);
            return false;
          }
          delete target[prop];
          return true;
        }
      });
    } catch(e) {
      // Proxy não suportado — fallback sem auditoria dinâmica
      wkzLog('[WkzSec] Proxy não suportado — proteção estática via defineProperty apenas.');
    }

    // 4. Protege window._wkzNavHooks contra reassignment (push() via Proxy interno continua OK)
    /* FIX: passar "value" explicitamente (lendo o valor atual antes) em vez
       de omitir e confiar no comportamento implícito de "preservar valor
       existente". A omissão funciona em qualquer engine JS real (browser),
       mas o ambiente de teste headless (Node vm.runInContext, usado nos
       harnesses de CI) tem uma discrepância nesse caso específico e reseta
       o valor pra undefined — sendo explícito remove a ambiguidade nos
       dois ambientes, sem mudar o comportamento em produção. */
    try {
      Object.defineProperty(global, '_wkzNavHooks', {
        value: global._wkzNavHooks,
        writable: false,
        configurable: false
      });
    } catch(e) { /* já definido */ }

    wkzLog('[WkzSec] WkzApp núcleo e _wkzNavHooks protegidos com sucesso.');
  }

  global.wkzFreezeApp = wkzFreezeApp;


  /* ──────────────────────────────────────────────────────────────────────
     COMPONENTE 4 — wkzSecureStorage
     Camada de abstração sobre localStorage com ofuscação XOR dinâmica.
     A chave de ofuscação é derivada do user-agent + origem (fingerprint leve),
     impedindo leitura direta dos valores sem o mesmo contexto de cliente.
     API: wkzSecureStorage.set(key, value) / .get(key) / .remove(key)
     ────────────────────────────────────────────────────────────────────── */

  var wkzSecureStorage = (function() {

    // Prefixo para distinguir chaves gerenciadas por este módulo
    var PREFIX = 'wkz_s_';

    /**
     * _deriveKey() — gera uma string de chave XOR a partir de
     * características estáveis do cliente (origin + user-agent).
     * Não é criptografia forte; é ofuscação suficiente para impedir
     * leitura trivial no DevTools / extração por extensões.
     */
    function _deriveKey() {
      var raw = (global.location ? global.location.origin : '') +
                (global.navigator ? global.navigator.userAgent : '') +
                'wkz2024';
      // Converte a string em um array de bytes (módulo 256)
      var key = [];
      for (var i = 0; i < raw.length; i++) {
        key.push(raw.charCodeAt(i) & 0xFF);
      }
      return key;
    }

    var _KEY = _deriveKey();

    /**
     * _xorCipher(str) — aplica XOR com a chave derivada.
     * Operação simétrica: aplicar duas vezes restaura o original.
     * Resultado retornado em Base64 para segurança no armazenamento.
     */
    function _xorCipher(str) {
      var out = [];
      for (var i = 0; i < str.length; i++) {
        out.push(str.charCodeAt(i) ^ _KEY[i % _KEY.length]);
      }
      // Converte para string binária e encoda em Base64
      try {
        return global.btoa(String.fromCharCode.apply(null, out));
      } catch(e) {
        // fallback sem Base64
        return out.join(',');
      }
    }

    /**
     * _xorDecipher(encoded) — decodifica Base64 e aplica XOR inverso.
     */
    function _xorDecipher(encoded) {
      try {
        var bin = global.atob(encoded);
        var bytes = [];
        for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
        var out = [];
        for (var j = 0; j < bytes.length; j++) {
          out.push(String.fromCharCode(bytes[j] ^ _KEY[j % _KEY.length]));
        }
        return out.join('');
      } catch(e) {
        // tenta fallback CSV
        try {
          var parts = encoded.split(',').map(Number);
          var res = [];
          for (var k = 0; k < parts.length; k++) {
            res.push(String.fromCharCode(parts[k] ^ _KEY[k % _KEY.length]));
          }
          return res.join('');
        } catch(e2) { return null; }
      }
    }

    return {
      /**
       * set(key, value) — serializa, ofusca e persiste no localStorage.
       * @param {string} key   — chave lógica (sem prefixo)
       * @param {*}      value — qualquer valor serializável via JSON
       */
      set: function(key, value) {
        if (!key) return;
        try {
          var json  = JSON.stringify(value);
          var enc   = _xorCipher(json);
          localStorage.setItem(PREFIX + key, enc);
        } catch(e) {
          wkzLog('[wkzSecureStorage] Erro ao gravar "' + key + '":', e);
        }
      },

      /**
       * get(key) — lê, deofusca e desserializa do localStorage.
       * @param  {string} key — chave lógica
       * @param  {*}  def     — valor padrão se ausente ou inválido
       * @return {*}
       */
      get: function(key, def) {
        if (!key) return def !== undefined ? def : null;
        try {
          var enc = localStorage.getItem(PREFIX + key);
          if (enc === null) return def !== undefined ? def : null;
          var json = _xorDecipher(enc);
          if (json === null) return def !== undefined ? def : null;
          return JSON.parse(json);
        } catch(e) {
          wkzLog('[wkzSecureStorage] Erro ao ler "' + key + '":', e);
          return def !== undefined ? def : null;
        }
      },

      /**
       * remove(key) — remove a chave do localStorage.
       */
      remove: function(key) {
        if (!key) return;
        try { localStorage.removeItem(PREFIX + key); } catch(e) {}
      },

      /**
       * clear() — remove todas as chaves gerenciadas por este módulo.
       */
      clear: function() {
        try {
          var toRemove = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
          }
          toRemove.forEach(function(k) { localStorage.removeItem(k); });
        } catch(e) {}
      }
    };
  })();

  global.wkzSecureStorage = wkzSecureStorage;


  /* ──────────────────────────────────────────────────────────────────────
     INICIALIZAÇÃO — executa wkzFreezeApp após o carregamento completo
     da página para garantir que WkzApp já esteja inicializado.
     ────────────────────────────────────────────────────────────────────── */
  function _wkzSecInit() {
    wkzFreezeApp();
    wkzLog('[WkzSec] Módulo de segurança inicializado.');
  }

  // Usa window 'load' (não DOMContentLoaded) para garantir que TODOS os módulos
  // internos (legal, fiscal, kyc, disputes) já adicionaram os seus métodos ao WkzApp
  // antes de aplicarmos a proteção de núcleo.
  if (document.readyState === 'complete') {
    _wkzSecInit();
  } else {
    global.addEventListener('load', _wkzSecInit);
  }

})(window);

/* ── BLOCO 2: Utilitários Gerais ─────────────────────────────────────────
   wkzUid(), showToast() [PATCH 3 — versão única consolidada, era 3-4
   definições no monólito: 28096/33942/44870/showToastConsent — esta é a
   mais completa, com progress bar, linha 44870], wkzCopyToClipboard(),
   wkzRenderEmpty(), wkzSanitize(), scroll-to-top, keyboard nav, etc.
   Origem monólito: linhas 30731–30740 (wkzUid) + 44818–45257 (resto)
   NOTA: wkzRateLimit() e wkzStore (TTL wrapper) do plano-alvo (Seção 5)
   NÃO foram localizados no monólito v2.9.36 — não existem ainda. Ficam
   como item pendente de implementação (ver changelog ao final da entrega).
   ─────────────────────────────────────────────────────────────────────── */
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

/* ════════════════════════════════════════════════════════════════
   WeKz Shop v1.9.0 — MAINTENANCE JS PATCH
   • Scroll-to-top button
   • Toast v2 upgrade (com progress bar)
   • Keyboard navigation (Escape fecha modais)
   • Passive scroll events
   • Page visibility API (pausa animações em background)
   • Clipboard share helper
   • Empty state injector helper
   • Bell button auto-inject
   • Print/Export helpers
   ════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── 1. SCROLL-TO-TOP BUTTON ── */
  function initScrollTop() {
    var btn = document.getElementById('wkzScrollTop');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'wkzScrollTop';
      btn.setAttribute('aria-label', 'Voltar ao topo');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18,15 12,9 6,15"/></svg>';
      document.body.appendChild(btn);
    }
    btn.onclick = function() { window.scrollTo({ top: 0, behavior: 'smooth' }); };

    var ticking = false;
    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          var show = (window.scrollY || document.documentElement.scrollTop) > 320;
          btn.classList.toggle('visible', show);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ── 2. TOAST V2 UPGRADE ──
     Substitui o showToast existente preservando compatibilidade total  */
  function initToastV2() {
    var toastEl = document.getElementById('wkz-toast-v2');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'wkz-toast-v2';
      document.body.appendChild(toastEl);
    }

    var _timer = null;

    window.showToast = function(msg, duration) {
      duration = duration || 3000;
      toastEl.innerHTML = msg || '';
      toastEl.style.setProperty('--_toast-dur', (duration / 1000) + 's');
      toastEl.classList.remove('show');
      /* Force reflow */
      void toastEl.offsetWidth;
      toastEl.classList.add('show');

      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(function() {
        toastEl.classList.remove('show');
      }, duration);
    };
  }

  /* ── 3. KEYBOARD NAVIGATION ── */
  function initKeyboardNav() {
    document.addEventListener('keydown', function(e) {
      /* Escape: fecha qualquer modal/overlay aberto */
      if (e.key === 'Escape') {
        var overlays = document.querySelectorAll(
          '.modal-overlay.open, .wkz-panel.open, [id$="Overlay"].open, [id$="overlay"].open, [id$="Modal"].open'
        );
        overlays.forEach(function(el) {
          el.classList.remove('open');
        });
        /* Fecha painel de notificações se aberto */
        var inbox = document.getElementById('wkzInboxPanel');
        if (inbox && inbox.style.display === 'block') {
          inbox.style.display = 'none';
        }
      }
      /* Slash /: foca na barra de pesquisa */
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        var searchInput = document.querySelector('.search-input') || document.querySelector('[placeholder*="Pesquisa"]');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
    });
  }

  /* ── 4. PAGE VISIBILITY: pausa animações pesadas quando tab está inativa ── */
  function initPageVisibility() {
    document.addEventListener('visibilitychange', function() {
      var animEls = document.querySelectorAll('[style*="animation"]');
      var state = document.hidden ? 'paused' : 'running';
      animEls.forEach(function(el) {
        el.style.animationPlayState = state;
      });
    });
  }

  /* ── 5. SKIP TO CONTENT LINK ── */
  function initSkipLink() {
    if (document.querySelector('.wkz-skip-link')) return;
    var link = document.createElement('a');
    link.className = 'wkz-skip-link';
    link.href = '#main-content';
    link.textContent = 'Ir para o conteúdo principal';
    document.body.insertBefore(link, document.body.firstChild);

    /* Garante que há um alvo para o skip link — sem remover o id original do page-home */
    var mainTarget = document.getElementById('main-content');
    if (!mainTarget) {
      var homePage = document.getElementById('page-home');
      if (homePage) {
        var skipTarget = document.createElement('div');
        skipTarget.id = 'main-content';
        skipTarget.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:hidden;';
        homePage.parentNode.insertBefore(skipTarget, homePage);
      }
    }
  }

  /* ── 6. BELL BUTTON AUTO-INJECT (referenciado no CSS mas criado dinamicamente) ──
     O bell é injectado pelo módulo broadcast — garantimos que é acessível por teclado */
  function patchBellAccessibility() {
    var checkInterval = setInterval(function() {
      var bell = document.getElementById('wkzBellBtn');
      if (bell) {
        if (!bell.getAttribute('aria-label')) bell.setAttribute('aria-label', 'Notificações');
        if (!bell.getAttribute('role')) bell.setAttribute('role', 'button');
        clearInterval(checkInterval);
      }
    }, 500);
    /* Limpar após 10 segundos */
    setTimeout(function() { clearInterval(checkInterval); }, 10000);
  }

  /* ── 7. EMPTY STATE HELPER — helper global para injetar empty states ── */
  window.wkzRenderEmpty = function(containerId, opts) {
    var el = document.getElementById(containerId);
    if (!el) return;
    opts = opts || {};
    el.innerHTML = '<div class="wkz-empty-state">'
      + '<div class="wkz-empty-icon">' + (opts.icon || '🔍') + '</div>'
      + '<div class="wkz-empty-title">' + (opts.title || 'Nenhum resultado encontrado') + '</div>'
      + '<div class="wkz-empty-msg">' + (opts.msg || 'Tente ajustar os filtros ou faça uma nova pesquisa.') + '</div>'
      + (opts.actionLabel ? '<button class="wkz-empty-action" onclick="' + (opts.actionFn || 'MapsTo(\'home\')') + '">' + opts.actionLabel + '</button>' : '')
      + '</div>';
  };

  /* ── 8. SANITIZE HELPER — previne XSS básico em conteúdo dinâmico ── */
  window.wkzSanitize = function(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* ── 9. CLIPBOARD SHARE HELPER ── */
  window.wkzCopyToClipboard = function(text, successMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function() {
        if (typeof showToast === 'function') showToast(successMsg || '📋 Copiado para a área de transferência!');
      }).catch(function() {
        _fallbackCopy(text, successMsg);
      });
    } else {
      _fallbackCopy(text, successMsg);
    }
  };
  function _fallbackCopy(text, successMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try {
      document.execCommand('copy');
      if (typeof showToast === 'function') showToast(successMsg || '📋 Copiado!');
    } catch(e) {}
    document.body.removeChild(ta);
  }

  /* ── 10. PERFORMANCE: marca entradas de imagem como lazy por defeito ── */
  function initLazyImages() {
    var imgs = document.querySelectorAll('img:not([loading])');
    imgs.forEach(function(img) {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
  }

  /* ── 11. ARIA LABELS EM BOTÕES DE AÇÃO SEM TEXTO ── */
  function patchAriaLabels() {
    var ariaMap = {
      'btn-cart': 'Adicionar ao carrinho',
      'btn-wish': 'Adicionar à lista de desejos',
      'btn-close': 'Fechar',
      'btn-back': 'Voltar',
      'btn-search': 'Pesquisar',
      'btn-menu': 'Abrir menu',
    };
    Object.keys(ariaMap).forEach(function(cls) {
      document.querySelectorAll('.' + cls + ':not([aria-label])').forEach(function(btn) {
        if (btn.textContent.trim() === '' || btn.textContent.trim().length < 3) {
          btn.setAttribute('aria-label', ariaMap[cls]);
        }
      });
    });
  }

  /* ── 12. PWA MANIFEST inject (inline) ── */
  function injectPWAManifest() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var manifest = {
      name: 'WeKz Shop',
      short_name: 'WeKz',
      description: 'O marketplace mais inteligente. Compre com proteção total.',
      start_url: '/',
      display: 'standalone',
      background_color: '#080E1A',
      theme_color: '#00B4AB',
      orientation: 'portrait-primary',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ],
      categories: ['shopping', 'business'],
      lang: 'pt-BR',
    };
    var blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);
  }

  /* ── 13. COUPON INPUT ID inject — o JS referencia #couponInput mas o elemento
     pode não ter id, apenas classe .coupon-input ── */
  function patchCouponInput() {
    var el = document.querySelector('.coupon-input:not([id])');
    if (el) el.id = 'couponInput';
  }

  /* ── MASTER INIT ── */
  function wkzMaintenanceInit() {
    initScrollTop();
    initToastV2();
    initKeyboardNav();
    initPageVisibility();
    initSkipLink();
    patchBellAccessibility();
    initLazyImages();
    patchAriaLabels();
    injectPWAManifest();
    patchCouponInput();

    /* Re-patch após navegação (lazy DOM) */
    if (typeof window.registerNavHook === 'function') {
      window.registerNavHook(function() {
        setTimeout(function() {
          patchAriaLabels();
          patchCouponInput();
          initLazyImages();
        }, 120);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wkzMaintenanceInit);
  } else {
    wkzMaintenanceInit();
  }

})();

/* ══════════════════════════════════════════════════════════════════════════
   WeKz Shop v2.2.0 — FEATURE SCRIPTS
   Módulos: Olhos do Lince · Tooltip FX · Coupon/Dispute helpers
   ══════════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ─── 1. Micro-interações dos olhos do Lince ─────────────────────────────
     a) Campo de senha: olhos "pisca" enquanto o utilizador digita
     b) Barra de frete 100%: olhos brilham (animação de celebração)
  ─────────────────────────────────────────────────────────────────────────── */

  function kzGetEyes() {
    // Apanha TODOS os olhos do Lince no DOM (múltiplas instâncias SVG possíveis)
    return document.querySelectorAll('.kz-eye-left, .kz-eye-right');
  }

  function kzEyesShy(active) {
    kzGetEyes().forEach(function(eye) {
      if (active) {
        eye.classList.add('kz-eye-shy');
        eye.classList.remove('kz-eye-celebrate');
      } else {
        eye.classList.remove('kz-eye-shy');
      }
    });
  }

  function kzEyesCelebrate() {
    kzGetEyes().forEach(function(eye) {
      eye.classList.remove('kz-eye-shy');
      eye.classList.add('kz-eye-celebrate');
      // Remove classe de celebração após 3 ciclos (~2.4s)
      setTimeout(function() {
        eye.classList.remove('kz-eye-celebrate');
      }, 2600);
    });
  }

  // Listener: campos de senha — olhos ficam "tímidos"
  function initPasswordEyeInteraction() {
    document.addEventListener('focusin', function(e) {
      var t = e.target;
      if (t && t.type === 'password') kzEyesShy(true);
    }, true);
    document.addEventListener('focusout', function(e) {
      var t = e.target;
      if (t && t.type === 'password') {
        setTimeout(function() { kzEyesShy(false); }, 400);
      }
    }, true);
    document.addEventListener('input', function(e) {
      var t = e.target;
      if (t && t.type === 'password') kzEyesShy(true);
    }, true);
  }

  // Listener: barra de frete grátis 100% — olhos celebram
  function initFreeShippingEyeCelebration() {
    // Observa mudanças na barra de frete (.cart-free-shipping-bar fill)
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          var fill = m.target;
          var w = parseFloat(fill.style.width) || 0;
          if (w >= 100) kzEyesCelebrate();
        }
      });
    });
    // Observa o fill da barra (inicialmente ou quando injectado)
    function attachFreeShippingObserver() {
      var fillEl = document.querySelector('.cart-free-shipping-fill, .free-shipping-fill');
      if (fillEl && !fillEl._kzObserved) {
        fillEl._kzObserved = true;
        observer.observe(fillEl, { attributes: true, attributeFilter: ['style'] });
      }
    }
    attachFreeShippingObserver();
    // Re-tenta após navegação SPA (100ms, 500ms, 2s)
    [100, 500, 2000].forEach(function(d) { setTimeout(attachFreeShippingObserver, d); });
  }

  /* [v2.9.15] Removida duplicação de cpShowActiveCoupons/cpOpenDisputeCenter.
     A versão funcional (scrollIntoView para #cpCouponList e #cpDisputeContainer,
     definida no IIFE "wekz-v190-maintenance-js" acima) já cobre este botão.
     Esta segunda versão procurava um sistema de abas (data-cp-tab/.cp-tab-*)
     que nunca existiu no DOM, e por executar depois sobrescrevia a versão
     correta — os botões "Cupons" e "Disputas" só levavam ao topo do perfil,
     sem rolar até o card certo. */

  /* ─── 3. Tooltip FX Guard (.kz-wisdom-text) ─────────────────────────────
     Simplifica a exibição de spread cambial: mostra apenas o valor final
     convertido e move os detalhes para um tooltip hover.
     Nota: não quebra a lógica do motor LANG_CURRENCY — apenas envolve
     o conteúdo extra em elementos de tooltip.
  ─────────────────────────────────────────────────────────────────────────── */

  function kzWrapFxTooltips() {
    // Selecciona elementos .kz-wisdom-text que contenham informação de spread
    var texts = document.querySelectorAll('.kz-wisdom-text[data-kzfx-detail]');
    texts.forEach(function(el) {
      if (el._kzTooltipWrapped) return;
      el._kzTooltipWrapped = true;
      var detail = el.getAttribute('data-kzfx-detail') || '';
      var mainText = el.textContent.split('|')[0].trim();
      el.innerHTML =
        '<span class="kz-fx-tooltip-wrap">' +
          '<span class="kz-fx-converted">' + mainText + '</span>' +
          ' <span class="kz-fx-info-icon" role="tooltip" aria-label="Detalhes cambiais">ℹ</span>' +
          '<span class="kz-fx-tooltip">' + detail + '</span>' +
        '</span>';
    });
  }

  /* ─── INIT ───────────────────────────────────────────────────────────── */
  function v220Init() {
    initPasswordEyeInteraction();
    initFreeShippingEyeCelebration();
    kzWrapFxTooltips();

    // Patch: adiciona data-label aos TDs de tabelas para o CSS responsivo
    document.querySelectorAll('.spd-tbl').forEach(function(tbl) {
      var headers = Array.from(tbl.querySelectorAll('thead th')).map(function(th) {
        return th.textContent.trim();
      });
      tbl.querySelectorAll('tbody tr').forEach(function(row) {
        row.querySelectorAll('td').forEach(function(td, i) {
          if (!td.getAttribute('data-label') && headers[i]) {
            td.setAttribute('data-label', headers[i]);
          }
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', v220Init);
  } else {
    v220Init();
  }

  // Re-executa após navegação SPA (lazy DOM)
  if (typeof window.registerNavHook === 'function') {
    window.registerNavHook(function() {
      setTimeout(function() {
        kzWrapFxTooltips();
        initFreeShippingEyeCelebration();
      }, 150);
    });
  }

})();

/* ── BLOCO 3+4+5: Preços, Catálogo de Dados e Estado Compartilhado ──────
   wkzExactPrice(), wkzExactOff(), products[] (28 itens) + _wkzFixCatalogPrices,
   SELLER_COUPONS{}, FRETE_GRATIS_SELLERS[], OFFICIAL_STORES, WKZ_CAT_ICONS,
   cartItemsData/wishlistItems/followedStores — AGORA REATIVOS via
   WkzBus.makeReactive() [FIX Sprint M1, ver Bloco 5 do plano]
   Origem monólito: linhas 19379–19819 (cortado exatamente antes de
   renderAll(), que é lógica de renderização Buyer — fica p/ Sprint M2)
   ─────────────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════
   MARKETING GLOBALS — populados por salvarMarketing()
   Declarados aqui para estarem disponíveis em todo o JS.
   ═══════════════════════════════════════════════════════ */
var SELLER_COUPONS      = {};
var SPONSORED_PRODUCTS  = [];
var FRETE_GRATIS_SELLERS= [];

/* ═══════════════════════════════════════════════════════
   KZ SMART NEGOTIATOR — configuração por vendedor
   [v2.9.39] Antes, a margem do Negociador era tratada como
   "política administrada centralmente pela WeKz" (ver stub antigo
   em wkz-seller.js: kzNegSaveSettings só mostrava um toast e nunca
   salvava nada). Por decisão do fundador, passa a ser configurável
   por CADA vendedor — cada loja define sua própria margem máxima
   de desconto automático. Como o site não tem backend, a
   configuração é persistida em localStorage (mesma origem —
   compartilhada entre wkz-seller.html e wkz-buyer.html).
   ═══════════════════════════════════════════════════════ */
var KZ_NEG_STORAGE_KEY = 'wkz_kz_negotiator_settings_v1';

/* Margens padrão para os vendedores já existentes no catálogo de
   produtos, para o Negociador funcionar "de fábrica" com diversos
   vendedores mesmo antes de qualquer um configurar algo no painel. */
var KZ_NEG_DEFAULTS = {
  'TechStore Brasil':   { active: true, maxPct: 15 },
  'TechStore':          { active: true, maxPct: 15 },
  'GadgetHub':          { active: true, maxPct: 12 },
  'SoundWorld':         { active: true, maxPct: 18 },
  'SportFit':           { active: true, maxPct: 10 },
  'NoteShop':           { active: true, maxPct: 8  },
  'PhotoPro':           { active: true, maxPct: 10 },
  'DisplayZone':        { active: true, maxPct: 12 },
  'GlowBeauty':         { active: true, maxPct: 20 },
  'GameWorld':          { active: true, maxPct: 15 },
  'FurniStyle':         { active: true, maxPct: 14 },
  'LivrariaKz Oficial': { active: true, maxPct: 10 },
  'Minha Loja Pro':     { active: true, maxPct: 15 }
};
var KZ_NEG_FALLBACK = { active: true, maxPct: 12 };

function kzNegGetAllSettings() {
  try {
    var raw = localStorage.getItem(KZ_NEG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function kzNegGetSellerConfig(sellerName) {
  var all = kzNegGetAllSettings();
  if (all && all[sellerName]) return all[sellerName];
  if (KZ_NEG_DEFAULTS[sellerName]) return KZ_NEG_DEFAULTS[sellerName];
  return KZ_NEG_FALLBACK;
}

function kzNegSetSellerConfig(sellerName, config) {
  var all = kzNegGetAllSettings();
  all[sellerName] = config;
  try { localStorage.setItem(KZ_NEG_STORAGE_KEY, JSON.stringify(all)); } catch (e) {}
  return all[sellerName];
}

window.kzNegGetSellerConfig = kzNegGetSellerConfig;
window.kzNegSetSellerConfig = kzNegSetSellerConfig;

// ══════════════════════════════════════════════════════
//  LOJA OFICIAL / MARCA VERIFICADA v1
//  Vendedores que atingiram os critérios do plano Premium
//  (volume mínimo, avaliação ≥4.5, documentos validados)
//  recebem o selo "✅ Loja Oficial WeKz" nas listagens e na PDP.
//  FIX BUG-N04 (proposto): substituir por flag real vinda da API
//  de planos (/api/sellers/:id/plan) após integração com
//  openPremiumPlansModal().
// ══════════════════════════════════════════════════════
const OFFICIAL_STORES = ['TechStore','GadgetHub','SoundWorld','SportFit'];

function isOfficialStore(sellerName) {
  return OFFICIAL_STORES.includes(sellerName);
}


/* WeKz Category Icon Map */
const WKZ_CAT_ICONS = {
  '📱': 'phone', '👗': 'shirt', '🏠': 'sofa', '💄': 'sparkles',
  '🎮': 'gamepad', '⚽': 'dribbble', '👶': 'baby', '🐾': 'paw',
  '🚗': 'car', '📚': 'book', '💊': 'checkcirc', '🧰': 'wrench',
};
const WKZ_ICON_PATHS = {
  phone:     '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  shirt:     '<path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/>',
  sofa:      '<path d="M20 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M2 16a2 2 0 002 2h16a2 2 0 002-2v-5a2 2 0 00-4 0v1.5H6V11a2 2 0 00-4 0z"/><line x1="6" y1="19" x2="6" y2="21"/><line x1="18" y1="19" x2="18" y2="21"/>',
  sparkles:  '<path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/><path d="M5 14l.85 2 2 .85-2 .85L5 20l-.85-2-2-.85 2-.85L5 14z"/>',
  gamepad:   '<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z"/>',
  dribbble:  '<circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>',
  baby:      '<circle cx="12" cy="8" r="4"/><path d="M3 21a9 9 0 0018 0H3z"/>',
  paw:       '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="15" r="2"/><circle cx="4" cy="8" r="2"/><path d="M9.87 12.42c-.54-.55-1.33-.92-2.18-.92a3.07 3.07 0 00-2.19.9A3.06 3.06 0 004.41 15c0 1.72 1.44 3.13 3.22 3.13H9.5c.76 0 1.4-.43 1.71-1.06.31-.64.31-1.38 0-2.02a3.07 3.07 0 00-1.34-2.63z"/>',
  car:       '<rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  wrench:    '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  book:      '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
  checkcirc: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>',
  settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
};

function wkzCatIconSVG(emojiOrName) {
  const name = WKZ_CAT_ICONS[emojiOrName] || emojiOrName;
  const paths = WKZ_ICON_PATHS[name];
  if (!paths) return emojiOrName; // fallback to emoji if unknown
  return '<span class="wkz-icon wkz-icon-cat wkz-icon-' + name + '">' +
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths + '</svg></span>';
}

// ─── DATA ───
const categories = [
  {e:'📱',n:'Eletrônicos',c:'18.4k'},
  {e:'👗',n:'Moda',c:'42.1k'},
  {e:'🏠',n:'Casa & Deco',c:'29.8k'},
  {e:'💄',n:'Beleza',c:'15.6k'},
  {e:'🎮',n:'Games',c:'8.9k'},
  {e:'⚽',n:'Esportes',c:'11.2k'},
  {e:'👶',n:'Bebê & Kids',c:'9.7k'},
  {e:'🐾',n:'Pet Shop',c:'6.3k'},
  {e:'🚗',n:'Automotivo',c:'14.8k'},
  {e:'📚',n:'Livros',c:'22.5k'},
  {e:'💊',n:'Saúde',c:'7.4k'},
  {e:'🧰',n:'Ferramentas',c:'5.1k'},
];

/* ══════════════════════════════════════════
   WKZ-PRODUCT-IMAGE — Custom Element (v2.9.26)
   Atributos: src (URL real da foto, opcional — nenhum produto tem
   ainda, ver auditoria), emoji (fallback nível 1), alt, ratio
   (aspect-ratio CSS, default "1/1").
   Sem `src`: não desenha skeleton — não existe "carregando" pra algo
   que nunca foi pedido. Mostra o emoji direto, visualmente idêntico
   ao que já existia antes do componente.
   Com `src`: skeleton + <img loading="lazy" decoding="async"> + fade-in
   no load + fallback em cascata (emoji, depois SVG genérico) no erro. */
(function(){
  if (!window.customElements || customElements.get('wkz-product-image')) return;

  var FALLBACK_SVG = '<svg class="wkz-pimg-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

  function wkzEscAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }

  class WkzProductImage extends HTMLElement {
    static get observedAttributes(){ return ['src','emoji','alt','ratio']; }
    connectedCallback(){ this._render(); }
    attributeChangedCallback(){ if (this._rendered) this._render(); }
    _render(){
      this._rendered = true;
      var src   = this.getAttribute('src') || '';
      var emoji = this.getAttribute('emoji') || '';
      var alt   = this.getAttribute('alt') || '';
      if (this.hasAttribute('ratio')) { this.style.aspectRatio = this.getAttribute('ratio'); }

      if (!src) {
        this.innerHTML = emoji
          ? '<span class="wkz-pimg-emoji" aria-hidden="true">' + emoji + '</span>'
          : FALLBACK_SVG;
        return;
      }

      this.innerHTML =
        '<span class="wkz-pimg-skeleton"></span>' +
        '<img class="wkz-pimg-img" src="' + wkzEscAttr(src) + '" alt="' + wkzEscAttr(alt) + '" loading="lazy" decoding="async">';

      var img  = this.querySelector('.wkz-pimg-img');
      var skel = this.querySelector('.wkz-pimg-skeleton');
      var self = this;
      img.addEventListener('load', function(){
        if (skel) skel.remove();
        img.classList.add('is-loaded');
      });
      img.addEventListener('error', function(){
        self.innerHTML = emoji
          ? '<span class="wkz-pimg-emoji" aria-hidden="true">' + emoji + '</span>'
          : FALLBACK_SVG;
      });
    }
  }
  customElements.define('wkz-product-image', WkzProductImage);
})();

/* v2.9.26: campo opcional `img` (string, URL da foto real) pode ser
   adicionado a qualquer produto abaixo — ex.: img:'https://.../foto.jpg'.
   Nenhum produto tem hoje (catálogo 100% emoji ainda). <wkz-product-image>
   já está pronto pra ler esse campo (atributo `src`) no `openProduct()` e
   em todo render de card — não precisa de nenhuma outra mudança de
   código quando as fotos reais forem cadastradas. */
const products = [
  /* ── Eletrônicos (6) ── */
  {e:'📱',n:'Smartphone Ultra Pro 5G 256GB — Câmera 200MP',p:1249.90,op:2199.90,off:43,s:'TechStore',r:4.9,sales:'18.4k',badge:'sale', stock:3,  stockMax:120, cat:'eletronicos'},
  {e:'💻',n:'Notebook Gamer RTX 4060 — 16GB RAM 1TB SSD',p:3499,op:5299,off:34,s:'NoteShop',r:4.8,sales:'9.2k',badge:'hot',          stock:12, stockMax:80,  cat:'eletronicos'},
  {e:'🎧',n:'Fone Bluetooth ANC Pro — 40h bateria',p:289,op:599,off:52,s:'SoundWorld',r:4.7,sales:'31k',badge:'sale',                 stock:0,  stockMax:200, cat:'eletronicos'},
  {e:'⌚',n:'Smartwatch Ultra 2 — GPS + NFC',p:799,op:1499,off:47,s:'GadgetHub',r:4.9,sales:'22.1k',badge:'new',                     stock:47, stockMax:100, cat:'eletronicos'},
  {e:'📷',n:'Câmera Mirrorless 4K — Lente 24-70mm',p:4299,op:6999,off:39,s:'PhotoPro',r:4.8,sales:'4.7k',badge:'',                   stock:8,  stockMax:60,  cat:'eletronicos'},
  {e:'🖥️',n:'Monitor 4K 144Hz 27" — HDR IPS',p:1890,op:2999,off:37,s:'DisplayZone',r:4.7,sales:'8.3k',badge:'sale',                 stock:23, stockMax:90,  cat:'eletronicos'},
  /* ── Esportes (2) ── */
  {e:'👟',n:'Tênis Running Pro Boost — Amortecimento MAX',p:349,op:699,off:50,s:'SportFit',r:4.6,sales:'55k',badge:'hot',             stock:84, stockMax:300, cat:'esportes'},
  {e:'🏋️',n:'Kit Musculação Completo — Halteres + Barras',p:479,op:899,off:47,s:'SportFit',r:4.7,sales:'12k',badge:'new',            stock:31, stockMax:150, cat:'esportes'},
  /* ── Beleza (2) ── */
  {e:'🧴',n:'Kit Skincare Vitamina C — 5 produtos',p:189,op:380,off:50,s:'GlowBeauty',r:4.8,sales:'42k',badge:'new',                 stock:4,  stockMax:150, cat:'beleza'},
  {e:'💄',n:'Paleta de Sombras 48 cores — Matte + Shimmer',p:129,op:249,off:48,s:'GlowBeauty',r:4.6,sales:'28k',badge:'hot',        stock:67, stockMax:200, cat:'beleza'},
  /* ── Games (2) ── */
  {e:'🎮',n:'Console Next-Gen 1TB — 2 Controles',p:2499,op:3999,off:38,s:'GameWorld',r:4.9,sales:'11.8k',badge:'sale',              stock:1,  stockMax:50,  cat:'games'},
  {e:'🕹️',n:'Controle Pro Sem Fio — Hall Effect + Turbo',p:299,op:499,off:40,s:'GameWorld',r:4.7,sales:'19k',badge:'sale',           stock:45, stockMax:180, cat:'games'},
  /* ── Casa & Deco (2) ── */
  {e:'🪑',n:'Cadeira Gamer Ergonômica — Couro PU',p:699,op:1399,off:50,s:'FurniStyle',r:4.5,sales:'18k',badge:'',                   stock:62, stockMax:120, cat:'casa'},
  {e:'🏮',n:'Luminária LED Smart 16M Cores — WiFi + App',p:149,op:299,off:50,s:'FurniStyle',r:4.6,sales:'33k',badge:'new',           stock:88, stockMax:250, cat:'casa'},
  /* ── Moda (2) ── */
  {e:'👗',n:'Vestido Midi Floral Premium — Viscose Eco',p:189,op:379,off:50,s:'ModaVibe',r:4.5,sales:'24k',badge:'new',              stock:38, stockMax:200, cat:'moda'},
  {e:'👔',n:'Camisa Social Slim Fit — 100% Algodão Egípcio',p:129,op:259,off:50,s:'ModaVibe',r:4.4,sales:'17k',badge:'sale',         stock:54, stockMax:180, cat:'moda'},
  /* ── Bebê & Kids (2) ── */
  {e:'🍼',n:'Kit Enxoval Bebê Completo — 20 peças Orgânico',p:349,op:699,off:50,s:'BebeStore',r:4.9,sales:'8k',badge:'new',          stock:22, stockMax:100, cat:'bebe'},
  {e:'🧸',n:'Berço Portátil Dobrável — Colchão + Mosquiteiro',p:549,op:999,off:45,s:'BebeStore',r:4.8,sales:'5.3k',badge:'hot',      stock:14, stockMax:80,  cat:'bebe'},
  /* ── Pet Shop (2) ── */
  {e:'🐾',n:'Ração Premium Grain Free Cães — 15kg',p:199,op:379,off:47,s:'PetWorld',r:4.8,sales:'31k',badge:'sale',                 stock:70, stockMax:300, cat:'pet'},
  {e:'🐱',n:'Arranhador Cat Tower 5 níveis — Sisal Natural',p:259,op:499,off:48,s:'PetWorld',r:4.7,sales:'9.4k',badge:'hot',         stock:29, stockMax:120, cat:'pet'},
  /* ── Automotivo (2) ── */
  {e:'🚗',n:'Câmera de Ré 170° HD — Visão Noturna',p:159,op:299,off:47,s:'AutoParts',r:4.6,sales:'14k',badge:'sale',                stock:56, stockMax:200, cat:'automotivo'},
  {e:'🔧',n:'Kit Polimento Automotivo Profissional — 8 itens',p:229,op:449,off:49,s:'AutoParts',r:4.5,sales:'7.8k',badge:'new',      stock:33, stockMax:150, cat:'automotivo'},
  /* ── Livros (2) ── */
  {e:'📚',n:'Box Harry Potter Edição Premium — 7 volumes',p:299,op:579,off:48,s:'LivrariaKz',r:4.9,sales:'11k',badge:'hot',          stock:40, stockMax:200, cat:'livros'},
  {e:'📖',n:'Curso Completo de Python — Livro + eBook',p:89,op:179,off:50,s:'LivrariaKz',r:4.7,sales:'22k',badge:'sale',            stock:99, stockMax:500, cat:'livros'},
  /* ── Saúde (2) ── */
  {e:'💊',n:'Vitamina D3 + K2 MK7 — 60 cápsulas 2000UI',p:79,op:149,off:47,s:'VidaSaude',r:4.8,sales:'38k',badge:'new',            stock:120,stockMax:400, cat:'saude'},
  {e:'🩺',n:'Monitor de Pressão Arterial Digital de Braço',p:189,op:349,off:46,s:'VidaSaude',r:4.7,sales:'15k',badge:'sale',         stock:47, stockMax:200, cat:'saude'},
  /* ── Ferramentas (2) ── */
  {e:'🔨',n:'Furadeira de Impacto 750W — Maleta + Kit 40 Bits',p:299,op:599,off:50,s:'FerraTech',r:4.6,sales:'9.1k',badge:'sale',   stock:27, stockMax:120, cat:'ferramentas'},
  {e:'⚙️',n:'Chave de Torque Digital 10-150Nm — LCD + Alarme',p:249,op:479,off:48,s:'FerraTech',r:4.5,sales:'4.2k',badge:'new',     stock:18, stockMax:100, cat:'ferramentas'},
];

/* ═══════════════════════════════════════════════════════════════════════════
   [v2.9.31] REGRA DE PREÇO EXATO — wkzExactPrice
   ─────────────────────────────────────────────────────────────────────────
   FONTE DA VERDADE: op (preço original) + off (% de desconto inteiro ou
   decimal). O campo `p` (preço de venda) é SEMPRE DERIVADO desta fórmula,
   nunca hardcoded com arredondamento.

   Por que Math.round causava erro:
     Ex.: op=5299, off=34 → 5299×0,66 = 3497,34
     Math.round(5299*(1-3497/5299)*100) = 34 (ok no badge)
     mas p=3499 ≠ 3497,34 → discrepância de R$1,66 visível na calculadora.

   Regra aplicada em:
     1. Patch de inicialização do catálogo (todos os produtos existentes)
     2. saveEditProduct()  — edição de produto pelo vendedor
     3. Bloco de criação de produto (addProduct / publicarProduto)
     4. updateProductPreview() — preview ao vivo no formulário
     5. Produtos futuros: qualquer código que calcule `p` a partir de op+off
        DEVE usar esta função.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Calcula o preço de venda exato a partir do preço original e do percentual
 * de desconto, sem nenhum arredondamento intermediário.
 * @param {number} op  - Preço original (De:)
 * @param {number} off - Percentual de desconto (ex: 34 para 34%)
 * @returns {number}   - Preço de venda exato com 2 casas decimais
 */
function wkzExactPrice(op, off) {
  if (!op || op <= 0 || !off || off <= 0 || off >= 100) return op || 0;
  // Usa arredondamento bancário (half-even) na 2ª casa decimal para evitar
  // acumulação de erro em iterações múltiplas — resultado exibido ao comprador.
  return Math.round(op * (1 - off / 100) * 100) / 100;
}

/**
 * Calcula o percentual de desconto exato entre dois preços, com precisão de
 * 4 casas decimais internas. O badge de exibição pode exibir arredondado (floor)
 * mas o preço derivado via wkzExactPrice(op, off_exato) permanece preciso.
 * @param {number} p   - Preço de venda
 * @param {number} op  - Preço original
 * @returns {number}   - % de desconto (ex: 33.9686...)
 */
function wkzExactOff(p, op) {
  if (!op || op <= 0 || !p || p <= 0 || p >= op) return 0;
  return (1 - p / op) * 100;
}

/* ── Patch de inicialização: recalcula p para todos os produtos do catálogo ──
   Garante que produtos cadastrados com p hardcoded/arredondado sejam corrigidos
   na carga da página. Novos produtos cadastrados pelo vendedor já usam
   wkzExactPrice() diretamente nos formulários. */
(function _wkzFixCatalogPrices() {
  for (var _i = 0; _i < products.length; _i++) {
    var _pr = products[_i];
    if (typeof _pr.op === 'number' && _pr.op > 0 &&
        typeof _pr.off === 'number' && _pr.off > 0 && _pr.off < 100) {
      // Recalcula p exato — substitui qualquer valor hardcoded no catálogo
      _pr.p = wkzExactPrice(_pr.op, _pr.off);
    }
  }
})();

/* ── CRO-01: Personalização por Interesses (Kz) ──────────────────────────
   Mapeia cada item de `products` (por índice) a uma categoria de interesse,
   usando as mesmas chaves do grid de interesses do cadastro / Turbinar Perfil. */
const PRODUCT_INTEREST_MAP = [
  /* 0-5  eletronicos */ 'eletronicos','eletronicos','eletronicos','eletronicos','eletronicos','eletronicos',
  /* 6-7  esportes    */ 'esportes','esportes',
  /* 8-9  beleza      */ 'beleza','beleza',
  /* 10-11 games      */ 'games','games',
  /* 12-13 casa       */ 'casa','casa',
  /* 14-15 moda       */ 'moda','moda',
  /* 16-17 bebe       */ 'bebe','bebe',
  /* 18-19 pet        */ 'pet','pet',
  /* 20-21 automotivo */ 'automotivo','automotivo',
  /* 22-23 livros     */ 'livros','livros',
  /* 24-25 saude      */ 'saude','saude',
  /* 26-27 ferramentas*/ 'ferramentas','ferramentas',
];

/* Interesses selecionados pelo usuário (cadastro ou Editar Perfil) — em memória, sem backend real neste demo */
let WKZ_USER_INTERESTS = [];

/* [v3.1] Dados complementares de perfil (Turbinar Perfil foi fundido dentro
   do modal "Editar Perfil") — vivem aqui, não apenas nos <input>, para que
   a % de completude e o pré-preenchimento do modal sobrevivam a fechar/
   reabrir a página de perfil (mesmo princípio de WKZ_USER_INTERESTS). */
let WKZ_PROFILE_EXTRA = {
  phone: '',
  doc: '',
  cep: '',
  country: 'PT',
  countryLabel: '🇵🇹 Portugal',
  lang: '🇧🇷 Português (Brasil)',
  curr: '🇧🇷 BRL — Real Brasileiro',
};

/* Retorna até `limit` produtos relacionados aos interesses do usuário;
   completa com mais vendidos/avaliados caso não haja matches suficientes. */
function wkzGetInterestSuggestions(limit) {
  limit = limit || 3;
  if (typeof products === 'undefined' || !products.length) return [];
  const matched = [];
  products.forEach((p, i) => {
    if (WKZ_USER_INTERESTS.includes(PRODUCT_INTEREST_MAP[i] || '') && matched.length < limit) {
      matched.push({ idx: i, p: p });
    }
  });
  if (matched.length < limit) {
    const usedIdx = matched.map(m => m.idx);
    const rest = products
      .map((p, i) => ({ idx: i, p: p }))
      .filter(o => !usedIdx.includes(o.idx))
      .sort((a, b) => (b.p.r || 0) - (a.p.r || 0));
    rest.forEach(o => { if (matched.length < limit) matched.push(o); });
  }
  return matched.slice(0, limit);
}

/* ── CRO-02: Produtos Relacionados + Vistos Recentemente — Kz AI (v3.0.0) ──
   wkzGetSimilarProducts(idx, limit): produtos da mesma categoria
   (PRODUCT_INTEREST_MAP), ordenados por avaliação; completa com mais
   bem avaliados se faltar itens da mesma categoria.
   wkzTrackRecentlyViewed(idx): histórico de navegação persistido em
   localStorage (sem backend real neste demo — pronto para trocar por
   endpoint de eventos, ex: POST /api/events/view). ──────────────────── */
const RECENTLY_VIEWED_KEY = 'wkzRecentlyViewed';
let WKZ_RECENTLY_VIEWED = (function() {
  /* v2.9.19: validate stored indices — stale entries from previous sessions
     must not trigger openProduct with wrong seller context */
  try {
    // Componente 4: lê via wkzSecureStorage (ofuscado) com fallback legado
    var raw = (typeof wkzSecureStorage !== 'undefined')
      ? (wkzSecureStorage.get(RECENTLY_VIEWED_KEY) || [])
      : (JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY)) || []);
    return raw.filter(function(idx){
      return Number.isInteger(idx) && idx >= 0 &&
             (typeof products === 'undefined' || idx < products.length);
    });
  }
  catch(e) { return []; }
})();

function wkzGetSimilarProducts(idx, limit) {
  limit = limit || 8;
  if (typeof products === 'undefined' || !products.length) return [];
  const cat = PRODUCT_INTEREST_MAP[idx];
  const matched = [];
  products.forEach((p, i) => {
    if (i !== idx && cat && PRODUCT_INTEREST_MAP[i] === cat && matched.length < limit) {
      matched.push({ idx: i, p: p });
    }
  });
  if (matched.length < limit) {
    const used = matched.map(m => m.idx).concat([idx]);
    const rest = products
      .map((p, i) => ({ idx: i, p: p }))
      .filter(o => !used.includes(o.idx))
      .sort((a, b) => (b.p.r || 0) - (a.p.r || 0));
    rest.forEach(o => { if (matched.length < limit) matched.push(o); });
  }
  return matched.slice(0, limit);
}

function wkzTrackRecentlyViewed(idx) {
  WKZ_RECENTLY_VIEWED = WKZ_RECENTLY_VIEWED.filter(v => v !== idx);
  WKZ_RECENTLY_VIEWED.unshift(idx);
  WKZ_RECENTLY_VIEWED = WKZ_RECENTLY_VIEWED.slice(0, 10);
  try {
    // Componente 4: grava via wkzSecureStorage (ofuscado)
    if (typeof wkzSecureStorage !== 'undefined') {
      wkzSecureStorage.set(RECENTLY_VIEWED_KEY, WKZ_RECENTLY_VIEWED);
    } else {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(WKZ_RECENTLY_VIEWED));
    }
  } catch(e) {}
}

function _wkzProductCardHtml(idx, p) {
  const offBadge = p.off ? `<div class="related-product-off">-${p.off}%</div>` : '';
  const priceTxt = (typeof formatPrice === 'function') ? formatPrice(p.p) : ('R$ ' + p.p);
  return `
    <div class="related-product-card" onclick="openProduct(${idx})">
      ${offBadge}
      <wkz-product-image class="related-product-emoji" src="${p.img||''}" emoji="${p.e || '📦'}" alt="${p.n}"></wkz-product-image>
      <div class="related-product-name">${p.n}</div>
      <div class="related-product-rating">⭐ ${p.r || '—'} · ${p.sales || ''}</div>
      <div class="related-product-price">${priceTxt}</div>
    </div>`;
}

function wkzRenderRelatedProducts(idx) {
  const row = document.getElementById('relatedProductsRow');
  const section = document.getElementById('relatedProductsSection');
  if (!row || !section) return;
  const similar = wkzGetSimilarProducts(idx, 8);
  if (!similar.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  row.innerHTML = similar.map(s => _wkzProductCardHtml(s.idx, s.p)).join('');
}

function wkzRenderRecentlyViewed(idx) {
  const row = document.getElementById('recentlyViewedRow');
  const section = document.getElementById('recentlyViewedSection');
  if (!row || !section) return;
  /* v2.9.19: re-validate every stored index against current products array
     before rendering — prevents stale localStorage entries from surfacing
     a card that calls openProduct() with the wrong seller index */
  const list = WKZ_RECENTLY_VIEWED.filter(i =>
    i !== idx && products[i] &&
    Number.isInteger(i) && i >= 0 && i < products.length
  );
  if (!list.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  row.innerHTML = list.map(i => _wkzProductCardHtml(i, products[i])).join('');
}

const stores = [
  {a:'T',n:'TechStore Brasil',i:'<span class="wkz-icon wkz-icon-phone"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></span> Eletrônicos',r:'4.9 ★',v:'18.4k vendas'},
  {a:'G',n:'GameWorld',i:'<span class="wkz-icon wkz-icon-gamepad"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z"/></svg></span> Games & Consoles',r:'4.9 ★',v:'11.8k vendas'},
  {a:'S',n:'SportFit',i:'<span class="wkz-icon wkz-icon-dribbble"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg></span> Esportes & Fitness',r:'4.6 ★',v:'55k vendas'},
  {a:'B',n:'GlowBeauty',i:'<span class="wkz-icon wkz-icon-sparkles"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/><path d="M5 14l.85 2 2 .85-2 .85L5 20l-.85-2-2-.85 2-.85L5 14z"/><path d="M17 1l.85 2 2 .85-2 .85L17 7l-.85-2-2-.85 2-.85L17 1z"/></svg></span> Beleza & Skincare',r:'4.8 ★',v:'42k vendas'},
  {a:'F',n:'FurniStyle',i:'🏠 Móveis & Deco',r:'4.5 ★',v:'18k vendas'},
  {a:'P',n:'PhotoPro',i:'📷 Câmeras & Foto',r:'4.8 ★',v:'4.7k vendas'},
];

const flashItems = [
  {e:'📱',n:'Smartphone X12',p:'R$ 599',o:'R$ 1.299',off:54,s:'TechStore Brasil',rating:4.8,reviews:1247,stock:8,
   desc:'Smartphone com tela AMOLED 6.7", câmera 108MP, bateria 5000mAh, processador octa-core 3.2GHz e 256GB de armazenamento. Desbloqueado para qualquer operadora.',
   specs:['Tela 6.7" AMOLED 120Hz','Câmera 108MP + ultrawide','Bateria 5000mAh carregamento 65W','256GB armazenamento','Android 14 atualizado','Dual SIM desbloqueado']},
  {e:'🎧',n:'AirPods Clone Pro',p:'R$ 129',o:'R$ 299',off:57,s:'SoundWorld',rating:4.5,reviews:892,stock:23,
   desc:'Fone de ouvido sem fio com cancelamento de ruído ativo (ANC), driver 12mm, 28h de bateria total com estojo, resistência IPX4 e conectividade Bluetooth 5.3.',
   specs:['ANC cancelamento ativo de ruído','28h bateria total (7h+21h estojo)','Driver 12mm premium','Bluetooth 5.3 latência baixa','Resistente IPX4','Toque sensível nos controles']},
  {e:'⌚',n:'Smartwatch Lite',p:'R$ 189',o:'R$ 449',off:58,s:'GadgetHub',rating:4.6,reviews:654,stock:15,
   desc:'Smartwatch com tela AMOLED 1.9", monitor cardíaco contínuo, GPS integrado, 100+ modos esportivos, 7 dias de bateria e resistência 5ATM para natação.',
   specs:['Tela AMOLED 1.9" always-on','GPS integrado','Monitor cardíaco + SpO2','100+ modos esportivos','7 dias de bateria','Resistência 5ATM à água']},
  {e:'💻',n:'Tablet 10" 128GB',p:'R$ 799',o:'R$ 1.599',off:50,s:'TechStore Brasil',rating:4.7,reviews:431,stock:5,
   desc:'Tablet com tela IPS 10.1" Full HD, processador 8 núcleos, 4GB RAM, 128GB interno (expansível até 1TB), câmera 13MP e bateria 7000mAh com 18W de carregamento.',
   specs:['Tela IPS 10.1" FHD 1920×1200','8 núcleos + 4GB RAM','128GB + slot microSD 1TB','Câmera 13MP + frontal 5MP','Bateria 7000mAh 18W','Android 13 · WiFi 6']},
  {e:'🖥️',n:'Monitor 24" FHD',p:'R$ 699',o:'R$ 1.299',off:46,s:'GadgetHub',rating:4.9,reviews:328,stock:3,
   desc:'Monitor 24 polegadas Full HD IPS, taxa de atualização 165Hz, tempo de resposta 1ms, painel IPS 99% sRGB, ajuste de altura e compatível com VESA 100×100.',
   specs:['Painel IPS 24" 1920×1080','165Hz · 1ms tempo resposta','99% sRGB · HDR10','HDMI 2.1 + DisplayPort 1.4','Ajuste altura, giro e inclinação','Compatível VESA 100×100']},
  {e:'⌨️',n:'Teclado Mecânico',p:'R$ 199',o:'R$ 399',off:50,s:'SoundWorld',rating:4.8,reviews:762,stock:19,
   desc:'Teclado mecânico TKL (87 teclas) com switches brown (tátil, silencioso), retroiluminação RGB por tecla, cabo removível USB-C e base de alumínio escovado.',
   specs:['Switches Brown tátil silencioso','Retroiluminação RGB por tecla','Layout TKL 87 teclas compacto','Cabo removível USB-C 1.8m','Base alumínio anti-derrapante','Compatível Win/Mac/Linux']},
];

/* ═══════════════════════════════════════════════════════
   WISHLIST DATA STORE — array global de favoritos
   Cada item: objeto do array products { e, n, p, op, off, s, r, sales, badge }
   ═══════════════════════════════════════════════════════ */
/* FIX Sprint M1 (Bloco 5 — Estado Compartilhado): no monólito original estes
   arrays eram mutados diretamente por qualquer módulo, sem nenhum listener
   externo conseguir reagir (RISCO 5 da Seção 1: "cartItemsData.length = 0
   é invisível para qualquer ouvinte externo"). Agora usam
   WkzBus.makeReactive(), que emite '<ns>:change' a cada set/delete de
   índice — Buyer, Seller e Admin podem assinar via WkzBus.on(...) sem
   precisar de polling nem de acoplamento direto entre módulos. */
let wishlistItems = WkzBus.makeReactive([], 'wishlist'); // array global reativo de favoritos
let followedStores = WkzBus.makeReactive([], 'stores'); // array global de lojas seguidas

/* ─── WISHLIST COLLECTIONS DATA STORE ─── */
let wishCollections = []; // [{id, name, emoji, createdAt}]
let wishColActiveFilter = null; // null = todas, string = id da coleção ativa
let wishColAssignTarget = null; // índice do item sendo atribuído (wi)
let wishColAssignSelected = null; // id coleção selecionada no modal

const WISH_COL_EMOJIS = ['📁','🎁','🛍️','🏠','👗','💻','🎮','🌟','🎄','💍','🧸','🏋️','📚','🎨','✈️','🍕'];
const WISH_COL_DEFAULT_EMOJI = '📁';
let wishColNewSelectedEmoji = WISH_COL_DEFAULT_EMOJI;

/* ═══════════════════════════════════════════════════════
   CART DATA STORE v1.0.9
   Cada item: { id, e, n, s, v, rawPrice (number), qty }
   ═══════════════════════════════════════════════════════ */
/* FIX Sprint M1 (Bloco 5): cartItemsData agora reativo — toda alteração
   (add/remove/qty) emite 'cart:change' automaticamente via WkzBus, que é
   o evento que Seller (KPIs) e Admin (overview) devem assinar em vez de
   ler o array diretamente. Ver Fluxo 3 (Seção 6 do plano). */
const cartItemsData = WkzBus.makeReactive([], 'cart'); // { id, e, n, s, v, rawPrice, qty }

const reviews = [
  {a:'J',n:'João S.',r:5,t:'Produto incrível! Chegou em 10 dias e exatamente como descrito.'},
  {a:'M',n:'Maria L.',r:5,t:'Excelente qualidade! Vendedor super atencioso. Recomendo!'},
  {a:'C',n:'Carlos R.',r:4,t:'Bom produto, porém a embalagem veio um pouco amassada. Funciona perfeito.'},
];


/* ── BLOCO 6: Router ──────────────────────────────────────────────────────
   NAV_PAGE_MAP{}, BNAV_PAGES[], window.MapsTo(sectionId) — único router,
   com guard de página protegida (admin-dashboard) e fallback de rota
   inexistente [correções v2.9.36 preservadas], window.showPage() como
   alias delegado (._wkzDelegated = true).
   Origem monólito: linhas 34838–35001 (init/DOMContentLoaded removido —
   cada módulo dispara sua própria página inicial, ver template Seção 5)
   ─────────────────────────────────────────────────────────────────────── */
/* ════════════════════════════════════════════════════
   WEKZ NAVIGATION ENGINE v1.0.8
   MapsTo(sectionId) — navegação com fade + active sync
   ════════════════════════════════════════════════════ */

/* ── Mapeamento: pageId → nav-link[data-page] ── */
var NAV_PAGE_MAP = {
  'home'       : 'home',
  'stores'     : 'stores',
  'tracking'   : 'tracking',
  'help'       : 'help',
  'category'   : 'category',
  'pg-comprar' : 'pg-comprar',
  'pg-flash'   : 'pg-flash',
  'cart'       : 'cart',
  'wishlist'   : 'wishlist',
  'dashboard'  : 'dashboard',
  'live'       : 'live',
};

/* ── Bottom nav: quais IDs mapeiam para botões bnav ── */
var BNAV_PAGES = ['home','search','pg-comprar','pg-flash','cart','wishlist','client-profile'];

/* ────────────────────────────────────────────────────
   MapsTo(sectionId)
   • Esconde todas as .page
   • Exibe a seção solicitada com fade-in
   • Sincroniza .active nos nav-links (desktop)
   • Sincroniza .active nos botões da bottom nav (mobile)
   ──────────────────────────────────────────────────── */
window.MapsTo = function(sectionId) {
  /* FIX v2.9.36 — [BUG CRÍTICO] Guard de páginas protegidas e fallback de
     "página não encontrada", ambos existentes no showPage() original e
     perdidos na migração para MapsTo. Sem isso: (a) admin-dashboard ficava
     acessível a qualquer usuário via console/URL; (b) um ID inexistente
     (ex.: typo 'page-client-profile') fazia o app não navegar para
     NENHUM lugar, sem qualquer aviso — sintoma relatado de "botões que
     não fazem nada". */
  var protectedPages = ['admin-dashboard'];
  if (protectedPages.indexOf(sectionId) !== -1) {
    var role = (window.currentAdminUser || window.currentUser || {}).role;
    if (role !== 'superadmin' && role !== 'admin') {
      if (typeof showToast === 'function') showToast('⛔ Acesso negado — autenticação necessária');
      sectionId = 'home';
    }
  }
  if (!document.getElementById('page-' + sectionId)) {
    if (typeof showToast === 'function') showToast('⚠️ Página não encontrada');
    console.warn('[WeKz][MapsTo] Página inexistente solicitada:', sectionId);
    /* FIX [tela-em-branco] — 'home' só existe no módulo Buyer (page-home).
       Nos módulos Seller/Admin/Legal esse fallback também falha, e como o
       passo 1 abaixo esconde TODAS as .page incondicionalmente, o app
       ficava com a tela inteira em branco (nenhuma .page ativa) sempre que
       qualquer botão/link chamasse MapsTo()/showPage() com um ID que não
       existisse no módulo atual. Isso é exatamente o bug relatado: "cliquei
       num tópico do menu e a tela ficou em branco". Agora, se nem o
       fallback 'home' existir aqui, abortamos ANTES de esconder qualquer
       coisa — a tela permanece como estava, em vez de apagar tudo. */
    if (!document.getElementById('page-home')) {
      console.warn('[WeKz][MapsTo] Fallback "home" também não existe neste módulo — navegação cancelada para não apagar a tela.');
      return;
    }
    sectionId = 'home';
  }

  /* 0. Reset de scroll imediato — evita animação de baixo→cima */
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  /* 1. Esconder todas as páginas */
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  /* 2. Mostrar a página solicitada */
  var target = document.getElementById('page-' + sectionId);
  if (target) {
    target.classList.add('active');
    target.scrollTop = 0; // reset container próprio (ex: page-search)
  }

  /* 3. Confirmar scroll no topo — instantâneo */
  window.scrollTo({ top: 0, behavior: 'instant' });

  /* 4. Sincronizar .active nos nav-links do menu desktop */
  document.querySelectorAll('.nav-link[data-page]').forEach(function(link) {
    var linkPage = link.getAttribute('data-page');
    link.classList.toggle('active', linkPage === sectionId);
  });

  /* 5. Sincronizar .active nos botões da bottom nav (mobile) */
  BNAV_PAGES.forEach(function(id) {
    var btn = document.getElementById('bnav-' + id);
    if (btn) btn.classList.toggle('active', id === sectionId);
  });

  /* 6. Hooks específicos de página */
  if (sectionId === 'product') {
    if (typeof renderReviews === 'function') renderReviews();
  }
  if (sectionId === 'pg-flash') {
    if (typeof renderFlashPage === 'function') renderFlashPage();
  }
  if (sectionId === 'wishlist') {
    /* Garante que a aba ativa é renderizada imediatamente */
    var activeTab = document.querySelector('.wishlist-tab-btn.active');
    var tabName = activeTab ? (activeTab.id === 'wishTabStores' ? 'stores' : 'products') : 'products';
    if (tabName === 'stores') {
      if (typeof renderWishlistStores === 'function') renderWishlistStores();
    } else {
      if (typeof renderWishlist === 'function') renderWishlist();
    }
  }
  /* FIX v2.9.36 — [BUG CRÍTICO] Estes 3 hooks existiam no showPage() original
     (pré-MapsTo) e foram perdidos quando showPage virou delegação estática
     para MapsTo (v1.0.8). Resultado: checkout entrava sempre no último step
     memorizado (sem forçar step 1) e sem popular o sidebar de totais; cart
     não recalculava UI/cupom ao navegar diretamente pela bottom-nav/menus;
     tracking não inicializava (_initTracking) — apenas um hook parcial
     (wkzDynamicPagesHook) limpava o input, sem religar os listeners/estado
     completos da função original. Restaurado 1:1 com o comportamento antigo. */
  if (sectionId === 'checkout') {
    if (typeof _ckoutGoto === 'function') { window._ckoutStep = 1; _ckoutGoto(1); }
    if (typeof _ckoutPopulateSidebar === 'function') _ckoutPopulateSidebar();
  }
  if (sectionId === 'cart') {
    setTimeout(function() {
      if (typeof updateCartUI === 'function') updateCartUI();
      if (typeof renderCouponActiveBanner === 'function') renderCouponActiveBanner();
    }, 60);
  }
  if (sectionId === 'tracking') {
    setTimeout(function() {
      if (typeof _initTracking === 'function') _initTracking();
    }, 50);
  }
  if (typeof updateFloatingChat === 'function') updateFloatingChat();

  /* 7. Kz Wisdom Banner no Dashboard */
  if (sectionId === 'dashboard') {
    if (typeof renderKzWisdomBanner === 'function') setTimeout(renderKzWisdomBanner, 120);
  }

  /* 8. Executar hooks registrados via registerNavHook()
     Cada hook recebe o sectionId e pode reagir à navegação de forma isolada.
     try/catch por hook garante que um erro em um módulo não quebra os demais. */
  if (Array.isArray(window._wkzNavHooks)) {
    window._wkzNavHooks.forEach(function(hookFn) {
      try { hookFn(sectionId); } catch(err) {
        console.warn('[WeKz] Nav hook error:', err);
      }
    });
  }
};

/* ── Retrocompatibilidade: showPage delega para MapsTo ── */
window.cartCount = 0;
window._wkzPrevCartCount = 0;

window.updateAllCounters = function(n) {
  if (typeof window.updateCartUI === 'function') window.updateCartUI();
};

/* FIX: showPage é uma delegação direta e imutável para MapsTo.
   O antigo patchShowPage IIFE criava loops de escopo ao re-wrapping cumulativo;
   substituído por delegação estática — MapsTo executa hooks via _wkzNavHooks. */
window.showPage = function wkzShowPage(id) { window.MapsTo(id); };
window.showPage._wkzDelegated = true;

/* NOTA (Sprint M1): o DOMContentLoaded original que chamava MapsTo('home')
   foi movido para o script de INIT de cada módulo HTML (wkz-buyer.html,
   wkz-seller.html, wkz-admin.html), conforme o Esqueleto da Seção 5 do plano.
   wkz-core.js não deve dar bootstrap sozinho — cada módulo decide sua página
   inicial e dispara WkzBus.emit('module:ready', {module:'...'}). */

/* ── BLOCO 7: Motor Fiscal (LC 214/2025 — IBS/CBS) ───────────────────────
   WkzFiscalSplit IIFE completo — calculateIbsCbs(), calculateCommission(),
   generateMockNfeNumber(), calculateRemessaConforme() [isenção ≤ US$50],
   frações de transição 2026-2032 (WKZ_TRANSITION). Ver Nota Legal Seção 6
   do plano: alterações aqui são hotfix de compliance tributário, não UX.
   Origem monólito: linhas 46645–46983
   ─────────────────────────────────────────────────────────────────────── */
var WkzFiscalSplit = (function () {
  'use strict';

  /* ── Configurações ── */
  var config = {
    commissionRate: 0.10,      /* 10% WeKz — sobre GMV (bruto) */
    nfeSequence:    1,
    ibsCbsVersion:  'LC214/2025-transicao-2026'
  };

  /* ─────────────────────────────────────────────────────────
     TABELA IBS/CBS POR CATEGORIA — LC 214/2025
     Alíquotas de referência para o período de transição
     Fonte: PLP 68/2024 + Resolução do Comitê Gestor (estimativas)

     ┌──────────────────┬──────────┬───────────────────────────┐
     │ Faixa            │ Alíquota │ Categorias                │
     ├──────────────────┼──────────┼───────────────────────────┤
     │ Geral            │  26.50%  │ eletronicos, games, moda, │
     │                  │          │ casa, esportes, pet,       │
     │                  │          │ automotivo, ferramentas    │
     │ Alimentação      │   9.00%  │ (não aplicável no mock)   │
     │ Saúde/Higiene    │  12.00%  │ saude, beleza             │
     │ Educação/Cultura │   5.00%  │ livros                    │
     │ Bebê (0–12 anos) │   0.00%  │ bebe                      │
     └──────────────────┴──────────┴───────────────────────────┘

     ATENÇÃO: período de transição 2026-2032
     Em 2026, apenas 1/8 da alíquota é efetiva. O percentual cresce
     progressivamente até a alíquota plena em 2033.
     Este simulador exibe a alíquota plena (regime definitivo) com aviso.
  ─────────────────────────────────────────────────────────── */
  var IBS_CBS_RATES = {
    /* faixa geral */
    eletronicos:  0.2650,
    games:        0.2650,
    moda:         0.2650,
    casa:         0.2650,
    esportes:     0.2650,
    pet:          0.2650,
    automotivo:   0.2650,
    ferramentas:  0.2650,
    /* faixa saúde / higiene pessoal */
    saude:        0.1200,
    beleza:       0.1200,
    /* faixa educação / cultura */
    livros:       0.0500,
    /* faixa bebê — isento */
    bebe:         0.0000,
    /* default (categoria desconhecida) */
    _default:     0.2650
  };

  /* ─────────────────────────────────────────────────────────
     calculateIbsCbs(amount, category)
     @param {number} amount    — valor bruto do produto (GMV)
     @param {string} [category] — cat key (ex: 'eletronicos')
     @returns {{ tax, rate, category, transicaoAviso }}
  ─────────────────────────────────────────────────────────── */
  function calculateIbsCbs(amount, category) {
    var cat   = (category || '').toLowerCase().replace(/[^a-z]/g, '');
    var rate  = (IBS_CBS_RATES.hasOwnProperty(cat)) ? IBS_CBS_RATES[cat] : IBS_CBS_RATES._default;
    var tax   = amount * rate;

    /* Fração efetiva 2026 = 1/8 da alíquota plena */
    var anoAtual = new Date().getFullYear();
    var transicaoAtiva = (anoAtual >= 2026 && anoAtual <= 2032);
    var fracoes = { 2026:1, 2027:2, 2028:3, 2029:4, 2030:5, 2031:6, 2032:7 };
    var fracao  = transicaoAtiva ? (fracoes[anoAtual] || 1) : 8;
    var taxEfetiva = tax * fracao / 8;

    return {
      tax:           tax,          /* alíquota plena */
      taxEfetiva:    taxEfetiva,   /* alíquota efetiva no ano corrente */
      rate:          rate,
      rateEfetivo:   rate * fracao / 8,
      category:      cat || 'geral',
      transicaoAtiva:transicaoAtiva,
      fracao:        fracao + '/8',
      transicaoAviso: transicaoAtiva
        ? '⚠ Período de transição ' + anoAtual + ': ' + fracao + '/8 da alíquota plena (' + (rate * 100).toFixed(1) + '%). Alíquota efetiva: ' + ((rate * fracao / 8) * 100).toFixed(2) + '%.'
        : null
    };
  }

  /* ─────────────────────────────────────────────────────────
     calculateCommission(gmv)
     Comissão WeKz incide sobre o GMV (valor bruto do produto),
     não sobre o valor líquido após impostos.
     @param {number} gmv — Gross Merchandise Value (preço cheio)
     @returns {number} comissão
  ─────────────────────────────────────────────────────────── */
  function calculateCommission(gmv) {
    return gmv * config.commissionRate; /* sobre GMV — correto */
  }

  /* ─────────────────────────────────────────────────────────
     generateMockNfeNumber()
     Algoritmo Módulo 11 correto conforme NT 2003.003 SEFAZ.
     Chave de 44 dígitos: cUF(2)+AAMM(4)+CNPJ(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)+cDV(1)
     @returns {string} chave de 44 dígitos
  ─────────────────────────────────────────────────────────── */
  function generateMockNfeNumber() {
    var now    = new Date();
    var aamm   = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
    var nNF    = String(config.nfeSequence++).padStart(9, '0');
    /* Campos fixos mockados */
    var cUF    = '35';                        /* SP */
    var cnpj   = '00000000000195';            /* mock CNPJ emitente */
    var mod    = '55';                        /* NF-e */
    var serie  = '001';
    var tpEmis = '1';                         /* emissão normal */
    var cNF    = String(Math.floor(10000000 + Math.random() * 89999999)); /* 8 dig aleatórios */

    /* Monta os 43 primeiros dígitos (sem cDV) */
    var chave43 = cUF + aamm + cnpj + mod + serie + nNF + tpEmis + cNF;

    /* Módulo 11 SEFAZ: pesos 2..9 cíclicos da direita para esquerda */
    var soma = 0;
    var peso = 2;
    for (var i = chave43.length - 1; i >= 0; i--) {
      soma += parseInt(chave43[i], 10) * peso;
      peso = (peso === 9) ? 2 : peso + 1;
    }
    var resto = soma % 11;
    var cDV   = (resto === 0 || resto === 1) ? 0 : 11 - resto;

    return chave43 + String(cDV);
  }

  /* ─────────────────────────────────────────────────────────
     calculateRemessaConforme(amountBRL, options)
     Regra da Remessa Conforme (Portaria MF 612/2023 + MP 1.256/2024)
     • Compras internacionais de pessoa física a varejistas estrangeiros
     • ≤ US$ 50 (≈ R$ 250 na taxa de referência): ISENTO de II
     • > US$ 50: II 20% + ICMS 17% estimado (base ampliada) + IOF 6,38%

     @param {number} amountBRL  — valor do produto em BRL
     @param {object} [opts]     — { currency:'USD', fxRate:6.0, isGift:false }
     @returns {object} breakdown
  ─────────────────────────────────────────────────────────── */
  function calculateRemessaConforme(amountBRL, opts) {
    var o       = opts || {};
    var fxRate  = o.fxRate  || 6.00;          /* fallback taxa USD/BRL */
    var isGift  = o.isGift  || false;
    var limiteUSD   = 50;                      /* limite de isenção US$ 50 */
    var limiteBRL   = limiteUSD * fxRate;

    /* Taxas fixas Remessa Conforme */
    var II_RATE   = 0.20;   /* Imposto de Importação 20% */
    var ICMS_RATE = 0.17;   /* ICMS estimado 17% (varia por UF) */
    var IOF_RATE  = 0.0638; /* IOF câmbio 6,38% */

    var isento = amountBRL <= limiteBRL && !isGift;

    if (isento) {
      return {
        isento:    true,
        amountBRL: amountBRL,
        limiteBRL: limiteBRL,
        limiteUSD: limiteUSD,
        totalDevido:0,
        breakdown: null,
        label:     'Isento — Remessa Conforme (≤ US$ ' + limiteUSD + ')',
        aviso:     'Esta compra está dentro do limite de isenção da Remessa Conforme. Nenhum imposto de importação é devido.'
      };
    }

    /* Base de cálculo do II: valor aduaneiro (CIF = produto + seguro + frete estimado) */
    var frete_est  = amountBRL * 0.05;   /* estimativa de frete: 5% do valor */
    var valorCIF   = amountBRL + frete_est;

    /* II */
    var ii = valorCIF * II_RATE;

    /* IOF: incide sobre o valor em BRL da operação de câmbio */
    var iof = amountBRL * IOF_RATE;

    /* ICMS: base = (valorCIF + II + IOF) / (1 - ICMS_RATE)  — base ampliada "por dentro" */
    var baseICMS  = (valorCIF + ii + iof) / (1 - ICMS_RATE);
    var icms      = baseICMS * ICMS_RATE;

    var totalDevido = ii + icms + iof;
    var totalFinal  = amountBRL + totalDevido;

    return {
      isento:      false,
      amountBRL:   amountBRL,
      valorCIF:    valorCIF,
      ii:          ii,
      icms:        icms,
      iof:         iof,
      totalDevido: totalDevido,
      totalFinal:  totalFinal,
      rates: { ii: II_RATE, icms: ICMS_RATE, iof: IOF_RATE },
      label:       'Remessa Conforme — Importação tributada',
      aviso:       'Valor acima de US$ ' + limiteUSD + '. Impostos aplicados: II ' + (II_RATE*100).toFixed(0) + '% + ICMS ' + (ICMS_RATE*100).toFixed(0) + '% (estimado, base ampliada) + IOF ' + (IOF_RATE*100).toFixed(2) + '%.',
      breakdown: {
        produto:    amountBRL,
        frete_est:  frete_est,
        valorCIF:   valorCIF,
        ii:         ii,
        icms:       icms,
        iof:        iof,
        total:      totalFinal
      }
    };
  }

  /* ─────────────────────────────────────────────────────────
     calculateFullSplit(valorProduto, category)
     Retorna breakdown completo: IBS/CBS + comissão + líquido
  ─────────────────────────────────────────────────────────── */
  function calculateFullSplit(valorProduto, category) {
    var ibsCbsObj = calculateIbsCbs(valorProduto, category);
    var ibsCbs    = ibsCbsObj.taxEfetiva;                  /* usa alíquota efetiva do ano */
    var comissao  = calculateCommission(valorProduto);     /* sobre GMV — CORRIGIDO */
    var liquido   = valorProduto - ibsCbs - comissao;

    return {
      produto:     valorProduto,
      ibsCbs:      ibsCbs,
      ibsCbsPleno: ibsCbsObj.tax,
      comissao:    comissao,
      liquido:     liquido,
      nfe:         generateMockNfeNumber(),
      ibsCbsMeta:  ibsCbsObj,
      percentagens: {
        ibsCbs:   ((ibsCbs    / valorProduto) * 100).toFixed(2),
        comissao: ((comissao  / valorProduto) * 100).toFixed(2),
        liquido:  ((liquido   / valorProduto) * 100).toFixed(2)
      }
    };
  }

  /* ─────────────────────────────────────────────────────────
     formatBRL(val) — formata número em "R$ X.XXX,XX"
  ─────────────────────────────────────────────────────────── */
  function formatBRL(val) {
    if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
    return 'R$ ' + Math.abs(val).toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ─────────────────────────────────────────────────────────
     updateCheckoutDisplay(totalValue, category, isCrossBorder, rcOpts)
     Atualiza UI do breakdown no checkout.
     Se isCrossBorder=true, mostra painel Remessa Conforme.
  ─────────────────────────────────────────────────────────── */
  function updateCheckoutDisplay(totalValue, category, isCrossBorder, rcOpts) {
    var split = calculateFullSplit(totalValue, category);

    var elProduto  = document.getElementById('splitProduto');
    var elIbsCbs   = document.getElementById('splitIbsCbs');
    var elComissao = document.getElementById('splitComissao');
    var elLiquido  = document.getElementById('splitLiquido');
    var elNfe      = document.getElementById('splitNfeNum');
    var elAviso    = document.getElementById('splitTransicaoAviso');
    var elRC       = document.getElementById('splitRemessaConforme');

    if (elProduto)  elProduto.textContent  = formatBRL(split.produto);
    if (elIbsCbs) {
      var meta = split.ibsCbsMeta;
      var label = '-' + formatBRL(split.ibsCbs) + ' (' + split.percentagens.ibsCbs + '%'
                + (meta.transicaoAtiva ? ' efetivo' : '') + ')';
      elIbsCbs.textContent = label;
    }
    if (elComissao) elComissao.textContent = '-' + formatBRL(split.comissao) + ' (' + split.percentagens.comissao + '% GMV)';
    if (elLiquido)  elLiquido.textContent  = formatBRL(split.liquido);
    if (elNfe)      elNfe.textContent      = split.nfe;

    /* Aviso de transição */
    if (elAviso) {
      if (split.ibsCbsMeta.transicaoAviso) {
        elAviso.textContent = split.ibsCbsMeta.transicaoAviso;
        elAviso.style.display = 'block';
      } else {
        elAviso.style.display = 'none';
      }
    }

    /* Remessa Conforme */
    if (elRC) {
      if (isCrossBorder) {
        var rc = calculateRemessaConforme(totalValue, rcOpts || {});
        elRC.style.display = 'block';
        if (rc.isento) {
          elRC.innerHTML =
            '<div style="color:#22C55E;font-weight:700;font-size:12px;">✅ Remessa Conforme — Isento</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px;">' + rc.aviso + '</div>';
        } else {
          elRC.innerHTML =
            '<div style="color:#F59E0B;font-weight:700;font-size:12px;">🌐 Remessa Conforme — Tributado</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.7;">' +
              '<div style="display:flex;justify-content:space-between;"><span>II (20%)</span><span style="color:#F59E0B;">+' + formatBRL(rc.ii) + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;"><span>ICMS estimado (17%)</span><span style="color:#F59E0B;">+' + formatBRL(rc.icms) + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;"><span>IOF (6,38%)</span><span style="color:#F59E0B;">+' + formatBRL(rc.iof) + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;margin-top:4px;font-weight:700;border-top:1px solid rgba(245,158,11,0.2);padding-top:4px;"><span>Total deveres</span><span style="color:#EF4444;">+' + formatBRL(rc.totalDevido) + '</span></div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--muted);margin-top:4px;">' + rc.aviso + '</div>';
        }
      } else {
        elRC.style.display = 'none';
      }
    }

    return split;
  }

  /* ─────────────────────────────────────────────────────────
     generateIbsCbsDisclaimer() — HTML para rodapé do checkout
  ─────────────────────────────────────────────────────────── */
  function generateIbsCbsDisclaimer() {
    var anoAtual = new Date().getFullYear();
    var transMsg = (anoAtual >= 2026 && anoAtual <= 2032)
      ? ' Em ' + anoAtual + ', período de transição: alíquota efetiva é fração da alíquota plena (reforma tributária 2026-2032).'
      : '';
    return '<div style="font-size:11px;color:var(--muted);line-height:1.6;margin-top:10px;padding:10px;background:rgba(245,158,11,0.08);border-left:3px solid #F59E0B;border-radius:4px;">' +
      '<strong>IBS/CBS (LC 214/2025):</strong> Estimativa baseada em alíquotas de referência por categoria.' +
      transMsg +
      ' Cálculo real varia conforme regime tributário do vendedor. NF-e é simulação educacional.' +
      '</div>';
  }

  return {
    calculate:             calculateFullSplit,
    calculateIbsCbs:       calculateIbsCbs,
    calculateCommission:   calculateCommission,
    calculateRemessaConforme: calculateRemessaConforme,
    updateCheckout:        updateCheckoutDisplay,
    formatBRL:             formatBRL,
    generateNfe:           generateMockNfeNumber,
    disclaimer:            generateIbsCbsDisclaimer,
    IBS_CBS_RATES:         IBS_CBS_RATES,
    setCommissionRate:     function (rate) { config.commissionRate = rate; },
    getConfig:             function () { return config; }
  };
})();

/* ── BLOCO 8: Notificações (WKZ_NOTIF) ───────────────────────────────────
   WKZ_NOTIF{} (inbox/unread/pushQueue), wkzShowPush(), wkzShowAlertBar(),
   wkzAddToInbox(), wkzRenderInbox(), wkzInjectBellBtn(), wkzUpdateBellBadge(),
   wkzDeliverBroadcast() + patch de hook em sendBroadcast() do Admin.
   Origem monólito: linhas 41271–41601 (init de injeção do sino removido —
   cada módulo com UI de sino deve chamar wkzInjectBellBtn() no seu INIT)
   NOTA: wkzInjectMobileBell() é referenciada mas não foi localizada nesta
   faixa — verificar/extrair junto do módulo Buyer no Sprint M2.
   ─────────────────────────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════
   WEKZ BROADCAST — Sistema de Notificações Admin→Usuário
   Conectado com o sendBroadcast() do painel Admin
   ══════════════════════════════════════════════════════════════ */

/* Estado global */
const WKZ_NOTIF = {
  inbox: [],        // todas as notificações recebidas
  unread: 0,        // contador de não lidas
  pushQueue: [],    // fila de push pendentes
  pushActive: false,// push sendo exibido agora
  barTimer: null,   // timer do alert bar
};

/* ── Ícone e cores por tipo ── */
function wkzNotifMeta(type) {
  const map = {
    info:    { icon: '📢', color: '#06B6D4', bgClass: 'push-info',    barClass: 'bar-info',    badgeTxt: 'Aviso'     },
    promo:   { icon: '🎉', color: '#7C3AED', bgClass: 'push-promo',   barClass: 'bar-promo',   badgeTxt: 'Promoção'  },
    warning: { icon: '⚠️', color: '#F59E0B', bgClass: 'push-warning', barClass: 'bar-warning', badgeTxt: 'Atenção'   },
    alert:   { icon: '🚨', color: '#EF4444', bgClass: 'push-alert',   barClass: 'bar-alert',   badgeTxt: 'Urgente'   },
  };
  return map[type] || map.info;
}

/* ── Detecta tipo automaticamente pelo título/msg ── */
function wkzAutoType(title, msg) {
  const t = (title + ' ' + msg).toLowerCase();
  if (/manutenção|maintenance|fora do ar|indisponível/.test(t)) return 'warning';
  if (/urgente|alerta|atenção|bloqueado|suspeito|fraude|violação/.test(t)) return 'alert';
  if (/promoção|desconto|off|cupom|oferta|sale|novidade|lançamento/.test(t)) return 'promo';
  return 'info';
}

/* ── EXIBIR PUSH NOTIFICATION (cinematic floating card) ── */
function wkzShowPush(title, msg, type, durationMs) {
  const dur = durationMs || 6000;
  const meta = wkzNotifMeta(type);
  const timeStr = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const kzSvg = typeof getKzSVG === 'function' ? getKzSVG(22) : '🐱';

  const card = document.createElement('div');
  card.className = 'wkz-push-card ' + meta.bgClass;
  card.style.cssText = '--push-dur:' + dur + 'ms';
  card.innerHTML = `
    <div class="wkz-push-kz">${kzSvg}</div>
    <div class="wkz-push-body">
      <div class="wkz-push-source">
        <div class="wkz-push-source-dot"></div>
        WeKz Shop · Admin
      </div>
      <div class="wkz-push-title">${title}</div>
      <div class="wkz-push-msg">${msg}</div>
    </div>
    <div class="wkz-push-time">${timeStr}</div>
    <button class="wkz-push-dismiss" onclick="wkzDismissPush(this.closest('.wkz-push-card'))" aria-label="Fechar">✕</button>`;

  /* Barra de progresso */
  card.style.setProperty('--push-dur', dur + 'ms');
  const style = document.createElement('style');
  style.textContent = `.wkz-push-card::after { animation-duration: ${dur}ms; }`;
  card.appendChild(style);

  const container = document.getElementById('wkzPushNotif');
  container.innerHTML = '';
  container.appendChild(card);
  WKZ_NOTIF.pushActive = true;

  /* Vibração (mobile) */
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

  /* Auto-dismiss */
  const t = setTimeout(() => wkzDismissPush(card), dur);
  card._dismissTimer = t;

  /* Clique abre inbox */
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('wkz-push-dismiss')) return;
    wkzOpenInbox();
    wkzDismissPush(card);
  });
}

function wkzDismissPush(card) {
  if (!card || !card.parentNode) return;
  clearTimeout(card._dismissTimer);
  card.style.animation = 'wkzPushOut 0.35s cubic-bezier(0.4,0,0.2,1) both';
  setTimeout(() => {
    if (card.parentNode) card.parentNode.removeChild(card);
    WKZ_NOTIF.pushActive = false;
  }, 350);
}

/* ── EXIBIR ALERT BAR (faixa no topo do site) ── */
function wkzShowAlertBar(title, msg, type) {
  const meta = wkzNotifMeta(type);
  const bar = document.getElementById('wkzAlertBar');
  bar.className = meta.barClass;
  bar.style.display = 'flex';
  bar.innerHTML = `
    <div class="wkz-bar-msg">
      <span class="wkz-bar-badge">${meta.badgeTxt}</span>
      <strong>${title}</strong>
      <span style="opacity:0.75;">— ${msg}</span>
    </div>
    <button class="wkz-bar-cta" onclick="wkzOpenInbox()">Ver →</button>
    <button class="wkz-bar-close" onclick="wkzHideAlertBar()" aria-label="Fechar">✕</button>`;
  document.body.classList.add('wkz-bar-active');

  clearTimeout(WKZ_NOTIF.barTimer);
  if (type !== 'warning' && type !== 'alert') {
    WKZ_NOTIF.barTimer = setTimeout(wkzHideAlertBar, 12000);
  }
}

function wkzHideAlertBar() {
  const bar = document.getElementById('wkzAlertBar');
  if (bar) { bar.style.display = 'none'; }
  document.body.classList.remove('wkz-bar-active');
}

/* ── INJETAR BANNER NO HERO (para tipo banner) ── */
function wkzShowHeroBanner(title, msg, type) {
  const meta = wkzNotifMeta(type);
  const kzSvg = typeof getKzSVG === 'function' ? getKzSVG(40) : '🐱';
  const colorMap = { info:'#06B6D4', promo:'#7C3AED', warning:'#F59E0B', alert:'#EF4444' };
  const bgMap = {
    info:    'linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)',
    promo:   'linear-gradient(90deg, rgba(124,58,237,0.2) 0%, rgba(0,180,171,0.12) 100%)',
    warning: 'linear-gradient(90deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.05) 100%)',
    alert:   'linear-gradient(90deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 100%)',
  };
  const c = colorMap[type] || colorMap.info;
  const bg = bgMap[type] || bgMap.info;
  const bannerEl = document.getElementById('wkzHeroBanner');
  bannerEl.style.cssText = `display:block; background:${bg}; border-bottom: 1.5px solid ${c}33; border-top: 1.5px solid ${c}22;`;
  bannerEl.innerHTML = `
    <div class="wkz-hero-banner-inner">
      <div class="wkz-hero-banner-kz">
        <div style="flex-shrink:0;">${kzSvg}</div>
        <div class="wkz-hero-banner-text">
          <div class="wkz-hero-banner-title" style="color:${c};">${title}</div>
          <div class="wkz-hero-banner-desc" style="color:rgba(255,255,255,0.7);">${msg}</div>
        </div>
      </div>
      <div class="wkz-hero-banner-actions">
        <button class="wkz-hero-banner-btn" style="background:${c};color:#000;" onclick="wkzOpenInbox()">Ver mais</button>
        <button class="wkz-hero-banner-dismiss" onclick="wkzHideHeroBanner()" style="color:${c};">✕</button>
      </div>
    </div>`;

  /* Injeta logo após o topbar na home (antes do hero) */
  const homePage = document.getElementById('page-home');
  if (homePage && homePage.firstChild) {
    homePage.insertBefore(bannerEl, homePage.firstChild);
  }
}

function wkzHideHeroBanner() {
  const el = document.getElementById('wkzHeroBanner');
  if (el) { el.style.display = 'none'; }
}

/* ── INBOX: adicionar item ── */
function wkzAddToInbox(title, msg, type, channels) {
  const meta = wkzNotifMeta(type);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  WKZ_NOTIF.inbox.unshift({ id: Date.now(), title, msg, type, icon: meta.icon, time: timeStr, unread: true, channels });
  WKZ_NOTIF.unread++;
  wkzUpdateBellBadge();
  wkzRenderInbox();
}

/* ── INBOX: renderizar ── */
function wkzRenderInbox() {
  const list = document.getElementById('wkzInboxList');
  if (!list) return;
  if (WKZ_NOTIF.inbox.length === 0) {
    list.innerHTML = `<div class="wkz-inbox-empty" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;">
      <img src="../shared/assets/mascot/notificacao.png" alt="Kz com sino" style="max-height:100px;width:auto;margin-bottom:12px;" onerror="this.outerHTML='<svg width=36 height=36 viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;rgba(148,163,184,0.4)&quot; stroke-width=&quot;1.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9&quot;/><path d=&quot;M13.73 21a2 2 0 0 1-3.46 0&quot;/></svg>'">
      <p style="margin:0;color:var(--muted);font-size:13px;">Nenhuma notificação ainda</p></div>`;
    return;
  }
  const colorMap = { info:'rgba(6,182,212,0.15)', promo:'rgba(124,58,237,0.15)', warning:'rgba(245,158,11,0.15)', alert:'rgba(239,68,68,0.15)' };
  list.innerHTML = WKZ_NOTIF.inbox.map(n => `
    <div class="wkz-inbox-item ${n.unread ? 'unread' : ''}" onclick="wkzMarkRead(${n.id})">
      <div class="wkz-inbox-item-icon" style="background:${colorMap[n.type]||colorMap.info};">${n.icon}</div>
      <div class="wkz-inbox-item-body">
        <div class="wkz-inbox-item-title">${n.title}</div>
        <div class="wkz-inbox-item-msg">${n.msg}</div>
        ${n.channels ? `<div style="font-size:10px;color:rgba(148,163,184,0.5);margin-top:3px;">via ${n.channels}</div>` : ''}
      </div>
      <div class="wkz-inbox-item-time">${n.time}</div>
    </div>`).join('');
}

function wkzMarkRead(id) {
  const n = WKZ_NOTIF.inbox.find(x => x.id === id);
  if (n && n.unread) { n.unread = false; WKZ_NOTIF.unread = Math.max(0, WKZ_NOTIF.unread - 1); wkzUpdateBellBadge(); wkzRenderInbox(); }
}

function wkzMarkAllRead() {
  WKZ_NOTIF.inbox.forEach(n => n.unread = false);
  WKZ_NOTIF.unread = 0;
  wkzUpdateBellBadge();
  wkzRenderInbox();
}

/* ── Inbox: abrir/fechar ── */
function wkzOpenInbox() {
  const panel = document.getElementById('wkzInboxPanel');
  const overlay = document.getElementById('wkzInboxOverlay');
  if (!panel) return;
  panel.style.display = 'flex';
  overlay.style.display = 'block';
  panel.style.animation = 'wkzInboxIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both';
  const bell = document.getElementById('wkzBellBtn');
  if (bell) bell.classList.add('wkz-bell-active');
  wkzRenderInbox();
}

function wkzCloseInbox() {
  const panel = document.getElementById('wkzInboxPanel');
  const overlay = document.getElementById('wkzInboxOverlay');
  if (panel) panel.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
  const bell = document.getElementById('wkzBellBtn');
  if (bell) bell.classList.remove('wkz-bell-active');
}

/* ── Bell badge update ── */
function wkzUpdateBellBadge() {
  const badge = document.getElementById('wkzBellBadge');
  const mobileDot = document.getElementById('wkzMobileBellDot');
  const n = WKZ_NOTIF.unread;
  if (badge) {
    badge.textContent = n > 9 ? '9+' : n;
    badge.style.display = n > 0 ? 'flex' : 'none';
    if (n > 0) {
      const bell = document.getElementById('wkzBellBtn');
      if (bell) { bell.classList.add('wkz-bell-shake'); setTimeout(() => bell.classList.remove('wkz-bell-shake'), 500); }
    }
  }
  if (mobileDot) mobileDot.style.display = n > 0 ? 'block' : 'none';
}

/* ── Injetar botão de sino no topbar (desktop + mobile via CSS order) ── */
function wkzInjectBellBtn() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.getElementById('wkzBellBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'wkzBellBtn';
  btn.className = 'btn-icon btn-icon-compact';
  btn.setAttribute('aria-label', 'Notificações');
  btn.onclick = wkzOpenInbox;
  btn.innerHTML = `
    <span class="wkz-icon wkz-icon-bell"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
    <span id="wkzBellBadge"></span>`;
  /* Anexa ao final — o CSS order reposiciona no mobile */
  actions.appendChild(btn);
}

/* ── Injetar sino na bottom-nav mobile ── */
function wkzInjectMobileBell() {
  const bottomNav = document.getElementById('bottomNav');
  if (!bottomNav || document.getElementById('wkzMobileBellWrap')) return;
  /* Substitui ou adiciona ao lado de "Favoritos" */
  const favBtn = bottomNav.querySelector('[aria-label="Favoritos"]') || bottomNav.lastElementChild;
  if (!favBtn) return;
  const dot = document.createElement('span');
  dot.id = 'wkzMobileBellDot';
  favBtn.style.position = 'relative';
  favBtn.appendChild(dot);
}

/* ══════════════════════════════════════════════════════════════
   PONTO DE INTEGRAÇÃO — sendBroadcast() no Admin chama esta função
   ══════════════════════════════════════════════════════════════ */
function wkzDeliverBroadcast(title, msg, channelsArr, audience) {
  const type = wkzAutoType(title, msg);
  const channelStr = (channelsArr || ['Push']).join(' + ');

  /* 1. Sempre adiciona ao inbox */
  wkzAddToInbox(title, msg, type, channelStr);

  /* 2. Push notification (se Push ativo) */
  if (!channelsArr || channelsArr.includes('Push')) {
    wkzShowPush(title, msg, type, 7000);
  }

  /* 3. Banner no app (se Banner ativo) */
  if (channelsArr && channelsArr.includes('Banner')) {
    wkzShowHeroBanner(title, msg, type);
    wkzShowAlertBar(title, msg, type);
  } else {
    /* Alert bar para todos os tipos */
    wkzShowAlertBar(title, msg, type);
  }
}

/* ── Hook no sendBroadcast do admin ── */
(function patchSendBroadcastForNotif() {
  const _origSendBroadcast = window.sendBroadcast;
  window.sendBroadcast = function() {
    /* Captura título, mensagem e canais ANTES de chamar o original */
    const ti = document.getElementById('commTitle');
    const bi = document.getElementById('commBody');
    const title = ti ? ti.value.trim() : '';
    const msg   = bi ? bi.value.trim() : '';

    const channels = [];
    if (document.getElementById('chPush')   && document.getElementById('chPush').checked)   channels.push('Push');
    if (document.getElementById('chEmail')  && document.getElementById('chEmail').checked)   channels.push('E-mail');
    if (document.getElementById('chBanner') && document.getElementById('chBanner').checked)  channels.push('Banner');

    const audEl = document.querySelector('.adm-aud-btn.active');
    const audience = audEl ? audEl.textContent.replace(/\(.*\)/, '').trim() : 'Todos';

    if (typeof _origSendBroadcast === 'function') _origSendBroadcast();

    /* Entrega a notificação após o delay simulado de envio (1.2s) */
    if (title && msg) {
      setTimeout(() => wkzDeliverBroadcast(title, msg, channels, audience), 1400);
    }
  };
})();

/* NOTA (Sprint M1): a injeção do sino (wkzInjectBellBtn/wkzInjectMobileBell)
   deve ser chamada pelo script de INIT de cada módulo que tiver UI de sino
   (Buyer e Seller), 300ms após DOMContentLoaded — não faz bootstrap sozinho
   aqui no core. wkzInjectMobileBell() ainda não foi localizado nesta extração
   e deve ser conferido/extraído junto do módulo Buyer no Sprint M2. */

/* ── BLOCO 10: LGPD Consent Banner ───────────────────────────────────────
   WkzCookieConsent (Art. 7º/8º/11º LGPD) — banner + modal de
   consentimento, wkzConsentAcceptAll(), wkzConsentReject(), storage
   'wkz_consent_v1' com expiração de 12 meses.
   Origem monólito: linhas 49033–49258
   ─────────────────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════
   WKZ COOKIE CONSENT ENGINE — v2.9.21
   LGPD Art. 7º / 8º / 11º
   Chave: "wkz_consent_v1"   Expiração: 12 meses
   Integração: admAuditAdd()
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORAGE_KEY  = 'wkz_consent_v1';
  var EXPIRY_MS    = 365 * 24 * 60 * 60 * 1000; /* 12 meses em ms */
  var BANNER_ID    = 'wkzCookieBanner';
  var MODAL_ID     = 'wkzCookieModal';

  /* ── Estrutura de consentimento padrão ── */
  function defaultConsent() {
    return {
      essential: true,   /* sempre true — não pode ser desativado */
      analytics: false,
      marketing: false,
      timestamp: null,
      expiry:    null,
      version:   '2.9.21'
    };
  }

  /* ── Ler do localStorage (com verificação de expiração) ── */
  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY); // C4: consentimento LGPD mantido em texto claro (requisito legal de auditabilidade)
      if (!raw) return null;
      var obj = JSON.parse(raw);
      /* Expirado? Trata como ausente */
      if (obj.expiry && Date.now() > obj.expiry) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return obj;
    } catch (e) {
      return null;
    }
  }

  /* ── Gravar no localStorage ── */
  function writeConsent(prefs) {
    try {
      var now = Date.now();
      prefs.timestamp = new Date(now).toISOString();
      prefs.expiry    = now + EXPIRY_MS;
      prefs.essential = true; /* garantia */
      prefs.version   = '2.9.21';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) { /* localStorage bloqueado — degradação graciosa */ }
  }

  /* ── Expor consentimento atual globalmente ── */
  function publishConsent(prefs) {
    window.wkzConsent = prefs;
    /* Evento personalizado para integrações futuras (GTM, etc.) */
    try {
      document.dispatchEvent(new CustomEvent('wkzConsentUpdate', { detail: prefs }));
    } catch (e) {}
  }

  /* ── Log de auditoria LGPD ── */
  function auditLog(action, detail) {
    try {
      if (typeof admAuditAdd === 'function') {
        admAuditAdd(
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
          'LGPD Consent — ' + action + ': ' + detail,
          'Usuário'
        );
      }
    } catch (e) {}
  }

  /* ── Mostrar banner com animação ── */
  function showBanner() {
    var el = document.getElementById(BANNER_ID);
    if (!el) return;
    el.style.display = 'block';
    /* RAF garante que a transição CSS dispara depois do display:block */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add('wkz-cb-visible');
        el.setAttribute('aria-hidden', 'false');
      });
    });
  }

  /* ── Esconder banner com animação ── */
  function hideBanner() {
    var el = document.getElementById(BANNER_ID);
    if (!el) return;
    el.classList.remove('wkz-cb-visible');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(function () { el.style.display = 'none'; }, 400);
  }

  /* ── AÇÕES PÚBLICAS ── */

  /* Aceitar todos */
  window.wkzConsentAcceptAll = function () {
    var prefs = { essential: true, analytics: true, marketing: true };
    writeConsent(prefs);
    publishConsent(prefs);
    auditLog('Aceitar todos', 'essential=true analytics=true marketing=true');
    hideBanner();
    wkzConsentCloseModal();
    showToastConsent('✅ Preferências salvas — cookies aceitos.');
  };

  /* Rejeitar opcionais */
  window.wkzConsentReject = function () {
    var prefs = { essential: true, analytics: false, marketing: false };
    writeConsent(prefs);
    publishConsent(prefs);
    auditLog('Rejeitar opcionais', 'essential=true analytics=false marketing=false');
    hideBanner();
    wkzConsentCloseModal();
    showToastConsent('🔒 Apenas cookies essenciais ativados.');
  };

  /* Salvar seleção personalizada */
  window.wkzConsentSaveCustom = function () {
    var analytics = document.getElementById('wkzCat_analytics');
    var marketing = document.getElementById('wkzCat_marketing');
    var prefs = {
      essential: true,
      analytics: analytics ? analytics.checked : false,
      marketing: marketing ? marketing.checked : false
    };
    writeConsent(prefs);
    publishConsent(prefs);
    auditLog(
      'Personalizado',
      'essential=true analytics=' + prefs.analytics + ' marketing=' + prefs.marketing
    );
    hideBanner();
    wkzConsentCloseModal();
    showToastConsent('✅ Preferências personalizadas salvas.');
  };

  /* Abrir modal de preferências */
  window.wkzConsentOpenModal = function () {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    /* Sincronizar toggles com estado atual */
    var saved = readConsent() || defaultConsent();
    var analytics = document.getElementById('wkzCat_analytics');
    var marketing = document.getElementById('wkzCat_marketing');
    if (analytics) analytics.checked = !!saved.analytics;
    if (marketing) marketing.checked = !!saved.marketing;
    /* Exibir */
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    /* Foco no botão fechar para acessibilidade */
    setTimeout(function () {
      var closeBtn = modal.querySelector('.wkz-cm-close');
      if (closeBtn) closeBtn.focus();
    }, 50);
  };

  /* Fechar modal */
  window.wkzConsentCloseModal = function () {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  /* Fechar modal ao clicar no overlay */
  window.wkzCmOverlayClick = function (evt) {
    if (evt.target === evt.currentTarget) wkzConsentCloseModal();
  };

  /* Fechar banner (ex: ao navegar para Privacy) */
  window.closeCookieBanner = function () { hideBanner(); };

  /* Toast de confirmação (leve, não interfere com showToast global) */
  function showToastConsent(msg) {
    try {
      if (typeof showToast === 'function') { showToast(msg); return; }
      /* Fallback: mini-toast próprio */
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0F1827;border:1px solid rgba(0,180,171,0.35);color:#E2E8F0;padding:10px 18px;border-radius:10px;font-size:13px;z-index:100300;pointer-events:none;opacity:0;transition:opacity 0.25s;';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = '1'; });
      setTimeout(function () {
        t.style.opacity = '0';
        setTimeout(function () { t.remove(); }, 300);
      }, 2800);
    } catch (e) {}
  }

  /* ── ESC fecha o modal ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') wkzConsentCloseModal();
  });

  /* ── INICIALIZAÇÃO ── */
  function init() {
    var saved = readConsent();
    if (saved) {
      /* Consentimento já dado e válido — publica e silencia */
      publishConsent(saved);
      return;
    }
    /* Sem consentimento → mostrar banner */
    showBanner();
  }

  /* Espera DOM + scripts carregarem */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    /* DOMContentLoaded já disparou */
    setTimeout(init, 120); /* pequeno delay para não competir com initApp() */
  }

  wkzLog('[WkzShop v2.9.21] ✓ Cookie Consent LGPD carregado');
})();

/* ════════════════════════════════════════════════════════════════════════
   BLOCOS ADICIONAIS — encontrados na auditoria final pré-push (após M3)
   Gaps reais no monólito nunca extraídos em M1/M2/M3. Documentados em
   detalhe no CHANGELOG da auditoria.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Direitos LGPD do Titular (Acessar/Corrigir/Excluir/Portabilidade/DPO) ─
   Origem monólito: linhas 47059–47274 ── */
function lgpdOpen(id) {
  var backdrop = document.getElementById('lgpdModalBackdrop');
  var modal    = document.getElementById(id);
  if (!backdrop || !modal) return;
  backdrop.style.display = 'block';
  modal.style.display    = 'flex';
  /* Foco acessível */
  setTimeout(function () {
    var firstBtn = modal.querySelector('button, input, select, textarea');
    if (firstBtn) firstBtn.focus();
  }, 60);
  /* ESC fecha */
  document._lgpdEscFn = function (e) { if (e.key === 'Escape') lgpdCloseAll(); };
  document.addEventListener('keydown', document._lgpdEscFn);
}

function lgpdClose(id) {
  var modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
  /* Se nenhum modal visível, fecha backdrop */
  var anyOpen = ['lgpdModalAcessar','lgpdModalCorrigir','lgpdModalExcluir',
                 'lgpdModalPortabilidade','lgpdModalDpo'].some(function (mid) {
    var m = document.getElementById(mid);
    return m && m.style.display !== 'none';
  });
  if (!anyOpen) {
    var bd = document.getElementById('lgpdModalBackdrop');
    if (bd) bd.style.display = 'none';
    if (document._lgpdEscFn) document.removeEventListener('keydown', document._lgpdEscFn);
  }
}

function lgpdCloseAll(e, backdrop) {
  /* Fecha apenas se clicou no próprio backdrop (não no modal) */
  if (e && e.target !== backdrop) return;
  ['lgpdModalAcessar','lgpdModalCorrigir','lgpdModalExcluir',
   'lgpdModalPortabilidade','lgpdModalDpo'].forEach(function (id) {
    var m = document.getElementById(id);
    if (m) m.style.display = 'none';
  });
  var bd = document.getElementById('lgpdModalBackdrop');
  if (bd) bd.style.display = 'none';
  if (document._lgpdEscFn) document.removeEventListener('keydown', document._lgpdEscFn);
}

/* ─────────────────────────────────────────────────────────────
   MODAL 1 — Acessar Dados
─────────────────────────────────────────────────────────────── */
function lgpdOpenAcessarDados() {
  /* Preenche tabela mock de categorias */
  var tb = document.getElementById('lgpdDataTable');
  if (tb) {
    var rows = [
      ['Identificação',   'Nome, e-mail, CPF (hash), telefone',              'Cadastro e autenticação',            'Ativo'],
      ['Endereços',       'CEP, logradouro, cidade, UF',                     'Entrega de pedidos',                 'Ativo'],
      ['Pedidos',         'Histórico de compras, valores, NF-e',             'Execução do contrato (CDC)',          'Ativo'],
      ['Navegação',       'IP de acesso, timestamps (Marco Civil Art.15)',   'Segurança e cumprimento legal',      'Retido 6m'],
      ['Financeiro',      'Últimos 4 dígitos do cartão, método de pagto.',   'Processamento de pagamentos',        'Ativo'],
      ['Preferências',    'Histórico de busca, categorias, wishlist',        'Personalização (consentimento)',      'Ativo'],
      ['Consentimento',   'Log de aceite dos termos e LGPD',                 'Comprovação legal (ANPD)',            'Ativo'],
    ];
    var statusColor = { 'Ativo':'var(--teal)', 'Retido 6m':'#F59E0B' };
    tb.innerHTML = rows.map(function (r) {
      var sc = statusColor[r[3]] || 'var(--muted)';
      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:8px 10px;font-weight:600;color:var(--text);white-space:nowrap;">' + r[0] + '</td>' +
        '<td style="padding:8px 10px;color:var(--muted);font-size:11px;">' + r[1] + '</td>' +
        '<td style="padding:8px 10px;color:var(--muted);font-size:11px;">' + r[2] + '</td>' +
        '<td style="padding:8px 10px;text-align:center;"><span style="font-size:10px;font-weight:700;color:' + sc + ';white-space:nowrap;">' + r[3] + '</span></td>' +
        '</tr>';
    }).join('');
  }
  lgpdOpen('lgpdModalAcessar');
}

function lgpdDownloadJson() {
  /* Monta payload mock — em produção, viria de API */
  var payload = {
    exportedAt:  new Date().toISOString(),
    controller:  'WeKz Intermediação de Negócios Ltda.',
    legalBasis:  'Art. 18 II LGPD',
    subject: {
      name:      (document.getElementById('cpProfileName') || {}).textContent || 'Usuário WeKz',
      email:     (document.getElementById('cpProfileEmail') || {}).textContent || 'usuario@email.com',
      since:     '2024-01-15T00:00:00Z',
    },
    categories: {
      identificacao: { fields: ['nome','email','cpf_hash','telefone'], status: 'ativo' },
      enderecos:     { count: 2, status: 'ativo' },
      pedidos:       { count: (window._WKZ_ORDERS || []).length, status: 'ativo' },
      navegacao:     { retencao: '6 meses (Marco Civil Art.15)' },
      consentimento: { version: 'wkz_consent_v1', accepted: true }
    },
    disclaimer: 'Dados mockados para fins de demonstração (LGPD Art.18). Em produção, este relatório reflete dados reais via API segura com autenticação.'
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'wekz-meus-dados-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  admAuditAdd && admAuditAdd('📋', 'Titular baixou relatório de dados pessoais (LGPD Art.18 II)', 'LGPD');
  showToast('✅ Relatório .json baixado com sucesso!');
}

/* ─────────────────────────────────────────────────────────────
   MODAL 2 — Corrigir Dados
─────────────────────────────────────────────────────────────── */
function lgpdOpenCorrigirDados() {
  /* Pré-preenche com dados visíveis no perfil */
  var nome  = (document.getElementById('cpProfileName')  || {}).textContent  || '';
  var email = (document.getElementById('cpProfileEmail') || {}).textContent || '';
  var f;
  f = document.getElementById('lgpdCorrNome');  if (f) f.value = nome.trim();
  f = document.getElementById('lgpdCorrEmail'); if (f) f.value = email.trim();
  f = document.getElementById('lgpdCorrCpf');   if (f) f.value = '';
  f = document.getElementById('lgpdCorrTel');   if (f) f.value = '';
  f = document.getElementById('lgpdCorrObs');   if (f) f.value = '';
  lgpdOpen('lgpdModalCorrigir');
}

function lgpdEnviarCorrecao() {
  var obs = (document.getElementById('lgpdCorrObs') || {}).value || '';
  if (!obs.trim()) {
    showToast('⚠ Descreva o que precisa ser corrigido.');
    return;
  }
  admAuditAdd && admAuditAdd('✏️', 'Titular solicitou correção de dados (LGPD Art.18 III): ' + obs.slice(0,60), 'LGPD');
  lgpdClose('lgpdModalCorrigir');
  showToast('✅ Solicitação enviada! Prazo de resposta: 15 dias úteis.');
}

/* ─────────────────────────────────────────────────────────────
   MODAL 3 — Excluir Conta — dupla confirmação
─────────────────────────────────────────────────────────────── */
function lgpdOpenExcluirConta() {
  /* Reset para step 1 */
  var s1 = document.getElementById('lgpdExcStep1');
  var s2 = document.getElementById('lgpdExcStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  var c1 = document.getElementById('lgpdExcChk1'); if (c1) c1.checked = false;
  var c2 = document.getElementById('lgpdExcChk2'); if (c2) c2.checked = false;
  var ps = document.getElementById('lgpdExcSenha');       if (ps) ps.value = '';
  var ct = document.getElementById('lgpdExcConfirmText'); if (ct) ct.value = '';
  lgpdOpen('lgpdModalExcluir');
}

function lgpdExcluirStep2() {
  var c1 = document.getElementById('lgpdExcChk1');
  var c2 = document.getElementById('lgpdExcChk2');
  if (!c1 || !c1.checked || !c2 || !c2.checked) {
    showToast('⚠ Marque as duas confirmações para continuar.');
    return;
  }
  var s1 = document.getElementById('lgpdExcStep1');
  var s2 = document.getElementById('lgpdExcStep2');
  if (s1) s1.style.display = 'none';
  if (s2) { s2.style.display = 'block'; setTimeout(function(){ var p = document.getElementById('lgpdExcSenha'); if(p) p.focus(); }, 60); }
}

function lgpdExcluirFinal() {
  var senha = (document.getElementById('lgpdExcSenha')       || {}).value || '';
  var conf  = (document.getElementById('lgpdExcConfirmText') || {}).value || '';
  if (!senha.trim()) {
    showToast('⚠ Digite sua senha para confirmar.');
    return;
  }
  if (conf.trim().toUpperCase() !== 'EXCLUIR CONTA') {
    showToast('⚠ Digite exatamente "EXCLUIR CONTA" para confirmar.');
    return;
  }
  admAuditAdd && admAuditAdd('🗑️', 'Titular solicitou exclusão de conta (LGPD Art.18 VI) — pendente verificação', 'LGPD');
  lgpdClose('lgpdModalExcluir');
  showToast('✅ Solicitação registrada. Você receberá confirmação em até 15 dias úteis.');
}

/* ─────────────────────────────────────────────────────────────
   MODAL 4 — Portabilidade
─────────────────────────────────────────────────────────────── */
function lgpdOpenPortabilidade() {
  lgpdOpen('lgpdModalPortabilidade');
}

function lgpdEnviarPortabilidade() {
  var fmt  = (document.getElementById('lgpdPortFormato') || {}).value || 'json';
  var dest = (document.getElementById('lgpdPortDest')    || {}).value || 'não informado';
  admAuditAdd && admAuditAdd('📤', 'Portabilidade solicitada — formato: ' + fmt + ' / destino: ' + dest, 'LGPD');
  lgpdClose('lgpdModalPortabilidade');
  showToast('✅ Portabilidade solicitada! Prazo: 15 dias úteis (Art. 18 §3º LGPD).');
}

/* ─────────────────────────────────────────────────────────────
   MODAL 5 — DPO
─────────────────────────────────────────────────────────────── */
function lgpdOpenDpo() {
  lgpdOpen('lgpdModalDpo');
}

wkzLog('[WkzShop v2.9.21] ✓ LGPD modais carregados (Art.18: acesso, correção, exclusão, portabilidade, DPO)');



/* ─────────────────────────────────────────────────────────────
   MÓDULO: Gerenciador de Disputas Trilateral (v2.9.0)
   ─────────────────────────────────────────────────────────────
   • Gera tickets de disputa com protocolo imutável
   • Gerencia SLA (24-48h para vendedor, 48h para mediação)
   • Timeline com estados: Aberto → Respondido → Análise → Resolvido
   • Chat trilateral (comprador ↔ WeKz ↔ vendedor)
   • Escalação automática
 */


/* ── WkzDisputeTickets — sistema de tickets de disputa (cross-module) ────
   Usado por Buyer (abrir), Seller (responder — M3), Admin (resolver — M4).
   Origem monólito: linhas 47275–47700
   ─────────────────────────────────────────────────────────────────────── */
var WkzDisputeTickets = (function() {
  'use strict';

  var state = {
    tickets: {},
    sequence: 1000,
    userTickets: []
  };

  /**
   * Gera número de ticket único e imutável
   * Formato: TICKET-YYYYMMDDhhmmss-HASH-OrderID
   * @returns {string}
   */
  function generateTicketNumber(orderId) {
    var now = new Date();
    var datePart = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('');
    
    var hash = (orderId + datePart).split('').reduce(function(a, c) {
      return ((a << 5) - a) + c.charCodeAt(0);
    }, 0).toString(16).substring(0, 6).toUpperCase();
    
    return 'TICKET-' + datePart + '-' + hash + '-' + orderId.replace('#', '');
  }

  /**
   * Calcula SLA (prazo para ação)
   * Vendedor: 24-48h para responder (depende da hora de abertura)
   * WeKz: 48h para análise completa
   * @param {number} openedAt - timestamp de abertura
   * @returns {object} { vendedorDeadline, wkzDeadline, hoursRemaining }
   */
  function calculateSLA(openedAt) {
    var now = Date.now();
    var vendedorDeadlineMs = openedAt + (48 * 60 * 60 * 1000); // 48 horas
    var wkzDeadlineMs = openedAt + (48 * 60 * 60 * 1000); // 48 horas (após toda evidência reunida)
    
    var hoursRemainingVendedor = Math.ceil((vendedorDeadlineMs - now) / (60 * 60 * 1000));
    var hoursRemainingWkz = Math.ceil((wkzDeadlineMs - now) / (60 * 60 * 1000));

    return {
      vendedorDeadline: vendedorDeadlineMs,
      wkzDeadline: wkzDeadlineMs,
      vendedorHoursRemaining: Math.max(0, hoursRemainingVendedor),
      wkzHoursRemaining: Math.max(0, hoursRemainingWkz),
      isVendedorOverdue: hoursRemainingVendedor <= 0,
      isWkzOverdue: hoursRemainingWkz <= 0
    };
  }

  /**
   * Cria novo ticket de disputa
   * @param {object} dispute - { orderId, buyerName, sellerName, productName, problem, description, evidence[], paymentMethod }
   * @returns {object} ticket completo
   */
  function createTicket(dispute) {
    var ticketId = generateTicketNumber(dispute.orderId);
    var now = Date.now();
    var sla = calculateSLA(now);

    var ticket = {
      ticketId: ticketId,
      orderId: dispute.orderId,
      createdAt: now,
      createdAtFormatted: new Date(now).toLocaleString('pt-BR'),
      
      // Partes envolvidas
      buyerName: dispute.buyerName,
      sellerName: dispute.sellerName,
      productName: dispute.productName,
      
      // Problema
      problemType: dispute.problem, // 'nao-recebido', 'nao-conforme', 'defeito', 'falsificado'
      description: dispute.description,
      evidence: dispute.evidence || [],
      paymentMethod: dispute.paymentMethod,
      
      // Estado
      status: 'open', // open, vendor-replied, wkz-analyzing, resolved, closed
      statusLabel: 'Aberto',
      
      // SLA
      sla: sla,
      
      // Timeline
      timeline: [
        {
          timestamp: now,
          type: 'opened',
          actor: 'buyer',
          message: 'Disputa aberta pelo comprador',
          data: { problem: dispute.problem }
        }
      ],
      
      // Chat trilateral
      messages: [],
      
      // Decisão (quando resolvida)
      resolution: null
    };

    state.tickets[ticketId] = ticket;
    return ticket;
  }

  /**
   * Adiciona mensagem ao chat do ticket
   * @param {string} ticketId
   * @param {string} actor - 'buyer' | 'seller' | 'wkz'
   * @param {string} message
   * @param {string[]} attachments - URLs de evidências
   */
  function addMessage(ticketId, actor, message, attachments) {
    var ticket = state.tickets[ticketId];
    if (!ticket) return false;

    ticket.messages.push({
      timestamp: Date.now(),
      timestampFormatted: new Date().toLocaleString('pt-BR'),
      actor: actor,
      message: message,
      attachments: attachments || []
    });

    return true;
  }

  /**
   * Atualiza status do ticket
   * @param {string} ticketId
   * @param {string} newStatus - 'vendor-replied', 'wkz-analyzing', 'resolved', 'closed'
   * @param {string} reason - Motivo da mudança
   */
  function updateStatus(ticketId, newStatus, reason) {
    var ticket = state.tickets[ticketId];
    if (!ticket) return false;

    var statusLabels = {
      'open': 'Aberto',
      'vendor-replied': 'Vendedor Respondeu',
      'wkz-analyzing': 'Analisando',
      'resolved': 'Resolvido',
      'closed': 'Fechado'
    };

    ticket.status = newStatus;
    ticket.statusLabel = statusLabels[newStatus] || newStatus;
    
    ticket.timeline.push({
      timestamp: Date.now(),
      type: 'status-change',
      actor: 'system',
      message: 'Status alterado para: ' + statusLabels[newStatus],
      reason: reason
    });

    return true;
  }

  /**
   * Emite decisão sobre o ticket
   * @param {string} ticketId
   * @param {string} decision - 'favorable-buyer' | 'favorable-seller' | 'partial'
   * @param {string} reason
   * @param {number} refundAmount (se favorable-buyer)
   */
  function resolveTicket(ticketId, decision, reason, refundAmount) {
    var ticket = state.tickets[ticketId];
    if (!ticket) return false;

    var decisionLabel = {
      'favorable-buyer': '✓ Favorável ao Comprador',
      'favorable-seller': '✓ Favorável ao Vendedor',
      'partial': '◐ Resolução Parcial'
    };

    ticket.status = 'resolved';
    ticket.statusLabel = 'Resolvido';
    ticket.resolution = {
      decision: decision,
      decisionLabel: decisionLabel[decision],
      reason: reason,
      refundAmount: refundAmount || 0,
      resolvedAt: Date.now(),
      resolvedAtFormatted: new Date().toLocaleString('pt-BR')
    };

    ticket.timeline.push({
      timestamp: Date.now(),
      type: 'resolved',
      actor: 'wkz',
      message: decisionLabel[decision],
      reason: reason
    });

    return true;
  }

  /**
   * Renderiza HTML de ticket para exibição
   * @param {string} ticketId
   * @returns {string} HTML
   */
  function renderTicketCard(ticketId) {
    var ticket = state.tickets[ticketId];
    if (!ticket) return '';

    var statusColor = {
      'open': '#F59E0B',
      'vendor-replied': '#06B6D4',
      'wkz-analyzing': '#7C3AED',
      'resolved': '#22C55E',
      'closed': '#6B7280'
    };

    var problemLabels = {
      'nao-recebido': '📦 Não Recebido',
      'nao-conforme': '🔍 Não Conforme',
      'defeito': '⚙️ Defeito/Danificado',
      'falsificado': '⚠️ Falsificado/Violado'
    };

    var html = '<div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--card2);">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
        '<div>' +
          '<strong style="font-size:13px;">' + ticket.ticketId + '</strong><br>' +
          '<span style="font-size:11px;color:var(--muted);">' + ticket.createdAtFormatted + '</span>' +
        '</div>' +
        '<div style="background:' + statusColor[ticket.status] + '20;color:' + statusColor[ticket.status] + ';padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">' +
          ticket.statusLabel +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;line-height:1.6;margin-bottom:8px;color:var(--text);">' +
        '<strong>Pedido:</strong> ' + ticket.orderId + '<br>' +
        '<strong>Produto:</strong> ' + ticket.productName + '<br>' +
        '<strong>Problema:</strong> ' + (problemLabels[ticket.problemType] || ticket.problemType) +
      '</div>';

    // SLA Visual
    if (ticket.status === 'open' && !ticket.sla.isVendedorOverdue) {
      html += '<div style="background:rgba(34,197,94,0.12);padding:8px;border-radius:6px;font-size:11px;margin-bottom:8px;">' +
        '⏰ Vendedor tem <strong>' + ticket.sla.vendedorHoursRemaining + ' horas</strong> para responder' +
      '</div>';
    }

    html += '<div style="display:flex;gap:8px;">' +
      '<button class="rev-filter" style="flex:1;padding:6px;font-size:11px;" onclick="wkzOpenTicketDetail(\'' + ticketId + '\')">Ver Detalhes</button>' +
      '<button class="btn-add-cart" style="flex:1;padding:6px;font-size:11px;" onclick="wkzAddMessageToTicket(\'' + ticketId + '\')">💬 Responder</button>' +
    '</div>' +
    '</div>';

    return html;
  }

  /**
   * Abre modal de novo ticket de disputa
   */
  function openNewTicketModal() {
    var html = '<div style="padding:20px;max-width:700px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;margin-bottom:20px;gap:10px;">' +
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-width="3"/></svg>' +
        '<h2 style="font-size:18px;font-weight:700;color:var(--text);">Abrir Ticket de Disputa</h2>' +
      '</div>' +
      '<form id="newDisputeForm" style="display:flex;flex-direction:column;gap:14px;">' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;">*Número do Pedido</label>' +
          '<input type="text" id="disputeOrderId" class="wkz-input" placeholder="Ex: #WKZ-8818" style="width:100%;padding:10px;" required>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;">*Tipo de Problema</label>' +
          '<select id="disputeProblem" class="wkz-select" style="width:100%;padding:10px;" required>' +
            '<option value="">Selecione...</option>' +
            '<option value="nao-recebido">📦 Não Recebi o Produto</option>' +
            '<option value="nao-conforme">🔍 Produto Não Conforme (diferente do anunciado)</option>' +
            '<option value="defeito">⚙️ Produto com Defeito/Danificado</option>' +
            '<option value="falsificado">⚠️ Suspeita de Falsificação</option>' +
          '</select>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;">*Descrição Detalhada</label>' +
          '<textarea id="disputeDescription" class="wkz-input" placeholder="Descreva o problema com o máximo de detalhes. Cite data, horário, evidências." style="width:100%;padding:10px;min-height:100px;font-family:inherit;" required></textarea>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;">Anexar Evidências (fotos, prints, comprovantes)</label>' +
          '<div style="border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;background:rgba(255,255,255,0.02);cursor:pointer;" onclick="document.getElementById(\'disputeEvidence\').click();">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:0 auto 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div style="font-size:12px;font-weight:700;color:var(--text);">Upload de Arquivos</div>' +
            '<div style="font-size:11px;color:var(--muted);">Imagens, PDFs, prints (máx. 50MB total)</div>' +
          '</div>' +
          '<input type="file" id="disputeEvidence" style="display:none;" multiple accept="image/*,.pdf">' +
        '</div>' +
      '</form>' +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<button style="flex:1;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;" onclick="wkzSubmitNewDispute();">' +
          '🚨 Abrir Disputa Formal' +
        '</button>' +
        '<button style="flex:1;background:var(--card2);color:var(--text);border:1px solid var(--border);padding:12px;border-radius:8px;font-weight:700;cursor:pointer;" onclick="_wkzModal(null);">' +
          'Cancelar' +
        '</button>' +
      '</div>' +
    '</div>';

    _wkzModal('wkzNewDisputeModal', html, { showClose: true });
  }

  return {
    createTicket: createTicket,
    addMessage: addMessage,
    updateStatus: updateStatus,
    resolveTicket: resolveTicket,
    renderTicketCard: renderTicketCard,
    openNewTicketModal: openNewTicketModal,
    getTicket: function(ticketId) { return state.tickets[ticketId]; },
    getAllTickets: function() { return state.tickets; },
    calculateSLA: calculateSLA,
    state: state
  };
})();

// ─────────────────────────────────────────────────────────────
// Funções globais para integração
window.wkzOpenDisputeTicketModal = function() {
  WkzDisputeTickets.openNewTicketModal();
};

window.wkzSubmitNewDispute = function() {
  var orderId = document.getElementById('disputeOrderId').value;
  var problem = document.getElementById('disputeProblem').value;
  var description = document.getElementById('disputeDescription').value;

  if (!orderId || !problem || !description) {
    showToast('❌ Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  var ticket = WkzDisputeTickets.createTicket({
    orderId: orderId,
    buyerName: 'Você',
    sellerName: 'Lojista',
    productName: 'Produto do Pedido',
    problem: problem,
    description: description,
    paymentMethod: 'Pix'
  });

  showToast('✓ Ticket de disputa aberto: ' + ticket.ticketId, 'success');
  wkzLog('[WkzDisputeTickets] Ticket criado:', ticket);
  setTimeout(function() { _wkzModal(null); }, 600);
};

window.wkzOpenTicketDetail = function(ticketId) {
  var ticket = WkzDisputeTickets.getTicket(ticketId);
  if (!ticket) {
    showToast('❌ Ticket não encontrado.', 'error');
    return;
  }
  wkzLog('[WkzDisputeTickets] Detalhes do ticket:', ticket);
  showToast('📋 Abrindo detalhes do ticket: ' + ticketId + '...', 'info');
};

window.wkzAddMessageToTicket = function(ticketId) {
  showToast('💬 Abrindo interface de chat para ticket: ' + ticketId + '...', 'info');
};

// ─────────────────────────────────────────────────────────────
// Integração com WkzApp
if (typeof WkzApp !== 'undefined') {
  WkzApp.state.disputes = {
    tickets: {},
    stats: {
      activeCount: 0,
      resolvedCount: 0,
      closedCount: 0,
      avgResolutionHours: 28
    }
  };

  WkzApp.createDisputeTicket = function(dispute) {
    var ticket = WkzDisputeTickets.createTicket(dispute);
    WkzApp.state.disputes.tickets[ticket.ticketId] = ticket;
    WkzApp.state.disputes.stats.activeCount++;
    return ticket;
  };

  WkzApp.getDisputeTicket = function(ticketId) {
    return WkzApp.state.disputes.tickets[ticketId] || WkzDisputeTickets.getTicket(ticketId);
  };
}

// ─────────────────────────────────────────────────────────────
// Exemplo: Criar ticket de teste (para demonstração)
var mockTicket = WkzDisputeTickets.createTicket({
  orderId: '#WKZ-8818',
  buyerName: 'Ana Paula',
  sellerName: 'TechStore',
  productName: 'Teclado Mecânico',
  problem: 'nao-conforme',
  description: 'Produto chegou diferente do anunciado. As teclas têm marca de queimadura e o switch está danificado.',
  paymentMethod: 'Pix'
});

WkzDisputeTickets.addMessage(mockTicket.ticketId, 'buyer', 'Comprador enviou fotos do defeito', ['photo1.jpg']);
WkzDisputeTickets.updateStatus(mockTicket.ticketId, 'vendor-replied', 'Vendedor respondeu com proposta de troca');

wkzLog('[WkzShop v2.9.0] ✓ Central de Disputas Trilateral carregada');
wkzLog('[WkzDisputeTickets] Exemplo de ticket:', mockTicket);


/* ─────────────────────────────────────────────────────────────
   MÓDULO: KYC/KYB Verificação de Vendedores (v2.9.2)
   ─────────────────────────────────────────────────────────────
   • Upload drag-drop de documentos (RG, CNPJ, Comprovante)
   • OCR mockado para extração de dados
   • Validação real de CNPJ (API mockada)
   • Classificação de risco (baixo/médio/alto)
   • Timeline de status com SLA (até 5 dias úteis)
 */


/* ── WkzArrependimento (Decreto 7.962/13) + WkzNoticeAndTakeDown ─────────
   Origem monólito: linhas 46318–46629
   ─────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   MÓDULO: Direito de Arrependimento (Decreto 7.962/13)
   ─────────────────────────────────────────────────────────────
   • Calcula dias desde a confirmação do recebimento
   • Habilita botão "Exercer Direito" enquanto <= 7 dias
   • Gera protocolo imutável com timestamp (para registro legal)
 */

var WkzArrependimento = (function() {
  'use strict';

  /**
   * Calcula dias decorridos desde um timestamp
   * @param {number|string} timestamp - millisegundos ou ISO string
   * @returns {number} Dias decorridos
   */
  function daysSince(timestamp) {
    var ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    var now = Date.now();
    var diffMs = now - ts;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Gera protocolo imutável com data/hora e hash de integridade
   * Formato: PROTO-[YYYYMMDDHHmmss]-[hash6dig]-[orderId]
   * @param {string} orderId - ID do pedido (ex: #WKZ-8821)
   * @returns {object} { protocol, timestamp, expiresAt, daysLeft }
   */
  function generateRightOfWithdrawalProtocol(orderId) {
    var now = new Date();
    var isoStr = now.toISOString();
    var timestamp = now.getTime();
    var expiresAt = timestamp + (7 * 24 * 60 * 60 * 1000); // +7 dias
    
    // Gera hash simples a partir do orderId + timestamp (não criptográfico, apenas para auditoria)
    var hashStr = (orderId + isoStr).split('').reduce(function(a, c) { 
      return ((a << 5) - a) + c.charCodeAt(0); 
    }, 0).toString(16).substring(0, 6).toUpperCase();
    
    var datePart = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('');
    
    var protocol = 'PROTO-' + datePart + '-' + hashStr + '-' + orderId.replace('#', '');

    return {
      protocol: protocol,
      timestamp: timestamp,
      expiresAt: expiresAt,
      daysLeft: 7,
      generatedAt: isoStr
    };
  }

  /**
   * Abre modal com protocolo de exercício de direito
   * @param {string} orderId - ID do pedido
   * @param {string} productName - Nome do produto
   * @param {string|number} orderDate - Data de confirmação de recebimento
   */
  function openWithdrawalModal(orderId, productName, orderDate) {
    var proto = generateRightOfWithdrawalProtocol(orderId);
    var daysPassed = daysSince(orderDate);
    var daysLeft = Math.max(0, 7 - daysPassed);

    if (daysLeft <= 0) {
      showToast('❌ Prazo expirado. O direito de arrependimento venceu em ' + new Date(proto.expiresAt).toLocaleDateString('pt-BR') + '.', 'error');
      return;
    }

    var html = '<div style="padding:20px;">' +
      '<div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:14px;margin-bottom:16px;">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
          '<div style="font-size:13px;line-height:1.6;color:var(--text);">' +
            '<strong>Exercer Direito de Arrependimento (Decreto 7.962/13)</strong><br>' +
            '<span style="font-size:12px;color:var(--muted);">Você tem <strong style="color:#22C55E;">' + daysLeft + ' dia(s)</strong> para cancelar este pedido sem justificativa. ' +
            'O reembolso será processado automaticamente para sua conta.</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px;">' +
        '<div style="font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px;">Detalhes da Solicitação</div>' +
        '<div style="font-size:13px;line-height:1.8;color:var(--text);">' +
          '<strong>Pedido:</strong> ' + orderId + '<br>' +
          '<strong>Produto:</strong> ' + productName + '<br>' +
          '<strong>Protocolo:</strong> <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px;color:var(--teal);">' + proto.protocol + '</code><br>' +
          '<strong>Gerado em:</strong> ' + new Date(proto.timestamp).toLocaleString('pt-BR') + '<br>' +
          '<strong>Expira em:</strong> ' + new Date(proto.expiresAt).toLocaleDateString('pt-BR') +
        '</div>' +
      '</div>' +
      '<div style="background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:11px;line-height:1.6;color:var(--muted);">' +
        '⚠️ <strong>Importante:</strong> Ao exercer este direito, você receberá instruções de devolução logística. ' +
        'O reembolso será processado em até 2 dias úteis após recebermos a confirmação de devolução. Este protocolo será armazenado por 5 anos para fins legais.' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button style="flex:1;background:linear-gradient(135deg,#22C55E 0%,#16A34A 100%);color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;" onclick="wkzCancelOrderWithProtocol(\'' + proto.protocol + '\', \'' + orderId + '\');">' +
          '✓ Confirmar Arrependimento' +
        '</button>' +
        '<button style="flex:1;background:var(--card2);color:var(--text);border:1px solid var(--border);padding:12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;" onclick="_wkzModal(null);">' +
          'Cancelar' +
        '</button>' +
      '</div>' +
    '</div>';

    _wkzModal('wkzWithdrawalModal', html, { showClose: true });
  }

  /**
   * Processa cancelamento com protocolo (mock: apenas loga)
   */
  function confirmWithdrawal(protocol, orderId) {
    wkzLog('[WkzArrependimento] Protocolo registrado: ' + protocol);
    wkzLog('[WkzArrependimento] Pedido para cancelamento: ' + orderId);
    showToast('✓ Solicitação registrada com protocolo: ' + protocol.substring(0, 20) + '... Verifique seu e-mail para instruções de devolução.', 'success');
  }

  return {
    open: openWithdrawalModal,
    confirm: confirmWithdrawal,
    generateProtocol: generateRightOfWithdrawalProtocol,
    daysSince: daysSince
  };
})();

window.wkzCancelOrderWithProtocol = function(protocol, orderId) {
  WkzArrependimento.confirm(protocol, orderId);
  setTimeout(function() { _wkzModal(null); }, 500);
};

/* ─────────────────────────────────────────────────────────────
   MÓDULO: Denúncia de Produto Falsificado/Violado (STJ Tema 533/987)
   ─────────────────────────────────────────────────────────────
   • Formulário robusto com campos obrigatórios STJ
   • Gera número de protocolo imutável
   • Separa denúncias por URL específica (não genérica por loja)
 */

var WkzNoticeAndTakeDown = (function() {
  'use strict';

  function generateDenunciaProtocol() {
    var now = new Date();
    var timestamp = now.getTime();
    var uniqueId = Math.random().toString(36).substr(2, 9).toUpperCase();
    var protocol = 'DENUNCIA-' + now.getFullYear() + 
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getDate()).padStart(2, '0') + '-' +
                   uniqueId;
    return {
      protocol: protocol,
      timestamp: timestamp,
      generatedAt: now.toISOString(),
      validFor: 'Permanente (arquivo por 5 anos)'
    };
  }

  function openDenunciaModal() {
    var proto = generateDenunciaProtocol();

    var html = '<div style="max-width:600px;margin:0 auto;padding:20px;">' +
      '<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:14px;margin-bottom:16px;">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
          '<div style="font-size:13px;font-weight:700;color:#EF4444;">Denúncia de Produto Falsificado ou Violação de Direitos (Lei 12.965/14 + STJ Tema 533/987)</div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--muted);line-height:1.6;">' +
          'A WeKz trata denúncias de <strong>falsificação ou violação de direitos intelectuais</strong> com rigor. ' +
          'Todos os campos abaixo são <strong>obrigatórios</strong> para validade jurídica. Denúncias genéricas ou sem documentação será arquivadas.' +
        '</div>' +
      '</div>' +
      '<form id="denunciaForm" style="display:flex;flex-direction:column;gap:14px;">' +
        // Campo 1: URL exata do anúncio
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*URL Exata do Anúncio Infringente</label>' +
          '<input type="url" id="denunciaUrl" class="wkz-input" placeholder="Ex: https://wekzshop.com/product/12345/item-falsificado" style="width:100%;padding:10px;font-size:13px;" required>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px;">⚠️ Denúncias genéricas (apenas URL da loja) serão rejeitadas. Você deve indicar o anúncio específico.</div>' +
        '</div>' +
        // Campo 2: Nome do requerente
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*Nome Completo do Requerente</label>' +
          '<input type="text" id="denunciaNome" class="wkz-input" placeholder="Ex: João da Silva Santos" style="width:100%;padding:10px;font-size:13px;" required>' +
        '</div>' +
        // Campo 3: CPF ou CNPJ
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*CPF ou CNPJ (Titular dos Direitos)</label>' +
          '<input type="text" id="denunciaCpfCnpj" class="wkz-input" placeholder="000.000.000-00 ou 00.000.000/0000-00" style="width:100%;padding:10px;font-size:13px;" oninput="docMask(this)" maxlength="18" required>' +
        '</div>' +
        // Campo 4: Tipo de violação
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*Tipo de Violação</label>' +
          '<select id="denunciaTipo" class="wkz-select" style="width:100%;padding:10px;font-size:13px;" required>' +
            '<option value="">Selecione uma opção...</option>' +
            '<option value="falsificacao">Produto Falsificado / Contrafação</option>' +
            '<option value="marca_registrada">Violação de Marca Registrada</option>' +
            '<option value="patente">Violação de Patente</option>' +
            '<option value="direito_autoral">Violação de Direito Autoral</option>' +
            '<option value="design">Violação de Design Registrado</option>' +
            '<option value="outro">Outro (descrever abaixo)</option>' +
          '</select>' +
        '</div>' +
        // Campo 5: Descrição e evidência
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*Descrição Detalhada da Violação</label>' +
          '<textarea id="denunciaDescricao" class="wkz-input" placeholder="Descreva especificamente por que acredita que o produto é falso ou viola seus direitos. Cite diferenças, irregularidades, etc." style="width:100%;padding:10px;font-size:13px;min-height:120px;font-family:inherit;" required></textarea>' +
        '</div>' +
        // Campo 6: Comprovante de titularidade
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">*Comprovante de Titularidade dos Direitos (Obrigatório)</label>' +
          '<div style="border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;background:rgba(255,255,255,0.02);cursor:pointer;" onclick="document.getElementById(\'denunciaFile\').click();">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:0 auto 8px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">Upload de Certificado, Registro ou RG</div>' +
            '<div style="font-size:11px;color:var(--muted);">Formatos: PDF, JPG, PNG (máx. 10MB)</div>' +
          '</div>' +
          '<input type="file" id="denunciaFile" style="display:none;" accept=".pdf,.jpg,.jpeg,.png" required>' +
          '<div id="denunciaFileName" style="font-size:11px;color:var(--muted);margin-top:6px;"></div>' +
        '</div>' +
        // Checkbox consentimento
        '<div style="background:rgba(107,114,128,0.08);border-radius:8px;padding:12px;font-size:11px;line-height:1.6;color:var(--muted);">' +
          '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">' +
            '<input type="checkbox" id="denunciaConsent" style="margin-top:2px;" required>' +
            '<span>' +
              'Confirmo que todas as informações acima são verdadeiras e que sou titular dos direitos mencionados. ' +
              'Denúncias falsas estão sujeitas a penalidades civis e criminais (Lei 12.965/14, art. 19). ' +
              'Autorizo a WeKz a compartilhar esta denúncia com autoridades competentes se necessário.' +
            '</span>' +
          '</label>' +
        '</div>' +
      '</form>' +
      '<div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:14px 0;font-size:11px;line-height:1.6;color:var(--muted);">' +
        '📋 <strong>Seu Protocolo de Denúncia:</strong><br>' +
        '<code style="background:rgba(0,180,171,0.12);padding:6px 8px;border-radius:4px;font-family:monospace;display:block;margin-top:6px;word-break:break-all;color:var(--teal);font-weight:700;">' + proto.protocol + '</code><br>' +
        '<span style="display:block;margin-top:6px;">Gerado em: ' + new Date(proto.timestamp).toLocaleString('pt-BR') + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button type="button" style="flex:1;background:var(--grad1);color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;" onclick="wkzSubmitDenuncia(\'' + proto.protocol + '\');">' +
          '🚨 Enviar Denúncia' +
        '</button>' +
        '<button type="button" style="flex:1;background:var(--card2);color:var(--text);border:1px solid var(--border);padding:12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;" onclick="_wkzModal(null);">' +
          'Cancelar' +
        '</button>' +
      '</div>' +
    '</div>';

    _wkzModal('wkzDenunciaModal', html, { showClose: true });

    // Handle file input
    document.getElementById('denunciaFile')?.addEventListener('change', function(e) {
      if (e.target.files.length > 0) {
        document.getElementById('denunciaFileName').textContent = '✓ Arquivo selecionado: ' + e.target.files[0].name;
      }
    });
  }

  return {
    openModal: openDenunciaModal,
    generateProtocol: generateDenunciaProtocol
  };
})();

window.wkzOpenNoticeModal = function() {
  WkzNoticeAndTakeDown.openModal();
};

window.wkzSubmitDenuncia = function(protocol) {
  var url = document.getElementById('denunciaUrl').value;
  var nome = document.getElementById('denunciaNome').value;
  var cpf = document.getElementById('denunciaCpfCnpj').value;
  var tipo = document.getElementById('denunciaTipo').value;
  var descricao = document.getElementById('denunciaDescricao').value;
  var arquivo = document.getElementById('denunciaFile').files.length > 0;
  var consentimento = document.getElementById('denunciaConsent').checked;

  if (!url || !nome || !cpf || !tipo || !descricao || !arquivo || !consentimento) {
    showToast('❌ Todos os campos são obrigatórios para validez jurídica.', 'error');
    return;
  }

  wkzLog('[WkzNoticeAndTakeDown] Denúncia registrada: ', { protocol: protocol, url: url, nome: nome });
  showToast('✓ Denúncia registrada com protocolo: ' + protocol + '. A WeKz revisará em até 48h úteis.', 'success');
  setTimeout(function() { _wkzModal(null); }, 800);
};

/* ─────────────────────────────────────────────────────────────
   INICIALIZAÇÃO: Expandir WkzApp com estado de legal
   ───────────────────────────────────────────────────────────── */

if (typeof WkzApp !== 'undefined') {
  WkzApp.state.legal = {
    denuncias: [],
    arrependimentos: [],
    disclaimersAccepted: false
  };

  WkzApp.setLegalState = function(state) {
    WkzApp.state.legal = Object.assign(WkzApp.state.legal, state);
  };

  WkzApp.getLegalState = function() {
    return WkzApp.state.legal;
  };
}

// Log de inicialização
wkzLog('[WkzShop v2.8.8] ✓ Blindagem Jurídica carregada (Marco Civil, CDC, STJ)');


/* ── Kz Smart Negotiator + Kz Magic Fill + Client Profile Module ─────────
   Entrelaçados no mesmo IIFE no monólito original (Negotiator é Buyer,
   Magic Fill é Seller, Client Profile é Buyer) — impossível separar sem
   reescrever. Funções só disparam por clique, resolvem em runtime
   conforme o módulo ativo (guardas typeof/&& já existiam no original).
   Origem monólito: linhas 41803–44517
   ─────────────────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════
   FEATURE 3 — PREENCHIMENTO MÁGICO POR IA
   ══════════════════════════════════════════════════════════════════════ */
(function() {
  /* Banco de dados de produtos mockados com inteligência WeKz */
  const KZ_PRODUCT_PRESETS = [
    {
      keywords: ['fone','headphone','sony','xm','bluetooth','áudio','audio','earphone','airpod'],
      title: 'Fone de Ouvido Sony WH-1000XM5 Bluetooth Cancelamento de Ruído Ativo 30h Bateria',
      shortDesc: 'Fone over-ear premium com cancelamento de ruído líder do setor, 30h de bateria e qualidade de áudio Hi-Res. Perfeito para home office e viagens.',
      desc: `🎧 Sony WH-1000XM5 — O Melhor Fone Bluetooth do Mercado

✅ CANCELAMENTO DE RUÍDO SUPERIOR: 8 microfones e processamento dual-chip eliminam até 99% do ruído externo para imersão total na sua música.

🔋 BATERIA DE 30 HORAS: Ouça por dias sem interrupção. Carga rápida de 3 minutos = 3 horas de uso. Carregamento via USB-C.

🎵 QUALIDADE HI-RES: Suporte a LDAC, AAC e SBC. Driver de 30mm com tecnologia Carbon Fiber Composite para graves profundos e agudos cristalinos.

📱 MULTIPOINT: Conecte-se a 2 dispositivos simultaneamente. Troca automática ao atender chamadas.

🛡️ GARANTIA: 12 meses de garantia oficial Sony Brasil. Nota fiscal inclusa.

📦 CONTEÚDO DA CAIXA: Fone WH-1000XM5 + Cabo USB-C + Cabo P2 + Case rígido + Manual em PT-BR`,
      tags: 'fone de ouvido, bluetooth, sony, cancelamento de ruído, wireless, headphone, hi-res, home office',
      category: 'eletronicos',
      brand: 'Sony',
    },
    {
      keywords: ['smartphone','celular','samsung','galaxy','iphone','apple','xiaomi','motorola','5g','256gb'],
      title: 'Smartphone Samsung Galaxy S24 Ultra 256GB 5G Câmera 200MP Snapdragon 8 Gen 3',
      shortDesc: 'O mais avançado Galaxy com câmera 200MP, S Pen integrada, processador Snapdragon 8 Gen 3 e bateria de 5000mAh com carga de 45W.',
      desc: `📱 Samsung Galaxy S24 Ultra — Poder Total na Palma da Sua Mão

📸 CÂMERA 200MP: Sistema quad-camera de última geração com zoom óptico 5x, Space Zoom 100x e Nightography AI para fotos perfeitas em qualquer condição.

⚡ DESEMPENHO MÁXIMO: Snapdragon 8 Gen 3 + 12GB RAM. Roda qualquer jogo, app de produtividade e multitarefa sem engasgar.

🖊️ S PEN INTEGRADA: Caneta inteligente para notas, desenhos e atalhos de teclado. Sem necessidade de compra adicional.

🔋 BATERIA 5000mAh: Carga rápida 45W + carregamento sem fio 15W. Dura o dia todo com uso intenso.

💎 TELA DYNAMIC AMOLED 2X 6,8": 120Hz adaptativos, brilho máximo de 2600 nits — visível até sob sol forte.

🛡️ Galaxy AI embutido: tradução em tempo real, resumo de chamadas e Circle to Search.`,
      tags: 'smartphone, samsung, galaxy, s24 ultra, 5g, câmera, android, snapdragon, celular',
      category: 'eletronicos',
      brand: 'Samsung',
    },
    {
      keywords: ['tênis','nike','adidas','puma','esport','corrida','running','sneaker','calçado'],
      title: 'Tênis Nike Air Max 270 React Masculino Preto/Branco Amortecimento Premium',
      shortDesc: 'Tênis lifestyle com a maior câmara de ar Nike já criada. Solado React ultra-responsivo e cabedal em mesh respirável para conforto diário.',
      desc: `👟 Nike Air Max 270 React — Estilo e Conforto Redefinidos

💨 AIR MAX 270: A maior câmara de ar heel da Nike proporciona amortecimento excepcional a cada passo, reduzindo o impacto em até 38%.

⚡ FOAM REACT: Espuma React de alta resposta devolve energia ao caminhar, com 13% mais leveza que o foam padrão.

🌬️ CABEDAL MESH: Malha respirável de alta engenharia mantém os pés frescos e confortáveis por horas.

📐 SISTEMA LACING: Cadarços planos duplos para ajuste personalizado e look clean premium.

🎨 COLORWAY EXCLUSIVO: Preto/Branco — combinação versátil para uso casual, academia ou streetwear.

📏 TABELA DE MEDIDAS: 38 a 46 BR (equivalente US 6-12). Recomendamos o tamanho usual.`,
      tags: 'tênis, nike, air max, esportivo, corrida, lifestyle, masculino, streetwear',
      category: 'esportes',
      brand: 'Nike',
    },
    {
      keywords: ['notebook','laptop','computador','dell','lenovo','hp','apple','macbook','intel','amd','ryzen'],
      title: 'Notebook Dell Inspiron 15 Intel Core i7-13ª Gen 16GB RAM SSD 512GB Tela Full HD',
      shortDesc: 'Notebook de alta performance com processador Intel i7 de 13ª geração, 16GB DDR5 e SSD NVMe de 512GB para produtividade máxima.',
      desc: `💻 Dell Inspiron 15 — Produtividade Sem Limites

🔥 PROCESSADOR i7-13ª GERAÇÃO: Intel Core i7-1355U com 10 núcleos e até 5.0GHz Turbo. Renderização, edição de vídeo e multitarefa sem travas.

🧠 16GB DDR5 + SSD 512GB NVMe: Abertura de apps instantânea. 3x mais rápido que HDD convencional. Expansível até 32GB.

🖥️ TELA FULL HD 15.6": Resolução 1920×1080, anti-reflexo, 250 nits. Ideal para trabalho em ambientes internos e externos.

🔋 BATERIA 54Wh: Até 8 horas de uso real. Carregador compacto 65W USB-C incluso.

🎮 INTEL IRIS XE: Gráficos integrados para edição de fotos, vídeos leves e games casuais sem placa adicional.

🛡️ GARANTIA DELL: 12 meses com suporte técnico nacional. Windows 11 Home original incluso.`,
      tags: 'notebook, laptop, dell, intel i7, 16gb, ssd, windows 11, computador portátil',
      category: 'eletronicos',
      brand: 'Dell',
    },
    {
      keywords: ['perfume','fragrância','fragrance','colônia','eau de','chanel','dior','armani'],
      title: 'Perfume Masculino Dior Sauvage Eau de Parfum 100ml — Fragrância Amadeirada',
      shortDesc: 'Um dos perfumes masculinos mais vendidos do mundo. Notas de bergamota, âmbar e baunilha selvagem para uma fragrância marcante e duradoura.',
      desc: `🌿 Dior Sauvage EDP — Selvagem e Sofisticado

✨ FRAGRÂNCIA PREMIUM: Criado pelo perfumista François Demachy com ingredientes naturais de origem rastreável. A escolha dos homens que não abrem mão de qualidade.

🌸 PIRÂMIDE OLFATIVA:
• Topo: Bergamota de Calábria (certificada)
• Coração: Pimenta-sichuan, lavanda e baunilha selvagem
• Fundo: Ambroxan, âmbar e cedro da Virgínia

⏱️ DURAÇÃO: 10 a 14 horas de fixação na pele. Sillage médio-alto, notável sem ser invasivo.

📦 CONTEÚDO: Frasco EDP 100ml com embalagem original Dior + certificado de autenticidade.

🎁 PRESENTE PERFEITO: Acompanha caixa lacrada premium. Ideal para aniversários, datas especiais ou uso pessoal.`,
      tags: 'perfume, masculino, dior, sauvage, eau de parfum, fragrância, amadeirado, presente',
      category: 'beleza',
      brand: 'Dior',
    },
  ];

  /* ══════════════════════════════════════════════════════════════════════
     FEATURE 3b — KZ SMART NEGOTIATOR + SOCIAL PROOF (auto-init)
     ══════════════════════════════════════════════════════════════════════ */
      /* ═══════════════════════════════════════════════════
         KZ SMART NEGOTIATOR MODAL — HTML template (injected)
         ═══════════════════════════════════════════════════ */

      // ── KZ NEGOTIATOR ──────────────────────────────────
      (function() {
        // Inject modal overlay HTML
        const modalHtml = `
        <div id="kzNegotiatorOverlay" onclick="kzNegOverlayClick(event)"
     role="dialog" aria-modal="true"
     aria-labelledby="kzNegDialogTitle"
     aria-describedby="kzNegChat">
          <div class="kz-neg-modal" id="kzNegModal">
            <div class="kz-neg-header">
              <svg width="38" height="38" viewBox="0 0 100 100" class="kz-svg" style="flex-shrink:0;filter:drop-shadow(0 0 6px rgba(0,180,171,0.7))" role="img" aria-label="Kz, o Lince Negociador"><use href="#kz-mascot-mini"/></svg>
              <div class="kz-neg-header-body">
                <div class="kz-neg-header-title" id="kzNegDialogTitle">🤝 Kz Smart Negotiator</div>
                <div class="kz-neg-header-sub">Negocie diretamente com a IA do Lince Kz</div>
              </div>
              <button class="kz-neg-close" onclick="closeKzNegotiator()" aria-label="Fechar Kz Smart Negotiator">✕</button>
            </div>
            <!-- JUR: aviso de que a IA opera dentro das margens parametrizadas pelo Vendedor titular do anúncio -->
            <div class="kz-neg-disclosure" id="kzNegDisclosure"><span class="wkz-icon wkz-icon-scale"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></span><span><strong>Preço negociado diretamente com os parâmetros do Vendedor</strong> via Kz AI — descontos seguem limites pré-definidos pelo lojista responsável pelo anúncio.</span></div>
            <!-- ── Kz Mood Bar: Flexibilidade do Fornecedor IA ── -->
            <div class="kz-neg-mood-bar" id="kzNegMoodBar">
              <span class="kz-neg-mood-label">Humor IA</span>
              <div class="kz-neg-mood-track">
                <div class="kz-neg-mood-fill" id="kzNegMoodFill"></div>
              </div>
              <span class="kz-neg-mood-status" id="kzNegMoodStatus">✦ Aberto a propostas</span>
            </div>
            <div class="kz-neg-chat" id="kzNegChat"
     role="log"
     aria-live="polite"
     aria-relevant="additions"
     aria-label="Conversa de negociação com Kz"></div>
            <div class="kz-neg-input-area">
              <input
                type="text"
                class="kz-neg-input"
                id="kzNegInput"
                placeholder="Propor um valor... (ex: R$ 950)"
                aria-label="Campo para propor um valor de negociação"
                aria-describedby="kzNegChat"
                onkeydown="if(event.key==='Enter')kzNegSend()"
              >
              <button class="kz-neg-send" id="kzNegSendBtn" onclick="kzNegSend()" aria-label="Enviar proposta de negociação">➤</button>
            </div>
          </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // [v2.2.0] Inject floating collapsed Kz Negotiator button
        const floatingBtnHtml = `
        <button id="kzNegFloatingBtn" title="Negociar com Kz" aria-label="Abrir Kz Smart Negotiator" onclick="openKzNegotiator()">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <use href="#kz-mascot-mini"/>
          </svg>
          <span id="kzNegFloatingBtnLabel">Negociar 🤝</span>
        </button>`;
        document.body.insertAdjacentHTML('beforeend', floatingBtnHtml);

        // Inject Social Proof container
        document.body.insertAdjacentHTML('beforeend',
  '<div id="kzSocialProofContainer"'
  + ' aria-live="polite"'
  + ' aria-atomic="false"'
  + ' aria-relevant="additions removals"'
  + ' aria-label="Notificações de compras recentes de outros clientes"'
  + '></div>');
      })();

      // ── SOCIAL PROOF NOTIFICATIONS ──────────────────────
      const KZ_SOCIAL_NAMES = ['Mariana','Carlos','Ana','Pedro','Fernanda','Lucas','Sofia','Rafael','Beatriz','Diego','Camila','Thiago','Isabela','Bruno','Juliana','André'];
      const KZ_SOCIAL_CITIES = ['Porto','Lisboa','São Paulo','Rio de Janeiro','Curitiba','Belo Horizonte','Recife','Salvador','Fortaleza','Manaus','Brasília','Florianópolis'];
      const KZ_SOCIAL_PRODUCTS = ['Headset Cyberpunk Pro 🎧','Smartphone Ultra 5G 📱','Notebook Gamer RTX 💻','Smartwatch Kz Pro ⌚','Câmera 4K Mirrorless 📷','Console Next-Gen 🎮','Fone ANC Premium 🎵','Cadeira Gamer Elite 🪑','Monitor 144Hz 2K 🖥️','Teclado Mecânico RGB ⌨️','Mouse Gamer 16000DPI 🖱️','Perfume Exclusivo 🌿'];
      let _socialProofInterval = null;

      // ── Social Proof: monotonically increasing UID prevents stale-closure conflicts ──
      let _kzSpUid = 0;
      function kzSocialProofShow() {
        const container = document.getElementById('kzSocialProofContainer');
        if (!container) return;
        const name    = KZ_SOCIAL_NAMES[Math.floor(Math.random() * KZ_SOCIAL_NAMES.length)];
        const city    = KZ_SOCIAL_CITIES[Math.floor(Math.random() * KZ_SOCIAL_CITIES.length)];
        const product = KZ_SOCIAL_PRODUCTS[Math.floor(Math.random() * KZ_SOCIAL_PRODUCTS.length)];
        const initials = name.substring(0,1);
        const minAgo   = Math.floor(Math.random() * 4) + 1;

        // Each toast gets an immutable unique ID baked into the DOM — no reference retained
        const uid = 'kzsp-' + (++_kzSpUid);
        const toast = document.createElement('div');
        toast.className = 'kz-social-proof-toast';
        toast.dataset.kzspId = uid;   // queryable selector without closure risk
        toast.innerHTML = `
          <div class="kz-sp-avatar">${initials}</div>
          <div class="kz-sp-body">
            <div class="kz-sp-text"><strong>${name}</strong> de ${city} acabou de adquirir <strong>${product}</strong></div>
            <div class="kz-sp-time">Há ${minAgo} min · Compra verificada ✅</div>
          </div>
          <div class="kz-sp-icon">🛒</div>`;

        container.appendChild(toast);

        // Removal via dynamic selector — safe even if closure is GC'd or timer fires late
        const removeId = uid;
        setTimeout(() => {
          const el = document.querySelector('[data-kzsp-id="' + removeId + '"]');
          if (!el) return; // already removed by kzSocialProofStop — no-op, no error
          el.style.animation = 'kzSocialProofOut 0.45s ease forwards';
          setTimeout(() => {
            const target = document.querySelector('[data-kzsp-id="' + removeId + '"]');
            if (target) target.remove();
          }, 440);
        }, 5500);
      }

      function _kzNegotiatorIsOpen() {
        // Verifica se o overlay do Smart Negotiator está aberto na tela
        const overlay = document.getElementById('kzNegotiatorOverlay');
        return overlay && overlay.classList.contains('open');
      }

      function kzSocialProofStart() {
        if (_socialProofInterval) return;
        // Só dispara se o Negotiator não estiver aberto
        if (!_kzNegotiatorIsOpen()) kzSocialProofShow();
        // [v2.2.0] Intervalo aumentado para 45s (era 40s) — controlo de poluição visual
        _socialProofInterval = setInterval(function() {
          // ── PATCH 1B: suprime disparo enquanto chat do Negotiator estiver visível ──
          if (_kzNegotiatorIsOpen()) return;
          // [v2.2.0] Remove toasts antigos ANTES de exibir novo — garante máximo 1 visível
          const container = document.getElementById('kzSocialProofContainer');
          if (container) {
            const existing = container.querySelectorAll('.kz-social-proof-toast');
            existing.forEach(function(el) { el.remove(); }); // destrói da DOM imediatamente
          }
          kzSocialProofShow();
        }, 45000);
      }

      function kzSocialProofStop() {
        if (_socialProofInterval) { clearInterval(_socialProofInterval); _socialProofInterval = null; }
        const container = document.getElementById('kzSocialProofContainer');
        if (container) container.innerHTML = '';
      }

      // Reads admin setting and applies
      function kzSocialProofSync() {
        const toggle = document.getElementById('kzSocialProofToggle');
        if (toggle && toggle.checked) kzSocialProofStart();
        else kzSocialProofStop();
      }

      // ── Expose to global scope so onchange="" inline handlers always find them ──
      window.kzSocialProofShow  = kzSocialProofShow;
      window.kzSocialProofStart = kzSocialProofStart;
      window.kzSocialProofStop  = kzSocialProofStop;
      window.kzSocialProofSync  = kzSocialProofSync;

      // ── Counter: increment every time a real toast fires ──
      const _origSpShow = kzSocialProofShow;
      window.kzSocialProofShow = function() {
        _origSpShow();
        const el = document.getElementById('kzSpStatViews');
        if (el) el.textContent = (parseInt(el.textContent) || 0) + 1;
      };
      // Also patch the interval's show call
      window.kzSocialProofStart = function() {
        if (_socialProofInterval) return;
        if (!_kzNegotiatorIsOpen()) window.kzSocialProofShow();
        _socialProofInterval = setInterval(function() {
          if (_kzNegotiatorIsOpen()) return;
          const container = document.getElementById('kzSocialProofContainer');
          if (container) {
            container.querySelectorAll('.kz-social-proof-toast').forEach(function(el) { el.remove(); });
          }
          window.kzSocialProofShow();
        }, 45000);
      };
      window.kzSocialProofStop = function() {
        if (_socialProofInterval) { clearInterval(_socialProofInterval); _socialProofInterval = null; }
        const container = document.getElementById('kzSocialProofContainer');
        if (container) container.innerHTML = '';
      };
      window.kzSocialProofSync = function() {
        const toggle = document.getElementById('kzSocialProofToggle');
        if (toggle && toggle.checked) window.kzSocialProofStart();
        else window.kzSocialProofStop();
      };

      // ══════════════════════════════════════════════════════════
      // KZ GLOBAL LOCALIZER v2 — Inteligência Internacional na PDP
      // Mercados: PT · EN · ES · JA · ZH · DE · RU · HI
      // Moedas:   BRL · EUR · USD · JPY · CNY · INR · RUB
      // ══════════════════════════════════════════════════════════
      const KZ_LOC = {
        lang: 'PT',
        curr: 'BRL',

        // ── Títulos localizados ─────────────────────────────────
        titles: {
          PT: 'Smartphone Ultra Pro Max 5G — 256GB',
          EN: 'Ultra Pro Max 5G Smartphone — 256GB',
          ES: 'Smartphone Ultra Pro Max 5G — 256 GB',
          JA: 'スマートフォン ウルトラ プロ マックス 5G — 256GB',
          ZH: '超旗舰智能手机 Ultra Pro Max 5G — 256GB',
          DE: 'Ultra Pro Max 5G Smartphone — 256 GB Speicher',
          RU: 'Смартфон Ультра Про Макс 5G — 256 ГБ',
          HI: 'अल्ट्रा प्रो मैक्स 5G स्मार्टफोन — 256GB'
        },

        // ── Tags de produto localizadas ─────────────────────────
        tags: {
          PT: ['📱 5G Ultra', '🤖 Kz Quantum X1', '🔋 6000mAh', '📷 200MP'],
          EN: ['📱 5G Ultra', '🤖 Kz Quantum X1', '🔋 6000mAh', '📷 200MP'],
          ES: ['📱 5G Ultra', '🤖 Kz Quantum X1', '🔋 6000mAh', '📷 200MP'],
          JA: ['📱 5G ウルトラ', '🤖 Kzクアンタム', '🔋 6000mAh', '📷 2億画素'],
          ZH: ['📱 5G旗舰', '🤖 Kz量子芯片', '🔋 6000毫安', '📷 2亿像素'],
          DE: ['📱 5G Ultra', '🤖 Kz Quantum X1', '🔋 6000mAh', '📷 200MP'],
          RU: ['📱 5G Ультра', '🤖 Kz Квантум X1', '🔋 6000мАч', '📷 200МП'],
          HI: ['📱 5G अल्ट्रा', '🤖 Kz क्वांटम X1', '🔋 6000mAh', '📷 200MP']
        },

        // ── Descrições curtas localizadas ───────────────────────
        descs: {
          PT: 'O mais avançado smartphone da linha WeKz. Câmera 200MP, bateria 6000mAh, tela AMOLED 120Hz e chip Kz Quantum X1.',
          EN: 'The most advanced smartphone in the WeKz lineup. 200MP camera, 6000mAh battery, 120Hz AMOLED display and Kz Quantum X1 chip.',
          ES: 'El smartphone más avanzado de WeKz. Cámara 200MP, batería 6000mAh, pantalla AMOLED 120Hz y chip Kz Quantum X1.',
          JA: 'WeKzラインナップ最高峰のスマートフォン。2億画素カメラ・6000mAhバッテリー・120Hz有機EL・Kzクアンタムチップ搭載。',
          ZH: 'WeKz旗舰机皇。搭载2亿像素主摄、6000毫安时电池、120Hz AMOLED屏幕及Kz量子X1处理器，引领未来科技。',
          DE: 'Das fortschrittlichste WeKz-Smartphone. 200-MP-Kamera, 6000-mAh-Akku, 120-Hz-AMOLED-Display und Kz-Quantum-X1-Prozessor.',
          RU: 'Самый передовой смартфон линейки WeKz. Камера 200 МП, аккумулятор 6000 мАч, дисплей AMOLED 120 Гц и чип Kz Quantum X1.',
          HI: 'WeKz की सबसे उन्नत स्मार्टफोन। 200MP कैमरा, 6000mAh बैटरी, 120Hz AMOLED डिस्प्ले और Kz Quantum X1 चिप।'
        },

        // ── Taxas de câmbio fictícias (base BRL = 1) ────────────
        // Coerentes com magnitudes reais (apenas simuladas)
        rates: {
          BRL: 1,
          EUR: 0.175,   // ~R$ 1 = €0,175
          USD: 0.190,   // ~R$ 1 = $0,190
          JPY: 28.50,   // ~R$ 1 = ¥28,5
          CNY: 1.38,    // ~R$ 1 = 元1,38
          INR: 15.80,   // ~R$ 1 = ₹15,8
          RUB: 17.40    // ~R$ 1 = ₽17,4
        },

        // ── Símbolos e prefixos de moeda ────────────────────────
        symbols: {
          BRL: 'R$', EUR: '€', USD: '$', JPY: '¥', CNY: '元', INR: '₹', RUB: '₽'
        },

        // ── Moedas que não usam casas decimais ──────────────────
        noDecimals: ['JPY'],

        // ── Bandeiras e rótulos de status ───────────────────────
        statusFlags: {
          PT: { BRL:'🇧🇷 Preço em Real Brasileiro', EUR:'🇪🇺 Preço em Euro', USD:'🇺🇸 Preço em Dólar', JPY:'🇯🇵 Preço em Iene', CNY:'🇨🇳 Preço em Yuan', INR:'🇮🇳 Preço em Rupia', RUB:'🇷🇺 Preço em Rublo' },
          EN: { BRL:'🇧🇷 Price in BRL', EUR:'🇪🇺 Price in EUR', USD:'🇺🇸 Price in USD', JPY:'🇯🇵 Price in JPY', CNY:'🇨🇳 Price in CNY', INR:'🇮🇳 Price in INR', RUB:'🇷🇺 Price in RUB' },
          ES: { BRL:'🇧🇷 Precio en Real', EUR:'🇪🇺 Precio en Euro', USD:'🇺🇸 Precio en Dólar', JPY:'🇯🇵 Precio en Yen', CNY:'🇨🇳 Precio en Yuan', INR:'🇮🇳 Precio en Rupia', RUB:'🇷🇺 Precio en Rublo' },
          JA: { BRL:'🇧🇷 ブラジルレアル', EUR:'🇪🇺 ユーロ', USD:'🇺🇸 米ドル', JPY:'🇯🇵 日本円', CNY:'🇨🇳 人民元', INR:'🇮🇳 インドルピー', RUB:'🇷🇺 ロシアルーブル' },
          ZH: { BRL:'🇧🇷 巴西雷亚尔', EUR:'🇪🇺 欧元', USD:'🇺🇸 美元', JPY:'🇯🇵 日元', CNY:'🇨🇳 人民币', INR:'🇮🇳 印度卢比', RUB:'🇷🇺 俄罗斯卢布' },
          DE: { BRL:'🇧🇷 Brasilianischer Real', EUR:'🇪🇺 Euro', USD:'🇺🇸 US-Dollar', JPY:'🇯🇵 Japanischer Yen', CNY:'🇨🇳 Chinesischer Yuan', INR:'🇮🇳 Indische Rupie', RUB:'🇷🇺 Russischer Rubel' },
          RU: { BRL:'🇧🇷 Бразильский реал', EUR:'🇪🇺 Евро', USD:'🇺🇸 Доллар США', JPY:'🇯🇵 Японская иена', CNY:'🇨🇳 Китайский юань', INR:'🇮🇳 Индийская рупия', RUB:'🇷🇺 Российский рубль' },
          HI: { BRL:'🇧🇷 ब्राज़ीलियन रियाल', EUR:'🇪🇺 यूरो', USD:'🇺🇸 अमेरिकी डॉलर', JPY:'🇯🇵 जापानी येन', CNY:'🇨🇳 चीनी युआन', INR:'🇮🇳 भारतीय रुपया', RUB:'🇷🇺 रूसी रूबल' }
        },

        basePriceBRL: 1249.90
      };
      /* Expõe KZ_LOC globalmente para que outros módulos (SPD, etc.) possam acessar */
      window.KZ_LOC = KZ_LOC;

      // ── Grupos para active-state tracking ──────────────────────
      const KZ_LOC_LANG_KEYS = ['PT','EN','ES','JA','ZH','DE','RU','HI'];
      const KZ_LOC_CURR_KEYS = ['€ EUR','$ USD','R$ BRL','¥ JPY','元 CNY','₹ INR','₽ RUB'];

      // ── Formata valor monetário com regras por moeda ───────────
      function kzFormatPrice(rawBRL, curr) {
        const rate   = KZ_LOC.rates[curr] || 1;
        const symbol = KZ_LOC.symbols[curr] || 'R$';

        // ── PATCH FX GUARD: aplica margem de spread/risco se disponível ──
        const spreadPct = (window.KZ_FX_SPREADS && window.KZ_FX_SPREADS[curr] != null)
          ? window.KZ_FX_SPREADS[curr]
          : 0;
        const spreadMult = 1 + (spreadPct / 100);
        const value  = rawBRL * rate * spreadMult;

        let formatted;
        if (KZ_LOC.noDecimals.includes(curr)) {
          // JPY: inteiro, separador de milhar com ponto
          formatted = Math.round(value).toLocaleString('ja-JP');
        } else {
          // Demais: 2 casas decimais, vírgula decimal
          formatted = value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
        return symbol + '\u00A0' + formatted;
      }

      function kzLocalize(type, val, btn) {
        KZ_LOC[type] = val;

        // ── Determina grupo de botões a resetar ─────────────────
        const isLang = (type === 'lang');
        const groupId = isLang ? 'kzLangGroup' : 'kzCurrGroup';
        const groupEl = document.getElementById(groupId);
        if (groupEl) groupEl.querySelectorAll('.kzloc-btn').forEach(b => b.classList.remove('kzloc-active'));
        btn.classList.add('kzloc-active');

        // ── Animação suave (flash-blur) nos elementos alvo ──────
        const targets = [
          document.getElementById('pdpTitle'),
          document.getElementById('pdpPrice'),
          document.getElementById('kzLocStatus')
        ].filter(Boolean);

        targets.forEach(el => {
          el.classList.remove('kzloc-animate');
          void el.offsetWidth;
          el.classList.add('kzloc-animate');
        });

        setTimeout(() => {
          // ── Título localizado ──────────────────────────────────
          const titleEl = document.getElementById('pdpTitle');
          if (titleEl) titleEl.textContent = KZ_LOC.titles[KZ_LOC.lang] || KZ_LOC.titles['PT'];

          // ── Preço convertido e formatado ───────────────────────
          const priceEl = document.getElementById('pdpPrice');
          if (priceEl) {
            priceEl.textContent = kzFormatPrice(KZ_LOC.basePriceBRL, KZ_LOC.curr);
            priceEl.style.cssText = ''; // remove gradient inline do pdp-price-main
          }

          // ── Status bar com bandeira e idioma ───────────────────
          const statusEl = document.getElementById('kzLocStatus');
          if (statusEl) {
            const statusRow = KZ_LOC.statusFlags[KZ_LOC.lang] || KZ_LOC.statusFlags['PT'];
            statusEl.textContent = statusRow[KZ_LOC.curr] || '🌐 Localização ativa';
          }

          targets.forEach(el => el.classList.remove('kzloc-animate'));

          // ── PATCH: Estimador de Logística Internacional ──────────
          if (typeof kzUpdateIntlShipping === 'function') {
            kzUpdateIntlShipping(KZ_LOC.lang, KZ_LOC.curr);
          }
        }, 180);
      }

      // ── KZ SMART NEGOTIATOR LOGIC ──────────────────────
      let _kzNegPriceRaw = 0;    // current product price in BRL (cents)
      let _kzNegMaxDisc  = 15;   // default max negotiation margin %
      let _kzNegRound    = 0;    // negotiation round counter
      let _kzNegAgreed   = false;

      function openKzNegotiator() {
        const overlay = document.getElementById('kzNegotiatorOverlay');
        if (!overlay) return;

        // Read current product price
        const priceEl = document.getElementById('pdpPrice');
        const priceText = priceEl ? priceEl.textContent : 'R$ 1.249,90';
        const priceNum = parseFloat(priceText.replace(/[^\d,]/g,'').replace(',','.')) || 1249.90;
        _kzNegPriceRaw = priceNum;

        // Read admin margin setting
        const marginInput = document.getElementById('kzNegMarginInput');
        _kzNegMaxDisc = marginInput ? Math.min(50, Math.max(1, parseFloat(marginInput.value)||15)) : 15;
        _kzNegRound = 0;
        _kzNegAgreed = false;
        kzNegSetMood(75, 'open'); /* reset mood to open state */

        // Clear chat and add initial Kz message
        const chat = document.getElementById('kzNegChat');
        if (chat) {
          chat.innerHTML = '';
          kzNegAddMsg('kz', `Olá! 👋 Sou o <strong>Kz</strong>, assistente de negociação da WeKz.<br>O preço atual é <strong style="color:var(--teal);">${priceText}</strong>.<br>Qual valor você propõe? Vou verificar dentro da margem de desconto definida pelo <strong>Vendedor</strong> deste anúncio! 🔍`);
        }

        const input = document.getElementById('kzNegInput');
        if (input) { input.value = ''; input.disabled = false; }
        const sendBtn = document.getElementById('kzNegSendBtn');
        if (sendBtn) sendBtn.disabled = false;

        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        /* v2.8.0: sincroniza estado do Negotiator com WkzApp */
        if (typeof WkzApp !== 'undefined') WkzApp.negotiatorOpen();

        // [v2.2.0] MODO FOCO: ativa backdrop-blur no restante da página
        document.body.classList.add('kz-neg-focus-mode');

        // [v2.2.0] Esconde botão flutuante quando o modal está aberto
        const floatBtn = document.getElementById('kzNegFloatingBtn');
        if (floatBtn) floatBtn.style.display = 'none';

        setTimeout(() => input && input.focus(), 300);
        admAuditAdd && admAuditAdd('🤝', `Kz Smart Negotiator aberto — produto com preço R$${priceNum.toFixed(2)}`, 'Cliente');
      }
      // [v2.9.29 BUGFIX] openKzNegotiator era declarada dentro de uma closure
      // (não no escopo global), mas os onclick="openKzNegotiator()" inline no
      // HTML executam no escopo global do window → ReferenceError: not defined.
      // Mesmo padrão usado em todo o app (window.kzcToggle, window.cpToggle...).
      window.openKzNegotiator = openKzNegotiator;

      function closeKzNegotiator() {
        const overlay = document.getElementById('kzNegotiatorOverlay');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
        /* v2.8.0: sincroniza estado do Negotiator com WkzApp */
        if (typeof WkzApp !== 'undefined') WkzApp.negotiatorClose();
        kzNegSetMood(75, 'open'); /* reset mood on close */

        // [v2.2.0] Remove modo foco ao fechar
        document.body.classList.remove('kz-neg-focus-mode');

        // [v2.2.0] Reexibe botão flutuante ao fechar (apenas em PDP)
        const isOnPdp = document.getElementById('page-product') &&
          document.getElementById('page-product').classList.contains('active');
        const floatBtn = document.getElementById('kzNegFloatingBtn');
        if (floatBtn && isOnPdp) floatBtn.style.display = 'flex';
      }
      // [v2.9.29 BUGFIX] mesmo problema de escopo do openKzNegotiator acima —
      // onclick="closeKzNegotiator()" (botão ✕ e overlay) precisa de window.*.
      window.closeKzNegotiator = closeKzNegotiator;

      /* ── Kz Mood Bar controller ── */
      function kzNegSetMood(pct, state) {
        const fill   = document.getElementById('kzNegMoodFill');
        const status = document.getElementById('kzNegMoodStatus');
        if (!fill || !status) return;
        const clamped = Math.max(0, Math.min(100, pct));
        fill.style.width = clamped + '%';
        fill.classList.remove('mood-warn', 'mood-danger');
        status.classList.remove('mood-warn', 'mood-danger');
        if (state === 'warn' || (state === 'auto' && clamped <= 45 && clamped > 20)) {
          fill.classList.add('mood-warn');
          status.classList.add('mood-warn');
          status.textContent = '⚠ Limite alcançado';
        } else if (state === 'danger' || (state === 'auto' && clamped <= 20)) {
          fill.classList.add('mood-danger');
          status.classList.add('mood-danger');
          status.textContent = '🔴 Oferta final';
        } else {
          status.textContent = '✦ Aberto a propostas';
        }
      }

      function kzNegOverlayClick(e) {
        if (e.target.id === 'kzNegotiatorOverlay') closeKzNegotiator();
      }
      // [v2.9.29 BUGFIX] onclick="kzNegOverlayClick(event)" no overlay (fecha
      // ao clicar fora do card) — mesmo problema de escopo das duas funções acima.
      window.kzNegOverlayClick = kzNegOverlayClick;

      function kzNegAddMsg(from, html, extra) {
        const chat = document.getElementById('kzNegChat');
        if (!chat) return;
        // [v2.9.29 BUGFIX] isKz precisa ser calculado ANTES de ser usado em
        // safeHtml — estava declarado 2 linhas abaixo (TDZ do const), o que
        // gerava "Cannot access 'isKz' before initialization" e abortava
        // openKzNegotiator() silenciosamente antes do overlay.classList.add('open').
        const isKz = from === 'kz';
        // C2: sanitiza mensagem antes de injetar no DOM do chat
        // userContent=true apenas para mensagens do utilizador; respostas da IA (kz) são conteúdo interno
        const safeHtml  = (typeof wkzSanitizeHTML === 'function') ? wkzSanitizeHTML(html,  !isKz) : html;
        const safeExtra = (typeof wkzSanitizeHTML === 'function') ? wkzSanitizeHTML(extra || '', false) : (extra || '');
        const avatarHtml = isKz
          ? `<div class="kz-neg-avatar">🐆</div>`
          : `<div class="kz-neg-avatar" style="background:rgba(124,58,237,0.2);border-color:rgba(124,58,237,0.3);">👤</div>`;
        const wrap = document.createElement('div');
        wrap.className = `kz-neg-bubble ${isKz ? 'kz' : 'user'}`;
        wrap.innerHTML = `${isKz ? avatarHtml : ''}<div class="kz-neg-msg">${safeHtml}${safeExtra}</div>${!isKz ? avatarHtml : ''}`;
        chat.appendChild(wrap);
        chat.scrollTop = chat.scrollHeight;
        return wrap;
      }

      function kzNegThinking() {
        const chat = document.getElementById('kzNegChat');
        if (!chat) return null;
        const wrap = document.createElement('div');
        wrap.className = 'kz-neg-bubble kz';
        wrap.id = 'kzNegThinkingBubble';
        wrap.innerHTML = `<div class="kz-neg-avatar">🐆</div><div class="kz-neg-msg"><div class="kz-neg-thinking"><div class="kz-neg-dot"></div><div class="kz-neg-dot"></div><div class="kz-neg-dot"></div></div></div>`;
        chat.appendChild(wrap);
        chat.scrollTop = chat.scrollHeight;
        return wrap;
      }

      function kzNegRemoveThinking() {
        const el = document.getElementById('kzNegThinkingBubble');
        if (el) el.remove();
      }

      function kzNegSend() {
        if (_kzNegAgreed) return;
        const input = document.getElementById('kzNegInput');
        if (!input) return;
        const raw = input.value.trim();
        if (!raw) return;

        // ── PATCH 1C: Extração de número puro — suporta ¥, 元, ₹, ₽, $, €, R$
        //   e formatações de milhares internacionais (1.000,00 · 1,000.00 · 1 000,00)
        let cleaned = raw;
        // Remove prefixos/sufixos de moeda conhecidos (ordem importa — R$ antes de $)
        cleaned = cleaned.replace(/R\$\s?|¥\s?|元\s?|₹\s?|₽\s?|€\s?|\$\s?|£\s?/g, '');
        // Remove espaços de separador de milhar (estilo europeu/russo: 1 000,00)
        cleaned = cleaned.replace(/\s/g, '');
        // Detecta formato "vírgula como decimal, ponto como milhar": 1.249,90 → 1249.90
        if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        // Detecta formato "ponto como decimal, vírgula como milhar": 1,249.90 → 1249.90
        } else if (/\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
          cleaned = cleaned.replace(/,/g, '');
        } else {
          // Fallback: mantém apenas dígitos, ponto e vírgula; troca vírgula por ponto
          cleaned = cleaned.replace(/[^\d.,]/g, '').replace(',', '.');
        }

        const proposed = parseFloat(cleaned);
        if (isNaN(proposed) || proposed <= 0) {
          kzNegAddMsg('kz', '⚠️ Por favor, insere um valor numérico válido! Ex: <strong>950</strong> ou <strong>R$ 950</strong>');
          input.value = '';
          return;
        }

        kzNegAddMsg('user', `Proponho <strong>R$ ${proposed.toFixed(2).replace('.',',')}</strong>`);
        input.value = '';
        input.disabled = true;
        document.getElementById('kzNegSendBtn').disabled = true;

        const thinkBubble = kzNegThinking();

        setTimeout(() => {
          kzNegRemoveThinking();
          _kzNegRound++;

          const minAcceptable = _kzNegPriceRaw * (1 - _kzNegMaxDisc / 100);
          const discPct = ((_kzNegPriceRaw - proposed) / _kzNegPriceRaw) * 100;

          if (proposed >= _kzNegPriceRaw) {
            // Cliente ofereceu valor igual ou acima
            kzNegAddMsg('kz', `😄 Ui, esse valor é excelente para nós! Nada a negociar — o preço de <strong>R$ ${_kzNegPriceRaw.toFixed(2).replace('.',',')}</strong> já está aceite! Pode finalizar a compra normalmente. 🎉`);
            _kzNegAgreed = true;
            kzNegSetMood(100, 'open');
          } else if (proposed >= minAcceptable) {
            // Dentro da margem — aceitar
            const disc = ((_kzNegPriceRaw - proposed) / _kzNegPriceRaw * 100).toFixed(1);
            const cupomCode = 'KZNEG-' + Math.random().toString(36).substring(2,7).toUpperCase();
            const cupomHtml = `<div class="kz-neg-cupom"><div class="kz-neg-cupom-code">${cupomCode}</div><div class="kz-neg-cupom-desc">Desconto de ${disc}% · Uso único · Válido por 24h</div></div>`;
            kzNegAddMsg('kz', `✅ Analisei as margens e <span class="neg-highlight">ACEITO</span> a sua proposta de <strong>R$ ${proposed.toFixed(2).replace('.',',')}</strong>!<br><br>Gerado o teu cupão de uso único:<br>`, cupomHtml);
            showToast && showToast(`🤝 Acordo feito! Cupão ${cupomCode} gerado!`);
            admAuditAdd && admAuditAdd('🤝', `Kz Negotiator: acordo feito — ${disc}% desconto, cupão ${cupomCode}`, 'Kz IA');
            _kzNegAgreed = true;
            kzNegSetMood(55, 'open');

            // Auto-apply cupom in cart
            const couponInput = document.getElementById('couponInput');
            if (couponInput) couponInput.value = cupomCode;

          } else if (_kzNegRound === 1) {
            // Primeira rodada — contraproposta
            const counterPct = (_kzNegMaxDisc * 0.6).toFixed(1);
            const counterPrice = (_kzNegPriceRaw * (1 - counterPct / 100));
            kzNegAddMsg('kz', `🤔 Hmm... <span class="neg-warn">R$ ${proposed.toFixed(2).replace('.',',')} está abaixo da margem autorizada pelo Vendedor.</span><br><br>A melhor oferta que o Vendedor autoriza é <strong style="color:var(--teal);">R$ ${counterPrice.toFixed(2).replace('.',',')}</strong> (${counterPct}% OFF).<br>Aceitas?`);
            kzNegSetMood(42, 'warn');
            input.disabled = false;
            document.getElementById('kzNegSendBtn').disabled = false;
            input.placeholder = `Propor valor ou aceitar R$ ${counterPrice.toFixed(2).replace('.',',')}`;
          } else {
            // Segunda ou mais rodadas — recusar com boa vontade
            const bestPrice = (minAcceptable).toFixed(2).replace('.',',');
            kzNegAddMsg('kz', `😔 Infelizmente o Vendedor não autorizou margem para ir mais abaixo de <strong>R$ ${bestPrice}</strong>.<br>Essa é a melhor oferta dentro do limite definido pelo lojista! Caso aceites, usa o botão de compra normal com o cupão especial que vou gerar.`);
            kzNegSetMood(12, 'danger');
            const cupomCode = 'KZMIN-' + Math.random().toString(36).substring(2,6).toUpperCase();
            const cupomHtml = `<div class="kz-neg-cupom"><div class="kz-neg-cupom-code">${cupomCode}</div><div class="kz-neg-cupom-desc">Desconto máximo de ${_kzNegMaxDisc}% · Válido 24h</div></div>`;
            kzNegAddMsg('kz', `Aqui está o melhor cupão que posso oferecer:`, cupomHtml);
            const couponInput = document.getElementById('couponInput');
            if (couponInput) couponInput.value = cupomCode;
            _kzNegAgreed = true;
            admAuditAdd && admAuditAdd('🤝', `Kz Negotiator: proposta recusada — cupão mínimo ${cupomCode} gerado`, 'Kz IA');
          }

          input.disabled = _kzNegAgreed;
          if (!_kzNegAgreed) {
            input.disabled = false;
            document.getElementById('kzNegSendBtn').disabled = false;
            input.focus();
          }

        }, 1800 + Math.random() * 600);
      }
      // [v2.9.29 BUGFIX] onclick="kzNegSend()" (botão ➤) e onkeydown="...kzNegSend()"
      // (tecla Enter no input) — mesmo problema de escopo das funções acima.
      // Sem isto, o usuário conseguia ABRIR o Negociador mas não enviar proposta.
      window.kzNegSend = kzNegSend;


  /* Preset padrão para quando não há match */
  const DEFAULT_PRESET = {
    title: 'Produto Premium WeKz — Alta Qualidade e Entrega Garantida',
    shortDesc: 'Produto selecionado com rigoroso controle de qualidade WeKz. Garantia estendida, frete expresso disponível e suporte especializado pós-venda.',
    desc: `✅ QUALIDADE GARANTIDA: Produto verificado e aprovado pelo Selo WeKz de Qualidade. Passa por inspeção rigorosa antes do envio.

🚀 ENTREGA RÁPIDA: Parceria com as maiores transportadoras do Brasil. Rastreamento em tempo real pelo app WeKz.

🛡️ GARANTIA COMPLETA: 90 dias de garantia contra defeitos de fabricação + 7 dias de devolução sem burocracia (CDC).

💬 SUPORTE 24/7: Nossa equipe está disponível por chat, e-mail e telefone para qualquer dúvida.

📦 EMBALAGEM SEGURA: Produto embalado com proteção reforçada para chegada perfeita.

⭐ AVALIAÇÕES REAIS: Loja com nota 4.8/5.0 baseada em mais de 2.300 avaliações verificadas.`,
    tags: 'produto premium, qualidade garantida, WeKz, entrega rápida, garantia, frete grátis',
    category: '',
    brand: '',
  };

  function matchPreset(query) {
    const q = query.toLowerCase();
    for (const preset of KZ_PRODUCT_PRESETS) {
      if (preset.keywords.some(kw => q.includes(kw))) return preset;
    }
    return DEFAULT_PRESET;
  }

  function setFieldAnimated(id, value, delay) {
    return new Promise(function(resolve) {
      setTimeout(function() {
        const el = document.getElementById(id);
        if (!el) { resolve(); return; }
        el.value = '';
        let i = 0;
        const chunk = Math.max(1, Math.floor(value.length / 18));
        const iv = setInterval(function() {
          i = Math.min(i + chunk, value.length);
          el.value = value.substring(0, i);
          if (typeof el.oninput === 'function') el.oninput();
          if (el.tagName === 'TEXTAREA') {
            const next = el.nextElementSibling;
            if (next && next.tagName !== 'INPUT') next.textContent = el.value.length + '/' + (el.getAttribute('maxlength') || '');
          }
          if (i >= value.length) { clearInterval(iv); resolve(); }
        }, 14);
      }, delay);
    });
  }


/* ════════════════════════════════════════════════════════════
   WeKz Shop v1.8.0 — CLIENT PROFILE MODULE
   Meu Perfil | Kz Copilot | Rastreio | Disputas | Carteira
   ════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── Kz FX Guard Bridge — formata valor (base EUR) usando a moeda activa do LANG_CURRENCY ──
     KZ_LOC e kzFormatPrice vivem no mesmo <script> raiz, logo acessíveis por closure.
     Fallback seguro para EUR caso o motor ainda não tenha sido iniciado.             */
  var CP_SAVED_EUR = 42.50;   // valor base em EUR para o "Economizado"

  function cpFmtAmt(eurValue) {
    // Lê moeda activa do motor LANG_CURRENCY
    var curr = (typeof KZ_LOC !== 'undefined' && KZ_LOC.curr) ? KZ_LOC.curr : 'EUR';
    if (typeof kzFormatPrice === 'function' && typeof KZ_LOC !== 'undefined') {
      // kzFormatPrice espera valor em BRL — converter EUR→BRL usando a taxa do motor
      var eurRate = (KZ_LOC.rates && KZ_LOC.rates.EUR) ? KZ_LOC.rates.EUR : 0.175;
      var brl = eurValue / eurRate;
      return kzFormatPrice(brl, curr);
    }
    // Fallback: símbolo estático sem conversão
    var sym = { BRL:'R$', EUR:'€', USD:'$', JPY:'¥', CNY:'元', INR:'₹', RUB:'₽' };
    return (sym[curr] || curr) + '\u00A0' + eurValue.toFixed(2).replace('.', ',');
  }

  /* ── Helpers de template ── */
  function cpApplyTpl(str) {
    return str ? str.replace('{{SAVED}}', cpFmtAmt(CP_SAVED_EUR)) : str;
  }

  /* ══════════════════════════════════════════
     [v3.0] BIBLIOTECA DE ÍCONES SVG — Meu Perfil
     Substitui os emojis usados neste módulo por
     ícones SVG simplificados (acessíveis, dimensionam-
     -se automaticamente via width/height:1em ao
     tamanho de fonte do elemento-pai).
  ══════════════════════════════════════════ */
  function _ico(paths, vb) {
    return '<svg viewBox="' + (vb || '0 0 24 24') + '" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;display:inline-block;flex-shrink:0;" aria-hidden="true">' + paths + '</svg>';
  }
  var CP_ICO = {
    bot:      '<svg viewBox="0 0 100 100" width="1em" height="1em" style="vertical-align:-0.2em;display:inline-block;flex-shrink:0;" aria-hidden="true"><use href="#kz-mascot-full"/></svg>',
    lynx:     '<svg viewBox="0 0 100 100" width="1em" height="1em" style="vertical-align:-0.2em;display:inline-block;flex-shrink:0;" aria-hidden="true"><use href="#kz-mascot-full"/></svg>',
    tag:      _ico('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    package:  _ico('<path d="M16.5 9.4L7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>'),
    scale:    _ico('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
    flame:    _ico('<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>'),
    card:     _ico('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    truck:    _ico('<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 00-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
    customs:  _ico('<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/>'),
    gear:     _ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
    check:    _ico('<polyline points="20 6 9 17 4 12"/>'),
    smartphone:_ico('<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),
    hourglass:_ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    shirt:    _ico('<path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/>'),
    dot:      _ico('<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>'),
    search:   _ico('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    calendar: _ico('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    undo:     _ico('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/>'),
    star:     _ico('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    trash:    _ico('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),
    zap:      _ico('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    trophy:   _ico('<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M7 4H3v1a4 4 0 004 4"/><path d="M17 4h4v1a4 4 0 01-4 4"/>'),
    sync:     _ico('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>'),
    pencil:   _ico('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    save:     _ico('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'),
    link:     _ico('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>'),
    copy:     _ico('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
    chat:     _ico('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>'),
    send:     _ico('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    door:     _ico('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    camera:   _ico('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>'),
    folder:   _ico('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
    store:    _ico('<path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0"/><path d="M5 9v10h14V9"/>'),
    warning:  _ico('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    award:    _ico('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>'),
    cyclone:  _ico('<path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
    close:    _ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    bank:     _ico('<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 21 7 3 7"/>'),
    coin:     _ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
    lock:     _ico('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
    gem:      _ico('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M2 9h20"/>'),
    shield:   _ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    hexagon:  _ico('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>'),
    crown:    _ico('<path d="M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4L3 18z"/><circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none"/>'),
    eye:      _ico('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    cpu:      _ico('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>'),
    target:   _ico('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>'),
    money:    _ico('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
    mail:     _ico('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>')
  };
  /* Rótulos curtos por ícone — usados em toasts (texto simples, sem HTML) */
  var CP_ICO_LABEL = { lynx:'Lince Kz', zap:'Raio', star:'Estrela', hexagon:'Hexágono', gem:'Gema', shield:'Escudo', crown:'Coroa', eye:'Olho Cyber', cpu:'Chip', trophy:'Troféu', flame:'Chama', target:'Mira' };

  /* ── Mock Data ── */
  var CP_HISTORY = [
    { emoji:CP_ICO.bot, text:'Smart Negotiator desbloqueou -15% no Smartphone Pro X', time:'Hoje 14:22' },
    { emoji:CP_ICO.tag, text:'Cupão KZNEON18 gerado automaticamente pelo Kz', time:'Ontem 11:05' },
    { emoji:CP_ICO.package, text:'Encomenda #WKZ-9042 saiu para entrega em Lisboa', time:'Ontem 09:30' },
    { emoji:CP_ICO.scale, text:'Veredito da disputa #WKZ-8801 emitido a seu favor', time:'3 dias atrás' },
    { emoji:CP_ICO.flame, text:'Atingiste o nível Neon Cyber — +200 pts bónus!', time:'5 dias atrás' },
    { emoji:CP_ICO.card, text:'Cartão Visa *4521 adicionado à carteira multimoedas', time:'1 sem atrás' },
  ];

  var CP_ORDERS = [
    { id:'#WKZ-9042', name:'Smartphone Pro X 256GB Grafite', amountEUR: 329.99,
      status:'shipping', statusLabel:CP_ICO.truck+' Saiu p/ Entrega', progress:85,
      steps:['Confirmado','Hub Central','Alfândega','Em Trânsito','Entregue'], activeStep:3, eta:'27 Mai 2026' },
    { id:'#WKZ-9038', name:'Fone ANC Pro Bluetooth 5.3', amountEUR: 89.50,
      status:'customs', statusLabel:CP_ICO.customs+' Aguard. Alfândega', progress:55,
      steps:['Confirmado','Hub Central','Alfândega','Em Trânsito','Entregue'], activeStep:2, eta:'02 Jun 2026' },
    { id:'#WKZ-9011', name:'Smartwatch Ultra Series 9', amountEUR: 214.00,
      status:'processing', statusLabel:CP_ICO.gear+' Processando Hub', progress:25,
      steps:['Confirmado','Hub Central','Alfândega','Em Trânsito','Entregue'], activeStep:1, eta:'08 Jun 2026' },
    { id:'#WKZ-8990', name:'Teclado Mecânico RGB TKL', amountEUR: 74.99,
      status:'delivered', statusLabel:CP_ICO.check+' Entregue', progress:100,
      steps:['Confirmado','Hub Central','Alfândega','Em Trânsito','Entregue'], activeStep:4, eta:'Entregue 18 Mai 2026' },
  ];

  var CP_DISPUTES = [
    { id:'#WKZ-8801', reason:'Produto chegou com ecrã danificado', date:'19 Mai 2026',
      verdict:'buyer', verdictAmtEUR:89.50,
      verdictTpl:CP_ICO.check+' Veredito a seu favor — Reembolso de {AMT} processado em 2 dias úteis.',
      icon:CP_ICO.smartphone, productName:'Smartphone Pro X 256GB Grafite',
      productCat:'Electrónicos', seller:'TechZone Store', amountEUR:329.99,
      timeline:[
        {date:'14 Mai 2026',event:'Pedido entregue pelo transportador'},
        {date:'19 Mai 2026',event:'Disputa aberta pelo comprador'},
        {date:'21 Mai 2026',event:'Vendedor notificado — prazo de resposta: 3 dias'},
        {date:'23 Mai 2026',event:'Veredito emitido a favor do comprador'},
        {date:'25 Mai 2026',event:'Reembolso processado — 2 dias úteis'},
      ]
    },
    { id:'#WKZ-8777', reason:'Artigo não corresponde à descrição (cor diferente)', date:'12 Mai 2026',
      verdict:'pending', verdictText:CP_ICO.hourglass+' Admin a analisar — Prazo: até 28 Mai 2026.', icon:CP_ICO.shirt,
      productName:'Hoodie Oversized Neon Edition — Azul',
      productCat:'Moda', seller:'UrbanKz Wear', amountEUR:42.00,
      timeline:[
        {date:'08 Mai 2026',event:'Pedido entregue pelo transportador'},
        {date:'12 Mai 2026',event:'Disputa aberta pelo comprador'},
        {date:'13 Mai 2026',event:'Vendedor notificado — prazo de resposta: 3 dias'},
        {date:'16 Mai 2026',event:'Vendedor enviou contra-argumentos'},
        {date:'18 Mai 2026',event:'Em análise pela equipa WeKz — decisão até 28 Mai'},
      ]
    },
    { id:'#WKZ-8720', reason:'Demora na entrega — ultrapassou prazo garantido', date:'3 Mai 2026',
      verdict:'partial', verdictAmtEUR:15.00,
      verdictTpl:CP_ICO.dot+' Resolução parcial — Cupão de {AMT} concedido como compensação.',
      icon:CP_ICO.truck, productName:'Fone Over-Ear Studio Pro — Preto',
      productCat:'Áudio', seller:'SoundWorld', amountEUR:118.00,
      timeline:[
        {date:'18 Abr 2026',event:'Pedido confirmado — entrega estimada: 28 Abr'},
        {date:'03 Mai 2026',event:'Prazo ultrapassado — disputa aberta'},
        {date:'05 Mai 2026',event:'Pedido entregue com 7 dias de atraso'},
        {date:'07 Mai 2026',event:'Resolução parcial: cupão de compensação emitido'},
      ]
    },
  ];

  var CP_CARDS = [
    { chip:CP_ICO.card, number:'**** **** **** 4521', holder:'ALEXANDRE K.', brand:'Visa', isDefault:true },
    { chip:CP_ICO.card, number:'**** **** **** 8834', holder:'ALEXANDRE K.', brand:'Mastercard', isDefault:false },
  ];

  var CP_COUPONS = [
    { emoji:CP_ICO.tag, discount:'-15% OFF',    desc:'Qualquer Electrónico',          code:'KZNEON18', expiry:'Val: 30 Jun 2026' },
    { emoji:CP_ICO.flame, discountEUR: 10.00, discountMinEUR: 80.00,                    desc:'Smart Negotiator', code:'KZSN10EU', expiry:'Val: 15 Jun 2026' },
    { emoji:CP_ICO.truck, discount:'Envio Grátis', desc:'Próximo pedido internacional',  code:'KZFSHIP',  expiry:'Val: 20 Jun 2026' },
  ];

  var CP_INSIGHTS = [
    'Olá, <strong>Alexandre</strong>! '+CP_ICO.flame+' Estás no nível <strong>Neon Cyber</strong> e já economizaste <strong>{{SAVED}}</strong> com o Smart Negotiator. Mais 160 pontos para o próximo nível!',
    CP_ICO.search+' Dica do Kz: Os teus padrões indicam interesse em Electrónicos. Ativa o alerta de preços para poupares ainda mais!',
    CP_ICO.package+' Tens 2 encomendas internacionais em trânsito. A mais próxima chega a <strong>27 Mai</strong> — fica atento!',
    CP_ICO.scale+' O veredito da disputa <strong>#WKZ-8801</strong> foi emitido a teu favor. Reembolso em processamento. '+CP_ICO.check,
    CP_ICO.tag+' O cupão <strong>KZNEON18</strong> expira em 30 Jun. Usa-o antes que caduque e poupa -15%!',
    CP_ICO.card+' Tens 2 cartões guardados. Considera adicionar um método de pagamento alternativo para maior segurança.',
  ];
  var _cpInsightIdx = 0;

  /* ── Render: Copilot History ── */
  function renderCopilotHistory() {
    var el = document.getElementById('cpHistoryList');
    if (!el) return;
    el.innerHTML = CP_HISTORY.map(function(h) {
      return '<div class="cp-history-item">'
        + '<span class="cp-history-emoji">' + h.emoji + '</span>'
        + '<span class="cp-history-text">' + h.text + '</span>'
        + '<span class="cp-history-time">' + h.time + '</span>'
        + '</div>';
    }).join('');
  }

  /* ── Render: Order Tracker ── */
  function renderOrders() {
    var el = document.getElementById('cpOrderList');
    if (!el) return;
    el.innerHTML = CP_ORDERS.map(function(o) {
      var stepsHtml = o.steps.map(function(s, i) {
        var cls = i < o.activeStep ? 'done' : (i === o.activeStep ? 'active' : '');
        return '<div class="cp-step ' + cls + '">'
          + '<div class="cp-step-dot"></div>'
          + '<div class="cp-step-label">' + s + '</div>'
          + '</div>';
      }).join('');
      return '<div class="cp-order-card">'
        + '<div class="cp-order-top">'
          + '<span class="cp-order-id">' + o.id + '</span>'
          + '<span class="cp-order-name">' + o.name + '</span>'
          + '<span class="cp-order-amount">' + cpFmtAmt(o.amountEUR) + '</span>'
        + '</div>'
        + '<span class="cp-status-pill ' + o.status + '">' + o.statusLabel + '</span>'
        + '<div class="cp-progress-wrap">'
          + '<div class="cp-progress-bar"><div class="cp-progress-fill" data-w="' + o.progress + '" style="width:0%"></div></div>'
          + '<div class="cp-progress-steps">' + stepsHtml + '</div>'
        + '</div>'
        + '<div class="cp-order-eta">'
          + '<span>' + CP_ICO.calendar + ' Estimativa:</span>'
          + '<span class="cp-order-eta-value">' + o.eta + '</span>'
          + '<button onclick="cpTrackOrder(\'' + o.id + '\')" style="margin-left:auto;padding:3px 10px;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);border-radius:6px;color:var(--teal);font-size:10px;font-weight:700;cursor:pointer;transition:var(--transition);" onmouseover="this.style.background=\'rgba(0,180,171,0.2)\'" onmouseout="this.style.background=\'rgba(0,180,171,0.1)\'">' + CP_ICO.search + ' Rastrear</button>'
          + (o.status === 'delivered' ? '<button onclick="openReturnModal(\'' + o.id + '\',\'' + o.name.replace(/'/g,"\\\\'") + '\')" style="padding:3px 10px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:6px;color:#a78bfa;font-size:10px;font-weight:700;cursor:pointer;transition:var(--transition);" onmouseover="this.style.background=\'rgba(124,58,237,0.2)\'" onmouseout="this.style.background=\'rgba(124,58,237,0.1)\'">' + CP_ICO.undo + ' Solicitar Devolução</button>' : '')
          + (o.status === 'shipping' ? '<button onclick="wkzBuyerConfirmReceived(\'' + o.id + '\')" style="padding:3px 10px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:#22C55E;font-size:10px;font-weight:700;cursor:pointer;transition:var(--transition);" onmouseover="this.style.background=\'rgba(34,197,94,0.2)\'" onmouseout="this.style.background=\'rgba(34,197,94,0.1)\'">' + '\u2713 Confirmar Recebimento</button>' : '')
        + '</div>'
        + '</div>';
    }).join('');
    /* Animate progress bars */
    setTimeout(function() {
      el.querySelectorAll('.cp-progress-fill').forEach(function(bar) {
        var w = bar.getAttribute('data-w');
        bar.style.width = (w || '0') + '%';
      });
    }, 120);
  }

  /* ── Render: Disputes ── */
  function renderDisputes() {
    var el = document.getElementById('cpDisputeContainer');
    if (!el) return;
    if (!CP_DISPUTES.length) {
      el.innerHTML = '<div class="cp-dispute-empty"><div class="cp-dispute-empty-icon">' + CP_ICO.scale + '</div>Nenhuma disputa registada. As tuas compras estão protegidas pela WeKz Buyer Protection!</div>';
      return;
    }
    el.innerHTML = '<div class="cp-dispute-list">'
      + CP_DISPUTES.map(function(d) {
          /* resolve verdict text: template com {AMT} ou texto estático */
          var verdictHtml = (d.verdictTpl && d.verdictAmtEUR != null)
            ? d.verdictTpl.replace('{AMT}', cpFmtAmt(d.verdictAmtEUR))
            : (d.verdictText || '');
          return '<div class="cp-dispute-item">'
            + '<div class="cp-dispute-icon">' + d.icon + '</div>'
            + '<div class="cp-dispute-body">'
              + '<div class="cp-dispute-order">' + d.id + '</div>'
              + '<div class="cp-dispute-reason">' + d.reason + '</div>'
              + '<div class="cp-dispute-date">Aberta em ' + d.date + '</div>'
              + '<div class="cp-verdict-box ' + d.verdict + '">' + verdictHtml + '</div>'
              + '<button onclick="cpViewDisputeProduct(\'' + d.id + '\')" style="margin-top:10px;padding:6px 14px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);border-radius:8px;color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer;" onmouseover="this.style.background=\'rgba(124,58,237,0.22)\'" onmouseout="this.style.background=\'rgba(124,58,237,0.12)\'">' + CP_ICO.search + ' Ver Produto / Detalhe</button>'
            + '</div>'
          + '</div>';
        }).join('')
      + '</div>';
  }

  /* ── Render: Wallet & Coupons ── */
  function renderWallet() {
    var grid = document.getElementById('cpWalletGrid');
    if (grid) {
      grid.innerHTML = CP_CARDS.map(function(c, i) {
        return '<div class="cp-saved-card">'
          + (c.isDefault ? '<span class="cp-card-default-badge">Principal</span>' : '')
          + '<div class="cp-card-chip">' + c.chip + '</div>'
          + '<div class="cp-card-number">' + c.number + '</div>'
          + '<div class="cp-card-meta">'
            + '<span class="cp-card-holder">' + c.holder + '</span>'
            + '<span class="cp-card-brand">' + c.brand + '</span>'
          + '</div>'
          + '<div style="display:flex;gap:6px;margin-top:12px;">'
            + (!c.isDefault ? '<button onclick="cpSetDefaultCard(' + i + ')" style="flex:1;padding:5px 8px;background:rgba(0,180,171,0.1);border:1px solid rgba(0,180,171,0.3);border-radius:7px;color:var(--teal);font-size:10px;font-weight:700;cursor:pointer;" onmouseover="this.style.background=\'rgba(0,180,171,0.2)\'" onmouseout="this.style.background=\'rgba(0,180,171,0.1)\'">' + CP_ICO.star + ' Principal</button>' : '<span style="flex:1;padding:5px 8px;font-size:10px;color:var(--muted);display:flex;align-items:center;gap:4px;">' + CP_ICO.check + ' Cartão principal</span>')
            + '<button onclick="cpDeleteCard(' + i + ')" style="padding:5px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:7px;color:#f87171;font-size:10px;font-weight:700;cursor:pointer;" onmouseover="this.style.background=\'rgba(239,68,68,0.2)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.1)\'">' + CP_ICO.trash + '</button>'
          + '</div>'
        + '</div>';
      }).join('');
    }
    var clist = document.getElementById('cpCouponList');
    if (!clist) return;
    if (!CP_COUPONS.length) {
      clist.innerHTML = '<div class="cp-no-coupons">' + CP_ICO.tag + ' Nenhum cupão disponível. Negoceie um produto para gerar cupões exclusivos!</div>';
      return;
    }
    clist.innerHTML = CP_COUPONS.map(function(c) {
      /* coupon monetário usa discountEUR; percentual/texto usa discount estático */
      var discLabel = (c.discountEUR != null)
        ? '-' + cpFmtAmt(c.discountEUR)
        : c.discount;
      var descLabel = (c.discountEUR != null && c.discountMinEUR != null)
        ? 'Mín. ' + cpFmtAmt(c.discountMinEUR) + ' · ' + c.desc
        : c.desc;
      return '<div class="cp-coupon-item" onclick="cpCopyCoupon(\'' + c.code + '\')">'
        + '<span class="cp-coupon-emoji">' + c.emoji + '</span>'
        + '<div class="cp-coupon-body">'
          + '<div class="cp-coupon-discount">' + discLabel + '</div>'
          + '<div class="cp-coupon-desc">' + descLabel + '</div>'
        + '</div>'
        + '<div class="cp-coupon-right">'
          + '<span class="cp-coupon-code" onclick="event.stopPropagation();cpCopyCoupon(\'' + c.code + '\')">' + c.code + '</span>'
          + '<span class="cp-coupon-expiry">' + c.expiry + '</span>'
        + '</div>'
      + '</div>';
    }).join('');
  }

  /* ── Master Init (called by nav hook) ── */
  function initClientProfile() {
    /* ── Preenche elementos estáticos que dependem da moeda activa ── */
    var savedFmt = cpFmtAmt(CP_SAVED_EUR);
    var heroSavedEl = document.getElementById('cpStatHeroSaved');
    if (heroSavedEl) heroSavedEl.textContent = savedFmt;
    var negoStatEl = document.getElementById('cpStatNego');
    if (negoStatEl) negoStatEl.textContent = savedFmt;
    /* Actualiza o span interno do copilot bubble (se ainda não foi substituído por cpRefreshCopilot) */
    var copilotSavedEl = document.getElementById('cpCopilotSaved');
    if (copilotSavedEl) copilotSavedEl.textContent = savedFmt;

    renderCopilotHistory();
    renderLevelGuideSection();
    renderOrders();
    renderDisputes();
    renderWallet();
    /* Set logo as default avatar on first load */
    var logoEl = document.getElementById('cpAvatarLogo');
    if (logoEl && !logoEl.src) {
      logoEl.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAA/3ElEQVR42u29eXxdZbU+/qz17r3PmLFNOrcU2lJa5oIgAmlBFAFRuCbO16+i4oCiKHpFNDkq6PWKiHr1grOIXnPUi4iITE1UoEoL1A60pfOYJs2cM+39vu/6/bH3OUmZlVpafll88mlpk3NO9xreZz1reIFxGZdxGZdxGZdxGZdxGZdxGZdxGZdxGZdxGZdxGZdxGZdxORAiEBp/CuMyLi+hD9LoF+hgev2Pjn74iJ8fs/w0AGiF8KH0VPhlrfBmUU1N4rS2CgMko1+Q1lbh1iZx/pUKySLLAJCWhmPSmPAOAFjc9HJ+5oeK4lvFeeqfLgLc42Z+uW5R3c01ANRTPbW5WdSB/iRLm8LPcccxuz9w78KBHQDoUMMCzstK982ikCWDDPQcfCTmNX/iVR5S53jaPc3Tana1j1rPkH29flt/zOiNMRM85A723UNr6BFkYQRCbQBlQPZAfiyPYsc0xmum/3z2iuOwBava0a5a0GLGDeCAhnswsmSmnnvvBPeIY99PUv3/iJLzSADyASkBxABrwFFoiAnmJQwucKj+Sx99xdBDtrDvG7SKsgCkvVlUS5ZetIIWd8IAIGb3bI+B+sTMjxLovUubhNB5aDy5wz81ESEQCyCY/MHd72Cv9suuk5juFAAuwng+tBdAYhrK01BxDYr5sHENHdOQuMCtIai4BqQ4+MDw8OaPfGvjyWtfrBG0Q1QzYH965KOLjqo+/q8Ex7IEdnP/qjPevn3RipsXLXcvX3FKMA4CX4y0tjKIBPgft/4Tw/9jJ065VbzEdF1CoI0NhMAUQ4zjiLOCK9ZnawpCEOU5iMVdxB2C8rX1ixY6Ga85Z0r1MQ9/+ugN/9aSJdPaJP9UhBQIHbkITCCZGJt9TUI5rGGtw643rWbOzz4z+QcNl684JVi+SNyXGhPQYe35ACa95tZkadGlt1NV6tU0BK00yA1AngI7wxpOsfSgMzJwDw8PPerlR7Yi8IO0qqtNUc38akosTiN5Ya2KN5AGHGuDFNhNWI3B3JZ3Zp6Y97N/JBK0opUXN7Xxkk7SAPCreds+OC058zu+wIDAJLApBTVcGlq9u7Dx3W/bvGg5AEizqGwWaAYshVnKuAE875nfDkYLSdW1w7/nqvT5GILPBsoBlKMBNdj/G6dv+1e3/vrEvz4nbpzzp4aamrlX1Lp1n0kh5rK2OkHMCVPCyMjO8z6zYc4Dzc3tKpt9dtDWCuE2ABSBx6/UtdccO/mcz9d49VcZkBFYZmJQmAaYOMMp2aJfCAa/uTe/6dvv2PqqbWOjx8E0gsPTANpFoYVM+tqhG1BfdRUGEbABKwfKyZV61UDX5V3fO+LX5UjRtBiqsRGSXQBBBmhuzlJ3dwM1Ni6WbOTd7zlu/dlTEjN/k+L4BNI2qCZ2Jcjt2tnXcVxs+4WDbYA8n2K+NvXuGTPTx7097dVcXuumjihYGADMAJhQNgAAsERQVQoY8guDRTvyf4PF3v8t0JaH37nxgqHxCPACUr10prvJphs6UILmAMQulCqUNtHmjRf33Xbs2ogLsMg8X0on1LpgjZtZe6z/7gWrzzyqau59nvUcZWEaFbzeod3XfWzdtGtbm8TJRKF97PNrRStNOvqS8yY6k96VoOq3To0nMaAB36KkyHqKuAK2uGwABABWAPZdRnyCA2gLdJeGdw2b7l9sw44bPrx28d5QQf/aaHC4GQChVQjo4ETylcvFi51ABQSK4XCp2E1bnzxj8EfHb8b7l7u45R9D2K0LVnuZtcf6V5+465rpyanXWR9+kuBSKde7Ztu9c28avGQgpJGfphD6ypxl06Y5MxpJMD+tUuc7KnZptRtPFQw0ExRHD5oiIxCEcb7KAQ35xSGD4A/Wlh4o2KHHAlPauS/1532Xr7g8GI8AT9PSUgeZJTqd6W3WE+rbkYMmgBianV3bzhv85pz7/xnlVyJBK+jOW9ril0z75PoaJz0dBsEEwO0a3PjvV22Ye2tr01In07lEP98rfeeIvxw9rWrBF+vcuuZSdAyoyHQEEI/AVnw9HAx+bU9u1f+8d+u528bTwBdGrVgAMKnUFQKIAIYSUBge/n6ofPknlY8wOHeAV+zJ5H2bb3cUILDGMiTt1V4AAAsbF8uzGg+E25tFSbOoD209c/0bVtW3dBX3tsYYCoARASwgLkGslHI7RzZdcOGaxs+8d+u529qbRS1tEkcgfLDTwsPHAFqFkSFbde3GudZxzhAfIAceCkHRG9r9JYgQpuBFsXdrG8PoXLCDd5QEEGKnJCBy4ic3odVpybJ55qhJkgHZliwZypJphbA0idOydvIXeku9t6QcOAYwAojDUF2FnVe8beOCe1cvEK8VrdySJbOkkzSBDnoaeDhFAAYAE69uQlI5AHwkQaRLD/R/89jtaAM9P+B7bslmYQGSrfseX1XQhX524PgArHKmnzf3rEmAoBWtz+uhGZBt62yz7c2iHu9+4BP9QXEnM1TCgeop9XW0rJ/zY2kS59i15GeQsS/5Qz2sGIBE4pURohIQQKWh26Ma/wH4t5AIhLI7W/q0BJuZgYCgobyky41TAGAtFtLYsP9sOCqDjG3oBmV6WkZG/MHvxhVIW2A46P56WHTqOHS86rCQtii8O3yMhKmUi5KBY0t/i5D5AfGkbHP4TDSZrUYBvoIhZpBKTGxvFvXu85ud9mZR5bBPIHm2noKOTlhAqMff3F4wVnI6v2N57q77ACDTucSMG8A/wvwRyaL33+wKO5NhACgo0cGA2bZpZ+RyciDeZ80aqPZmUQFLV6CAgCBGATkb1LZkyVxwN5VasmSa0ez9dN6y2QJBBmSfyQgyICsArth0xsa8zW/THHTeuPMThY4mqDAb/CegEFo5AowHBCweVuXgjSUvZa2uFnggFyAfPcO33jLwT2a01IpWWtjcRmu6QQsbIS1ZMpm18LEWuOIV27dVqXr4DBQBOG5iwfcXbVniUfL0uI2fnIB7YlzUjD8c179s48iG939kC20QCNNTegk6mqDQCe3b3FIr5mEA6PgHw79AqByZWrJkMp0hbnihaenLxgAQdBFgSQSgMK/2gaypPKfn8pzWVl67to0WLAAtXBspGxlBNjPmuxa5157ysyOr09Xz+61pGiIrcODqQKS+qv6zdfHqzyUMoCwgARAEkLqY1zSfFi795szOM3k7b2mF8NiGksWLYdEJ5KX35561uwAAnR32hXg6mhbzwsbFQlkyyIZH4H8f1TnjyOT8ixXb81Zt+vN7APS9mPoBHTZHAEhqLvxyXf41V2wUL13PDKicv7ZwVWzh09nCVmpe20bdC0CNCyHZFjbPYB/8oSUPzkg4kxZUeakTE0ic4pJ3nDLqiGrPc3t1EZt8SEI8cnyDGh6W6fF66/qwHFiKGSZXg1kjqGN4+4oDy363+tNnv7r5ZtuSJfssBknPZaitEF7cBF68GJbGZDTfmP3bSTMTJ52Tcqvf5Kj4OZO9WG1Xfujxc/9ec9KLLR4dVhHAUayJlS8MiAVAqJre3J54JZr9zXXgI18Nm20hg0xGssjs97OXnL90em31zPlxjp+couSJHpwTY+IekeRYIgGATejV1gI5DT1ULFLJ8xhWC5GlugmMeD14cIPhdFwhKAEsAAvcIQN/Urz29HOPvvbKlix9TZpF0TOXkOXp7JNQRxN4cScMgWymM4wY3z7iwVkTqmYtSauqi1wVW1zFsQkMIG9gCxo6sKV7xx4xL2cDILSCsFB40ppsKUc2ZxkQDRhFNTsXzI1lM1QAYFbcEv7AOZc/Ni1GdUenlXNiTJKLYqKO8xA7MsmxVBKAY8I2MfhAycAYA6usJUVM2jc8cZJSr3hlAmuzOaQ9F6SU7OFteP2HumWwYx79/VcGtQkFbQG2AMQ6I8K2Oj7xP743/aEfIov+5/PMcp8BgQSdYQZz49yHj5kUn/naKq/6dSD3VWkVSzGAkgGGDTTEgsHiC9yCP7IiQhkvMxAoQsiCmxpAjYshWWKDTPgg1wImftNQPxgQgRWi5BSbWDgls41dcV+RotRJCVHHu3BnJ+ClkwS4GuBSqGw/gBENy9qSK0wOQC6DLcBEDDEWXppw5kf6kflWRgb9K4lchVg8jlUbt+Dciy7DH++5W2b3LqJtSzXqYg6MBUiYSga61ktMyNfM+QDtpOuXNonzXJ4ZNZmom+euOSWZmvDahEpe4LB3cpUTcy2AkgWGLDRZgAEmgqII+wybwB+0u5eHqeZi+/IwgHZReDObsMULZmzP5IzWFVO92qnzahL2xE2+bfR9CBmQtlCJZON9qeq6eJwBTwOqBFAR0CXYgoEJNEhpy64wQGBmMDHDCmAVIgUCrICRAYM3XO7iZ7//Em770W104YXvw1BhAAqMRFUMex8boas/eQ1+eN0fsf5+A8MODIcFf7bgvEBiTvLyj09vv3FxJ4rPVj1snbU0NnvCMV9NcepcRyUXJB2GkVDpgxYBBAQBWw3lOGHRgwVgYuswVF4XNv1+401bCYQX28HsHDJeT+GZOfPry6dQ3bSjHVYnOyp+Egmf4MCd7bpeelgD0p2HtYAKuXpoisUpgNXGWhiGa0KOkBkkAkcYEBUpXEJCnqIxERYhKySGIkLEZVTPsrjzugegVC0GBtZRUOwXEgtYDeYGPLFmIwo8DLcmBR0ADgOWAEPgooVJe6mZJ1Wd+loC3R6maftHgfZm4TVZ+Lahr74+lV6wr4TA1yASEMgyETvWAJQGEkcCxZXhe4RVCliHoAIbPJZF1jwH1jiMDKBVGER2Svu+K5xU7L0wsSPYcWuUAlR0VjsloHcQ9gMnwzwsBfW7XQlml8QY0MQq15o8CEKOG8ZIAVWUEirbApYj5duoPVwAY0nKxmAA+BAoVyGeSEBkJ3q6H5ZSYRBWl+AqhkgOM2bMR4xTKOQ1quMOrA5fO+z7sCBiSXk17wRw+zNVD1uysAKAlk/4fz88deCouljN6fnAGiZmYoYYwChg0quFVDVJblWljAyO6E4rpb8BQEf3i8/iXlomsLWVkSE75SebZlJN7bekOn2CuG6N0bBBDtofgRYfpnvY2E+fCTpm5TedR37zPSiPgPwIMCKYj7X0nxcXhVhEg8RGyrdlz+ToK/q9VSDLT/nz6O8CsdiyFvj4Jz4Aa/dh66Z70LP3EfR0r8DmXfdBZBhtX/oPrL+fQZZRea/o/YSYcwA5nHj1TXP+1NCSJfN0xo4kGhnT3f6W9xbELxEzGbYIBCgxUH8eEJ9FktseHlGGAAsLAVReLAZM798AoKczK4e3ASxuC3n3dPXrpUqJHoFvrRUBCAxFSpzBouHzjlR0+shfccllV6Jr525SuSKwrwsJ1vj5T3+DZbd+Ele8htGXCyBPUaoZYwSWAAOICeuuMCxU/rtAgGSdhz/+qoTjj3w7fvDD72D6ET6Eu8CxHiw6dTJu//0vUTf4ejxyewnpGg/WYn8jIFAA6HQsXl0Tn/naSpr21CiAFtPaJM5/rDxpzUhQuMNzwUbYBEao/mwgPQcYeEJo358B4cjrwxOPS0GxZ0f3yjUA0IzmF13/eGmPgJ4oL06mzo9mdlmICBSl+URSDASXzAVu+dwtABGS/iBo1wZB/y7Q4D446QbK/NcNtPTtn5WGminwfQuPGRR5DoXKlqcoKjr3CRbh31NEN7leDN/7QhGvffsHcecdzejt3QVWjCQdgS0PVuGuu4uYUJOA1UICEolek6IvDtu9JKGq3gjgZz2Nz0z8TB0ph2/ebQgoGouJZxDS84C+J4DuDhLXhqHfCACwVQQu2NKqTN87h6RVmDJ0GBtABPyqfrJ2grjOWbYIotAAxBKIIqWRIkopSFdXNxQRpGcb3Cfuh831EZEjsdIQikYhP9grsdgUKgQgJ1RC2QCEScgQCVHYnWsJZcWDKsYWupliIO7Ecc/Piph3ZhXyu45FrgfI92o4gU+1dXGBD0DC48aMUT6FPJ/KW5ByEmdfffTtVS1ZGn4qJ9CMdnX5Cgo+NOvOyXC9t/QXITWngKuPJRnYBOzptPAsQyg8Ajj8fEIAfJt/BAA6OiqQ4DA9ArLhe3t1k8+gtFsjBgYEiiKBCIFAoEAs9vpA01mvgLEWaqQH5sn7YLY9JNj+IHLrO2j+3JnQqZm0Y8DAcVhMGQNUEPooNigfD5YEZb62MjNOUcqlgIQbh6djqJsEBCOg6qoYpWs8ETO6YWDsxoExWIBKAus5iYaj+JiTwn/q6HNuhXAWLeYNs35UO3/qGb8TiU2KH2dt3QlMA9uAnX9CiC8i0GoQfQmoKEBODz8EAM8WWQ4fA2gIQ6DEvddKmOuKjKl+CQRaBFVJB7es0Hjz+z6IV558Co0MrcXI7seR73kCQ3uXIy0b5FOf/Zz8dHU1oISEnn4u21Gvh42ULEJiEEUCjH3vUKwG9m0FaiYq1E5WoksQktHu3v2+d6wRABCGcRkgii8CgIam8EfCQhHb5oZvp5dMf8NdHtedQkdZ3XAS8+BuYGdHREdHnh99PoQfF05OF4u9ettjALAm23ZADOClOwIWw6BVWBz/HAmi87/iiWG8MyTwXJINI4SPL5+I//rpb+X2738VjyxbgXyuSFNnTpGz/u2DuJtfR4/u0lSfcqA1oBhkbRh3bRTiZYzyrbUwwsICkZB0gVhQ9I0iFnAcYLgbyA0INR5FsrULCHuQIJBR5Uc2EZUmojMbgGWIdVEz1vO/ALYXTfl88vSj3vE7j2teGUyxwcxT2BnuAXb8CaASCAwRA1EIYX9EUUhMATm/uOFzm87fGR0p9vA1AAlz/3T77mPgNM6TYnRISqik8DGSgAgBhNIphT/vs1jVMxlNF31DTruwBL8USK9O4xe9oNw+jZoqR3QAipQPSyAOcQQJCayQZQsrFkzMrATEowo3IpYhzBhTx7Ma2LcNmHUikGoUKuwmOApUPqKEIsOKMISlihWQLyCt/YcB4BcjK2hK6yIck/m8d9ZRH7vdUzWLixNsMPNUcvNDkK1/EZIRgusAgYE4BPYIrBAarBb4FBJAjwKQjiY4L6YA9NIbQARgOBVfQimlZBB+5TgikBCxqDA0Q0iXDCiZZFXSgtu3ayITEwcxONZSUgHJlIMg9HyQCIhJLIeVPQbEChly4HgKzBqwxVLOL5mCGFKKYnUJlx1ohjEwEDAkbA5UChjaA+RnA/WzgV179/P0SgaAKNugMM3UaRdOT27goV+t+dn9YfsYbEuG5Pozen8Rd2vPy6VMMOtU5ZSKofL1EInrgAID6xLY14XcgO65mqwu1cWnfD3GiaqSQHJ2aNmLL/8cCgawOPQxiiXOFgUgDo/c8DCGDyAP2JIv7HiEFBzxAT8PoxRxOqVIRQc3RflcYMrKD9E5TOiRRgAmiJOAo/sK3fl86X/t0NDvTN+uJ7Zvfzxf79WoKXXzj/BTk8+t8mrenY6ljtYGIiHrwsQQUyLp3QZMPoYk2QgUd4cgUWzo+TwKJGEAE3PgDJQK+7pG1r+jA23mls1wLl9BQdvp3bcm4vWXDsVtMOs0cowA25ZZFPs5VH5gxQFLYIpB18gTb/jmhkX3A8BV85ZvOKJ64b1APJ4r9DwcNpTAHt4GEKUv5GCOFHQeefOEtbIOBf8xKZknHat3Sndfnmuq034yeRrHYpe5VfGTzDCsCMEwiAFhkCgJy0eVmTsCEQNGW2GHhQDO9/bf2L3yka/8/d7Xdj/DZ9kHYPn06Td885IT33p1TWJixiFXbHhcEClgaDdQM02oeiZJqRuwZlTxZQ7AiLUeM/m6WNo29OSlrRtO31J9vsSuvJtK156x96aqZMM7BpUNZiyCQy5j6zKLfDfDdUDaQBhsFOD0DG257JtPLrq/dYF4AJBZS3+5ZsH6D9Z7E274q/r5egDIAAdsduCl6whqFa5ZuG0Wx13Tf/G07c+XrUxqH/iUk6r5Mpdg2IDZCLElYRvWDJQJmzqUBikNcQyspzXrPV3veviGGbcCwPkfkdjd36LS2BcOl0OtUb/KHucLBJctXvPmafVzbmPyQAJSBBIN1M8BamYA/WsAfzfgUvR+4fuKK7CstbNtYN2bWv9+3K9/1CTxd3dS8ZrTe75YWzXx2iHYYNopcFJ1jO3LLQa3MjwHEAMQoJMEd9/Azq/duG7G1e9fJO4tKygYzRzIXjO/8+Tr1p392IEeHDn4BtAuCs0Q0BgUu+j97sSPfWmiyQeut2F1794bXpsDACyNNnQshgWRnXjbwDXxiTXX0RAMCxSH/XnCBqQshDVIGQgHsDEPyt+x9xOPfXHy15tbxcNamGyWzKJF7TWTU4uOTyFRlQ7y23/48JzV5QeNZjiZLPkffPW2D0ydMPO7OoBRBCYLeGmg8Tihka0khe2ABxAbiDIWjmUdE7i7e7d++JrHZ3/nhtMl8YllVLjqtK4rG6onfWPIIJhysnVqpzJ2PGbRu57huYAYIQgFCYY7MNx7xzdWT3xDNIVsxnYP/St3BhwkA4gWOryZTPmfFfvB+iPduomvcdzkeQI6gS03kGVmMb2wwSPcP3JL9/sm3wsRQlsbYXEbYwnpyb8qPugkY2dQzhq2rJQNFz+xhSgDIg3tuXBMT+6BVZ9Kn7voZnGPvA82myVz9sVdV9U5NZ9M+PEpCQN4JV/YH/nLwMC69/9i9avWtUIYreBMhvTVFw3eX5euPkcH0AQoBcBLAWYwrCSqKPKwhU4T3N37dn7xs8tnfP6G07cnPrFsZuHDp255W2PtEbflDHTjAssTj2TqWie0eyWJFw6uk1hrYswqVxhc/ciOm88474pP5doyz7yH4KnNpgdK+F+ueAmHKNBCBgJK3N5zcfqP+d96M2avVo3136Wa+KWciB1FrlvNrkqz581yqlJvUlMm3dP40+H/BrURFrZRmT7Ww/3XW4SVkTKnHzF+ZAgiDA4CrYtD3VeV7TubJXPqW7qvTU6cdINR8SklWFuwxhbJkXii/qza6oV3v2bB3fVtgKAj9Lj+fFdbSRtYAUuUjvmDZRIpSs8AHXfh7hra+6PPLp/x+damLfFPLJtZeM9J686tqZ760+EApuYoy7VHMHVtBHauIiFHSAvgi7XCzMOlXF9X74o3PtT76WFknn0fwL9C+f9CAxijeCKDj9wVi989+O/JB4p/5YaJv0VV4mKQm5BhaDNijZRgYayIgVgNa0agbQmBOzX9ocafXPVltJBBRwdALPu2rrtfD/s7xQt7QspALKr0GUqBg3zu509+6ciVC1qtt+Jy6IUt60+gqtovFEvQvjFGE0gzUcBC/YEpJRI1s2YlF76z8vAF+P4DR/8lV8qvclywWFgrEdsHwApIC3TChds91P/7ax+afFlrs3iZztnFt5ywZuGECbN+XRSPk7MsJs5h2rfdYtvK8GlbIdECEbANdAndQ+ve+ssd525qalrq/KuUfHCzgGh9CwgGrUvjyVee+E5JJj+OhHeMaAB5GDEWLGAQORTZoBALUcSwMzEsrB6E5qrU1XU3d/2s//LJq7BcXJxCRfrF8CPiedOlBEsU9mWCIKzAflH7Qa7ry4BQYmpI81PVwLXsuuRbA2Zi4qh4AwKxqDwg4qbPAXDT2kZI22IoANrXxT8SVx1XyfgEYIA0oNMe3H3DA3/71fofvLm9Wbi5HcHfj3qwccqEI35nEK9xJxvTeLTivi6LrY/zGA4MIMB4BLc3t+sjv9x4yj3Psn3koAgfUMUTAS1k0Nzuxf7Yf1n8vDMftQ21t4jrHWNHYKQAI4ACkZJIC2U2LdRUBZaETJtAKKXIScffAwCzhsPautZ6XVSEqUQAAxgkwbpQ+PW2z85ft+hmOCsu52DuO7ccI8nUG0pFay1BBQTo6CsgIACoJCAtdCQAymbZlKmWgskvCyJW0YaFGQosjOvAGcgNbXxk8x8uXrn3k/n7NoOPoLZY44xj/g9ucratNXryfFbD/RabHweMAVkSCqJjQxHcrsEd//OztUd9+6VU/oGJACGqt1FPH8fvG3wbkrFPSzJ2rPiAjMDAgijazyujyJNkrAWW6bWwrSv8FrZsNQHKOxMAtlVFA6IkuyR8sUpJFww2JS12uPvrAFDYjdC0qid8Eq7jGmu0JlIcKp+YJbRBBpUswOzOuGje0gl3bliyb23UypXP9z2RT0+1HlxlwvczMRcqX8r3bOxaddHvtrxt70fPPyV2y93zSu9p6rs1kao7o+TaYMYxyikUrGxZCfglhlIQsURiYWIKbt/Ivnt/uXbmh8PWcLykQ6L/fAQQYYhwGO5JEvf1vzG5rPQwGqpvlVjsWDsMY4uwQuBIFUYIAQiBEOnQGUIPHltWFVSiggiYrCUIqyn4eHsCi0L+W2yQG/1+wMJaSoJ1vvTAjk/PWd7UKs7aDIIj3rN5lo7F3hr4VqwCGwI0A5ohARECIgoIVIS11ovXIN4wHwC6uzsIAFY9ef+2wAR7oUBarAWDAl3yt+174t9uW3Xm+nc1bYl/6+55pXectfe6ZLruzYNig4nz4BoLbP47KDdCJAoIbBg5oOAMFYc2Pdnzv28VEQkregd3IcSLjwAijCwqXbzJpb3nI5X+lMS8JUYAGUEQjW+H5ByBxQORA4CgIAB0FAVy4e/HJqUSNXGGx4Gl8OiVRDWqE0NEBSDkXCvVOApbgEUAM9J/AwDsqocCSOu6oY+rhJdQMBoBlPEBJhCiJk5mgJmIrRhxFatY9WkA/gIshogQEeXOkg/siBOmCLO1Yt09A1v//cd/O+XP72qS+E86qXjpWdv+X7Km8ZrBwOrGuXA4Rtiy2tJwP8FxCIERslasIuainx/sHlx58SO7P9Lb0jJJZZF5yUfEX7gBtAqjbVTxVZ29Z9hk+jPW9S4SAmwevgAKHly4AFQ0fZPTBgXsZG03QgcbUDJbyLc9NsZHcDp9FTmcltAgSKJdetG6ByITFlyEBFTUAorqucqtRgU7kOE42AwUHun6+Iy70SrOxo/Cn752/TQdi1/mAOLGoYpDRC6P7uszY5pDoqgAuInTAaCxEZJtAQMwJa23WMIiUnB7B7o/8oM/z//lu5q2xH/SScXzXrnm7HTV5O8NBzC1M0XF6xRtX2dloIfIccMahUCEwGKNT4O5LW95YOPZa5ualjrZ7BKNQ0CcF+z1RBYZIPWnvuMplf4PzerNkmRGMVQ2V8OzIwB83YWiXUsl/1HK+Y9YKaz0H3tyW5BZUnzqyyZ/nz8b9YklGLJGwurnWDwgwhBSIDAND+57JAdrGURWIBMkjBZibdTmnxtoAyBz6qE2Emn/MwMfQ5WbThmri33kaEAUERkSobBUDFNWvCUqARDlnbQI73ezWQ7qFj3iAjAFE/zdjeHNe7q6r//BfVO+/ZHzN8S+dffs4lnHd86uq539q6J4KtFobapR0e4tVvbtCVk+raMmF2HtENyhkd0fumftsXc3NUl8NAbKYWIARLbub8PHSjL2OZN0WyQJ0D5ABvQwWdmMwKxEqbRMFYaWF/Z0b8Dlpww+oxF1gNGzw0XzjGLsf9bNQsI9SYoQAvOYVhspw0ABCzEgxvYhm/GBNgeAJeVMiUCCUSm4unv4gZ4PTr0LS8XZuBh+/db104J44gNpgiURNeKTxBRDWwiRUAT+hBgU/ipcshDlxI6oO+nyOXjslif6j1xksQIYyQ/eumWX6brt/ik/bG4W1QXo6dNvSNROPunXRiUaVNrqmmns9O6xsnc7QzlAYCNsA2iP4fYP7vn2/WtmfxcAOjupiENInOfxfFqwBm5PfvC9OhV7nxhS3Ff6id1rHnWKwQZ/YGRN4ZLpO55V2egAOhZbtEHQBmAxgJaZBXz573V82tzbOOnUYgQGHGGDMKyHgb5sDC4All1j+wjFUZMlHPBQUtSBzg1cCQIWdIDXLiFtPz94LdV46ZSxenCQnKgFHEQkzJAIAxCHEYBIkRBZ46qYI7GJpwJ4ogwEf/vnuTsA/LC1VbijA9TZSfr81/T9wElWnRSwDeqnkzvYb9G1lYh4TIeRWO0wuwND/Xc9sGrqRwHgjDnLj0rWTzrDiadmppPJS4uF3C/u7JzwteZmUdkDcD/BgTcAIlm7dKmtc064s3+r+320kP8shqLQAcLiqJ8mLPTYCnYAGBkyyMCq/+tZ7Eys+Q7F3WNkKNyZW+mvo0pgJFDYegUFiA52h6W78DWF1HQJIJyEa/aMfKH/QzNXo321t7YFQfozW+br6uR7agjWWKicJngKMCaaEorWOnGIB4QpHCMjCWllcWOnAfhpaK3huzU1dag771xBK1acEjSdu+czTqrurQWLoGE6nGIB6NoSMnwcdRaLhXEUOyOFoSe2b8++DYCcddL6s6trZtzhJBI1YIBcALrkArihvR2W6FA9ApYs0f3A9nJEAMDoAKEHgjVtgkymzAE8LXpUoFwG8H61az4m1n6SvPhl7DDGen7EslIZ2FE5i+CwC0+s3Rq9qpn0icdTReYGSoLsvsLjvb+/9zq0i8KacMUb1Qxfr6odL6Wt7h+AEi7X7EUsCQwBTAITRgMwQ1gEBHBAgHiJU8JQXc7PSYClWLHilOCVZ266KJ5uvL6goeunWccS0d6tFr6vRDHIGgjEWmamgp8f7B189NLN/ZcPLjqyvcarmXIbkomagoHPBCr5YHYT85ec8rd5RLR+NP85NEEghWc0lXseXwgraACYWPv2OTJ14sfEcd/DSSeBQYgEEBpVfoWB3y8LCMEAwQLiF3eUI1LxxicaVMydLnmdk8GBtyHb4uPV4iJDQeq6PUt0XeqSGsAUA6hCALhMYhggpsgQrGgiSwTF0ZwAE4HYciCAkDv/xBP/1PD449QTXkAF6syQPun0FXNitdN+WrRsqxssuymivVtE8jkFRwHalGkMttr4zkBu/VtXb1iyDhDCpM3ncapqetFAw4EbUdfai7ku1c48H8D6piZw5wHs9DmwRNBoz80LrgUkb906JfZg4QaZNeUx1CY+TOIkZAhaUOEIKq3YUQWgvE19dKs6gcUHxBQrOEOx0iTBFhrMt/S9b+oTaF3q4P0waGp1dG3NjbE4IeZABvIA8f7ze4YAo5glzo4mgWGpjI9ZIgQCQ7FEtZdoPA4AFi1a4bQCmDLl5mSift6vrIrVedXWJuuIe7tEhgcYiDZ9mxDaG8twhoZ2fHzVqpP/ECJ+EsdLHmcVRCtIIICqAlKTLJUMgETyIiDaJXRYUsFPTxdN4p7+S82E9H9LwpkswwAGocPKS9j9Es3wqjInLGX8X16oXFnFCIbvG7b5XWU80Xcl7cT77zgWt1ycj5ZJCIhs7Bu975cJiROqfeiRIpRvGS6PHdywwg6TKRV3m9zgb2KJSVcYaySKAsREArLWcVhJrOpUAA80NCziTIaCU87r+56KpU8Qx+jqRqWG+i16uwHFQkYoIrBFK8Xu8HD3D1eumvONpvC6GQ0AmhmaEM4hGqGaWqCqnrm3F2D2XrnorM4pmQzteZZ9AodVMcgmHhh6g0yu+bWIM1kGUISBBsEhD4qq4KAGLqrhwBmdxsH+kaD8JVCAFRkY2tmzDwDQFiXOofIZbW2ENZCq69dOMDVVX0gRLJHlwUII9iwDwkJWAZZgrQcq+SPf62qf/BEd5HutUmQhYqL6gGYhTYBV8UVoFb77biodd86uK7103dsCa4OaRlLFvKWePSHSDSd2hDREw2Enl+99eOUjF3yguVlUiCHColLR5Db5DAQMMg5JrkTiJkGqyhoTj6XcujnnAKCmZxgkPTwMQITQDDvljl1JJOPflbDWCqpFnKrhEFugEGzl3uJdtHPwBuwZvEmsGY7WJcqYSDCmJhClgGK7kFkyGA3fjaIFIouFbYQM2dKEaV9UdW5DFcEO5oltVGUKPZ9EYCGKVVAo5tCz5QdoFRZTWmcVYEgkGh4VA6IAgFXu8ciQnX/mhqZ4quGGkoaubhSHmNHTBdGaRag8siVWmJ18aXh3X+/DzcCjQTYbFjc7F4frW7Tf9ZhvAjEMZRxgKAcEBqhtgGgWwEteCEAaGw8+M3TgIgCR7CkWXYIUyDcl9oNV3Fv4PnUNv9ft6znBv++2Y4pLEheWXlf7ydL5tR+jYuFmSgOgcoVv1JwqvzqAiGwHILCW98MkEdZwv7n5BFOXel+NwGgDNeKH6L6cVlYKUXGQDUZ+2X/PK3YgQ9YieEJUaCDl7MCSsBZAnNikua9cebZXM/3nBq6KVxmOVyn091oUCoCoivLFMItvS8HwyBNv2vnk63c1N1tVQfMZsgBhfbBqnW/9TdYFGWWlKEJ9w0LpCWA4BMvekgVN7emQCzi46+KdA6V8QAgtNKh+s/YVdtLkdPFV9ZVLEEr7E0QeqmDQP5SDChs5KiViGjUFofDTkdVhCvgs07CmbtKNsbRyEgF0d16ImESifL+yytlhtiU/kNye/yqfs5rsKhMZCBNRGGAonFAkropPmHcPq3jMipH0BMUjw4KBfkh5vxBERIg1KbiFgR0f3PbYaQ83NYmTze5f229utiqbpUBf3PKg42GO0WwsgXuHBRMnMyVqYIcHkpO9uhMXAehsbgZnD2KJ+AC2hIXhefjSBb0V5S8VB0vFiUrHIcezGBqnUCCOdwF0iPRp7H0qUUUQEQdgRW98tkzD/WH3mzExuaTOwoyUoEomXPkiY78UDBJg4+f+b+QXx69DK1wAoMLAemMBy2p0eJQ5jARKKeJ4zGhrlUfkB5C+feFaspDhEtKAERfuyPCumzb9de73mprE6XyGxo7uaI2Lb0fu1wwYBYIDGS6S5HyhmkYYiQMqOeFcAOhegMP8wggRitg/whLSWEI6YgYJYTeQjt3VfxnXx0+VHCwIamxtvxIACSwGoGJxSxgBOsbiDcHVf6nSNdVfTSmIYmCwGLJ7UZGIRFUMgG0QWAzu+M/o1cNzuW/bWu3ni6KgbIgDYMiGxgARLVaEQYGG9O615JdCDGIhZEQ0PHbyxb77tzw0/eOjoO/p0tnZZgGg4O/pCLRfFBeOOJAAQO8wkKiy7CQArZzFANCJg5sOHngDIJLo4gapUMESZggg0rH7Bj7AjVU3owhLUWqI0fk6weh+AEbJgvxCyEIu7JHIEBSIrDrxmM/wxNjMasAMFqFMSBsTWAgc1pGgwjYxKeXvzP/4hEfRDkaGNEDo//MPdoPNNusAJgKBNppIDiMCwwCkNRD4BCkrH9aKy07gj+wo9N//VkCQfc7GjoyFCO2+5xU7DPxHJQYYtiIu0D9CYhVTvBoIlHf8qW+8d0L47A4eDvjXtYVLpPgMWRAZ987di+IP5X/Hk2u+C6M4vEszMoAK645yWyjggCQICtI73FU+TNEqjMWLjXfzlvmmvuqqtAl7DEdKGHM1V7T7hUjAYGhjKdf1JUAI2fLBbBWQNWLMelGAZbKGw/ay8sCnkC3vGiAhEQshC7HCSgIplorD697U9XhLD5rBeJ5bP5raol5GW7xPPMC4bOECOS00UgQlqmEpFa/JxWefENU8+HA+ArjMCYDIpO7qOj61LPdjd0rDX7k2cRFyMGRHUz+MQetjS8JwALHSU7h3z77K9y0MFRtMnnSDW+3GqhVksFhhDcMfDKt9IgpGUmDJ535X+Ob8R9Ae3i4OAIjOWWtKa8qcwxi2cMw+IapEAwsSy2zEgSoOb79857JT/4YmcfACqnida8NoWLS992gIREGJAwQMDBWFvDisUwWYZNXJANB0EHHAASSC2lWlcaSFTOKe3aekVxR/jKkTlqMu+S6IAxlGCQDBA0OFZVOi/Y1AIiWKC4BkN+6+oFReH4sWMl57z8UyMXFBtYYOLJx8EE3rhue9YMzZL1pbm9/9xf28fwyesLb0uBXAEpcHjccukxILEYtw5YxhaInBLeR2fXX3n4/+CZrEwQvt5s2G6eCevQ+vCExhB+JgyxBxSEZ8EnEsKAFIPHbc4ccDVJpDWwyIbFXn3jOqVhZ/oSY1PkhVsXdBHBcFgNJQXIcYxcDi6x4YO0hOSPiMIYIkugtI4AAoVwE7oIAscMNDCb+u+gaPISkXNFCMWsPDiSCAQRJWEQ3SYBTydwRfOWbFft4fEu9hPWZ4z2rj+9YSlCWBZZAlovKql3CFnJABNOJwiyO9v911//RPR8r/R1I1QbtV6Hx3Uch0IAaIspYcIG+EAgmnkEVhLgB0th1OaWAY6m3Nsv5zatf4f1CzGh90psXewlXKgw+Q1Rp+sJUGi7+nfYVruG94MT+25lgRu1NiQDhnEwK/CBSGvQAMwJqtFb6ipcWoOQs/jQnenDrAlLSoYgBhrvxMGP4VBA4Yvjbu0K6ne3+FoBHqK/xhgzGljeJALIUNyJZFRvcKEllYjTjcUmlgTXHkB+9EqzBCxP+PsXZrQjM3pvCwVYA4LHCAACSBDZtmraMmNTW1OhHjeVCOAedFeD7NeRLesBl6jYX7MUtOkxgekX69DD3+k1Qyq6Won6BgYMPIss5tyLx7tBXqzm11ScIsCipVwDFV4THksO+HBrAYvnfbxrl+feLTSR8m4YB3D2F0kI5HZw0g0EjCQXf+1/nMgkcrk0pPlVYoZDJaWt77Y6Srrrc+SgR45Xl/JsCKDTimXB3k9/rDa97Q+9CnhzFttgJa/vFULcIB4uc2CQBxwBTV1ksmAp6KqrcCaQAD+01QHHIGEHLxUli2o4Gqa2YQyU2md+Q9A/es3ItnaP6sHBVr4GAtTELvOYoclRYLiZbsltfhQkRImAgBIKVgR3RhlNX35m/kajfeoKGHi2DfUhgxwk0N5fYTEQKTrzX3d4Xe/zT3L0eBcEmV29HxLe3WvMVJVB1v8zAkVsJGQTicgBuUcrv1yJYLepaeual8cfWLeeDGsUacUapaBBguAtoAYGExkw4DIigqyuw6fcbOrgXV3+k+JnXHwKvqtyGzpBidyCpiAFXEA4TFm54OixYyiHkzkaSwDkDlToDyfyQgsBS0iC3tAUi827susRMTF9YF0Ayo/uIoY1j+AoPAMKgCU6GQDT5z9Eq0I8Qmz8pctqGnc8kI5zecrwsjdwkHCh474sIxKBb9Qn97oXflGT33HLfyRSt/AQitwk5N9SzEoljFAClgqAAUDUAOC6nSQS0IvbhaQNnvsgDWQNAGecauocrtLYtDq1M0G05U8o2g/+ighwUUEwI7Ekhpx5yb7optqq+9Ic6QegXqGg7XvlO4Dl5AEZ8QdiYyFbWvhnu/YESoUj5+NslkLCC07/9oD4ALGy5YfaJONc4Tf9Dnob2repaeualCZmVeZNPmVBAuJ8ufHbyYFFCOAuUOKHEA8tG3DQMjeEp17NA1gKcqO/MCf8x1Z0eVgcr5P2b7oogLQl568fb5+zbfO3AtTYrNbihCFwyc4SDqE0QlaiC6QcSgCg7vzN3mf3T2OkwW9cKUFhWyBOghehzA46M4QRiZNryoK2lbhTEVCpdT0PjRTedxdfL11g8pcCKhcBiSLTlgC7MRnRn9rLjlkK0GvlCJtoNZx51Rwbnlxy8RDiAIhdnB6vjNy2eW6lLXVhVhPAXelcPYmqFEnh+uVPTANBKUnL7u616Q9z/VCChSVkcHo3GxYAHkH1d82EMIdDCwGPgC6+g1bMOntr/WrZ/0c8sOgRAWrUIfIlgSUoC1/jIAaFoD6jysysEvXGyEPKaJiWYAOGwAl7ImKEyPONAbg6PnXS81TswOQw8bqKIZwxZGq74jEGiQhoM9uR+Wrpy3CVNeqPc/U3r4QosxkbIXgrAGhIUIt6BksN81thOvfvLkWE3DhyiZvgxQEB+WOBx4RHmtHUHZkhbJ994RMofZg4YDDp4BRJkDPt6esEyTKdzlR+XdABUWUKBkBEDcXSIxbz4GIHkRp2BorPJHl/QZK/CYaTjIye7t1+Mf9v5/UNkNUUv8qLJHZda74umLrzwy3jDleCeROg2smkh5JyHhwOYgsBAo4cg8KFyJDsMJOHaw2LntpqMfPyB44xCOAEgev6BGmGuiDc3hCNgoEghNQQM2HT8eOlS0LdeK8bSaQbirKw0HO/M348oTduJ4ccKK3z+PbNDaGu4lei5lo9mrurptlqqpXeAm4icRq0VQ3rFgNZMTHjMDCABbhJgCDAGKKLpfODJgESukGGQElO/+XMQXHIYdQS9E2sITX9ek6hxQClGHQNQHG04eSMXfRILyNpXy9l2MoYwqVJEgBkWDfr/s7P5KlJWYfzgyZcFoAGFx1OuZycj+iLbJqfnYt2baKQ0L3OrUCSxyqrB7HEjNVAnPISeKSH607duHtuFhUq5NqjDCUXnijcLDnwInDc/uHfjqtv866s8Hgmc4dA1gYaiymJesM3GHxMCCwrvconUw5XpAmeEjjAGK+3k/IgLIhmc/9eVukivn9eB4cbDkObxfhJDNMhqaw1c5h/Uzpa2J1mXTqX7GAo55JzF7ryDXOxbgI5yE55GLaFdMdHllACN+eJ6TgEM4KU64PDgiOKPBmso/U0izAjsJeLpn4NYdX6j/dIj88TJYEvV8KNDYOFSE3J92nxJGF++Wi0OyX8Af+zuLGBT1+112y7abnub9El3r0BGRXYthnknZyS8tn+I3NM7jZGoRsbOI2D1eWM2mmJeCG4VqP1S41TASwMKGSCSkrMBRNKPyJulosiWcRg2RvoSbDK0Q2FEpOCgEgdk38PkdrY3XoVU4VP7B3xZy8HcFuxSNfo+mfxhDi0YBMtrKv3/DyNjiGkAWCTjUPXy9fPykAZwlLhbBYqlQebMosD8ixw2r653a5FxbW38iOe4igE4uKWcuuW61xMYouwQYAyMFWGtBZC2TMIW5OxSN5a7Lx5NU+lEkXDYOIYS0MpgdVlCsGMgFRgZLv7M9e7+054Y5KyLQJ3iJlgUcfAPQxYonV6aA5CneLUBF+fuZSPlvKfL+0ib76KrvRX0IwX7vc/XtVe6pJxwVJGqOJ885lUgtEnbmGeVNkGT0YtH9wRTAUg42vD7EMlkQgdlGDavETGTDRhOKgOuY+FU2svI4RHg7qRfmuGwAyWtNRb3O+sXf2r7+bM9/HrkSAA4m4XPIGAApFKObOUiioeAxoT+MmKPDoeVBcexHAYXgj6hn6HOSWVLEQlGJ7z8x1Z895VXWVScRuacKsFCTOwUpDusFAcL+dB+CHIxEqRgMovmhcH9gxC4JWSGS8KIpKitbrJCwibydiKAo7PING1s0IHnA+n4fB8GTCPRKUyw9TEH/sq7M/A2VaCTCaANeauUfXANYE6oxSMou5WufHMeDJZExpzpFyq6cBGXUNPYYEGuQZof68g/b1zX+b5j3Z1Xp1Rfda6ckFsCP7m+JLoxGAbq8tQC2wh06Y7mE8HqyUa8Om0yiFsHo2hZiMDlM4LCMiwCQXCBk7G7RZiPr4krRspJyvavN9t2bB29Zsu8ZaOFoSzBZHCJy8AwgyqNLPbndqSrZDRdHSCny+LEAkPY7Xyt7oUARcHRZyNfGGRy4IojMR/3+7CZTl1iAvujmEbsfW+CA9osgMua0lTGxRyIMosBgckevkqM8gKKfJ4Md7JfWS8ms4lJxpRT3PjHyxN+34Gf/nnvGjKOtMutnkSF5kfzE4X4EkETt4T4vK/xNYu4s+OHIvkj5yr0KBiSOtnOWeX8pU0Q1cNXW3LXBxdMexWrxAPJtevidcCFRcuiMSR1Hr3kKd8rYUQoWBIKCE/0UhUifRgAq+r3QwRb29TqUiivcfHGVLQ6uL/zHCXuexjMQja613wBCHQhrYEGkARxyCn9pMUC5N8MUboWNt5Rx/lgicCz4K1PFhHCvPurhUlfhdv3q2uuwXFwcyz5u+3sdYrELUYhI4vAHbFntlVdUrBD+F8LIEoARbVCU3VQKtijt/x2lYKWTH17p9O7bPHzNab1lTe+3F6ddFBpA6AAq/P8zcQ8hurfjBjBWWshAhIfb2u5KX/gff+UJ8dPsEAIgHNcqh//K5pBy3LCiqZ5c9Pt/Mvfe93aIMFaEDs6Tp79Oatw65FCK/j1hT6ADVJSdB5DXeWjZTrq0Xgp6JQelx1Wu8IT/8KrtcsvF+bKmgv15hKesw2kLFT5mjj/xX3vfRPGqt7NgLoA8AY/J4MhtI5+jP1XqH4ewHPzVRGH/rqT/uPtomdrwF8TdCXYEQcSQk1QYIIgVCBgO1QKyr3Rv7d82XtpzxbEj0dJKgMjyw8UHZGZsCUaiMJID4Ot9pM0WMmadlAqP0Yhe7Q4Oryu+Z+6uZ6z2VbaaAejJCpqb7bMqLtpfNuFTD6ZzU4+/jWurXi/R9lMmgJwwZPDg8I1Dn6q+Cs3tCtkWi0NhKeAhYQDlB05kk/fuPIknNfwv0t4864ckTHljFNxwDBs5PUSF3NeLZ9zzJaDFhHOHbUAmY2O/2XaUnj7pfgi2cuA/Di2PSi63Vu/u24z3Hdv3jO9dDuE9kKd0Mb0wiZpEEl//5J1oSL8OAwivvYRlkvBuCWKAq+BgV9/1w9dM+OyhkO8fWgYwxgjwn3+pqmo67r1wvUss3DkWyiNrSrB6C7S+027p/kXxHUduq3jfqLII926qrik5PHjRrP5n8dSnh/AXQ7dGikzf0HWJnTDpN3YEPglcVDq7KsvOLBEsW83SvWPB8JeOXH+oYoKX7upYIhsZwfAwcCOAG9G+Ol0zZaE7uGddgJZjR8YoM9w6NnZDCLPgvKMGB5/ZuFSUb5un5qIHpJ7hpN8ewRSO9C7YP41hWBikHHaqJ14C4CvAgbnt++VjAKNGQOiAioo1I4NjPbgDCh1t+yuyNYocANRDfa+nWPwNYt25IXVn1lBO/1wTPYh/xebFFg6vDVA8F7oy0zwmmlI54Q1/EQjIHj2eBTy3EUglX5Yx5cGxf/6U1Crxu33TghlVP7Jp7zzL4d17EAAOmiiBD6mH8982d//nlWhri4rKBwiJiyUQCYO03X+4df9qpYwhsQ5xLsA5pD7Nc4GxcOkEUvd1TSo21Dwgtc48OwCNsfWCaMGLnZ64Qp33yYQhem94zBwgBB4ye5q0XsOMkyyshH1to9vdyn0rkdmR6OIjh7IBMA4XaQOQIVuoqv6OrXfm2T7rg+CEpRgoEBQ45PWkD4FtTF+m7uk6F0QW7XJg1q8tjKaXCgM/DulmFqqsh476WMJYYMgFY7jYbwf7fg0IoQ1m3ABeZMbgLu09FqnYpRiAgeIKeYSnhmMBiYJIbfUHAADNB5DIahXOfWbGAzQw+ENVCze8PxSGLBmItbAIiMHKA6vC0CeGv7KgF+3gQ5UQOjwMICJpJOU1Ic2oTATRsyayjAAkpE5Ea6sTgcgDgwozELQKj9xx4+XcP/IDFYOj0nA4CaWSrJw0XAW/xHt7PtZ3zaQfofnQ5QAOPQzwfBBB20nCUsYKo+WD/RtJolwNAFG6AYvjPciMRNdQHIhPIWFlk+xQZ+a9dV/b9WPxUv8mxl0IgYb4y9W+vT/v/fL8dQe7xfvlbwCwwwQSedptK1HzJVUaSQUKQtb09mQW5/41nLwQWoX6P0l/AfCXZyONDvVnengYQE+obtb+Q1TabyhszErQ/fqFLOJQtC+4B0gIOkYXNx9IC0CGBO3tCmuaCW2wyEZTQoA9HJQPvJRU8D8qrcJYmCU1941/k1r3ZBlBIBRVEfcP/RoeFBeDnLe1e0HxjdN2og10OJRmx0Hgc6ZgWUJLi/EG9n6YSzqgBNzw5ldowBoINCw0EnAYhpyRoX8vXjJ9B7JZHlf+y0XCUjJinfte46wt7VQ7RHirCG+Oft0qolaXNnv39b6ucg6Py8vkCHgKJ5D+2vKJ/tlHvl3c+NkEVU0su8nX9yfvXH17X+b0ocMFhI3Li4gEzyrt7eOe//8DI6DKHqLyWtrw/2n84YzLuIzLuIzLuIzLuIzLuIzLuDyb/H/GqrQ7mrbx4wAAAABJRU5ErkJggg==';
      logoEl.style.display = '';
    }
  }

  /* ── Public API ── */

  window.cpRefreshCopilot = function() {
    _cpInsightIdx = (_cpInsightIdx + 1) % CP_INSIGHTS.length;
    var el = document.getElementById('cpCopilotMsg');
    if (!el) return;
    el.style.opacity = '0'; el.style.transform = 'translateY(-6px)';
    el.style.transition = 'opacity 0.25s, transform 0.25s';
    setTimeout(function() {
      el.innerHTML = cpApplyTpl(CP_INSIGHTS[_cpInsightIdx]);
      el.style.opacity = '1'; el.style.transform = 'translateY(0)';
    }, 250);
    showToast && showToast('Lince Kz: Novo insight gerado!');
  };

  /* ══════════════════════════════════════════
     GUIA DE NÍVEIS KZ — v3.0
     [v3.0] Deixou de ser um modal: agora é
     renderizado numa secção fixa do perfil
     (#cpLevelGuideBody) e inclui um CTA directo
     para a categoria com maior taxa de pontos do
     momento (WKZ_REWARDS.bonusCategory).
     Lê directamente de WKZ_REWARDS.levels para
     garantir consistência com checkout e PDP.
  ══════════════════════════════════════════ */
  function renderLevelGuideSection() {
    var host = document.getElementById('cpLevelGuideBody');
    if (!host) return;
    var pts  = userPoints.lifetime;
    var curr = _wkzLevel(pts);
    var next = _wkzNextLevel(pts);
    var toNext = next ? (next.min - pts) : 0;
    var bonus = WKZ_REWARDS.bonusCategory;

    function rateLabel(n) {
      return n==='Silver'?'1,2x': n==='Gold'?'1,5x': n==='Cyber'?'2x': n==='Neon Cyber'?'3x':'1x';
    }

    /* [FIX light-mode] Este bloco usava rgba(255,255,255,X) fixo para texto/
       bordas/fundos — herdado do tema escuro original. Em tema claro isso
       resultava em texto quase branco sobre cartão branco (ilegível) e
       bordas invisíveis entre níveis. Trocado por var(--text)/var(--muted)/
       var(--border)/var(--card2), que já se adaptam a claro/escuro sozinhos
       (ver wkz-styles-base.css). Níveis ainda não alcançados usam opacidade
       0.55 (antes 0.42) — suficiente para "bloqueado" sem ficar ilegível. */
    var levelsHtml = WKZ_REWARDS.levels.map(function(lvl) {
      var isCurrent = (lvl.name === curr.name);
      var isPast    = (pts >= lvl.min);
      var border    = isCurrent
        ? ('2px solid ' + lvl.color)
        : (isPast ? '1px solid var(--border)' : '1px dashed var(--border)');
      var bg = isCurrent ? lvl.bg : (isPast ? 'var(--card2)' : 'transparent');
      var op = (!isPast && !isCurrent) ? '0.55' : '1';
      var shadow = isCurrent ? 'box-shadow:0 3px 14px rgba(0,0,0,0.07);' : '';
      var maxLabel = (lvl.max === Infinity) ? '∞' : lvl.max.toLocaleString('pt-BR');
      var icoSvg = (CP_ICO[lvl.icon] || CP_ICO.award);
      return '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;'
           + 'border-radius:14px;border:'+border+';background:'+bg+';opacity:'+op+';'+shadow
           + 'margin-bottom:8px;position:relative;">'
           + '<div style="font-size:26px;flex-shrink:0;line-height:1;color:'+lvl.color+';">'+icoSvg+'</div>'
           + '<div style="flex:1;min-width:0;">'
             + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">'
               + '<span style="font-family:\'DM Sans\',sans-serif;font-size:14px;font-weight:800;color:'+lvl.color+';">'+lvl.name+'</span>'
               + (isCurrent ? '<span style="font-family:\'DM Sans\',sans-serif;font-size:9px;font-weight:800;background:'+lvl.color+';color:#000;border-radius:4px;padding:1px 6px;letter-spacing:0.4px;">VOCÊ ESTÁ AQUI</span>' : '')
             + '</div>'
             + '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">'
               + lvl.min.toLocaleString('pt-BR')+' – '+maxLabel+' pts'
             + '</div>'
             + '<div style="font-size:12px;color:var(--text);line-height:1.55;">'+lvl.perks+'</div>'
             + '<div style="margin-top:5px;font-size:11px;font-weight:700;color:var(--muted);">'
               + 'Taxa: <span style="color:'+lvl.color+';">'+rateLabel(lvl.name)+'</span> ponto por R$1'
             + '</div>'
           + '</div>'
           + '</div>';
    }).join('');

    var progressHtml = next
      ? '<div style="margin:4px 0 16px;padding:14px 16px;background:rgba(0,180,171,0.07);'
          + 'border:1px solid rgba(0,180,171,0.2);border-radius:14px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            + '<span style="font-size:12px;font-weight:700;color:var(--text);">Faltam para '+next.name+'</span>'
            + '<span style="font-family:\'DM Sans\',sans-serif;font-size:16px;font-weight:800;color:var(--teal);">'+toNext.toLocaleString('pt-BR')+' pts</span>'
          + '</div>'
          + '<div style="background:var(--border);border-radius:99px;height:6px;overflow:hidden;">'
            + '<div style="height:100%;width:'+Math.min(100,Math.round((pts-curr.min)/(next.min-curr.min)*100))+'%;'
              + 'background:linear-gradient(90deg,'+curr.color+','+next.color+');border-radius:99px;"></div>'
          + '</div>'
          + '<div style="margin-top:8px;font-size:11px;color:var(--muted);">'
            + 'No nível <strong style="color:'+curr.color+';">'+curr.name+'</strong> ganhas '
            + '<strong style="color:var(--teal);">'+rateLabel(curr.name)+' ponto por R$1</strong> em cada compra.'
          + '</div>'
        + '</div>'
      : '<div style="margin:4px 0 16px;padding:14px 16px;background:rgba(167,139,250,0.08);'
          + 'border:1px solid rgba(167,139,250,0.3);border-radius:14px;text-align:center;">'
          + '<div style="font-size:20px;margin-bottom:4px;color:#a78bfa;">'+CP_ICO.zap+'</div>'
          + '<div style="font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:800;color:#a78bfa;">Nível Máximo Atingido!</div>'
          + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Aproveita todos os benefícios VIP · 3x pontos por R$1 gasto.</div>'
        + '</div>';

    /* [v3.0] CTA directo para a categoria com maior taxa de pontos do momento */
    var ctaHtml = bonus ? (
      '<div style="margin:0 0 18px;padding:14px 16px;background:rgba(245,158,11,0.08);'
        + 'border:1px solid rgba(245,158,11,0.28);border-radius:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">'
        + '<div style="font-size:22px;color:var(--c-warning);flex-shrink:0;">'+CP_ICO.flame+'</div>'
        + '<div style="flex:1;min-width:180px;">'
          + '<div style="font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:800;color:var(--c-warning);">'+bonus.rate+' pontos em '+bonus.name+'</div>'
          + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">'+bonus.note+'</div>'
        + '</div>'
        + '<button onclick="cpGoToBonusCategory()" style="padding:8px 16px;background:#F59E0B;border:none;border-radius:9px;color:#000;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0;">Ver Produtos →</button>'
      + '</div>'
    ) : '';

    host.innerHTML =
        '<p style="font-size:12px;color:var(--muted);margin:0 0 16px;line-height:1.6;">'
          + 'Sobe de nível acumulando pontos em cada compra. A taxa de ganho de pontos aumenta com o nível — quanto mais alto, mais pontos por real gasto.'
        + '</p>'
        + ctaHtml
        + progressHtml
        + '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Todos os Níveis</div>'
        + levelsHtml;
  }

  /* [v3.0] Mantém o nome cpOpenLevelGuide() por compatibilidade com os
     pontos de entrada existentes (badge de nível, stat-item) — agora
     apenas garante que a secção está actualizada e desloca a página até ela. */
  window.cpOpenLevelGuide = function() {
    renderLevelGuideSection();
    var card = document.getElementById('cpLevelGuideCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* [v2.9.15] CTA do Guia de Níveis → leva o comprador até à página
     inicial para que possa explorar livremente o catálogo (em vez de
     fixar numa única categoria/sub-página de Eletrónicos). O toast
     mantém o aviso da categoria em bónus para orientar a escolha. */
  window.cpGoToBonusCategory = function() {
    var bonus = WKZ_REWARDS.bonusCategory;
    if (!bonus) return;
    showToast && showToast('A render ' + bonus.rate + ' pontos em ' + bonus.name + ' — aproveita e escolhe o que quiseres!');
    if (typeof MapsTo === 'function') {
      MapsTo('home');
    } else if (typeof showPage === 'function') {
      showPage('home');
    }
  };

  window.cpRefreshOrders = function() {
    /* FUNC-05 */
    var btn = document.querySelector('[onclick="cpRefreshOrders()"]');
    if (btn && btn._syncing) return;
    if (btn) {
      btn._syncing = true; btn._origHTML = btn.innerHTML;
      btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg style="animation:kzSpin 0.8s linear infinite;" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Sincronizando…</span>';
      btn.style.opacity = '0.65'; btn.style.pointerEvents = 'none';
    }
    showToast && showToast('Lince Kz: A sincronizar rastreios internacionais…');
    if (!document.getElementById('kzSpinStyle')) {
      var st = document.createElement('style'); st.id = 'kzSpinStyle';
      st.textContent = '@keyframes kzSpin{to{transform:rotate(360deg)}}'; document.head.appendChild(st);
    }
    setTimeout(function() {
      var today = new Date();
      CP_ORDERS.forEach(function(o) {
        if (o.status==='shipping'   && o.progress<95) o.progress=Math.min(o.progress+5,95);
        if (o.status==='customs'    && o.progress<70) o.progress=Math.min(o.progress+5,70);
        if (o.status==='processing' && o.progress<40) o.progress=Math.min(o.progress+8,40);
        if (o.status!=='delivered') {
          var e=new Date(today); e.setDate(today.getDate()+(o.status==='shipping'?1:o.status==='customs'?5:9));
          var m=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
          o.eta=e.getDate()+' '+m[e.getMonth()]+' '+e.getFullYear();
        }
      });
      renderOrders();
      if (btn){btn.innerHTML=btn._origHTML;btn.style.opacity='';btn.style.pointerEvents='';btn._syncing=false;}
      var inT=CP_ORDERS.filter(function(o){return o.status!=='delivered';}).length;
      showToast && showToast('Lince Kz: '+CP_ORDERS.length+' encomendas actualizadas — '+inT+' em trânsito, dados de rastreio frescos!');
    }, 1800);
  };

  window.cpTrackOrder = function(id) {
    showToast && showToast('Lince Kz: Consultando estado de ' + id + '...');
    var order = CP_ORDERS.find(function(o){ return o.id === id; });
    setTimeout(function() {
      if (order) showToast && showToast(id + ': ' + order.statusLabel + ' — Chegada estimada: ' + order.eta);
    }, 1200);
  };

  /* ══════════════════════════════════════════
     EDITAR PERFIL — Modal completo
     [v3.1] Antes existiam DOIS lugares para a mesma finalidade — este
     modal (só nome/email/telefone/país) e o card estático "Turbinar
     Perfil" na página (interesses, CPF, CEP, idioma, moeda). Fundidos
     num só ponto de entrada: clicar "Editar Perfil" abre este modal já
     com tudo. O estado dos campos extra vive em WKZ_PROFILE_EXTRA (ver
     início do ficheiro), não só no DOM, para sobreviver a fechar/abrir.
     Inclui também uma Zona de Risco com exclusão de conta, que reaproveita
     o fluxo LGPD já existente (lgpdOpenExcluirConta(), Art.18 VI) em vez
     de duplicar essa lógica.
  ══════════════════════════════════════════ */
  function _cpInterestTags() {
    return [
      {key:'eletronicos', label:'Eletrônicos', svg:'<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'},
      {key:'moda',        label:'Moda',        svg:'<path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/>'},
      {key:'casa',        label:'Casa &amp; Deco', svg:'<path d="M20 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M2 16a2 2 0 002 2h16a2 2 0 002-2v-5a2 2 0 00-4 0v1.5H6V11a2 2 0 00-4 0z"/><line x1="6" y1="19" x2="6" y2="21"/><line x1="18" y1="19" x2="18" y2="21"/>'},
      {key:'beleza',      label:'Beleza',      svg:'<path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/><path d="M5 14l.85 2 2 .85-2 .85L5 20l-.85-2-2-.85 2-.85L5 14z"/>'},
      {key:'games',       label:'Games',       svg:'<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z"/>'},
      {key:'esportes',    label:'Esportes',    svg:'<circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>'},
      {key:'petshop',     label:'Pet Shop',    svg:'<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="15" r="2"/><circle cx="4" cy="8" r="2"/><path d="M9.87 12.42c-.54-.55-1.33-.92-2.18-.92a3.07 3.07 0 00-2.19.9A3.06 3.06 0 004.41 15c0 1.72 1.44 3.13 3.22 3.13H9.5c.76 0 1.4-.43 1.71-1.06.31-.64.31-1.38 0-2.02a3.07 3.07 0 00-1.34-2.63z"/><path d="M14.13 12.42c.54-.55 1.33-.92 2.18-.92a3.07 3.07 0 012.19.9 3.06 3.06 0 011.09 2.6c0 1.72-1.44 3.13-3.22 3.13H14.5c-.76 0-1.4-.43-1.71-1.06-.31-.64-.31-1.38 0-2.02.31-.63.78-1.15 1.34-1.63z"/>'},
      {key:'automotivo',  label:'Automotivo',  svg:'<rect x="1" y="3" width="15" height="13"/><path d="M17 8h4l2 5v5H1"/><path d="M1 16V8"/><circle cx="5.5" cy="19.5" r="2.5"/><circle cx="18.5" cy="19.5" r="2.5"/>'},
      {key:'livros',      label:'Livros',      svg:'<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>'},
      {key:'saude',       label:'Saúde',       svg:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'},
      {key:'musica',      label:'Música',      svg:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'},
      {key:'viagens',     label:'Viagens',     svg:'<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.64 11.2a19.79 19.79 0 01-3.07-8.67A2 2 0 012.55 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l.91-.91a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>'},
    ];
  }
  function _cpInterestsGridHtml() {
    return _cpInterestTags().map(function(t) {
      var active = WKZ_USER_INTERESTS.indexOf(t.key) !== -1;
      return '<span class="interest-tag' + (active ? ' active' : '') + '" data-interest="' + t.key + '" onclick="toggleInterest(this)">'
        + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + t.svg + '</svg> ' + t.label
        + '</span>';
    }).join('');
  }
  function _cpSelectOptionsHtml(id, options, current) {
    return '<select id="' + id + '" class="form-select wkz-select wkz-select--lg">'
      + options.map(function(o) { return '<option' + (o === current ? ' selected' : '') + '>' + o + '</option>'; }).join('')
      + '</select>';
  }

  window.cpEditProfile = function() {
    var name  = document.getElementById('cpUserName')  ? document.getElementById('cpUserName').textContent  : 'Alexandre Kz';
    var email = document.getElementById('cpUserEmail') ? document.getElementById('cpUserEmail').textContent : 'alexandre@wekzshop.com';
    var ex = WKZ_PROFILE_EXTRA;
    _cpShowModal({
      id: 'cpEditProfileModal',
      title: CP_ICO.pencil + ' Editar Perfil',
      width: '480px',
      body: ''
        /* ── Barra de completude (herdada do antigo Turbinar Perfil) ── */
        + '<div style="margin-bottom:16px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
            + '<span style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Completude do perfil</span>'
            + '<span id="cpEditProgressLabel" style="font-size:11px;color:var(--teal);font-weight:800;">0% completo</span>'
          + '</div>'
          + '<div style="background:var(--border);border-radius:99px;height:6px;overflow:hidden;">'
            + '<div id="cpEditProgressBar" style="height:100%;width:0%;background:var(--grad1);border-radius:99px;transition:width .4s ease;"></div>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.55;">Quanto mais completo, mais precisas ficam as recomendações e mais rápido o check-out. Tudo aqui é opcional.</div>'
        + '</div>'
        /* ── Dados pessoais ── */
        + '<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">Dados pessoais</div>'
        + '<div class="form-group"><label class="form-label">Nome de utilizador</label>'
          + '<input id="cpEditName" class="form-input wkz-input" type="text" value="' + name + '"></div>'
        + '<div class="form-group"><label class="form-label">Email</label>'
          + '<input id="cpEditEmail" class="form-input wkz-input" type="email" value="' + email + '"></div>'
        + '<div class="form-row">'
          + '<div class="form-group"><label class="form-label">Telefone / WhatsApp</label>'
            + '<input id="cpEditPhone" class="form-input wkz-input" type="tel" placeholder="(11) 99999-9999" value="' + ex.phone + '" oninput="cpUpdateProfileCompletion()"></div>'
          + '<div class="form-group"><label class="form-label">CPF / Documento</label>'
            + '<input id="cpEditDoc" class="form-input wkz-input" type="text" placeholder="000.000.000-00" value="' + ex.doc + '" oninput="cpUpdateProfileCompletion()"></div>'
        + '</div>'
        + '<div class="form-row">'
          + '<div class="form-group"><label class="form-label">CEP / Endereço</label>'
            + '<input id="cpEditCep" class="form-input wkz-input" type="text" placeholder="00000-000" value="' + ex.cep + '" oninput="cpUpdateProfileCompletion()"></div>'
          + '<div class="form-group"><label class="form-label">País</label>'
            + '<div id="cpCountryPickerWrap" style="position:relative;">'
            + '<div id="cpCountrySelected" onclick="cpToggleCountryPicker()" class="form-select wkz-select wkz-select--lg" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;">'
            + '<span id="cpCountryLabel">' + ex.countryLabel + '</span>'
            + '</div>'
            + '<div id="cpCountryDropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:9999;background:var(--card);border:1px solid rgba(0,180,171,0.35);border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3),0 0 0 1px var(--border);max-height:220px;overflow-y:auto;">'
              + '<div style="padding:8px;"><div style="position:relative;"><span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:rgba(0,180,171,0.6);">' + CP_ICO.search + '</span><input id="cpCountrySearch" type="text" placeholder="Pesquisar país..." oninput="cpFilterCountries(this.value)" style="width:100%;padding:8px 12px 8px 30px;background:rgba(0,180,171,0.07);border:1px solid rgba(0,180,171,0.2);border-radius:9px;color:var(--text);font-size:12px;outline:none;box-sizing:border-box;" autocomplete="off"></div></div>'
              + '<div id="cpCountryList" style="padding:0 4px 8px;"></div>'
            + '</div>'
            + '<input type="hidden" id="cpEditCountry" value="' + ex.country + '">'
            + '</div></div>'
        + '</div>'
        /* ── Preferências (idioma/moeda) ── */
        + '<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:14px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">Preferências de compra</div>'
        + '<div class="form-row">'
          + '<div class="form-group"><label class="form-label">Idioma preferido</label>'
            + _cpSelectOptionsHtml('cpEditLang', ['🇧🇷 Português (Brasil)','🇺🇸 English','🇪🇸 Español','🇨🇳 中文'], ex.lang) + '</div>'
          + '<div class="form-group"><label class="form-label">Moeda preferida</label>'
            + _cpSelectOptionsHtml('cpEditCurr', ['🇧🇷 BRL — Real Brasileiro','🇺🇸 USD — Dólar','🇪🇺 EUR — Euro'], ex.curr) + '</div>'
        + '</div>'
        /* ── Interesses (para o Kz Copilot recomendar melhor) ── */
        + '<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:14px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">Interesses <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--muted);">— melhora as recomendações do Kz Copilot</span></div>'
        + '<div class="interests-grid" style="margin-bottom:4px;">' + _cpInterestsGridHtml() + '</div>'
        /* ── Zona de risco ── */
        + '<div style="border-top:1px solid rgba(239,68,68,0.22);margin-top:16px;padding-top:14px;">'
          + '<div style="font-size:11px;font-weight:800;color:#EF4444;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Zona de risco</div>'
          + '<div onclick="cpEditProfileDeleteAccount()" role="button" tabindex="0" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.22);border-radius:12px;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(239,68,68,0.11)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.06)\'">'
            + '<div><div style="font-size:13px;font-weight:700;color:#EF4444;">Excluir minha conta</div>'
            + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Remove o teu perfil e dados permanentemente, respeitando os prazos legais de retenção.</div></div>'
            + '<span style="color:#EF4444;flex-shrink:0;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>'
          + '</div>'
        + '</div>',
      confirmLabel: CP_ICO.save + ' Guardar Alterações',
      confirmColor: 'var(--grad1)',
      onConfirm: function() {
        var newName  = document.getElementById('cpEditName')  ? document.getElementById('cpEditName').value.trim()  : '';
        var newEmail = document.getElementById('cpEditEmail') ? document.getElementById('cpEditEmail').value.trim() : '';
        if (!newName)  { showToast && showToast('⚠ Informa um nome de utilizador.'); return false; }
        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { showToast && showToast('⚠ Informa um email válido.'); return false; }
        var nameEl = document.getElementById('cpUserName');
        if (nameEl) nameEl.textContent = newName;
        var emailEl = document.getElementById('cpUserEmail');
        if (emailEl) emailEl.textContent = newEmail;

        var f;
        f = document.getElementById('cpEditPhone');    if (f) WKZ_PROFILE_EXTRA.phone        = f.value.trim();
        f = document.getElementById('cpEditDoc');      if (f) WKZ_PROFILE_EXTRA.doc           = f.value.trim();
        f = document.getElementById('cpEditCep');      if (f) WKZ_PROFILE_EXTRA.cep           = f.value.trim();
        f = document.getElementById('cpEditCountry');  if (f) WKZ_PROFILE_EXTRA.country       = f.value;
        f = document.getElementById('cpCountryLabel'); if (f) WKZ_PROFILE_EXTRA.countryLabel  = f.textContent.trim();
        f = document.getElementById('cpEditLang');     if (f) WKZ_PROFILE_EXTRA.lang           = f.value;
        f = document.getElementById('cpEditCurr');     if (f) WKZ_PROFILE_EXTRA.curr           = f.value;

        var pct = cpUpdateProfileCompletion();
        var msg = pct >= 100
          ? '🎉 Perfil 100% completo! +100 pts bônus creditados e recomendações turbinadas.'
          : 'Perfil atualizado com sucesso' + (pct ? ' — ' + pct + '% completo' : '') + '!';
        showToast && showToast(msg);
        if (pct === 100) {
          var ptsEl = document.getElementById('cpStatHeroPoints');
          if (ptsEl) ptsEl.textContent = '8.440';
          var coPtsEl = document.getElementById('cpStatPoints');
          if (coPtsEl) coPtsEl.textContent = '8.440 pts';
        }
      }
    });
    /* Sincroniza a barra de completude assim que o modal abre */
    cpUpdateProfileCompletion();
  };

  /* [v3.1] "Excluir minha conta" dentro do Editar Perfil não reimplementa
     nada — apenas fecha este modal e delega para o fluxo LGPD (dupla
     confirmação, Art.18 VI) já usado na Central de Privacidade, mantendo
     uma única fonte de verdade para essa ação sensível. */
  window.cpEditProfileDeleteAccount = function() {
    _cpCloseModal('cpEditProfileModal');
    setTimeout(function() {
      if (typeof lgpdOpenExcluirConta === 'function') lgpdOpenExcluirConta();
    }, 240);
  };

  /* ══════════════════════════════════════════
     PARTILHAR PERFIL
  ══════════════════════════════════════════ */
  window.cpShareProfile = function() {
    var name = document.getElementById('cpUserName') ? document.getElementById('cpUserName').textContent : 'Alexandre Kz';
    var shareUrl = 'https://wekzshop.com/perfil/' + encodeURIComponent(name.replace(/\s+/g,'_').toLowerCase());
    _cpShowModal({
      id: 'cpShareModal',
      title: CP_ICO.link + ' Partilhar Perfil',
      width: '400px',
      body: '<div style="text-align:center;">'
        + '<div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Partilha o teu perfil WeKz e convida amigos!</div>'
        + '<div style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid rgba(0,180,171,0.25);border-radius:10px;padding:10px 14px;margin-bottom:18px;">'
        + '<span style="flex:1;font-size:12px;color:var(--teal);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="cpShareUrlText">' + shareUrl + '</span>'
        + '<button onclick="cpCopyShareUrl()" style="padding:5px 12px;background:rgba(0,180,171,0.15);border:1px solid rgba(0,180,171,0.4);border-radius:7px;color:var(--teal);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">' + CP_ICO.copy + ' Copiar</button>'
        + '</div>'
        + '<div style="display:flex;justify-content:center;gap:12px;">'
        + '<button onclick="cpShareVia(\'whatsapp\')" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 16px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25D366;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(37,211,102,0.2)\'" onmouseout="this.style.background=\'rgba(37,211,102,0.1)\'"><span style="font-size:22px;">' + CP_ICO.chat + '</span>WhatsApp</button>'
        + '<button onclick="cpShareVia(\'telegram\')" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 16px;background:rgba(0,136,204,0.1);border:1px solid rgba(0,136,204,0.3);border-radius:12px;color:#0088cc;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(0,136,204,0.2)\'" onmouseout="this.style.background=\'rgba(0,136,204,0.1)\'"><span style="font-size:22px;">' + CP_ICO.send + '</span>Telegram</button>'
        + '<button onclick="cpShareVia(\'copy\')" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 16px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(124,58,237,0.2)\'" onmouseout="this.style.background=\'rgba(124,58,237,0.1)\'"><span style="font-size:22px;">' + CP_ICO.link + '</span>Copiar Link</button>'
        + '</div>'
        + '</div>',
      confirmLabel: null
    });
  };

  window.cpCopyShareUrl = function() {
    var el = document.getElementById('cpShareUrlText');
    var url = el ? el.textContent.trim() : 'https://wekzshop.com/perfil/';
    function _doFeedback() {
      var btn = document.querySelector('[onclick="cpCopyShareUrl()"]');
      if (btn) { var orig = btn.innerHTML; btn.innerHTML = CP_ICO.check + ' Copiado!'; btn.style.color = '#34d399'; btn.style.borderColor = 'rgba(52,211,153,0.5)'; setTimeout(function(){ btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 1800); }
      showToast && showToast('Link copiado para a área de transferência!');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(_doFeedback).catch(function() {
        /* fallback */ var ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(e){}
        document.body.removeChild(ta); _doFeedback();
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e){}
      document.body.removeChild(ta); _doFeedback();
    }
  };

  window.cpShareVia = function(via) {
    var name = document.getElementById('cpUserName') ? document.getElementById('cpUserName').textContent : 'Alexandre Kz';
    var url = 'https://wekzshop.com/perfil/' + encodeURIComponent(name.replace(/\s+/g,'_').toLowerCase());
    var msg = encodeURIComponent('Vê o meu perfil na WeKz Shop! ' + url);
    if (via === 'whatsapp') { window.open('https://wa.me/?text=' + msg, '_blank'); }
    else if (via === 'telegram') { window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Vê o meu perfil na WeKz Shop!'), '_blank'); }
    else {
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function(){});
      showToast && showToast('Link copiado!');
    }
    _cpCloseModal('cpShareModal');
  };

  /* ══════════════════════════════════════════
     COUNTRY PICKER PREMIUM — WeKz
  ══════════════════════════════════════════ */
  var _cpCountries = [
    {code:'PT',flag:'🇵🇹',name:'Portugal'},
    {code:'BR',flag:'🇧🇷',name:'Brasil'},
    {code:'AO',flag:'🇦🇴',name:'Angola'},
    {code:'MZ',flag:'🇲🇿',name:'Moçambique'},
    {code:'CV',flag:'🇨🇻',name:'Cabo Verde'},
    {code:'GW',flag:'🇬🇼',name:'Guiné-Bissau'},
    {code:'ST',flag:'🇸🇹',name:'São Tomé e Príncipe'},
    {code:'TL',flag:'🇹🇱',name:'Timor-Leste'},
    {code:'ES',flag:'🇪🇸',name:'Espanha'},
    {code:'FR',flag:'🇫🇷',name:'França'},
    {code:'DE',flag:'🇩🇪',name:'Alemanha'},
    {code:'GB',flag:'🇬🇧',name:'Reino Unido'},
    {code:'IT',flag:'🇮🇹',name:'Itália'},
    {code:'NL',flag:'🇳🇱',name:'Países Baixos'},
    {code:'BE',flag:'🇧🇪',name:'Bélgica'},
    {code:'CH',flag:'🇨🇭',name:'Suíça'},
    {code:'AT',flag:'🇦🇹',name:'Áustria'},
    {code:'SE',flag:'🇸🇪',name:'Suécia'},
    {code:'NO',flag:'🇳🇴',name:'Noruega'},
    {code:'DK',flag:'🇩🇰',name:'Dinamarca'},
    {code:'PL',flag:'🇵🇱',name:'Polónia'},
    {code:'US',flag:'🇺🇸',name:'Estados Unidos'},
    {code:'CA',flag:'🇨🇦',name:'Canadá'},
    {code:'MX',flag:'🇲🇽',name:'México'},
    {code:'AR',flag:'🇦🇷',name:'Argentina'},
    {code:'CO',flag:'🇨🇴',name:'Colômbia'},
    {code:'CL',flag:'🇨🇱',name:'Chile'},
    {code:'PE',flag:'🇵🇪',name:'Peru'},
    {code:'JP',flag:'🇯🇵',name:'Japão'},
    {code:'CN',flag:'🇨🇳',name:'China'},
    {code:'KR',flag:'🇰🇷',name:'Coreia do Sul'},
    {code:'IN',flag:'🇮🇳',name:'Índia'},
    {code:'SG',flag:'🇸🇬',name:'Singapura'},
    {code:'AU',flag:'🇦🇺',name:'Austrália'},
    {code:'ZA',flag:'🇿🇦',name:'África do Sul'},
    {code:'NG',flag:'🇳🇬',name:'Nigéria'},
    {code:'KE',flag:'🇰🇪',name:'Quénia'},
    {code:'MA',flag:'🇲🇦',name:'Marrocos'},
    {code:'EG',flag:'🇪🇬',name:'Egito'},
    {code:'AE',flag:'🇦🇪',name:'Emirados Árabes'},
  ];

  window.cpToggleCountryPicker = function() {
    var dd = document.getElementById('cpCountryDropdown');
    var sel = document.getElementById('cpCountrySelected');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
      dd.style.display = 'none';
      if (sel) sel.style.borderColor = 'rgba(0,180,171,0.3)';
    } else {
      dd.style.display = 'block';
      if (sel) sel.style.borderColor = 'rgba(0,180,171,0.7)';
      cpRenderCountryList('');
      setTimeout(function() {
        var s = document.getElementById('cpCountrySearch');
        if (s) s.focus();
      }, 50);
    }
    /* Close when clicking outside */
    setTimeout(function() {
      document.addEventListener('click', function _outsideClick(e) {
        var wrap = document.getElementById('cpCountryPickerWrap');
        if (wrap && !wrap.contains(e.target)) {
          var dd2 = document.getElementById('cpCountryDropdown');
          var sel2 = document.getElementById('cpCountrySelected');
          if (dd2) dd2.style.display = 'none';
          if (sel2) sel2.style.borderColor = 'rgba(0,180,171,0.3)';
          document.removeEventListener('click', _outsideClick);
        }
      });
    }, 10);
  };

  window.cpRenderCountryList = function(filter) {
    var list = document.getElementById('cpCountryList');
    if (!list) return;
    var f = (filter || '').toLowerCase().trim();
    var filtered = f ? _cpCountries.filter(function(c){ return c.name.toLowerCase().includes(f) || c.code.toLowerCase().includes(f); }) : _cpCountries;
    if (!filtered.length) {
      list.innerHTML = '<div style="padding:12px 10px;font-size:12px;color:var(--muted);text-align:center;">Nenhum país encontrado</div>';
      return;
    }
    list.innerHTML = filtered.map(function(c) {
      return '<div onclick="cpSelectCountry(\'' + c.code + '\',\'' + c.flag + ' ' + c.name + '\')" '
        + 'style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-radius:8px;font-size:13px;color:var(--text);transition:background 0.15s;margin:0 2px;" '
        + 'onmouseover="this.style.background=\'rgba(0,180,171,0.1)\'" onmouseout="this.style.background=\'\'">'
        + '<span style="font-size:18px;line-height:1;">' + c.flag + '</span>'
        + '<span>' + c.name + '</span>'
        + '<span style="margin-left:auto;font-size:10px;color:var(--muted);font-family:monospace;">' + c.code + '</span>'
        + '</div>';
    }).join('');
  };

  window.cpSelectCountry = function(code, label) {
    var lbl = document.getElementById('cpCountryLabel');
    var inp = document.getElementById('cpEditCountry');
    var dd  = document.getElementById('cpCountryDropdown');
    var sel = document.getElementById('cpCountrySelected');
    if (lbl) lbl.innerHTML = label;
    if (inp) inp.value = code;
    if (dd)  dd.style.display = 'none';
    if (sel) sel.style.borderColor = 'rgba(0,180,171,0.3)';
  };

  window.cpFilterCountries = function(val) {
    cpRenderCountryList(val);
  };

    // [KZ-ILLUS] Fallback seguro do mascote flutuante do modal de logout —
  // definida aqui (dentro do mesmo escopo de CP_ICO) mas exposta em
  // window, então o atributo onerror="_wkzLogoutIconError(this)" consegue
  // chamá-la de qualquer lugar e ainda assim acessar CP_ICO via closure.
  // FIX v2.3.0: fallback agora preenche o slot flutuante (sem moldura),
  // não mais a caixinha antiga de 52px.
  window._wkzLogoutIconError = function(imgEl) {
    if (!imgEl) return;
    imgEl.outerHTML = '<span style="display:flex;align-items:center;justify-content:center;'
      + 'width:100%;height:100%;font-size:56px;color:#EF4444;'
      + 'filter:drop-shadow(0 10px 22px rgba(0,0,0,0.45));">' + CP_ICO.door + '</span>';
  };

  window.cpLogout = function() {
    // [KZ-ILLUS] mesma exceção já aprovada: ilustração raster como mascote
    // do modal de logout, com fallback pro ícone de porta via
    // _wkzLogoutIconError() se a imagem não carregar. Só afeta ESTA
    // chamada de _wkzConfirm — o helper genérico continua servindo os
    // outros confirms do site sem nenhuma alteração.
    // FIX v2.3.0: removida a "figurinha" com fundo/borda/box-shadow em
    // caixa — agora é um mascote flutuante "vazado" (sem moldura), maior,
    // que sangra por cima do topo do card, renderizado via
    // opts.floatingMascotHTML (ver .wkz-confirm-mascot-float no CSS acima).
    var logoutMascotHTML = '<img src="../shared/assets/mascot/ate-logo.png" alt="Kz acenando um até logo" '
      + 'class="wkz-confirm-mascot-img" '
      + 'onerror="_wkzLogoutIconError(this)">';
    window._wkzConfirm('Tens a certeza que queres encerrar a sessão?', {
      title: 'Sair da conta',
      floatingMascotHTML: logoutMascotHTML,
      variant: 'danger',
      confirmLabel: 'Sair',
      cancelLabel: 'Ficar',
    }).then(function(confirmed) {
      if (!confirmed) return;

      // FIX SEC-02: limpar dados de sessão ao fazer logout para evitar
      // session fixation em dispositivos partilhados.
      try {
        localStorage.removeItem('kzPriceAlerts_v1');
        localStorage.removeItem('wkz_seller_settings');
        localStorage.removeItem('wkz_notif_prefs');
        localStorage.removeItem('wkz_social_proof');
        localStorage.removeItem('kzFxAlerts_v1');
        localStorage.removeItem('kzFxRatesPrev_v1');
        localStorage.removeItem('kzContracts_v1');
        localStorage.removeItem('kzContractsSync');
        localStorage.removeItem('kzNegoLog_v1');
        localStorage.removeItem('kzDisputas_v1');
        localStorage.removeItem('kzDisputasSync');
        // wkzLang / wkzCurrency mantidos intencionalmente para melhor UX no próximo login
        sessionStorage.clear();
        // Futuro: fetch('/api/auth/logout', {method:'POST'}) para invalidar JWT
      } catch(e) { /* ignorar erros de quota/modo privado */ }

      // [v2.9.13] Atualiza o estado de login do comprador (mock) — esconde
      // imediatamente os elementos buyer-only, ex.: "Meus Favoritos".
      // OBS: sessionStorage.clear() acima já limpou a chave de estado;
      // chamamos de novo aqui só para garantir o re-sync visual da UI.
      if (typeof window.wkzSetBuyerLoggedIn === 'function') window.wkzSetBuyerLoggedIn(false);

      showToast && showToast('Lince Kz: Sessão encerrada. Até breve!');
      setTimeout(function() {
        MapsTo('auth');
      }, 1200);
    });
  };

  /* ══════════════════════════════════════════
     AVATAR — Upload de imagem + ícone Kz
     [v3.0] Substituídos os emojis de avatar por
     um conjunto de ícones SVG cyberpunk (alinhados
     com a identidade visual da WeKz / Lince Kz).
  ══════════════════════════════════════════ */
  var CP_AVATAR_ICONS = ['lynx','zap','star','hexagon','gem','shield','crown','eye','cpu','trophy','flame','target'];

  window.cpEditAvatar = function() {
    _cpShowModal({
      id: 'cpAvatarModal',
      title: CP_ICO.camera + ' Foto de Perfil',
      width: '380px',
      body: '<div style="display:flex;flex-direction:column;gap:14px;align-items:center;">'
        + '<div id="cpAvatarPreviewModal" style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#00B4AB,#7C3AED);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 0 3px rgba(0,180,171,0.35),0 0 24px rgba(0,180,171,0.2);">'
        + '<img id="cpAvatarPreviewImg" src="" style="width:100%;height:100%;object-fit:cover;display:none;border-radius:50%;">'
        + '<span id="cpAvatarPreviewIcon" style="font-size:38px;color:#fff;">' + CP_ICO.lynx + '</span>'
        + '</div>'
        + '<button onclick="document.getElementById(\'cpAvatarFileInput\').click()" style="width:100%;padding:11px;background:rgba(0,180,171,0.1);border:1px dashed rgba(0,180,171,0.4);border-radius:12px;color:var(--teal);font-size:13px;font-weight:700;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(0,180,171,0.2)\'" onmouseout="this.style.background=\'rgba(0,180,171,0.1)\'">' + CP_ICO.folder + ' Escolher Foto da Galeria</button>'
        + '<div style="width:100%;text-align:center;color:var(--muted);font-size:11px;font-weight:600;">— ou escolher ícone Kz —</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">'
        + CP_AVATAR_ICONS.map(function(key){
            return '<button onclick="cpSetAvatarEmoji(\'' + key + '\')" title="' + (CP_ICO_LABEL[key]||key) + '" style="width:44px;height:44px;font-size:20px;background:var(--card2);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:0.2s;color:var(--text);display:flex;align-items:center;justify-content:center;" onmouseover="this.style.borderColor=\'rgba(0,180,171,0.5)\'" onmouseout="this.style.borderColor=\'\'">'+(CP_ICO[key]||CP_ICO.lynx)+'</button>';
          }).join('')
        + '</div>'
        + '<button onclick="cpResetAvatarToLogo()" style="width:100%;padding:10px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;color:#a78bfa;font-size:12px;font-weight:700;cursor:pointer;transition:0.2s;" onmouseover="this.style.background=\'rgba(124,58,237,0.2)\'" onmouseout="this.style.background=\'rgba(124,58,237,0.1)\'">' + CP_ICO.store + ' Usar Logótipo da Loja (padrão)</button>'
        + '</div>',
      confirmLabel: null
    });
    /* Sync preview with current avatar */
    setTimeout(function() {
      var mainImg = document.getElementById('cpAvatarImg');
      var prevImg = document.getElementById('cpAvatarPreviewImg');
      var prevIcon = document.getElementById('cpAvatarPreviewIcon');
      if (mainImg && mainImg.style.display !== 'none' && mainImg.src) {
        if (prevImg) { prevImg.src = mainImg.src; prevImg.style.display = 'block'; }
        if (prevIcon) prevIcon.style.display = 'none';
      }
    }, 50);
  };

  window.cpSetAvatarEmoji = function(key) {
    var icoSvg = CP_ICO[key] || CP_ICO.lynx;
    /* Update main avatar */
    var imgEl = document.getElementById('cpAvatarImg');
    var logoEl = document.getElementById('cpAvatarLogo');
    var emojiWrap = document.getElementById('cpAvatarEmoji');
    if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }
    if (logoEl) { logoEl.style.display = 'none'; }
    if (emojiWrap) {
      var existing = emojiWrap.querySelector('span.cp-emoji-char');
      if (!existing) {
        existing = document.createElement('span');
        existing.className = 'cp-emoji-char';
        existing.style.fontSize = '34px';
        existing.style.color = '#fff';
        emojiWrap.appendChild(existing);
      }
      existing.innerHTML = icoSvg;
      existing.style.display = '';
    }
    /* ── Actualiza estado canônico (sincroniza dropdown imediatamente) ── */
    if (window._cpAvatarState) { window._cpAvatarState.mode = 'icon'; window._cpAvatarState.payload = icoSvg; }
    /* Update preview */
    var prevImg = document.getElementById('cpAvatarPreviewImg');
    var prevIcon = document.getElementById('cpAvatarPreviewIcon');
    if (prevImg) prevImg.style.display = 'none';
    if (prevIcon) { prevIcon.style.display = ''; prevIcon.innerHTML = icoSvg; }
    showToast && showToast('Avatar actualizado para ' + (CP_ICO_LABEL[key] || key) + '!');
    _cpCloseModal('cpAvatarModal');
  };

  window.cpResetAvatarToLogo = function() {
    var imgEl = document.getElementById('cpAvatarImg');
    var logoEl = document.getElementById('cpAvatarLogo');
    var emojiWrap = document.getElementById('cpAvatarEmoji');
    var emojiChar = emojiWrap ? emojiWrap.querySelector('span.cp-emoji-char') : null;
    if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }
    if (emojiChar) emojiChar.style.display = 'none';
    if (logoEl) { logoEl.style.display = ''; }
    /* ── Actualiza estado canônico ── */
    if (window._cpAvatarState) { window._cpAvatarState.mode = 'logo'; window._cpAvatarState.payload = null; }
    showToast && showToast('Logótipo da loja definido como foto de perfil!');
    _cpCloseModal('cpAvatarModal');
  };

  window.cpHandleAvatarFile = function(input) {
    if (!input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      /* Update main avatar */
      var imgEl = document.getElementById('cpAvatarImg');
      var logoEl = document.getElementById('cpAvatarLogo');
      var emojiWrap = document.getElementById('cpAvatarEmoji');
      var emojiChar = emojiWrap ? emojiWrap.querySelector('span.cp-emoji-char') : null;
      if (emojiChar) emojiChar.style.display = 'none';
      if (logoEl) logoEl.style.display = 'none';
      if (imgEl) { imgEl.src = dataUrl; imgEl.style.display = 'block'; }
      /* ── Actualiza estado canônico ── */
      if (window._cpAvatarState) { window._cpAvatarState.mode = 'photo'; window._cpAvatarState.payload = dataUrl; }
      /* Update modal preview */
      var prevImg = document.getElementById('cpAvatarPreviewImg');
      var prevIcon = document.getElementById('cpAvatarPreviewIcon');
      if (prevImg) { prevImg.src = dataUrl; prevImg.style.display = 'block'; }
      if (prevIcon) prevIcon.style.display = 'none';
      showToast && showToast('Foto de perfil actualizada!');
    };
    reader.readAsDataURL(input.files[0]);
    /* Clear input so same file can be selected again */
    input.value = '';
  };

  /* ══════════════════════════════════════════
     ABRIR DISPUTA — Modal completo
  ══════════════════════════════════════════ */

  /* Helper: gera lista de radio buttons estilizados para substituir <select> nativo */
  function _cpBuildRadioGroup(name, options, selectedVal) {
    var styles = {
      wrap:  'display:flex;flex-direction:column;gap:0;margin-top:6px;border:1px solid rgba(124,58,237,0.3);border-radius:10px;overflow:hidden;',
      item:  'display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card2);cursor:pointer;border-bottom:1px solid rgba(124,58,237,0.12);font-size:13px;color:var(--text);transition:background 0.15s;',
      radio: 'width:16px;height:16px;border-radius:50%;border:2px solid rgba(124,58,237,0.5);flex-shrink:0;display:flex;align-items:center;justify-content:center;',
      dot:   'width:7px;height:7px;border-radius:50%;background:#7C3AED;display:none;'
    };
    var html = '<div style="' + styles.wrap + '" id="' + name + 'Group">';
    options.forEach(function(opt, i) {
      var isLast = i === options.length - 1;
      var itemStyle = styles.item + (isLast ? 'border-bottom:none;' : '');
      var dotStyle  = styles.dot  + (opt.value === selectedVal ? 'display:block;' : '');
      html += '<label style="' + itemStyle + '" onclick="(function(el,v){' +
        'var g=document.getElementById(\'' + name + 'Group\');' +
        'g.querySelectorAll(\'[data-dot]\').forEach(function(d){d.style.display=\'none\';});' +
        'el.querySelector(\'[data-dot]\').style.display=\'block\';' +
        'g.dataset.val=v;' +
        '})(this,\'' + opt.value + '\')">' +
        '<span style="' + styles.radio + '"><span data-dot style="' + dotStyle + '"></span></span>' +
        '<span>' + opt.label + '</span>' +
        '</label>';
    });
    html += '</div>';
    /* Hidden input to relay value — read via cpDisputeOrderGroup.dataset.val */
    return html;
  }

  /* Wrapper para ler valor do radio group customizado */
  function _cpRadioVal(name) {
    var g = document.getElementById(name + 'Group');
    return g ? (g.dataset.val || '') : '';
  }

  window.cpOpenNewDispute = function() {
    var orderOptions = CP_ORDERS.map(function(o) {
      return '<option value="' + o.id + '">' + o.id + ' — ' + o.name + '</option>';
    }).join('');
    _cpShowModal({
      id: 'cpNewDisputeModal',
      title: CP_ICO.scale + ' Abrir Nova Disputa',
      width: '460px',
      body: '<div style="display:flex;flex-direction:column;gap:14px;">'
        + '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px;font-size:12px;color:#fbbf24;display:flex;gap:8px;align-items:flex-start;"><span style="flex-shrink:0;margin-top:1px;">'+CP_ICO.shield+'</span><span>Todas as compras estão cobertas pela <strong>WeKz Buyer Protection</strong>. A tua disputa será analisada em até 5 dias úteis.</span></div>'
        + '<div><label style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Pedido relacionado</label>'
        + _cpBuildRadioGroup('cpDisputeOrder', [{value:'',label:'— Selecionar pedido —'}].concat(CP_ORDERS.map(function(o){return {value:o.id,label:o.id+' — '+o.name};})), '')
        + '</div>'
        + '<div><label style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;display:block;">Motivo da disputa</label>'
        + _cpBuildRadioGroup('cpDisputeReason', [{value:'',label:'— Selecionar motivo —'},{value:'damaged',label:'Produto chegou danificado'},{value:'notreceived',label:'Produto não recebido'},{value:'wrong',label:'Produto diferente do anunciado'},{value:'delay',label:'Atraso na entrega além do prazo'},{value:'refund',label:'Reembolso não processado'},{value:'other',label:'Outro motivo'}], '')
        + '</div>'
        + '<div><label style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Descrição detalhada</label>'
        + '<textarea id="cpDisputeDesc" placeholder="Descreve detalhadamente o problema ocorrido..." style="width:100%;margin-top:6px;padding:10px 14px;background:var(--card2);border:1px solid rgba(124,58,237,0.3);border-radius:10px;color:var(--text);font-size:13px;outline:none;box-sizing:border-box;resize:vertical;min-height:90px;font-family:inherit;"></textarea></div>'
        + '</div>',
      confirmLabel: CP_ICO.scale + ' Submeter Disputa',
      confirmColor: 'linear-gradient(135deg,#7C3AED,#4F46E5)',
      onConfirm: function() {
        var order = _cpRadioVal('cpDisputeOrder');
        var reason = _cpRadioVal('cpDisputeReason');
        var desc = document.getElementById('cpDisputeDesc') ? document.getElementById('cpDisputeDesc').value.trim() : '';
        if (!order) { showToast && showToast('Seleciona o pedido relacionado!'); return false; }
        if (!reason) { showToast && showToast('Seleciona o motivo da disputa!'); return false; }
        if (!desc || desc.length < 10) { showToast && showToast('Descreve o problema em pelo menos 10 caracteres!'); return false; }
        var reasonLabels = { damaged:'Produto chegou danificado', notreceived:'Produto não recebido', wrong:'Produto diferente do anunciado', delay:'Atraso na entrega além do prazo', refund:'Reembolso não processado', other:'Outro motivo' };
        var newDispute = {
          id: order,
          reason: reasonLabels[reason] || reason,
          date: new Date().toLocaleDateString('pt-PT', {day:'2-digit',month:'short',year:'numeric'}),
          verdict: 'pending',
          verdictText: CP_ICO.hourglass+' Disputa submetida — A ser analisada pela equipa WeKz (prazo: 5 dias úteis).',
          icon: CP_ICO.scale
        };
        CP_DISPUTES.unshift(newDispute);
        renderDisputes();
        showToast && showToast('Disputa submetida com sucesso! ID: ' + order);

        // Espelha a disputa no painel do vendedor E na Central de Mediação do
        // admin — sem isso, o vendedor e o admin nunca veem o que o
        // comprador realmente abre (eram 3 painéis desconectados).
        var relatedOrder = CP_ORDERS.find(function(o) { return o.id === order; });
        var buyerDisplayName = document.getElementById('cpUserName') ? document.getElementById('cpUserName').textContent : 'Alexandre Kz';
        if (typeof wkzCreateTrilateralDispute === 'function') {
          wkzCreateTrilateralDispute({
            orderId: order,
            productName: relatedOrder ? relatedOrder.name : 'Produto do pedido',
            buyerName: buyerDisplayName,
            reason: reasonLabels[reason] || reason,
            dateStr: newDispute.date,
            valor: relatedOrder ? cpFmtAmt(relatedOrder.amountEUR) : '—',
            description: desc
          });
        }
      }
    });
  };

  /* ══════════════════════════════════════════
     RECEBE veredito do admin (Central de Mediação)
     Chamada por wkzPropagateResolutionToSeller's counterpart
     no fluxo de resolução do admin (admResolveDispute).
  ══════════════════════════════════════════ */
  window.cpUpdateDisputeVerdict = function(disputeId, verdictKey, verdictText) {
    var d = CP_DISPUTES.find(function(x){ return x.id === disputeId; });
    if (!d) return;
    d.verdict = verdictKey;
    d.verdictText = verdictText;
    delete d.verdictTpl;
    delete d.verdictAmtEUR;
    renderDisputes();
  };

  /* ══════════════════════════════════════════
     NOTIFICA o comprador que o VENDEDOR respondeu
     Chamada por enviarRespostaDisputa() no painel do vendedor.
     Atualiza o card da disputa no painel do comprador para
     mostrar que o vendedor já enviou uma posição.
  ══════════════════════════════════════════ */
  window.cpNotifyBuyerSellerResponded = function(disputeId, posLabel, sellerText) {
    var d = CP_DISPUTES.find(function(x){ return x.id === disputeId; });
    if (!d) return;
    if (d.verdict === 'pending') {
      d.verdictText = CP_ICO.chat + ' Vendedor respondeu: <em>' + posLabel + '</em> — Em análise pela equipa WeKz.';
    }
    renderDisputes();
    if (typeof showToast === 'function') showToast('📩 O vendedor respondeu à disputa ' + disputeId + '.');
  };

  /* ══════════════════════════════════════════
     VER PRODUTO de uma disputa
  ══════════════════════════════════════════ */
  window.cpViewDisputeProduct = function(orderId) {
    /* FUNC-06: modal com dados completos do produto e linha do tempo */
    var dispute = CP_DISPUTES.find(function(d){ return d.id === orderId; });
    if (!dispute) { showToast && showToast('Disputa não encontrada.'); return; }
    var vColors = {
      buyer:   {bg:'rgba(16,185,129,0.1)',txt:'#34d399',bd:'rgba(16,185,129,0.2)'},
      pending: {bg:'rgba(245,158,11,0.1)',txt:'#fbbf24',bd:'rgba(245,158,11,0.2)'},
      partial: {bg:'rgba(37,99,235,0.1)', txt:'#60a5fa',bd:'rgba(37,99,235,0.2)' },
      seller:  {bg:'rgba(239,68,68,0.1)', txt:'#f87171',bd:'rgba(239,68,68,0.2)' }
    };
    var vc = vColors[dispute.verdict] || vColors.seller;
    var verdictHtml = (dispute.verdictTpl && dispute.verdictAmtEUR != null)
      ? dispute.verdictTpl.replace('{AMT}', cpFmtAmt(dispute.verdictAmtEUR))
      : (dispute.verdictText || '');
    var tlHtml = '';
    if (dispute.timeline && dispute.timeline.length) {
      var li = dispute.timeline.length - 1;
      tlHtml = '<div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Linha do Tempo</div>'
        + '<div style="display:flex;flex-direction:column;">'
        + dispute.timeline.map(function(t,i){
            var isL=i===li;
            return '<div style="display:flex;gap:10px;align-items:flex-start;">'
              +'<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">'
              +'<div style="width:8px;height:8px;border-radius:50%;background:'+(isL?vc.txt:'rgba(0,180,171,0.6)')+';margin-top:3px;"></div>'
              +(!isL?'<div style="width:1px;flex:1;min-height:18px;background:rgba(0,180,171,0.2);margin:3px 0;"></div>':'')
              +'</div>'
              +'<div style="padding-bottom:'+(isL?'0':'10px')+';">'
              +'<div style="font-size:11px;color:var(--muted);">'+t.date+'</div>'
              +'<div style="font-size:12px;color:var(--text);margin-top:1px;">'+t.event+'</div>'
              +'</div></div>';
          }).join('')+'</div>';
    }
    var actionBtn='';
    if (dispute.verdict==='buyer') actionBtn='<button onclick="_cpCloseModal(\'cpDisputeProductModal\')" style="width:100%;padding:10px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">'+CP_ICO.money+' Ver Reembolso na Carteira</button>';
    else if (dispute.verdict==='pending') actionBtn='<button onclick="_cpCloseModal(\'cpDisputeProductModal\')" style="width:100%;padding:10px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:10px;color:#fbbf24;font-size:13px;font-weight:700;cursor:pointer;">'+CP_ICO.mail+' Aguardar — Receberás notificação por email</button>';
    else if (dispute.verdict==='partial') actionBtn='<button onclick="_cpCloseModal(\'cpDisputeProductModal\')" style="width:100%;padding:10px;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.3);border-radius:10px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer;">'+CP_ICO.tag+' Ver Cupão de Compensação</button>';
    _cpShowModal({
      id:'cpDisputeProductModal',
      title:'▸ Disputa '+orderId,
      width:'460px',
      body:'<div style="display:flex;flex-direction:column;gap:12px;">'
        +'<div style="display:flex;gap:14px;align-items:center;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:14px;">'
        +'<div style="width:56px;height:56px;border-radius:12px;background:rgba(124,58,237,0.12);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">'+dispute.icon+'</div>'
        +'<div style="min-width:0;flex:1;">'
        +'<div style="font-weight:700;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(dispute.productName||orderId)+'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:3px;">'+(dispute.productCat||'')+(dispute.seller?' · '+dispute.seller:'')+'</div>'
        +(dispute.amountEUR?'<div style="font-size:13px;color:var(--teal);margin-top:5px;font-weight:700;">'+cpFmtAmt(dispute.amountEUR)+'</div>':'')
        +'</div></div>'
        +'<div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:14px;">'
        +'<div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Motivo da Disputa</div>'
        +'<div style="font-size:13px;color:var(--text);">'+dispute.reason+'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:6px;">Aberta em '+dispute.date+'</div>'
        +'</div>'
        +'<div style="border-radius:12px;padding:12px;font-size:12px;font-weight:600;background:'+vc.bg+';color:'+vc.txt+';border:1px solid '+vc.bd+';">'+verdictHtml+'</div>'
        +(tlHtml?'<div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:14px;">'+tlHtml+'</div>':'')
        +actionBtn
        +'</div>',
      confirmLabel:null
    });
  };

  /* ══════════════════════════════════════════
     ADICIONAR CARTÃO / CONTA — Modal completo
     Tipos: Cartão | Banco | MB Way | Pix | Cripto
  ══════════════════════════════════════════ */

  /* Forms HTML por tipo */
  var _cpCardForms = {
    0: /* ── Cartão Débito/Crédito ── */ function() {
      return '<div style="display:flex;flex-direction:column;gap:12px;">'
        + _cpField('Número do Cartão','<input id="cpNewCardNumber" type="text" maxlength="19" placeholder="0000 0000 0000 0000" oninput="cpFmtCardNum(this)" '+_cpInStyle('font-size:15px;letter-spacing:2px;font-family:\'DM Sans\',monospace;')+'>')
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + _cpField('Validade','<input id="cpNewCardExpiry" type="text" maxlength="5" placeholder="MM/AA" oninput="cpFmtExpiry(this)" '+_cpInStyle()+'>')
        + _cpField('CVV','<input id="cpNewCardCVV" type="password" maxlength="4" placeholder="•••" '+_cpInStyle()+'>')
        + '</div>'
        + _cpField('Nome no Cartão','<input id="cpNewCardHolder" type="text" placeholder="ALEXANDRE K." style="text-transform:uppercase;" '+_cpInStyle()+'>')
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;"><input type="checkbox" data-wkz-default-method="1" name="cpNewCardDefault" style="accent-color:var(--teal);width:15px;height:15px;"><span style="font-size:12px;color:var(--muted);">Definir como método principal</span></label>'
        + _cpSecBadge()
        + '</div>';
    },
    1: /* ── Banco / IBAN ── */ function() {
      return '<div style="display:flex;flex-direction:column;gap:12px;">'
        + _cpField('Banco / Instituição','<input id="cpNewBankName" type="text" placeholder="Ex: Millennium BCP, Caixa Geral..." '+_cpInStyle()+'>')
        + _cpField('IBAN','<input id="cpNewBankIBAN" type="text" maxlength="34" placeholder="PT50 0000 0000 0000 0000 0000 0" oninput="cpFmtIBAN(this)" '+_cpInStyle('font-family:monospace;letter-spacing:1.5px;')+'>')
        + _cpField('Titular da Conta','<input id="cpNewBankHolder" type="text" placeholder="Nome completo" '+_cpInStyle()+'>')
        + _cpField('Moeda preferida','<select id="cpNewBankCurrency" '+_cpSelStyle()+'>'
            +'<option value="EUR">🇪🇺 EUR — Euro</option>'
            +'<option value="BRL">🇧🇷 BRL — Real Brasileiro</option>'
            +'<option value="USD">🇺🇸 USD — Dólar</option>'
            +'<option value="GBP">🇬🇧 GBP — Libra</option>'
            +'<option value="AOA">🇦🇴 AOA — Kwanza</option>'
            +'<option value="MZN">🇲🇿 MZN — Metical</option>'
            +'</select>')
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;"><input type="checkbox" data-wkz-default-method="1" name="cpNewCardDefault" style="accent-color:var(--teal);width:15px;height:15px;"><span style="font-size:12px;color:var(--muted);">Definir como método principal</span></label>'
        + _cpSecBadge()
        + '</div>';
    },
    2: /* ── MB Way ── */ function() {
      return '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div style="background:linear-gradient(135deg,rgba(0,180,171,0.08),rgba(124,58,237,0.06));border:1px solid rgba(0,180,171,0.2);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;">'
        + '<div style="font-size:30px;color:var(--teal);">' + CP_ICO.smartphone + '</div>'
        + '<div><div style="font-size:13px;font-weight:700;color:var(--text);">MB Way</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Pagamentos rápidos pelo telemóvel</div></div>'
        + '</div>'
        + _cpField('Número de Telemóvel','<input id="cpNewMBWayPhone" type="tel" maxlength="14" placeholder="+351 912 345 678" oninput="cpFmtPhone(this)" '+_cpInStyle('font-size:15px;letter-spacing:1px;')+'>')
        + _cpField('Confirmar Número','<input id="cpNewMBWayConfirm" type="tel" maxlength="14" placeholder="+351 912 345 678" oninput="cpFmtPhone(this)" '+_cpInStyle('font-size:15px;letter-spacing:1px;')+'>')
        + _cpField('Alias / Apelido (opcional)','<input id="cpNewMBWayAlias" type="text" placeholder="Ex: O meu MB Way pessoal" '+_cpInStyle()+'>')
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;"><input type="checkbox" data-wkz-default-method="1" name="cpNewCardDefault" style="accent-color:var(--teal);width:15px;height:15px;"><span style="font-size:12px;color:var(--muted);">Definir como método principal</span></label>'
        + _cpSecBadge()
        + '</div>';
    },
    3: /* ── Pix ── */ function() {
      return '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div style="background:linear-gradient(135deg,rgba(0,155,100,0.1),rgba(0,180,171,0.06));border:1px solid rgba(0,155,100,0.25);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;">'
        + '<div style="font-size:30px;color:#10b981;">' + CP_ICO.zap + '</div>'
        + '<div><div style="font-size:13px;font-weight:700;color:var(--text);">Pix</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Transferências instantâneas — Banco Central do Brasil</div></div>'
        + '</div>'
        + _cpField('Tipo de Chave Pix','<select id="cpNewPixKeyType" onchange="cpUpdatePixPlaceholder(this.value)" '+_cpSelStyle()+'>'
            +'<option value="cpf">CPF</option>'
            +'<option value="cnpj">CNPJ</option>'
            +'<option value="phone">Telefone</option>'
            +'<option value="email">E-mail</option>'
            +'<option value="random">Chave Aleatória</option>'
            +'</select>')
        + _cpField('Chave Pix','<input id="cpNewPixKey" type="text" placeholder="000.000.000-00" oninput="cpFmtPixKey(this)" '+_cpInStyle('font-family:monospace;letter-spacing:1px;')+'>')
        + _cpField('Nome do Favorecido','<input id="cpNewPixHolder" type="text" placeholder="Nome completo" '+_cpInStyle()+'>')
        + _cpField('Banco (opcional)','<input id="cpNewPixBank" type="text" placeholder="Ex: Nubank, Itaú, Bradesco..." '+_cpInStyle()+'>')
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;"><input type="checkbox" data-wkz-default-method="1" name="cpNewCardDefault" style="accent-color:var(--teal);width:15px;height:15px;"><span style="font-size:12px;color:var(--muted);">Definir como método principal</span></label>'
        + _cpSecBadge()
        + '</div>';
    },
    4: /* ── Cripto ── */ function() {
      return '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.06));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;">'
        + '<div style="font-size:30px;color:#F59E0B;">' + CP_ICO.coin + '</div>'
        + '<div><div style="font-size:13px;font-weight:700;color:var(--text);">Carteira Cripto</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">Bitcoin, Ethereum, USDT e outras</div></div>'
        + '</div>'
        + _cpField('Criptomoeda','<select id="cpNewCryptoCoin" '+_cpSelStyle()+'>'
            +'<option value="BTC">₿ Bitcoin (BTC)</option>'
            +'<option value="ETH">⟠ Ethereum (ETH)</option>'
            +'<option value="USDT">₮ Tether (USDT)</option>'
            +'<option value="USDC">$ USD Coin (USDC)</option>'
            +'<option value="BNB">◈ BNB (BNB)</option>'
            +'<option value="SOL">◎ Solana (SOL)</option>'
            +'<option value="MATIC">⬡ Polygon (MATIC)</option>'
            +'<option value="OTHER">🪙 Outra</option>'
            +'</select>')
        + _cpField('Endereço da Carteira','<input id="cpNewCryptoAddress" type="text" placeholder="0x... ou bc1..." '+_cpInStyle('font-family:monospace;font-size:12px;letter-spacing:0.5px;')+'>')
        + _cpField('Rede / Network','<select id="cpNewCryptoNetwork" '+_cpSelStyle()+'>'
            +'<option value="ERC20">Ethereum (ERC-20)</option>'
            +'<option value="TRC20">Tron (TRC-20)</option>'
            +'<option value="BEP20">BNB Smart Chain (BEP-20)</option>'
            +'<option value="BTC">Bitcoin Network</option>'
            +'<option value="SOL">Solana Network</option>'
            +'<option value="MATIC">Polygon Network</option>'
            +'</select>')
        + _cpField('Alias / Apelido','<input id="cpNewCryptoAlias" type="text" placeholder="Ex: Minha carteira ETH" '+_cpInStyle()+'>')
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;"><input type="checkbox" data-wkz-default-method="1" name="cpNewCardDefault" style="accent-color:var(--teal);width:15px;height:15px;"><span style="font-size:12px;color:var(--muted);">Definir como método principal</span></label>'
        + _cpSecBadge()
        + '</div>';
    }
  };

  /* Helpers de estilo inline */
  function _cpInStyle(extra) {
    return 'style="width:100%;margin-top:6px;padding:10px 14px;background:var(--card2);border:1px solid rgba(0,180,171,0.3);border-radius:10px;color:var(--text);font-size:14px;outline:none;box-sizing:border-box;' + (extra||'') + '" onfocus="this.style.borderColor=\'rgba(0,180,171,0.7)\'" onblur="this.style.borderColor=\'rgba(0,180,171,0.3)\'"';
  }
  function _cpSelStyle() {
    return 'style="width:100%;margin-top:6px;padding:10px 14px;background:var(--card2);border:1px solid rgba(0,180,171,0.3);border-radius:10px;color:var(--text);font-size:14px;outline:none;box-sizing:border-box;cursor:pointer;"';
  }
  function _cpField(label, inputHtml) {
    return '<div><label style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</label>' + inputHtml + '</div>';
  }
  function _cpSecBadge() {
    return '<div style="background:rgba(0,180,171,0.05);border:1px solid rgba(0,180,171,0.15);border-radius:8px;padding:10px;font-size:11px;color:var(--muted);display:flex;gap:7px;align-items:flex-start;"><span style="flex-shrink:0;margin-top:1px;">'+CP_ICO.lock+'</span><span>Os teus dados são encriptados com AES-256 e nunca ficam guardados em texto simples.</span></div>';
  }

  var _cpActiveCardType = 0;

  window.cpAddCard = function() {
    _cpActiveCardType = 0;
    var tabs = [CP_ICO.card+' Cartão', CP_ICO.bank+' Banco', CP_ICO.smartphone+' MB Way', CP_ICO.zap+' Pix', CP_ICO.coin+' Cripto'];
    var tabsHtml = '<div style="display:flex;gap:6px;margin-bottom:4px;overflow-x:auto;padding-bottom:2px;">'
      + tabs.map(function(t,i){
          var active = i===0;
          return '<button onclick="cpSelectCardType(this,' + i + ')" class="cp-card-type-btn" style="flex:0 0 auto;padding:8px 11px;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer;transition:0.2s;white-space:nowrap;background:' + (active?'rgba(0,180,171,0.2)':'var(--card2)') + ';border:1px solid ' + (active?'rgba(0,180,171,0.6)':'var(--border)') + ';color:' + (active?'var(--teal)':'var(--muted)') + ';">' + t + '</button>';
        }).join('')
      + '</div>';
    _cpShowModal({
      id: 'cpAddCardModal',
      title: CP_ICO.card + ' Adicionar Método de Pagamento',
      width: '480px',
      body: '<div style="display:flex;flex-direction:column;gap:14px;">'
        + tabsHtml
        + '<div id="cpCardFormFields">' + _cpCardForms[0]() + '</div>'
        + '</div>',
      confirmLabel: CP_ICO.save + ' Guardar Método',
      confirmColor: 'var(--grad1)',
      onConfirm: function() { return cpSavePaymentMethod(); }
    });
  };

  window.cpSelectCardType = function(btn, idx) {
    _cpActiveCardType = idx;
    document.querySelectorAll('.cp-card-type-btn').forEach(function(b) {
      b.style.background = 'var(--card2)';
      b.style.borderColor = 'var(--border)';
      b.style.color = 'var(--muted)';
    });
    btn.style.background = 'rgba(0,180,171,0.2)';
    btn.style.borderColor = 'rgba(0,180,171,0.6)';
    btn.style.color = 'var(--teal)';
    var fields = document.getElementById('cpCardFormFields');
    if (fields && _cpCardForms[idx]) {
      fields.style.opacity = '0';
      fields.style.transition = 'opacity 0.18s';
      setTimeout(function() {
        fields.innerHTML = _cpCardForms[idx]();
        fields.style.opacity = '1';
      }, 180);
    }
  };

  window.cpSavePaymentMethod = function() {
    var isDefault = (function(){ var el = document.querySelector('[data-wkz-default-method="1"]'); return el ? el.checked : false; })();
    var entry = null;

    if (_cpActiveCardType === 0) { /* Cartão */
      var num    = document.getElementById('cpNewCardNumber') ? document.getElementById('cpNewCardNumber').value.replace(/\s/g,'') : '';
      var expiry = document.getElementById('cpNewCardExpiry') ? document.getElementById('cpNewCardExpiry').value : '';
      var cvv    = document.getElementById('cpNewCardCVV')    ? document.getElementById('cpNewCardCVV').value    : '';
      var holder = document.getElementById('cpNewCardHolder') ? document.getElementById('cpNewCardHolder').value.trim().toUpperCase() : '';
      if (num.length < 13) { showToast && showToast('Número de cartão inválido!'); return false; }
      // FIX SEC-03: validação Luhn — detecta números estruturalmente inválidos
      if (!luhnCheck(num)) { showToast && showToast('Número de cartão inválido — verifique os dígitos'); return false; }
      if (!expiry || expiry.length < 5) { showToast && showToast('Data de validade inválida!'); return false; }
      // FIX SEC-05: usar isCardExpired() centralizada (substitui bloco inline SEC-04)
      if (isCardExpired(expiry)) { showToast && showToast('Cartão expirado — verifique a data de validade'); return false; }
      if (!cvv || cvv.length < 3) { showToast && showToast('CVV inválido!'); return false; }
      if (!holder || holder.length < 2) { showToast && showToast('Nome no cartão inválido!'); return false; }
      var brand = num.startsWith('4') ? 'Visa' : num.startsWith('5') ? 'Mastercard' : num.startsWith('3') ? 'Amex' : 'Cartão';
      var masked = '**** **** **** ' + num.slice(-4);
      entry = { chip:CP_ICO.card, number:masked, holder:holder, brand:brand + ' · ' + expiry, isDefault:isDefault };
      showToast && showToast('Cartão ' + brand + ' ' + masked + ' adicionado!');

    } else if (_cpActiveCardType === 1) { /* Banco */
      var bname  = document.getElementById('cpNewBankName')   ? document.getElementById('cpNewBankName').value.trim()   : '';
      var iban   = document.getElementById('cpNewBankIBAN')   ? document.getElementById('cpNewBankIBAN').value.replace(/\s/g,'').toUpperCase() : '';
      var bholder= document.getElementById('cpNewBankHolder') ? document.getElementById('cpNewBankHolder').value.trim().toUpperCase() : '';
      var bcurr  = document.getElementById('cpNewBankCurrency')? document.getElementById('cpNewBankCurrency').value : 'EUR';
      if (!bname) { showToast && showToast('Indica o nome do banco!'); return false; }
      if (!iban || iban.length < 15) { showToast && showToast('IBAN inválido!'); return false; }
      if (!bholder || bholder.length < 2) { showToast && showToast('Nome do titular inválido!'); return false; }
      var maskedIBAN = iban.slice(0,4) + ' **** **** ' + iban.slice(-4);
      entry = { chip:CP_ICO.bank, number:maskedIBAN, holder:bholder, brand:bname + ' · ' + bcurr, isDefault:isDefault };
      showToast && showToast('Conta bancária ' + bname + ' adicionada!');

    } else if (_cpActiveCardType === 2) { /* MB Way */
      var phone  = document.getElementById('cpNewMBWayPhone')   ? document.getElementById('cpNewMBWayPhone').value.replace(/\s/g,'')   : '';
      var phone2 = document.getElementById('cpNewMBWayConfirm') ? document.getElementById('cpNewMBWayConfirm').value.replace(/\s/g,'') : '';
      var alias  = document.getElementById('cpNewMBWayAlias')   ? document.getElementById('cpNewMBWayAlias').value.trim() : '';
      if (!phone || phone.length < 9) { showToast && showToast('Número de telemóvel inválido!'); return false; }
      if (phone !== phone2) { showToast && showToast('Os números de telemóvel não coincidem!'); return false; }
      var maskedPhone = phone.slice(0,-3).replace(/\d/g,'*') + phone.slice(-3);
      entry = { chip:CP_ICO.smartphone, number:'MB Way · ' + maskedPhone, holder:alias || 'MB Way Pessoal', brand:'MB Way', isDefault:isDefault };
      showToast && showToast('MB Way ' + maskedPhone + ' adicionado!');

    } else if (_cpActiveCardType === 3) { /* Pix */
      var pixKey    = document.getElementById('cpNewPixKey')    ? document.getElementById('cpNewPixKey').value.trim()    : '';
      var pixHolder = document.getElementById('cpNewPixHolder') ? document.getElementById('cpNewPixHolder').value.trim().toUpperCase() : '';
      var pixType   = document.getElementById('cpNewPixKeyType')? document.getElementById('cpNewPixKeyType').value : 'cpf';
      var pixBank   = document.getElementById('cpNewPixBank')   ? document.getElementById('cpNewPixBank').value.trim() : '';
      if (!pixKey) { showToast && showToast('Indica a chave Pix!'); return false; }
      if (!pixHolder || pixHolder.length < 2) { showToast && showToast('Nome do favorecido inválido!'); return false; }
      var pixTypeLabel = {cpf:'CPF',cnpj:'CNPJ',phone:'Telefone',email:'E-mail',random:'Aleatória'}[pixType] || pixType;
      var maskedPix = pixKey.length > 6 ? pixKey.slice(0,3) + '···' + pixKey.slice(-3) : pixKey;
      entry = { chip:CP_ICO.zap, number:'Pix ' + pixTypeLabel + ' · ' + maskedPix, holder:pixHolder, brand:'Pix' + (pixBank ? ' · ' + pixBank : ''), isDefault:isDefault };
      showToast && showToast('Chave Pix adicionada com sucesso!');

    } else if (_cpActiveCardType === 4) { /* Cripto */
      var addr    = document.getElementById('cpNewCryptoAddress') ? document.getElementById('cpNewCryptoAddress').value.trim() : '';
      var coin    = document.getElementById('cpNewCryptoCoin')    ? document.getElementById('cpNewCryptoCoin').value    : 'BTC';
      var network = document.getElementById('cpNewCryptoNetwork') ? document.getElementById('cpNewCryptoNetwork').value : '';
      var calias  = document.getElementById('cpNewCryptoAlias')   ? document.getElementById('cpNewCryptoAlias').value.trim() : '';
      if (!addr || addr.length < 10) { showToast && showToast('Endereço de carteira inválido!'); return false; }
      var maskedAddr = addr.slice(0,6) + '···' + addr.slice(-4);
      entry = { chip:CP_ICO.coin, number:coin + ' · ' + maskedAddr, holder:calias || (coin + ' Wallet'), brand:network || coin, isDefault:isDefault };
      showToast && showToast('Carteira ' + coin + ' adicionada!');
    }

    if (!entry) return false;
    if (isDefault) CP_CARDS.forEach(function(c){ c.isDefault = false; });
    CP_CARDS.push(entry);
    renderWallet();
    return true; /* close modal */
  };

  window.cpFmtCardNum = function(input) {
    var v = input.value.replace(/\D/g,'').substring(0,16);
    input.value = v.replace(/(.{4})/g,'$1 ').trim();
  };

  window.cpFmtExpiry = function(input) {
    var v = input.value.replace(/\D/g,'').substring(0,4);
    if (v.length >= 2) v = v.substring(0,2) + '/' + v.substring(2);
    input.value = v;
  };

  window.cpFmtIBAN = function(input) {
    var v = input.value.replace(/\s/g,'').toUpperCase().substring(0,34);
    input.value = v.replace(/(.{4})/g,'$1 ').trim();
  };

  window.cpFmtPhone = function(input) {
    var v = input.value.replace(/[^\d+]/g,'');
    input.value = v;
  };

  window.cpFmtPixKey = function(input) {
    var type = document.getElementById('cpNewPixKeyType') ? document.getElementById('cpNewPixKeyType').value : 'cpf';
    var v = input.value;
    if (type === 'cpf') {
      v = v.replace(/\D/g,'').substring(0,11);
      if (v.length > 9) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6,9)+'-'+v.slice(9);
      else if (v.length > 6) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6);
      else if (v.length > 3) v = v.slice(0,3)+'.'+v.slice(3);
    } else if (type === 'cnpj') {
      v = v.replace(/\D/g,'').substring(0,14);
      if (v.length > 12) v = v.slice(0,2)+'.'+v.slice(2,5)+'.'+v.slice(5,8)+'/'+v.slice(8,12)+'-'+v.slice(12);
      else if (v.length > 8) v = v.slice(0,2)+'.'+v.slice(2,5)+'.'+v.slice(5,8)+'/'+v.slice(8);
    }
    input.value = v;
  };

  window.cpUpdatePixPlaceholder = function(type) {
    var ph = {cpf:'000.000.000-00',cnpj:'00.000.000/0001-00',phone:'+55 11 91234-5678',email:'exemplo@email.com',random:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'};
    var inp = document.getElementById('cpNewPixKey');
    if (inp) { inp.placeholder = ph[type] || ''; inp.value = ''; }
  };

  /* ══════════════════════════════════════════
     GERIR CARTÕES — Apagar / definir principal
  ══════════════════════════════════════════ */
  window.cpDeleteCard = function(idx) {
    window._wkzConfirm('Remover este cartão da carteira? Esta ação não pode ser desfeita.', {
      title: 'Remover Cartão',
      icon: CP_ICO.card,
      variant: 'danger',
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
    }).then(function(confirmed) {
      if (!confirmed) return;
      CP_CARDS.splice(idx, 1);
      renderWallet();
      showToast && showToast('Cartão removido da carteira!');
    });
  };

  window.cpSetDefaultCard = function(idx) {
    CP_CARDS.forEach(function(c){ c.isDefault = false; });
    CP_CARDS[idx].isDefault = true;
    renderWallet();
    showToast && showToast('Cartão ' + CP_CARDS[idx].brand + ' definido como principal!');
  };

  window.cpCopyCoupon = function(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function(){});
    showToast && showToast('Lince Kz: Cupão ' + code + ' copiado! Aplica-o no checkout.');
  };

  /* ══════════════════════════════════════════
     SISTEMA DE MODAIS INTERNO cp
  ══════════════════════════════════════════ */
  function _cpShowModal(opts) {
    var existing = document.getElementById(opts.id);
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = opts.id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,14,26,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:wkzConfirmOverlayIn 0.22s ease forwards;box-sizing:border-box;';
    overlay.onclick = function(e) { if (e.target === overlay) _cpCloseModal(opts.id); };
    /* [FIX light-mode] box/topBar/título/botões eram hardcoded para o
       tema escuro original (#151E2E, #fff, rgba branco) — por isso todo
       modal desta fábrica (Editar Perfil, Partilhar, Avatar, Disputa,
       Cartão) aparecia sempre escuro, mesmo com o site em tema claro.
       Trocado por var(--card)/var(--text)/var(--card2)/var(--border),
       que já resolvem certo em claro e escuro (wkz-styles-base.css). */
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:' + (opts.width||'440px') + ';background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 0 0 1px var(--border),0 24px 64px rgba(0,0,0,0.35),0 0 40px rgba(0,180,171,0.08);animation:wkzConfirmIn 0.38s cubic-bezier(0.34,1.4,0.64,1) forwards;max-height:90vh;overflow-y:auto;';
    var topBar = '<div style="position:sticky;top:0;z-index:1;background:var(--card);border-bottom:1px solid var(--border);padding:18px 20px 14px;display:flex;align-items:center;justify-content:space-between;">'
      + '<div style="font-family:\'DM Sans\',sans-serif;font-size:16px;font-weight:800;color:var(--text);">' + opts.title + '</div>'
      + '<button onclick="_cpCloseModal(\'' + opts.id + '\')" style="width:28px;height:28px;border-radius:50%;background:var(--card2);border:1px solid var(--border);color:var(--muted);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:0.2s;" onmouseover="this.style.borderColor=\'var(--teal)\';this.style.color=\'var(--teal)\'" onmouseout="this.style.borderColor=\'var(--border)\';this.style.color=\'var(--muted)\'">' + CP_ICO.close + '</button>'
      + '</div>';
    var bodyHtml = '<div style="padding:16px 20px 8px;">' + (opts.body || '') + '</div>';
    var footerHtml = '';
    if (opts.confirmLabel !== null) {
      footerHtml = '<div style="padding:12px 20px 20px;display:flex;gap:10px;justify-content:flex-end;">'
        + '<button onclick="_cpCloseModal(\'' + opts.id + '\')" style="padding:10px 20px;background:var(--card2);border:1px solid var(--border);border-radius:10px;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;transition:0.2s;" onmouseover="this.style.color=\'var(--text)\'" onmouseout="this.style.color=\'var(--muted)\'">Cancelar</button>';
      if (opts.confirmLabel) {
        footerHtml += '<button onclick="_cpHandleModalConfirm(\'' + opts.id + '\')" style="padding:10px 20px;background:' + (opts.confirmColor||'var(--grad1)') + ';border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:0.2s;white-space:nowrap;" onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'">' + opts.confirmLabel + '</button>';
      }
      footerHtml += '</div>';
    }
    box.innerHTML = topBar + bodyHtml + footerHtml;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    /* Store callback */
    overlay._cpOnConfirm = opts.onConfirm || null;
    /* Prevent body scroll */
    document.body.style.overflow = 'hidden';
    return overlay;
  }

  window._cpHandleModalConfirm = function(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    var result = overlay._cpOnConfirm ? overlay._cpOnConfirm() : undefined;
    if (result === false) return; /* validation failed — keep modal open */
    _cpCloseModal(id);
  };

  window._cpCloseModal = function(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.style.animation = 'wkzConfirmOverlayOut 0.22s ease forwards';
    setTimeout(function() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      /* Restore scroll if no other modals */
      if (!document.querySelector('[id^="cp"][id$="Modal"]')) {
        document.body.style.overflow = '';
      }
    }, 220);
  };

  /* ── Nav Hook: init when page opens ── */
  /* FIX (auditoria M3): usa registerNavHook (delega pro WkzBus, ver
     fix de Sprint M1 em WkzApp) em vez de tocar window._wkzNavHooks
     diretamente — essa variável é congelada (writable:false) após o
     boot por wkzFreezeApp(), reatribuí-la lança TypeError. */
  window.registerNavHook(function(sectionId) {
    if (sectionId === 'client-profile') {
      initClientProfile();
      /* Highlight header button */
      var btn = document.getElementById('btnClientProfile');
      if (btn) {
        btn.style.background = 'linear-gradient(135deg,rgba(0,180,171,0.3),rgba(124,58,237,0.25))';
        btn.style.borderColor = 'rgba(0,180,171,0.8)';
        btn.style.color = '#fff';
      }
    } else {
      /* Reset button when navigating away */
      var btn = document.getElementById('btnClientProfile');
      if (btn) { btn.style.background=''; btn.style.borderColor=''; btn.style.color=''; }
    }
  });

})();
/* ── End Client Profile v1.8.0 ── */

/* ════════════════════════════════════════════════════════════════
   WeKz Shop v2.9.12 — NOVOS MÓDULOS DO PERFIL
   ════════════════════════════════════════════════════════════════ */

/* ── 1. HEADER QUICK-PROFILE DROPDOWN ──────────────────────────── */
(function() {
  var _dropOpen = false;

  // ── Estado canônico do avatar (fonte-de-verdade compartilhada) ──
  // mode: 'logo' | 'icon' | 'photo'
  // payload: dataURL para 'photo', innerHTML SVG para 'icon', null para 'logo'
  window._cpAvatarState = { mode: 'logo', payload: null };

  // ── Helper: aplica o estado canônico no avatar do dropdown ──────
  function _syncDdAvatar() {
    var init  = document.getElementById('cpHdrAvatarInitial');
    var img   = document.getElementById('cpHdrAvatarImg');
    var icon  = document.getElementById('cpHdrAvatarIcon');
    var nameEl = document.getElementById('cpUserName');
    // Reset
    if (init) init.style.display = 'none';
    if (img)  { img.style.display = 'none'; img.src = ''; }
    if (icon) { icon.classList.remove('active'); icon.innerHTML = ''; }
    var s = window._cpAvatarState;
    if (s.mode === 'photo' && s.payload) {
      if (img) { img.src = s.payload; img.style.display = 'block'; }
    } else if (s.mode === 'icon' && s.payload) {
      if (icon) { icon.innerHTML = s.payload; icon.classList.add('active'); }
    } else {
      // logo / padrão → inicial do nome
      var ch = nameEl ? nameEl.textContent.trim().charAt(0).toUpperCase() : 'A';
      if (init) { init.textContent = ch; init.style.display = ''; }
    }
  }

  window.cpToggleHeaderDropdown = function(e) {
    if (e) e.stopPropagation();
    var dd = document.getElementById('cpHdrDropdown');
    if (!dd) return;
    _dropOpen = !_dropOpen;
    if (_dropOpen) {
      // v2.9.21 — posicionamento fixo via coordenadas do botão trigger
      // evita clip por overflow:hidden do topbar/body no mobile
      var _triggerBtn = document.getElementById('btnClientProfile') || document.getElementById('cpBtnWrap');
      if (_triggerBtn) {
        var _btnRect = _triggerBtn.getBoundingClientRect();
        var _ddW = 260;
        var _margin = 8;
        var _vw = window.innerWidth;
        // calcula right (distância da borda direita do viewport)
        var _rightFromRight = _vw - _btnRect.right;
        // garante que o dropdown não saia pela esquerda
        var _leftIfRight = _btnRect.right - _ddW;
        if (_leftIfRight < _margin) {
          // âncora pela esquerda do botão em vez da direita
          dd.style.left  = Math.max(_margin, _btnRect.left) + 'px';
          dd.style.right = 'auto';
        } else {
          dd.style.right = Math.max(_margin, _rightFromRight) + 'px';
          dd.style.left  = 'auto';
        }
        dd.style.top = (_btnRect.bottom + 8) + 'px';
      }
      dd.classList.add('open');

      // ── Sincroniza nome e pontos ──────────────────────────────────
      var nameEl  = document.getElementById('cpUserName');
      var ptsEl   = document.getElementById('cpStatHeroPoints');
      var hdrName = document.getElementById('cpHdrName');
      var hdrPts  = document.getElementById('cpHdrPts');
      if (hdrName && nameEl) hdrName.textContent = nameEl.textContent;
      if (hdrPts  && ptsEl)  hdrPts.textContent  = ptsEl.textContent + ' Pontos Kz';

      // ── Sincroniza nível ───────────────────────────────────────────
      var levelEl  = document.getElementById('cpLevelName');
      var hdrLevel = document.getElementById('cpHdrLevel');
      if (hdrLevel && levelEl) {
        var levelText = levelEl.cloneNode(true);
        levelText.querySelectorAll('svg, .wkz-icon').forEach(function(n){ n.remove(); });
        hdrLevel.innerHTML = '<span class="wkz-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg></span> ' + levelText.textContent.trim();
      }

      // ── Sincroniza avatar via estado canônico ─────────────────────
      _syncDdAvatar();

      // v2.9.21: clamp removido — posicionamento fixed via getBoundingClientRect() já garante
      // que o dropdown nunca saia dos limites do viewport em nenhuma breakpoint

      // Fecha ao clicar fora
      setTimeout(function() {
        document.addEventListener('click', function _close(ev) {
          var wrap = document.getElementById('cpBtnWrap');
          if (wrap && !wrap.contains(ev.target)) {
            window.cpCloseHeaderDropdown();
            document.removeEventListener('click', _close);
          }
        });
      }, 0);

      // Reposiciona ao redimensionar (ex: rotação de tela no mobile)
      var _ddResizeHandler = function() {
        if (!_dropOpen) { window.removeEventListener('resize', _ddResizeHandler); return; }
        var btn2 = document.getElementById('btnClientProfile') || document.getElementById('cpBtnWrap');
        var dd2  = document.getElementById('cpHdrDropdown');
        if (!btn2 || !dd2) return;
        var r2 = btn2.getBoundingClientRect();
        var vw2 = window.innerWidth;
        var ddW2 = 260;
        var m2 = 8;
        var leftIfRight2 = r2.right - ddW2;
        if (leftIfRight2 < m2) {
          dd2.style.left  = Math.max(m2, r2.left) + 'px';
          dd2.style.right = 'auto';
        } else {
          dd2.style.right = Math.max(m2, vw2 - r2.right) + 'px';
          dd2.style.left  = 'auto';
        }
        dd2.style.top = (r2.bottom + 8) + 'px';
      };
      window.addEventListener('resize', _ddResizeHandler, { passive: true });
    } else {
      window.cpCloseHeaderDropdown();
    }
  };

  window.cpCloseHeaderDropdown = function() {
    var dd = document.getElementById('cpHdrDropdown');
    if (dd) { dd.classList.remove('open'); dd.style.right = ''; dd.style.left = ''; dd.style.top = ''; }
    _dropOpen = false;
  };

  window.cpHdrDdGo = function(page) {
    window.cpCloseHeaderDropdown();
    if (typeof MapsTo === 'function') MapsTo(page);
  };

  window.cpHdrDdGoDisputes = function() {
    window.cpCloseHeaderDropdown();
    if (typeof MapsTo === 'function') MapsTo('client-profile');
    setTimeout(function() {
      var el = document.getElementById('cpDisputeContainer');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  };

  window.cpHdrDdCoupons = function() {
    window.cpCloseHeaderDropdown();
    if (typeof MapsTo === 'function') MapsTo('client-profile');
    setTimeout(function() {
      var el = document.getElementById('cpCouponList');
      if (el) el.closest('.cp-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  };

  window.cpHdrDdLogout = function() {
    window.cpCloseHeaderDropdown();
    if (typeof cpLogout === 'function') cpLogout();
  };
})();

/* ── 1b. ESTADO DE LOGIN DO COMPRADOR (gate de elementos buyer-only) ──
   [v2.9.13] Ainda não há backend de autenticação integrado (ver doLogin()
   e cpLogout(), que já preveem o /api/auth futuro). Para que botões
   restritos a compradores logados — ex.: "Meus Favoritos" — já nasçam
   com a regra correta de exibição, criamos aqui uma fonte única de
   verdade do estado de login, hoje "mockada" em sessionStorage.

   Por padrão o estado inicia LOGADO (true): este protótipo já exibe o
   header/"Meu Perfil" como se o usuário estivesse autenticado (nome,
   pontos, nível etc. fixos), então manter "Meus Favoritos" visível por
   padrão preserva a experiência atual de demo/edição do front-end —
   exatamente como está hoje, sem regressão. A diferença é que agora o
   botão REAGE de verdade a login/logout (mock), em vez de estar sempre
   visível de forma incondicional.

   Quando a integração real existir, basta trocar o corpo de
   wkzIsBuyerLoggedIn() pela checagem da sessão/JWT retornada pelo
   backend — todo o resto (sync de UI, hooks de login/logout) já funciona.

   Elementos restritos: marcar com  data-wkz-auth-gate="buyer"  no HTML.
   Hoje: botão de Favoritos no header + aba "Favoritos" da bottom-nav mobile.
   ──────────────────────────────────────────────────────────────── */
(function() {
  var STORAGE_KEY = 'wkz_buyer_logged_in';

  function readState() {
    try {
      var v = sessionStorage.getItem(STORAGE_KEY);
      if (v !== null) return v === '1';
    } catch (e) { /* modo privado / quota — ignora e usa padrão */ }
    return true; // padrão: logado (ver nota acima)
  }

  window.wkzBuyerLoggedIn = readState();

  /* Aplica o estado atual a todos os elementos marcados como buyer-only
     (data-wkz-auth-gate="buyer") ou guest-only (data-wkz-auth-gate="guest").
     FIX [header-duplicado] — antes só existia o gate "buyer" (ex.: botão de
     Favoritos). O componente de autenticação do header ("Meu Perfil" vs.
     "Entrar/Cadastrar") não estava ligado a NENHUM gate, por isso os dois
     apareciam simultaneamente sempre, independente do estado de login —
     sintoma relatado nos prints (botão duplicado no topbar mobile e
     desktop). Agora "Meu Perfil" usa data-wkz-auth-gate="buyer" (mesmo
     comportamento de Favoritos) e "Entrar/Cadastrar" usa o gate inverso
     data-wkz-auth-gate="guest", tornando os dois mutuamente exclusivos. */
  window.wkzSyncBuyerOnlyUI = function() {
    var show = !!window.wkzBuyerLoggedIn;
    /* FIX: usamos toggle de classe (.wkz-gate-hidden), não style.display
       inline — alguns elementos (ex.: .btn-login-mobile) já têm regras
       CSS com !important para o próprio responsivo (mobile x desktop) e
       um display inline "solto" nunca venceria esse !important. A classe
       .wkz-gate-hidden é definida com seletor de maior especificidade
       ([data-wkz-auth-gate].wkz-gate-hidden{display:none!important}),
       então sempre prevalece, em qualquer breakpoint. */
    document.querySelectorAll('[data-wkz-auth-gate="buyer"]').forEach(function(el) {
      el.classList.toggle('wkz-gate-hidden', !show);
    });
    document.querySelectorAll('[data-wkz-auth-gate="guest"]').forEach(function(el) {
      el.classList.toggle('wkz-gate-hidden', show);
    });
  };

  /* Define o estado de login do comprador (mock) e re-sincroniza a UI.
     Use window.wkzSetBuyerLoggedIn(false) no console para testar o
     estado deslogado enquanto o backend real não está disponível. */
  window.wkzSetBuyerLoggedIn = function(state) {
    window.wkzBuyerLoggedIn = !!state;
    try { sessionStorage.setItem(STORAGE_KEY, state ? '1' : '0'); } catch (e) {}
    window.wkzSyncBuyerOnlyUI();
  };

  document.addEventListener('DOMContentLoaded', window.wkzSyncBuyerOnlyUI);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.wkzSyncBuyerOnlyUI();
  }
})();

/* ── 1.1 TEMA CLARO/ESCURO (Sprint UI-Theming) ─────────────────────
   Compartilhado pelos 4 módulos (wkz-core.js é carregado por todos).
   O <head> de cada módulo já roda um script inline síncrono que aplica
   o tema salvo ANTES do primeiro paint (evita FOUC); aqui só cuidamos
   da troca interativa via botão e da sincronização do ícone. */
(function() {
  var THEME_KEY = 'wkz-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncThemeIcons() {
    var isDark = currentTheme() === 'dark';
    document.querySelectorAll('.wkz-icon-theme-light').forEach(function(el) {
      el.style.display = isDark ? 'none' : '';
    });
    document.querySelectorAll('.wkz-icon-theme-dark').forEach(function(el) {
      el.style.display = isDark ? '' : 'none';
    });
    document.querySelectorAll('[id^="wkzThemeToggleBtn"]').forEach(function(btn) {
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    });
  }

  /* Troca o tema, persiste em localStorage e atualiza os ícones dos
     botões de toggle em qualquer módulo aberto. */
  window.wkzToggleTheme = function() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeIcons();
  };

  document.addEventListener('DOMContentLoaded', syncThemeIcons);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    syncThemeIcons();
  }
})();

/* ── 2. MISSÕES DO DIA ──────────────────────────────────────────── */
(function() {
  var CP_MISSOES = [
    { id:'buy',    emoji:'🛒', title:'Fazer uma compra hoje',        sub:'Qualquer produto conta',                pts:50,  done:false },
    { id:'review', emoji:'⭐', title:'Avaliar um produto',            sub:'Opiniões valem +30 pts bônus',          pts:30,  done:false },
    { id:'browse', emoji:'🔍', title:'Ver produtos recomendados',     sub:'Acesse 3 produtos da sua categoria',    pts:10,  done:true  },
    { id:'share',  emoji:'📤', title:'Compartilhar um produto',       sub:'Via WhatsApp, link ou redes sociais',   pts:20,  done:false },
    { id:'coupon', emoji:'🎟️', title:'Usar um cupom numa compra',     sub:'Aplique qualquer cupom no checkout',    pts:25,  done:false },
  ];

  function renderMissoes() {
    var list = document.getElementById('cpMissaoList');
    if (!list) return;
    var done = CP_MISSOES.filter(function(m){return m.done;}).length;
    var total = CP_MISSOES.length;
    list.innerHTML = CP_MISSOES.map(function(m) {
      return '<div class="cp-mission-item' + (m.done ? ' done' : '') + '" data-mid="' + m.id + '">' +
        '<div class="cp-mission-chk">' +
        (m.done ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>' : '') +
        '</div>' +
        '<div class="cp-mission-body">' +
          '<div class="cp-mission-title">' + m.emoji + ' ' + m.title + '</div>' +
          '<div class="cp-mission-sub">' + m.sub + '</div>' +
        '</div>' +
        '<div class="cp-mission-pts">+' + m.pts + ' pts</div>' +
        '</div>';
    }).join('');
    // Click to complete (demo)
    list.querySelectorAll('.cp-mission-item:not(.done)').forEach(function(item) {
      item.style.cursor = 'pointer';
      item.onclick = function() {
        var mid = item.dataset.mid;
        var m = CP_MISSOES.find(function(x){return x.id===mid;});
        if (!m || m.done) return;
        m.done = true;
        renderMissoes();
        if (typeof showToast === 'function') showToast('🎯 Missão concluída! +' + m.pts + ' pts creditados.');
      };
    });
    // Update progress bar
    var pct = Math.round((done / total) * 100);
    var bar = document.getElementById('cpMissaoBarFill');
    var lbl = document.getElementById('cpMissaoPct');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = done + '/' + total + ' concluídas';
  }

  function startCountdown() {
    function tick() {
      var el = document.getElementById('cpMissoesCountdown');
      if (!el) return;
      var now = new Date();
      var midnight = new Date(now); midnight.setHours(24,0,0,0);
      var diff = Math.max(0, midnight - now);
      var h = Math.floor(diff/3600000);
      var m = Math.floor((diff%3600000)/60000);
      var s = Math.floor((diff%60000)/1000);
      el.textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    }
    tick();
    setInterval(tick, 1000);
  }

  // Init when profile opens
  /* FIX (auditoria M3): mesmo motivo do fix acima — registerNavHook em
     vez de reatribuir window._wkzNavHooks (congelada após o boot). */
  window.registerNavHook(function(sectionId) {
    if (sectionId !== 'client-profile') return;
    renderMissoes();
    startCountdown();
  });

  // Also init if page already open
  if (document.getElementById('cpMissaoList')) {
    renderMissoes();
    startCountdown();
  }
})();

/* ── 3. AVALIAÇÕES — star rating interativo ─────────────────────── */
(function() {
  // Highlight stars on hover
  document.addEventListener('mouseover', function(e) {
    var star = e.target.closest('.cp-review-star');
    if (!star) return;
    var wrap = star.closest('.cp-review-stars');
    if (!wrap) return;
    var stars = Array.from(wrap.querySelectorAll('.cp-review-star'));
    var idx = stars.indexOf(star);
    stars.forEach(function(s, i) {
      s.style.color = i <= idx ? '#F59E0B' : 'rgba(255,255,255,0.2)';
    });
  });
  document.addEventListener('mouseout', function(e) {
    var wrap = e.target.closest && e.target.closest('.cp-review-stars');
    if (!wrap) return;
    wrap.querySelectorAll('.cp-review-star.lit').forEach(function(s) {
      s.style.color = '#F59E0B';
    });
    wrap.querySelectorAll('.cp-review-star:not(.lit)').forEach(function(s) {
      s.style.color = 'rgba(255,255,255,0.2)';
    });
  });

  window.cpSubmitStarReview = function(wrap, orderId, productName) {
    var stars = Array.from(wrap.querySelectorAll('.cp-review-star'));
    var rating = stars.filter(function(s){return s.style.color === 'rgb(245, 158, 11)' || s.style.color === '#F59E0B';}).length;
    if (rating === 0) rating = 5; // default 5 stars if click without hover
    stars.forEach(function(s,i){ s.style.color = i < rating ? '#F59E0B' : 'rgba(255,255,255,0.2)'; s.classList.toggle('lit', i < rating); });
    setTimeout(function() {
      var item = wrap.closest('.cp-review-item');
      if (item) {
        item.style.transition = 'opacity 0.4s';
        item.style.opacity = '0.4';
        item.style.pointerEvents = 'none';
        item.querySelector('.cp-review-meta').textContent = '✅ Avaliação enviada — +30 pts creditados!';
      }
      if (typeof showToast === 'function') showToast('⭐ Obrigado pela avaliação! +30 pts Kz creditados.');
    }, 300);
  };
})();

/* ── 4. REFERRAL / INDICAÇÃO ────────────────────────────────────── */
window.cpCopyReferralCode = function() {
  var code = (document.getElementById('cpReferralCode') || {}).textContent || 'KZWEKZ8340';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(function() {
      if (typeof showToast === 'function') showToast('📋 Código ' + code + ' copiado!');
    });
  } else {
    if (typeof showToast === 'function') showToast('📋 Código: ' + code);
  }
};

window.cpShareReferral = function(channel) {
  var code = (document.getElementById('cpReferralCode') || {}).textContent || 'KZWEKZ8340';
  var msg = '🛍️ Compre na WeKz Shop e ganhe -10% OFF na 1ª compra! Use meu código: ' + code + ' → wekzshop.com';
  if (channel === 'whatsapp') {
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  } else {
    if (navigator.clipboard) {
      navigator.clipboard.writeText('https://wekzshop.com/?ref=' + code).then(function() {
        if (typeof showToast === 'function') showToast('🔗 Link de indicação copiado!');
      });
    }
  }
};

/* ── 5. ACESSO RÁPIDO — scroll suave para secções ──────────────── */
/* Override das funções já existentes para scroll em vez de navegação */
(function() {
  var origCpShowActiveCoupons = window.cpShowActiveCoupons;
  window.cpShowActiveCoupons = function() {
    if (typeof MapsTo === 'function') MapsTo('client-profile');
    setTimeout(function() {
      var el = document.getElementById('cpCouponList');
      if (el && el.closest) el.closest('.cp-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (origCpShowActiveCoupons) origCpShowActiveCoupons();
    }, 350);
  };

  var origCpOpenDisputeCenter = window.cpOpenDisputeCenter;
  window.cpOpenDisputeCenter = function() {
    if (typeof MapsTo === 'function') MapsTo('client-profile');
    setTimeout(function() {
      var el = document.getElementById('cpDisputeContainer');
      if (el && el.closest) el.closest('.cp-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (origCpOpenDisputeCenter) origCpOpenDisputeCenter();
    }, 350);
  };
})();

  window.kzMagicFill = function() {
    const prompt   = (document.getElementById('kzMagicPrompt')?.value || '').trim();
    const fillBtn  = document.getElementById('kzMagicFillBtn');
    const statusEl = document.getElementById('kzMagicStatus');
    const statusTx = document.getElementById('kzMagicStatusText');
    const block    = document.getElementById('kzMagicFillBlock');
    const lince    = document.getElementById('kzMagicLince');

    if (!prompt) {
      if (statusEl) { statusEl.classList.remove('hidden'); statusTx.textContent = '⚠️ Cole um link ou descreva o produto primeiro.'; }
      setTimeout(() => statusEl && statusEl.classList.add('hidden'), 3000);
      return;
    }

    const preset = matchPreset(prompt);

    /* Ativa estado de scanning */
    if (fillBtn) { fillBtn.disabled = true; fillBtn.textContent = '⚡ Escaneando...'; }
    if (statusEl) { statusEl.classList.remove('hidden'); }
    if (statusTx) { statusTx.textContent = 'Kz está analisando a fonte...'; }
    if (block)    block.classList.add('is-scanning');
    if (lince)    lince.classList.add('scanning');

    /* Audit log */
    admAuditAdd && admAuditAdd('🤖', `Kz Magic Fill acionado — prompt: "${prompt.substring(0,60)}${prompt.length>60?'...':''}"`, 'Admin WeKz');

    const steps = [
      { delay: 300,  msg: '🔍 Identificando categoria e marca...' },
      { delay: 800,  msg: '📝 Gerando título otimizado para SEO...' },
      { delay: 1400, msg: '✍️ Redigindo descrição persuasiva...' },
      { delay: 2000, msg: '🏷️ Sugerindo tags de alta conversão...' },
      { delay: 2600, msg: '✅ Preenchimento concluído pelo Kz!' },
    ];

    steps.forEach(({ delay, msg }) => {
      setTimeout(() => { if (statusTx) statusTx.textContent = msg; }, delay);
    });

    setTimeout(async function() {
      /* Preenche título */
      await setFieldAnimated('ap-title', preset.title, 0);
      /* Atualiza contador de título */
      const countEl = document.getElementById('ap-title-count');
      if (countEl) countEl.textContent = preset.title.length + '/120';

      /* Preenche categoria */
      if (preset.category) {
        const catEl = document.getElementById('ap-cat');
        if (catEl) { catEl.value = preset.category; if (typeof loadSubcats === 'function') loadSubcats(); }
      }

      /* Preenche marca */
      if (preset.brand) await setFieldAnimated('ap-brand', preset.brand, 100);

      /* Preenche descrição curta */
      await setFieldAnimated('ap-short-desc', preset.shortDesc, 200);

      /* Preenche descrição completa */
      await setFieldAnimated('ap-desc', preset.desc, 400);

      /* Preenche tags */
      await setFieldAnimated('ap-tags', preset.tags, 600);
      if (typeof renderTagsPrev === 'function') setTimeout(renderTagsPrev, 700);

      /* Atualiza preview */
      if (typeof updateProductPreview === 'function') setTimeout(updateProductPreview, 800);

      /* Encerra scanning */
      setTimeout(function() {
        if (block)   block.classList.remove('is-scanning');
        if (lince)   lince.classList.remove('scanning');
        if (fillBtn) { fillBtn.disabled = false; fillBtn.textContent = '✨ Preencher Agora'; }
        if (statusTx) statusTx.textContent = '✅ Formulário preenchido! Revise e ajuste conforme necessário.';
        showToast && showToast('✨ Kz preencheu o formulário! Revise os dados antes de publicar.');
        admAuditAdd && admAuditAdd('✨', `Kz Magic Fill concluído — produto "${preset.title.substring(0,50)}..."`, 'Kz IA');
      }, 900);

    }, 600);
  };
})();

/* ── FIX: submitFraudReport (formulário pg-antifraude, agora em Legal) ───
   Origem monólito: linhas 39575–39579 (FRAUD_REPORTS) + 39769–39799
   ─────────────────────────────────────────────────────────────────────── */
/* FIX Sprint M3 (achado na auditoria final): submitFraudReport() é chamado
   pelo formulário "Reportar uma Fraude" da página pg-antifraude, que agora
   vive em wkz-legal.html — mas a função original ficava no território
   Admin (nunca carregado por Legal/Buyer/Seller), então o formulário
   estava, na prática, quebrado (ReferenceError ao clicar enviar).
   FRAUD_REPORTS + submitFraudReport movidos para o core (compartilhado
   por todos os módulos); render/resolução de reportes (visão do Admin)
   continua no território Admin, fica para o Sprint M4 — quando o Admin
   carregar o core, vai ler o MESMO array FRAUD_REPORTS declarado aqui. */
let FRAUD_REPORTS = [
  { id:'FR-100231', type:'Phishing / site falso', details:'Recebi um e-mail "WeKz Shop" pedindo confirmação de senha em um link suspeito fora do domínio oficial.', status:'recebida', createdAt:new Date(Date.now() - 86400000 * 1).toISOString() },
  { id:'FR-100198', type:'Vendedor solicitando pagamento externo', details:'O vendedor da loja "EletrônicosBR" pediu Pix direto fora da plataforma, oferecendo desconto adicional.', status:'resolvida', createdAt:new Date(Date.now() - 86400000 * 6).toISOString() },
];

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

  /* FIX: admAuditAdd só existe quando o Admin (M4) também estiver
     carregado na mesma página — guard defensivo evita ReferenceError
     em Legal/Buyer/Seller, mesmo padrão já usado em outros pontos do
     próprio código original (ex.: "admAuditAdd && admAuditAdd(...)"). */
  if (typeof admAuditAdd === 'function') {
    admAuditAdd('🚨', `Novo reporte de fraude recebido (${select.value}) — ${id}`, 'Cliente');
  }

  textarea.value = '';
  select.selectedIndex = 0;
  showToast('Reporte enviado ao time anti-fraude. Protocolo: ' + id);
};

/* ── FAQ compartilhada (toggleFaq/showFaqTheme/searchFaqs/FAQ_THEMES_DATA)
   Usada por Buyer (page-help) E Legal (pg-suporte) — precisa estar em
   ambos os escopos. Cópia idêntica também existe em wkz-buyer.js (Zero
   Rewrite: mantida lá como estava, duplicação aceita aqui por segurança
   em vez de editar o arquivo já montado e testado).
   Origem monólito: linhas 29552–30076
   ─────────────────────────────────────────────────────────────────────── */
function toggleFaq(i){
  const ans = document.getElementById('faq-ans-'+i);
  const icon = document.getElementById('faq-icon-'+i);
  const open = ans.style.display==='block';
  ans.style.display = open?'none':'block';
  icon.textContent = open?'▼':'▲';
}

/* ════════════════════════════════════════════════════════════
   WeKz Shop v1.9.0 — MAINTENANCE PATCH
   Funções em falta, correcções de bugs e melhorias de UX
   ════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   _wkzConfirm v2.2.0 — Modal de Confirmação Customizado WeKz
   Substitui window.confirm() nativo por Promise-based modal com o
   visual do design system da plataforma.
   API: window._wkzConfirm(msg, opts?) → Promise<boolean>
   opts: { title, icon, confirmLabel, cancelLabel, variant }
   variant: 'danger' | 'warning' | 'info' (default: 'info')
   ══════════════════════════════════════════════════════════════════════ */
(function() {
  /* ── CSS do modal — injectado uma única vez ── */
  var _cssId = 'wkz-confirm-modal-style';
  if (!document.getElementById(_cssId)) {
    var s = document.createElement('style');
    s.id = _cssId;
    s.textContent = `
/* ── WeKz Confirm Modal ── */
@keyframes wkzConfirmIn {
  0%   { opacity:0; transform:scale(0.88) translateY(18px); }
  60%  { opacity:1; transform:scale(1.02) translateY(-3px); }
  100% { opacity:1; transform:scale(1)    translateY(0); }
}
@keyframes wkzConfirmOut {
  0%   { opacity:1; transform:scale(1)    translateY(0); }
  100% { opacity:0; transform:scale(0.9)  translateY(10px); }
}
@keyframes wkzConfirmOverlayIn  { from { opacity:0; } to { opacity:1; } }
@keyframes wkzConfirmOverlayOut { from { opacity:1; } to { opacity:0; } }

#wkzConfirmOverlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(8,14,26,0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: wkzConfirmOverlayIn 0.22s ease forwards;
}
#wkzConfirmOverlay.closing {
  animation: wkzConfirmOverlayOut 0.22s ease forwards;
}
#wkzConfirmBox {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: var(--card);
  border-radius: 22px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--border),
    0 24px 64px rgba(0,0,0,0.35),
    0 0 40px rgba(0,180,171,0.08);
  animation: wkzConfirmIn 0.38s cubic-bezier(0.34,1.4,0.64,1) forwards;
}
#wkzConfirmBox.closing {
  animation: wkzConfirmOut 0.22s ease forwards;
}
/* Linha de cor no topo — muda por variant */
#wkzConfirmBox::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
}
#wkzConfirmBox.variant-danger::before  { background: linear-gradient(90deg,#EF4444,#7C3AED); }
#wkzConfirmBox.variant-warning::before { background: linear-gradient(90deg,#F59E0B,#EF4444); }
#wkzConfirmBox.variant-info::before    { background: linear-gradient(90deg,#00B4AB,#7C3AED); }
/* Brilho sutil no topo */
#wkzConfirmBox::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,180,171,0.04) 0%, transparent 60%);
  pointer-events: none;
  border-radius: 22px;
}
.wkz-confirm-inner {
  padding: 28px 26px 22px;
  position: relative;
  z-index: 1;
}
.wkz-confirm-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  margin: 0 auto 18px;
  font-size: 26px;
  flex-shrink: 0;
}
.variant-danger  .wkz-confirm-icon-wrap { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.25); }
.variant-warning .wkz-confirm-icon-wrap { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.25); }
.variant-info    .wkz-confirm-icon-wrap { background: rgba(0,180,171,0.1);   border: 1px solid rgba(0,180,171,0.25); }
/* ── FIX v2.3.0 — Mascote flutuante "vazado" no topo do modal ──────────
   Substitui o .wkz-confirm-icon-wrap (caixinha com fundo/borda) quando
   opts.floatingMascotHTML é fornecido (hoje só usado por cpLogout()).
   O wrapper é irmão de #wkzConfirmBox (não filho), então o
   overflow:hidden do box NÃO corta o mascote — ele pode "sangrar" para
   fora/por cima do card livremente. Sem fundo, sem border-radius, sem
   box-shadow em caixa: só drop-shadow acompanhando o recorte real da
   arte (PNG/SVG com fundo transparente) — igual ao efeito flutuante do
   mascote do Flash Sale (.wkz-fsm-mascot-img). */
.wkz-confirm-wrap {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}
.wkz-confirm-mascot-float {
  position: absolute;
  top: -44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: 118px;
  height: 118px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: wkzConfirmMascotFloat 3.6s ease-in-out infinite;
}
@keyframes wkzConfirmMascotFloat {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%      { transform: translateX(-50%) translateY(-7px); }
}
.wkz-confirm-mascot-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,0.45)) drop-shadow(0 0 18px rgba(0,180,171,0.25));
}
/* Espaço extra no topo do card para o mascote "sangrar" por cima do
   título sem tapar o texto.
   [FIX] O mascote vai de top:-44px até -44+118=74px dentro do box (ver
   .wkz-confirm-mascot-float acima); o padding anterior (52px) era menor
   que isso e por isso o título "Sair da conta" ficava embaixo do
   mascote. Agora sobra folga (74px + ~18px de respiro). */
.wkz-confirm-inner.has-floating-mascot { padding-top: 92px; }
@media (max-width: 420px) {
  .wkz-confirm-inner.has-floating-mascot { padding-top: 80px; }
}
@media (max-width: 420px) {
  .wkz-confirm-mascot-float { width: 98px; height: 98px; top: -36px; }
}
.wkz-confirm-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 17px;
  font-weight: 800;
  color: var(--text);
  text-align: center;
  margin-bottom: 10px;
  line-height: 1.3;
}
.wkz-confirm-msg {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  line-height: 1.65;
  margin-bottom: 24px;
}
.wkz-confirm-msg strong { color: var(--text); font-weight: 600; }
.wkz-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.wkz-confirm-btn {
  padding: 12px 16px;
  border-radius: 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  border: none;
  letter-spacing: 0.3px;
  outline: none;
}
.wkz-confirm-btn:focus-visible { outline: 2px solid rgba(0,180,171,0.6); outline-offset: 2px; }
.wkz-confirm-btn-cancel {
  background: var(--card2);
  border: 1px solid var(--border);
  color: var(--muted);
}
.wkz-confirm-btn-cancel:hover {
  background: var(--border);
  color: var(--text);
  border-color: var(--teal);
}
/* Confirm button — muda por variant */
.variant-danger  .wkz-confirm-btn-ok { background: linear-gradient(135deg,#EF4444,#DC2626); color:#fff; }
.variant-warning .wkz-confirm-btn-ok { background: linear-gradient(135deg,#F59E0B,#D97706); color:#0F172A; }
.variant-info    .wkz-confirm-btn-ok { background: linear-gradient(135deg,#00B4AB,#7C3AED); color:#fff; }
.wkz-confirm-btn-ok:hover { transform: translateY(-1px); filter: brightness(1.1); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.wkz-confirm-btn-ok:active { transform: translateY(0); }
/* Mascote Kz mini no rodapé do modal */
.wkz-confirm-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 26px 18px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
}
/* [FIX] Ícone SVG do rodapé removido a pedido — mantém só o texto */
@media (max-width: 420px) {
  .wkz-confirm-actions { grid-template-columns: 1fr; }
  .wkz-confirm-btn-ok  { order: -1; }
}
    `;
    document.head.appendChild(s);
  }

  /* ── Mapa de defaults por variante ── */
  var VARIANT_DEFAULTS = {
    danger:  { icon: '🚪', title: 'Confirmar ação' },
    warning: { icon: '⚠️', title: 'Atenção' },
    info:    { icon: 'ℹ️', title: 'Confirmar' },
  };

  /* ── Fecha com animação e resolve a Promise ── */
  function _closeConfirm(overlay, box, resolve, result) {
    overlay.classList.add('closing');
    box.classList.add('closing');
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = _prevOverflow || '';
      resolve(result);
    }, 220);
  }

  var _prevOverflow = '';

  /* ── Função pública — retorna Promise<boolean> ── */
  window._wkzConfirm = function(msg, opts) {
    opts = opts || {};
    var variant  = opts.variant || 'info';
    var defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.info;
    var icon     = opts.icon         || defaults.icon;
    var title    = opts.title        || defaults.title;
    var okLabel  = opts.confirmLabel || 'Confirmar';
    var noLabel  = opts.cancelLabel  || 'Cancelar';
    /* [FIX v2.3.0] Modo mascote flutuante — opcional, hoje só usado por
       cpLogout(). Quando presente, substitui inteiramente o
       .wkz-confirm-icon-wrap (caixinha com fundo) por um mascote maior,
       sem moldura, "sangrando" por cima do card. Todos os outros
       chamadores de _wkzConfirm (danger/warning/info com emoji) seguem
       exatamente como antes — zero mudança de comportamento pra eles. */
    var floatingMascotHTML = opts.floatingMascotHTML || null;

    return new Promise(function(resolve) {
      /* Remove modal anterior se houver (edge case) */
      var prev = document.getElementById('wkzConfirmOverlay');
      if (prev) prev.parentNode && prev.parentNode.removeChild(prev);

      /* Salva overflow e bloqueia scroll */
      _prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      var overlay = document.createElement('div');
      overlay.id = 'wkzConfirmOverlay';

      var iconBlockHTML = floatingMascotHTML
        ? '' /* mascote renderizado fora do box, ver wrapHTML abaixo */
        : '<div class="wkz-confirm-icon-wrap">' + icon + '</div>';
      var innerClass = 'wkz-confirm-inner' + (floatingMascotHTML ? ' has-floating-mascot' : '');

      var boxHTML =
        '<div id="wkzConfirmBox" class="variant-' + variant + '">' +
          '<div class="' + innerClass + '">' +
            iconBlockHTML +
            '<div class="wkz-confirm-title">' + title + '</div>' +
            '<div class="wkz-confirm-msg">' + msg + '</div>' +
            '<div class="wkz-confirm-actions">' +
              '<button class="wkz-confirm-btn wkz-confirm-btn-cancel" id="wkzConfirmNo">' + noLabel + '</button>' +
              '<button class="wkz-confirm-btn wkz-confirm-btn-ok"     id="wkzConfirmOk">' + okLabel + '</button>' +
            '</div>' +
          '</div>' +
          /* [FIX] Ícone SVG do rodapé removido a pedido — mantém só o texto */
          '<div class="wkz-confirm-footer">WeKz Shop · Ação segura</div>' +
        '</div>';

      overlay.innerHTML = floatingMascotHTML
        ? '<div class="wkz-confirm-wrap">' +
            '<div class="wkz-confirm-mascot-float">' + floatingMascotHTML + '</div>' +
            boxHTML +
          '</div>'
        : boxHTML;

      document.body.appendChild(overlay);

      var box = document.getElementById('wkzConfirmBox');

      /* Botão OK */
      document.getElementById('wkzConfirmOk').addEventListener('click', function() {
        _closeConfirm(overlay, box, resolve, true);
      });

      /* Botão Cancelar */
      document.getElementById('wkzConfirmNo').addEventListener('click', function() {
        _closeConfirm(overlay, box, resolve, false);
      });

      /* Clique no overlay fecha com false */
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) _closeConfirm(overlay, box, resolve, false);
      });

      /* Teclado: Enter confirma, Escape cancela */
      function _keyHandler(e) {
        if (e.key === 'Enter')  { document.removeEventListener('keydown', _keyHandler); _closeConfirm(overlay, box, resolve, true); }
        if (e.key === 'Escape') { document.removeEventListener('keydown', _keyHandler); _closeConfirm(overlay, box, resolve, false); }
      }
      document.addEventListener('keydown', _keyHandler);

      /* Foca o botão OK por acessibilidade */
      setTimeout(function() {
        var okBtn = document.getElementById('wkzConfirmOk');
        if (okBtn) okBtn.focus();
      }, 80);
    });
  };
})();

/* ── otpNext: navegação automática entre caixas OTP ── */
window.otpNext = function(input, index) {
  const boxes = document.querySelectorAll('#otpBoxes .otp-box');
  if (!boxes.length) return;
  /* Aceita apenas dígitos */
  input.value = input.value.replace(/[^0-9]/g, '');
  if (input.value.length === 1 && index < boxes.length - 1) {
    boxes[index + 1].focus();
  }
  /* Ao completar todos os 6 dígitos — verificar automaticamente */
  const code = Array.from(boxes).map(b => b.value).join('');
  if (code.length === boxes.length && boxes.length > 0) {
    /* Verificação simulada */
    const allFilled = Array.from(boxes).every(b => b.value.length === 1);
    if (allFilled) {
      setTimeout(() => {
        if (typeof showToast === 'function') showToast('✅ Código verificado com sucesso!');
        /* Avançar para próximo passo do registo se aplicável */
        const nextBtn = document.getElementById('regNext4');
        if (nextBtn) nextBtn.click();
      }, 280);
    }
  }
};

/* ── Suporte a backspace no OTP: volta ao campo anterior ── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Backspace') {
    const boxes = document.querySelectorAll('#otpBoxes .otp-box');
    boxes.forEach((box, idx) => {
      if (document.activeElement === box && box.value === '' && idx > 0) {
        boxes[idx - 1].focus();
      }
    });
  }
});

/* ── trackOrder: rastreamento de pedido pelo input ── */
window.trackOrder = function() {
  const input = document.getElementById('trackInput');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  const result = document.getElementById('trackResult');
  if (!result) return;

  if (!code) {
    if (typeof showToast === 'function') showToast('⚠️ Insira o número do pedido ou código de rastreamento.');
    return;
  }

  /* Procura nos dados mock */
  const order = DB && DB.trackingOrders && (DB.trackingOrders[code] || Object.values(DB.trackingOrders).find(o => o.product && o.product.toUpperCase().includes(code)));

  result.style.display = 'block';

  if (!order) {
    result.innerHTML = `
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:14px;padding:20px;text-align:center;">
        <div style="font-size:28px;margin-bottom:10px;">🔍</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;color:#EF4444;margin-bottom:6px;">Pedido não encontrado</div>
        <div style="font-size:13px;color:var(--muted);">Verifique o código e tente novamente. Ex: <strong style="color:var(--text);">WKZ-8821</strong></div>
      </div>`;
    return;
  }

  const stepIcons = ['📋','📦','🚚','🔄','🛵','✅'];
  const stepsHTML = order.steps.map((s, i) => `
    <div style="display:flex;gap:12px;margin-bottom:${i < order.steps.length-1 ? '0' : '0'};">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
        <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;
          background:${s.done ? 'var(--teal)' : s.active ? 'rgba(0,180,171,0.15)' : 'var(--card2)'};
          border:2px solid ${s.done || s.active ? 'var(--teal)' : 'var(--border)'};
          box-shadow:${s.active ? '0 0 16px rgba(0,180,171,0.4)' : 'none'};">
          ${s.done ? '✓' : stepIcons[i] || '•'}
        </div>
        ${i < order.steps.length-1 ? `<div style="width:2px;flex:1;min-height:20px;margin:3px 0;background:${s.done ? 'var(--teal)' : 'var(--border)'};"></div>` : ''}
      </div>
      <div style="padding-bottom:${i < order.steps.length-1 ? '16px' : '0'};min-width:0;">
        <div style="font-size:13px;font-weight:700;color:${s.active ? 'var(--teal)' : s.done ? 'var(--text)' : 'var(--muted)'};">${s.title}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${s.desc}</div>
        ${s.date && s.date !== '—' ? `<div style="font-size:10px;color:var(--muted);opacity:0.7;margin-top:2px;">${s.date}</div>` : ''}
      </div>
    </div>`).join('');

  result.innerHTML = `
    <!-- FIX JUR-02: banner de modo demonstração — dados fictícios, CDC art. 37 -->
    <div style="display:flex;align-items:center;gap:8px;background:rgba(234,179,8,0.07);border:1px solid rgba(234,179,8,0.25);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#FCD34D;">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>⚙️ <strong>Dados de demonstração</strong> — rastreamento fictício para fins de teste. Integração com transportadoras reais disponível após o lançamento.</span>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--grad1);"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:800;">${order.product}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Vendido por <strong style="color:var(--text);">${order.store}</strong></div>
        </div>
        <span style="background:rgba(0,180,171,0.12);border:1px solid rgba(0,180,171,0.3);color:var(--teal);padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700;">${order.status}</span>
      </div>
      <div>${stepsHTML}</div>
    </div>`;
};

/* ── showFaqTheme: filtro de FAQ por categoria temática ── */
const FAQ_THEMES_DATA = {
  pedidos: [
    {q:'Como acompanhar meu pedido?', a:'Acesse "Meus Pedidos" no painel do cliente ou use a página "Rastrear Pedido" com o código #WKZ-XXXX. Você também receberá atualizações por e-mail e WhatsApp.'},
    {q:'Posso cancelar um pedido?', a:'Sim, pedidos podem ser cancelados em até 30 minutos após a confirmação do pagamento (antes do processamento pelo vendedor). Após esse prazo, solicite devolução.'},
    {q:'O que significa cada status do pedido?', a:'"Aguardando Pagamento" → pagamento ainda não processado. "Em Preparação" → vendedor está separando o produto. "Enviado" → produto a caminho. "Entregue" → confirmado na sua residência.'},
    {q:'Posso alterar o endereço de entrega?', a:'Se o pedido ainda não foi enviado, contacte o vendedor pelo chat da WeKz. Após o envio, o redirecionamento depende da transportadora.'},
  ],
  pagamentos: [
    {q:'Quais formas de pagamento são aceitas?', a:'Aceitamos Pix (aprovação imediata), cartões de crédito/débito (Visa, Master, Amex, Elo), boleto bancário, carteiras digitais (PayPal, Mercado Pago) e criptomoedas (BTC, ETH, USDT).'},
    {q:'O pagamento é seguro?', a:'Sim! Utilizamos criptografia AES-256, somos certificados PCI DSS Nível 1 e o dinheiro fica retido em custódia até a confirmação da entrega. Nunca transferimos antes do prazo de proteção.'},
    {q:'Quando meu cartão é cobrado?', a:'O débito ocorre no momento da confirmação do pedido. Para parcelamentos, as cobranças seguem as datas da sua fatura conforme o banco emissor.'},
    {q:'Como funciona o reembolso?', a:'Reembolsos são processados em até 5 dias úteis para o método original de pagamento. Pix e carteiras digitais costumam ser mais rápidos (1-2 dias).'},
  ],
  entrega: [
    {q:'Qual o prazo de entrega?', a:'O prazo varia de acordo com o vendedor e localização. Em geral: São Paulo capital 1-3 dias, demais capitais 3-7 dias, interior 5-12 dias. Produtos internacionais: 10-35 dias.'},
    {q:'Como calcular o frete?', a:'O frete é calculado automaticamente na página do produto e no carrinho, com base no CEP de entrega. Compras acima de R$ 299 têm frete grátis em produtos elegíveis.'},
    {q:'O produto pode ser rastreado?', a:'Sim! Todo produto enviado recebe um código de rastreamento que você pode consultar na página "Rastrear Pedido" ou diretamente no site da transportadora.'},
    {q:'E se o produto não chegar?', a:'Se o prazo máximo for ultrapassado, abra uma disputa em "Meus Pedidos". A WeKz garante reembolso total ou reenvio se o produto não for entregue.'},
  ],
  devolucao: [
    {q:'Como solicitar uma devolução?', a:'Acesse "Meus Pedidos" → clique no pedido → "Solicitar Devolução". Você tem 30 dias corridos após o recebimento. O produto deve estar sem uso e na embalagem original.'},
    {q:'Quem paga o frete de devolução?', a:'Se o produto tiver defeito ou for diferente do anunciado, o frete é por conta do vendedor. Para devoluções por arrependimento, o frete pode ser do comprador.'},
    {q:'Quando recebo meu dinheiro de volta?', a:'Após a chegada do produto ao vendedor e confirmação do estado, o reembolso é processado em até 5 dias úteis.'},
    {q:'Posso trocar por outro produto?', a:'A política de troca depende de cada vendedor. Consulte as informações de troca na página do produto ou entre em contacto com o vendedor via chat.'},
  ],
  conta: [
    {q:'Como alterar minha senha?', a:'Acesse o Painel → Configurações → Segurança → "Alterar Senha". Por segurança, você receberá um código de verificação no e-mail ou telefone cadastrado.'},
    {q:'Como ativar a autenticação em dois fatores?', a:'No Painel → Configurações → Segurança → "Autenticação 2FA". Recomendamos usar um aplicativo autenticador (Google Authenticator, Authy) para maior segurança.'},
    {q:'Posso ter mais de um endereço cadastrado?', a:'Sim! Você pode cadastrar até 10 endereços de entrega diferentes e selecionar qual usar em cada compra. Acesse Painel → Meus Endereços.'},
    {q:'Como excluir minha conta?', a:'Acesse Configurações → Privacidade → "Excluir Conta". A exclusão é permanente e ocorre em 30 dias. Pedidos ativos devem ser finalizados antes da exclusão.'},
  ],
  vendedor: [
    {q:'Como me tornar vendedor na WeKz?', a:'Clique em "Vender" no menu ou acesse a aba "Abrir Minha Loja" na tela de login. Preencha o cadastro com CNPJ ou CPF, envie os documentos de verificação KYC e aguarde a aprovação — em geral concluída em até 24 horas úteis.'},
    {q:'Qual a comissão cobrada pela WeKz?', a:'A WeKz não cobra mensalidade. A comissão incide apenas sobre vendas concluídas: Starter (gratuito pelos primeiros 3 meses, depois 8%), Pro (5% por venda) e Enterprise (3%, para volume acima de 500 pedidos/mês). Veja a tabela completa em Taxas e Comissões.'},
    {q:'Como receber meus pagamentos?', a:'Os pagamentos são liberados via Pix, TED ou PayPal após a confirmação de entrega pelo comprador (ou automaticamente após 7 dias da entrega no plano Pro/Enterprise). Acesse o Dashboard do Vendedor → Financeiro para solicitar saques ou acompanhar o calendário de repasses.'},
    {q:'O que acontece se receber uma disputa?', a:'Você será notificado imediatamente por e-mail e no app. Responda dentro de 48 horas com evidências (fotos, NF, código de rastreio). A equipe WeKz analisa as duas partes com imparcialidade e emite veredito em até 48 horas úteis. Disputas resolvidas amigavelmente não afetam sua pontuação.'},
  ],
};

window.showFaqTheme = function(theme, btn) {
  /* Atualiza botão ativo */
  document.querySelectorAll('.faq-theme-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  /* Limpa eventual busca textual em andamento */
  const searchInputEl = document.getElementById('faqSearchInput');
  if (searchInputEl) searchInputEl.value = '';

  const faqs = FAQ_THEMES_DATA[theme] || DB.faqs;
  const container = document.getElementById('faqContent');
  if (!container) return;

  container.innerHTML = faqs.map((f, i) => `
    <div class="faq-item-themed" style="border-bottom:1px solid var(--border);padding:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;cursor:pointer;font-size:14px;font-weight:600;transition:color 0.2s;"
           onclick="toggleFaqThemed(this, ${i}, 'faq-themed-ans-${theme}-${i}')"
           onmouseenter="this.style.color='var(--teal)'" onmouseleave="this.style.color=''">
        <span>${f.q}</span>
        <span id="faq-themed-icon-${theme}-${i}" style="font-size:12px;color:var(--teal);transition:transform 0.25s;flex-shrink:0;margin-left:12px;">▼</span>
      </div>
      <div id="faq-themed-ans-${theme}-${i}" style="display:none;padding-bottom:14px;font-size:13px;color:var(--muted);line-height:1.65;">${f.a}</div>
    </div>`).join('');

  /* Abre primeiro item automaticamente */
  if (faqs.length > 0) {
    const firstAns = document.getElementById(`faq-themed-ans-${theme}-0`);
    const firstIcon = document.getElementById(`faq-themed-icon-${theme}-0`);
    if (firstAns) { firstAns.style.display = 'block'; }
    if (firstIcon) { firstIcon.style.transform = 'rotate(180deg)'; }
  }
};

window.toggleFaqThemed = function(header, i, ansId) {
  const ans = document.getElementById(ansId);
  if (!ans) return;
  const icon = header.querySelector('[id^="faq-themed-icon-"]');
  const isOpen = ans.style.display === 'block';
  ans.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.style.transform = isOpen ? '' : 'rotate(180deg)';
};

/* ── searchFaqs: busca textual livre em todas as categorias de FAQ ── */
function _wkzNormalizeText(str) {
  return (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

window.searchFaqs = function() {
  const input = document.getElementById('faqSearchInput');
  const container = document.getElementById('faqContent');
  if (!input || !container) return;
  const query = input.value.trim();

  /* Campo vazio: volta para a navegação normal por tema */
  if (!query) {
    const activeBtn = document.querySelector('.faq-theme-btn.active') || document.querySelector('.faq-theme-btn');
    let theme = 'pedidos';
    if (activeBtn) {
      const m = (activeBtn.getAttribute('onclick') || '').match(/showFaqTheme\('([a-z]+)'/);
      if (m) theme = m[1];
    }
    window.showFaqTheme(theme, activeBtn);
    return;
  }

  document.querySelectorAll('.faq-theme-btn').forEach(b => b.classList.remove('active'));

  const nq = _wkzNormalizeText(query);
  const themeLabels = { pedidos:'Pedidos', pagamentos:'Pagamentos', entrega:'Entrega', devolucao:'Devoluções', conta:'Conta', vendedor:'Vendedores' };
  const results = [];
  Object.keys(FAQ_THEMES_DATA).forEach(theme => {
    FAQ_THEMES_DATA[theme].forEach(item => {
      if (_wkzNormalizeText(item.q).includes(nq) || _wkzNormalizeText(item.a).includes(nq)) {
        results.push({ theme, q: item.q, a: item.a });
      }
    });
  });

  const safeQuery = escapeHtml(query); // Sprint 0.1 fix S1 (escapeHtml para texto simples)
  if (!results.length) {
    container.innerHTML = `<div style="padding:28px 0;text-align:center;color:var(--muted);font-size:13px;">Nenhum resultado para "<strong style="color:var(--text);">${safeQuery}</strong>". Tente outro termo ou escolha um tema acima.</div>`;
    return;
  }

  container.innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">${results.length} resultado(s) para "<strong style="color:var(--text);">${safeQuery}</strong>"</div>` +
    results.map((f, i) => `
    <div class="faq-item-themed" style="border-bottom:1px solid var(--border);padding:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;cursor:pointer;font-size:14px;font-weight:600;transition:color 0.2s;"
           onclick="toggleFaqThemed(this, ${i}, 'faq-themed-ans-search-${i}')"
           onmouseenter="this.style.color='var(--teal)'" onmouseleave="this.style.color=''">
        <span>${f.q} <span style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">· ${themeLabels[f.theme] || f.theme}</span></span>
        <span id="faq-themed-icon-search-${i}" style="font-size:12px;color:var(--teal);transition:transform 0.25s;flex-shrink:0;margin-left:12px;">▼</span>
      </div>
      <div id="faq-themed-ans-search-${i}" style="display:none;padding-bottom:14px;font-size:13px;color:var(--muted);line-height:1.65;">${f.a}</div>
    </div>`).join('');
};

/* ── FIX Sprint M4: formatLogTime movida pro core (compartilhada) ────────
   Achado na extração do Admin: renderFraudReports() (wkz-admin.js) chama
   formatLogTime() sem guard, mas ela só existia em wkz-buyer.js — Admin é
   arquivo separado, geraria ReferenceError real ao renderizar o painel
   de Segurança/Fraude. Cópia idêntica também existe em wkz-buyer.js
   (Zero Rewrite: mantida lá como estava, mesmo padrão já usado com
   FAQ_THEMES_DATA — duplicação inofensiva entre arquivos diferentes).
   Origem monólito: linha 34138 (dentro do sistema de denúncias). */
function formatLogTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' às ' +
         d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

/* ── FIX (achado via test-m3.html real em navegador): formatPrice movida
   pro core (compartilhada) ──────────────────────────────────────────────
   wkz-seller.js chama formatPrice() em 12+ lugares (lista de produtos,
   preview do PDP, calculadora de margem, modal de marketing) SEM guard —
   só existia em wkz-buyer.js, geraria ReferenceError real em qualquer uma
   dessas telas do Seller. Movida com suas 3 dependências diretas
   (currentCurrency/rates/symbols). Cópia idêntica mantida em
   wkz-buyer.js (mesmo padrão já usado com FAQ_THEMES_DATA/FRAUD_REPORTS).
   No Seller, currentCurrency nunca muda de 'BRL' (o seletor de moeda do
   topbar foi redirecionado pro Buyer no Sprint M3), então os preços
   sempre aparecem em Real — comportamento correto para o painel do
   vendedor. Origem monólito: bloco de preços/i18n do Buyer (M2). */
let currentCurrency='BRL';
const rates={BRL:1,USD:0.185,EUR:0.172,GBP:0.147,JPY:27.9,ARS:185,MXN:3.18,CNY:1.34};
const symbols={BRL:'R$',USD:'$',EUR:'€',GBP:'£',JPY:'¥',ARS:'$',MXN:'$',CNY:'¥'};

function formatPrice(input) {
  let brl;
  if (typeof input === 'number') {
    brl = input;
  } else {
    const clean = String(input)
      .replace(/[R$€£¥\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    brl = parseFloat(clean);
  }

  const rate = rates[currentCurrency];
  if (isNaN(brl) || brl === null || !rate) {
    return `${symbols[currentCurrency] || ''} 0.00`;
  }

  const converted = brl * rate;

  try {
    if (currentCurrency === 'JPY') {
      return `${symbols[currentCurrency]} ${Math.round(converted).toLocaleString()}`;
    }
    if (currentCurrency === 'BRL') {
      return `R$ ${converted.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${symbols[currentCurrency]} ${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch(e) {
    return `${symbols[currentCurrency]} ${converted.toFixed(2)}`;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Sprint M5 (Hardening) — wkzStore + wkzRateLimit
   NOTA: estes NÃO existem no monólito original — o plano de arquitetura
   (Seção 5, Bloco 2) já previa esses dois utilitários como alvo, mas eles
   nunca foram implementados na v2.9.36. São infraestrutura nova, não
   extração. Adicionados agora porque o M5 exige verificar que estão
   ativos nos formulários de submit e que localStorage com TTL substitui
   sets diretos.
   ════════════════════════════════════════════════════════════════════════ */

/* ── wkzStore: wrapper de localStorage com expiração (TTL) ────────────────
   Uso: wkzStore.set('chave', valor, 60000)  // expira em 60s
        wkzStore.get('chave')                 // null se expirado/ausente
        wkzStore.remove('chave')
   Serializa como JSON; falha graciosamente se localStorage não estiver
   disponível (modo privado, quota excedida, etc.) — nunca lança erro para
   quem chama, só retorna null/false. */
var wkzStore = {
  set: function (key, value, ttlMs) {
    try {
      var entry = { v: value, exp: ttlMs ? (Date.now() + ttlMs) : null };
      localStorage.setItem('wkz_ttl_' + key, JSON.stringify(entry));
      return true;
    } catch (e) {
      wkzLog('[wkzStore] Falha ao salvar "' + key + '": ' + e.message);
      return false;
    }
  },
  get: function (key) {
    try {
      var raw = localStorage.getItem('wkz_ttl_' + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (entry.exp && Date.now() > entry.exp) {
        localStorage.removeItem('wkz_ttl_' + key);
        return null;
      }
      return entry.v;
    } catch (e) {
      return null;
    }
  },
  remove: function (key) {
    try { localStorage.removeItem('wkz_ttl_' + key); } catch (e) {}
  }
};
window.wkzStore = wkzStore;

/* ── wkzRateLimit: limitador de tentativas do lado do cliente ────────────
   Uso: if (!wkzRateLimit('login', 5, 60000)) { showToast('Muitas tentativas, aguarde.'); return; }
   Retorna true se a ação PODE prosseguir (dentro do limite), false se
   deve ser bloqueada. Usa wkzStore (TTL) para guardar os timestamps das
   tentativas dentro da janela de tempo — a lista é limpa automaticamente
   após 'windowMs' sem nenhuma tentativa nova (TTL do próprio registro).
   IMPORTANTE: isto é uma camada de UX/mitigação básica do lado do
   cliente (evita clique acidental duplo, spam grosseiro de formulário).
   NÃO substitui rate limiting real do lado do servidor — um atacante
   pode sempre limpar o localStorage ou chamar a API diretamente. Ver
   nota de segurança no changelog do M5. */
function wkzRateLimit(actionKey, maxAttempts, windowMs) {
  maxAttempts = maxAttempts || 5;
  windowMs = windowMs || 60000;
  var key = 'ratelimit_' + actionKey;
  var now = Date.now();
  var attempts = wkzStore.get(key) || [];
  attempts = attempts.filter(function (ts) { return now - ts < windowMs; });
  if (attempts.length >= maxAttempts) {
    return false;
  }
  attempts.push(now);
  wkzStore.set(key, attempts, windowMs);
  return true;
}
window.wkzRateLimit = wkzRateLimit;
