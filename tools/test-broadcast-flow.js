/* Teste funcional (não apenas "carrega sem erro") da entrega de
   Comunicados (admin → comprador/vendedor), usando o CÓDIGO REAL de
   wkz-core.js e wkz-admin.js, com um DOM falso mínimo porém funcional
   e uma localStorage falsa PARTILHADA entre as abas simuladas — exatamente
   como elas se comunicam de verdade (localStorage + BroadcastChannel).
   Cobre o bug real encontrado: sendBroadcast() nunca entregava nada às
   outras abas (ver FIX-comunicados v1.0 em wkz-core.js/wkz-admin.js). */
const vm = require('vm');
const fs = require('fs');

/* ── DOM mínimo, porém real o suficiente para suportar os seletores
   usados no código: #id, [attr="val"], :not([attr="val"]) ── */
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
    this.dataset = new Proxy({}, {
      set: (t, k, v) => { t[k] = v; this._attrs['data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())] = v; return true; },
      get: (t, k) => t[k]
    });
    this._html = '';
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = v; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  get firstChild() { return this.children[0] || null; }
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html; }
  set onclick(fn) { this._attrs['onclick'] = '[fn]'; this.__onclick = fn; }
  addEventListener(type, fn) { (this._listeners = this._listeners || {})[type] = (this._listeners[type] || []).concat(fn); }
  removeEventListener(type, fn) { if (this._listeners && this._listeners[type]) this._listeners[type] = this._listeners[type].filter(f => f !== fn); }
  click() { (this._listeners && this._listeners.click || []).forEach(fn => fn({ target: this })); }
  focus() {}
  closest() { return null; }
  insertAdjacentHTML() {}
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(other) { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i !== -1) this.parentNode.children[i] = other; other.parentNode = this.parentNode; } }

  _matches(sel) {
    // suporta: [attr="val"], [attr="val"]:not([attr2="val2"]), #id
    const notMatch = sel.match(/^(.*?):not\((.*)\)$/);
    if (notMatch) {
      const [, base, negSel] = notMatch;
      return this._matchesSimple(base) && !this._matchesSimple(negSel);
    }
    return this._matchesSimple(sel);
  }
  _matchesSimple(sel) {
    if (sel.startsWith('#')) return this._attrs.id === sel.slice(1);
    const m = sel.match(/^\[([\w-]+)="([^"]*)"\]$/);
    if (m) return this.getAttribute(m[1]) === m[2];
    return false;
  }
  _walk(cb) { cb(this); this.children.forEach(c => c._walk(cb)); }
  querySelector(sel) {
    let found = null;
    this._walk(el => { if (!found && el !== this && el._matches(sel)) found = el; });
    return found;
  }
  querySelectorAll(sel) {
    const out = [];
    this._walk(el => { if (el !== this && el._matches(sel)) out.push(el); });
    return out;
  }
}

function makeDocument() {
  const registry = {};
  const root = new El('body');
  const origSetAttr = El.prototype.setAttribute;
  return {
    _root: root,
    getElementById(id) { return registry[id] || root.querySelector('#' + id); },
    createElement(tag) { return new El(tag); },
    querySelector(sel) { return root.querySelector(sel); },
    querySelectorAll(sel) { return root.querySelectorAll(sel); },
    addEventListener() {}, removeEventListener() {},
    body: root, head: new El('head'), documentElement: new El('html'),
    readyState: 'complete',
    _register(id, el) { el.setAttribute('id', id); registry[id] = el; },
  };
}

function makeLocalStorage(shared) {
  return {
    getItem: k => (k in shared ? shared[k] : null),
    setItem: (k, v) => { shared[k] = String(v); },
    removeItem: k => { delete shared[k]; },
  };
}

/* BroadcastChannel falso mas REAL o suficiente para entregar mensagens
   entre "abas" (contexts) diferentes — mantém uma lista global de
   listeners por nome de canal, tal como o navegador faz entre tabs. */
const _bcChannels = {};
class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    _bcChannels[name] = _bcChannels[name] || [];
    _bcChannels[name].push(this);
  }
  postMessage(msg) {
    (_bcChannels[this.name] || []).forEach(ch => {
      if (ch !== this && typeof ch.onmessage === 'function') {
        setTimeout(() => ch.onmessage({ data: msg }), 0);
      }
    });
  }
  close() { _bcChannels[this.name] = (_bcChannels[this.name] || []).filter(c => c !== this); }
}

function makeContext(sharedLS, label) {
  const doc = makeDocument();
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: (...a) => console.error('[' + label + ']', ...a) },
    window: null, document: doc, localStorage: makeLocalStorage(sharedLS),
    BroadcastChannel: FakeBroadcastChannel,
    navigator: { language: 'pt-PT', userAgent: 'node-test' },
    location: { href: 'https://wekz-shop.test/' + label, hostname: 'wekz-shop.test', search: '', pathname: '/' + label },
    setTimeout, clearTimeout, setInterval, clearInterval,
    DOMParser: function () { this.parseFromString = () => ({ body: new El('body'), querySelector: () => null }); },
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    requestAnimationFrame: cb => setTimeout(cb, 0),
    matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
    showToast: (msg) => { sandbox.__toasts.push(msg); },
    __toasts: [],
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    MutationObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox._doc = doc;
  return sandbox;
}

