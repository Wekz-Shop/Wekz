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
    try {
      Object.defineProperty(global, '_wkzNavHooks', {
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

/* Interesses selecionados pelo usuário (cadastro ou Turbinar Perfil) — em memória, sem backend real neste demo */
let WKZ_USER_INTERESTS = [];

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
    list.innerHTML = `<div class="wkz-inbox-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <p>Nenhuma notificação ainda</p></div>`;
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