function loadFile(ctx, path, exposeCode) {
  // `const`/`let` de topo-de-ficheiro não viram propriedades do objeto
  // global do vm (só `var`/funções viram) — para inspecionar coisas como
  // `const ADMIN_DISPUTES = [...]` a partir de fora, anexamos uma linha
  // de exposição e rodamos tudo como UM único script (mesmo escopo).
  const code = fs.readFileSync(path, 'utf8') + (exposeCode ? ('\n' + exposeCode) : '');
  vm.runInContext(code, ctx, { filename: path });
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('✅ ' + msg); }
  else { fail++; console.log('❌ ' + msg); }
}

// ─── Monta as 3 "abas" partilhando a MESMA localStorage ───
const sharedLS = {};
const adminCtx  = makeContext(sharedLS, 'admin');
const buyerCtx  = makeContext(sharedLS, 'buyer');   // já aberta ANTES do envio → deve receber AO VIVO

[adminCtx, buyerCtx].forEach(ctx => {
  loadFile(ctx, 'core/wkz-bus.js');
  loadFile(ctx, 'core/wkz-core.js');
});
loadFile(adminCtx, 'admin/wkz-admin.js', 'window.__COMM_HISTORY = COMM_HISTORY;');

// Comprador já com a aba aberta ANTES do envio — equivalente ao bootstrap
// real em wkz-buyer.html, que chama isto no DOMContentLoaded.
buyerCtx.window.wkzSyncBroadcastsForRole('buyer');

// Elementos que o composer do admin espera existir na página
['commTitle', 'commBody', 'commChars', 'prevTitle', 'prevMsg', 'commHistory'].forEach(id => {
  const tag = id === 'commTitle' ? 'input' : (id === 'commBody' ? 'textarea' : 'div');
  adminCtx._doc._register(id, adminCtx._doc.createElement(tag));
});
// Botões de audiência (setAudience já testado à parte — aqui simulamos "Todos" ativo)
const audAllBtn = adminCtx._doc.createElement('button');
audAllBtn.setAttribute('id', 'audAll');
audAllBtn.classList.add = () => { audAllBtn._active = true; };
audAllBtn.className = 'adm-aud-btn active';
audAllBtn.textContent = 'Todos (318K)';
audAllBtn.innerHTML = 'Todos (318K)';
adminCtx._doc._register('audAll', audAllBtn);
adminCtx._doc._root.appendChild(audAllBtn);
adminCtx._doc.querySelector = (sel) => (sel === '.adm-aud-btn.active' ? audAllBtn : adminCtx._doc._root.querySelector(sel));

// Canais: Push ligado, Email/Banner desligados (default do composer real)
['chPush'].forEach(id => { const el = adminCtx._doc.createElement('input'); el.checked = true; adminCtx._doc._register(id, el); });
['chEmail', 'chBanner'].forEach(id => { const el = adminCtx._doc.createElement('input'); el.checked = false; adminCtx._doc._register(id, el); });

// wkzRateLimit precisa existir e liberar (é definida em outro patch do core.js — se não existir, o teste segue sem bloquear)
if (typeof adminCtx.wkzRateLimit !== 'function') adminCtx.window.wkzRateLimit = () => true;

// Elementos de UI de notificação que precisam existir na página do
// comprador (e do vendedor, quando aplicável) para wkzDeliverBroadcast
// conseguir realmente exibir push/banner/inbox — em produção já existem
// no HTML de wkz-buyer.html / wkz-seller.html.
[buyerCtx].forEach(ctx => {
  ['wkzPushNotif', 'wkzAlertBar', 'wkzHeroBanner', 'wkzInboxList', 'page-home'].forEach(id => {
    const el = ctx._doc.createElement('div');
    ctx._doc._register(id, el);
  });
});

// Stub do modal de confirmação: em produção é um clique real do gestor no
// botão "Enviar"; aqui simulamos a confirmação diretamente, já que o que
// queremos validar é a ENTREGA do comunicado, não o modal em si (que já é
// usado e testado em outros pontos do app — ver Config → Modo manutenção).
adminCtx.window._wkzConfirm = () => Promise.resolve(true);

function tick(ms) { return new Promise(r => setTimeout(r, ms || 5)); }

(async () => {
  // ─── 1) Admin escreve e envia um comunicado para "Todos" ───
  adminCtx._doc.getElementById('commTitle').value = 'Manutenção programada — 10/08 às 02h';
  adminCtx._doc.getElementById('commBody').value  = 'Plataforma ficará indisponível por 1h para manutenção.';

  adminCtx.sendBroadcast();
  await tick(20);        // aguarda o _wkzConfirm (stub) resolver
  await tick(1300);      // aguarda o setTimeout de 1200ms que simula o envio

  // ─── 2) Foi persistido no registo partilhado? (bug real: antes NADA saía da aba do admin) ───
  let shared;
  try { shared = JSON.parse(sharedLS['kzComunicados_v1']); } catch (e) { shared = null; }
  assert(!!shared && shared.length === 1, 'Storage: comunicado foi gravado em kzComunicados_v1 (fonte de verdade partilhada)');
  assert(shared && shared[0].audience === 'all', 'Storage: audiência gravada com chave estável ("all"), não só o texto do botão');
  assert(shared && shared[0].title === 'Manutenção programada — 10/08 às 02h', 'Storage: título gravado corretamente');

  // ─── 3) Comprador com a aba JÁ ABERTA deveria ter recebido AO VIVO (WkzBus) ───
  await tick(10);
  const buyerInboxAfterLive = buyerCtx._doc.getElementById('wkzInboxList');
  // wkzDeliverBroadcast() chama wkzAddToInbox, que por sua vez chama wkzRenderInbox() —
  // sem #wkzInboxList registado o teste só confirma via card de push/banner abaixo.
  const pushContainer = buyerCtx._doc.getElementById('wkzPushNotif');
  assert(!!pushContainer && pushContainer.children.length > 0, 'Comprador (aba já aberta): recebeu o card de push AO VIVO no momento do envio (bug real corrigido — antes o hook nunca disparava)');
  const pushHtml = pushContainer && pushContainer.children[0] ? pushContainer.children[0].innerHTML : '';
  assert(pushHtml.indexOf('Manutenção programada') !== -1, 'Comprador (aba já aberta): o push mostra o título correto do comunicado');

  const alertBar = buyerCtx._doc.getElementById('wkzAlertBar');
  assert(!!alertBar && alertBar.innerHTML.indexOf('Manutenção programada') !== -1, 'Comprador (aba já aberta): a barra de alerta no topo também foi acionada');

  // ─── 4) Vendedor abre a aba DEPOIS do envio (hidratação, não ao vivo) ───
  const sellerCtx = makeContext(sharedLS, 'seller-late');
  loadFile(sellerCtx, 'core/wkz-bus.js');
  loadFile(sellerCtx, 'core/wkz-core.js');
  sellerCtx.window.wkzSyncBroadcastsForRole('seller');
  const sellerInbox = sellerCtx.__WKZ_NOTIF_INBOX = (() => { try { return sellerCtx.window.WKZ_NOTIF; } catch (e) { return null; } })();
  // WKZ_NOTIF é `const` de topo — expõe via segunda execução no MESMO contexto
  const sellerHasEntry = (() => {
    try {
      const raw = require('vm').runInContext('JSON.stringify(WKZ_NOTIF.inbox)', sellerCtx);
      return JSON.parse(raw).some(n => n.title === 'Manutenção programada — 10/08 às 02h');
    } catch (e) { return false; }
  })();
  assert(sellerHasEntry, 'Vendedor (abriu a aba DEPOIS do envio): comunicado "Todos" entra na caixa de entrada ao carregar (hidratação a partir do storage partilhado)');

  // ─── 5) Comunicado só para "Vendedores" NÃO deve poluir a caixa de um comprador ───
  adminCtx.window._wkzConfirm = () => Promise.resolve(true);
  const audSellersBtn = adminCtx._doc.createElement('button');
  audSellersBtn.setAttribute('id', 'audSellers');
  audSellersBtn.className = 'adm-aud-btn active';
  audSellersBtn.textContent = 'Vendedores (12,8K)';
  adminCtx._doc._register('audSellers', audSellersBtn);
  audAllBtn.className = 'adm-aud-btn'; // desativa "Todos"
  adminCtx._doc.querySelector = (sel) => (sel === '.adm-aud-btn.active' ? audSellersBtn : adminCtx._doc._root.querySelector(sel));

  adminCtx._doc.getElementById('commTitle').value = 'Novas regras de CNPJ a partir de setembro';
  adminCtx._doc.getElementById('commBody').value  = 'Todos os vendedores devem revalidar o CNPJ até 01/09.';
  adminCtx.sendBroadcast();
  await tick(20);
  await tick(1300);

  const buyerPushCountBefore = buyerCtx._doc.getElementById('wkzPushNotif').children.length;
  await tick(10);
  const buyerHasSellerOnlyMsg = buyerCtx._doc.getElementById('wkzPushNotif').innerHTML.indexOf('Novas regras de CNPJ') !== -1
    || buyerCtx._doc.getElementById('wkzAlertBar').innerHTML.indexOf('Novas regras de CNPJ') !== -1;
  assert(!buyerHasSellerOnlyMsg, 'Segmentação: comunicado endereçado só a "Vendedores" NÃO é entregue na aba do comprador');

  console.log('\n' + (fail === 0 ? '✅ TODOS OS TESTES FUNCIONAIS PASSARAM' : ('❌ ' + fail + ' TESTE(S) FALHARAM')) + ` (${pass} ok / ${fail} falhas)`);
  process.exit(fail === 0 ? 0 : 1);
})();
