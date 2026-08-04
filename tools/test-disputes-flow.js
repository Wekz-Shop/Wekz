/* Teste funcional (não apenas "carrega sem erro") do fluxo de disputas
   comprador → vendedor → admin, usando o CÓDIGO REAL de wkz-core.js,
   wkz-seller.js e wkz-admin.js, com um DOM falso mínimo porém funcional
   (getElementById/querySelector/querySelectorAll reais) e uma
   localStorage falsa PARTILHADA entre as 3 "abas" simuladas — exatamente
   como elas se comunicam de verdade (localStorage + BroadcastChannel). */
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
  addEventListener() {}
  removeEventListener() {}
  closest() { return null; }
  insertAdjacentHTML() {}
  focus() {}
  click() {}
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
const buyerCtx  = makeContext(sharedLS, 'buyer');
const sellerCtx = makeContext(sharedLS, 'seller');
const adminCtx  = makeContext(sharedLS, 'admin');

[buyerCtx, sellerCtx, adminCtx].forEach(ctx => {
  loadFile(ctx, 'core/wkz-bus.js');
  loadFile(ctx, 'core/wkz-core.js');
});
loadFile(sellerCtx, 'seller/wkz-seller.js');
loadFile(adminCtx, 'admin/wkz-admin.js', 'window.__ADMIN_DISPUTES = ADMIN_DISPUTES;');

// Elemento que representa o painel "Disputas" do vendedor
const sellerList = sellerCtx._doc.createElement('div');
sellerCtx._doc._register('sellerDisputesList', sellerList);

// Elementos auxiliares que o admin.js espera existir na página (modal de chat etc.)
['disputaChatModal', 'disputasList', 'navBadgeDisputas', 'wkzPushNotif'].forEach(id => {
  adminCtx._doc._register(id, adminCtx._doc.createElement('div'));
});

// Liga o listener ao vivo do vendedor (equivalente ao bootstrap do wkz-seller.html)
sellerCtx.wkzLoadSharedDisputesForSeller();

// ─── 1) Comprador abre uma disputa ───
const created = buyerCtx.wkzShareNewDispute({
  orderId: '#WKZ-9042', productName: 'Smartphone Pro X 256GB Grafite',
  buyerName: 'Alexandre Kz', reason: 'Atraso na entrega além do prazo',
  dateStr: '03 ago 2026', valor: 'R$ 1.885,66', amountEUR: 329.99,
  description: 'TESTE DE FUNCIONAMENTO, COMPRADOR.', seller: 'Tecnologia Brasil'
});
assert(created.isNew === true, 'Comprador: 1ª disputa para #WKZ-9042 é criada como nova');

// dá tempo ao BroadcastChannel fake (setTimeout 0) entregar o 'dispute:opened'
function tick() { return new Promise(r => setTimeout(r, 5)); }

(async () => {
  await tick();

  // ─── 2) Vendedor deveria ter recebido a disputa (mesmo já estando montado ANTES da criação) ───
  const sharedAfterCreate = JSON.parse(sharedLS['kzDisputas_v1']);
  assert(sharedAfterCreate.length === 1, 'Storage: exactamente 1 disputa gravada em kzDisputas_v1 (não duplicou)');

  let card = sellerList.querySelector('[data-order-id="#WKZ-9042"]');
  assert(!!card, 'Vendedor: card da disputa #WKZ-9042 chegou ao painel (via WkzBus dispute:opened)');
  assert(card && card.getAttribute('data-dispute-status') === 'open', 'Vendedor: card está com status "open"');
  assert((card && card.innerHTML.indexOf('Atraso na entrega além do prazo') !== -1), 'Vendedor: motivo exibido é o mesmo que o comprador escolheu (não um motivo antigo/divergente)');

  // ─── 3) Comprador tenta abrir uma 2ª disputa para o MESMO pedido (era o bug relatado: duas entradas divergentes) ───
  const dup = buyerCtx.wkzFindSharedDispute('#WKZ-9042');
  assert(!!dup && dup.status !== 'resolved', 'Comprador: consegue detectar disputa já aberta para o mesmo pedido antes de reenviar (bloqueio de duplicata)');

  // ─── 4) Vendedor responde à disputa ───
  const updated1 = sellerCtx.wkzUpdateSharedDispute('#WKZ-9042', {
    status: 'answered',
    sellerReply: { position: 'contest', positionLabel: 'Contestação enviada', text: 'Produto foi enviado dentro do prazo.', time: '23:19' },
    timelineEvent: { date: 'Hoje 23:19', event: 'Vendedor respondeu: Contestação enviada' }
  });
  assert(updated1 && updated1.status === 'answered', 'Vendedor: resposta persistida no registo partilhado (status=answered)');

  await tick();

  card = sellerList.querySelector('[data-order-id="#WKZ-9042"]');
  assert(card && card.getAttribute('data-answered') === '1', 'Vendedor: o PRÓPRIO card se atualiza para "respondido" imediatamente (upsert, não duplica)');
  assert(sellerList.querySelectorAll('[data-order-id="#WKZ-9042"]').length === 1, 'Vendedor: ainda existe só 1 card para o pedido (sem duplicar ao atualizar)');

  // O admin (se tivesse a lista carregada) deveria ver a resposta do vendedor no chat
  adminCtx.wkzLoadSharedDisputesForAdmin();
  const adminEntry = adminCtx.__ADMIN_DISPUTES.find(d => d.id === '#WKZ-9042');
  assert(!!adminEntry, 'Admin: a disputa aparece na Central de Mediação');
  assert(!!adminEntry && adminEntry.msgs.some(m => m.who === 'seller'), 'Admin: a resposta do vendedor aparece no histórico/chat trilateral');

  // ─── 5) Admin resolve a favor do comprador ───
  adminCtx.admResolveDispute('#WKZ-9042', 'refund_buyer');
  await tick();

  const sharedAfterResolve = JSON.parse(sharedLS['kzDisputas_v1']).find(d => d.orderId === '#WKZ-9042');
  assert(!!sharedAfterResolve && sharedAfterResolve.status === 'resolved', 'Storage: resolução do admin foi PERSISTIDA em kzDisputas_v1 (sobrevive a reload)');
  assert(sharedAfterResolve && sharedAfterResolve.verdict === 'buyer', 'Storage: veredito gravado corretamente (buyer)');

  // Vendedor (aba ainda aberta) deveria refletir a resolução AO VIVO
  card = sellerList.querySelector('[data-order-id="#WKZ-9042"]');
  assert(card && card.getAttribute('data-dispute-status') === 'resolved', 'Vendedor: card mudou para "resolved" AO VIVO (WkzBus dispute:updated), sem precisar recarregar');
  assert(card && !!card.getAttribute('onclick') && card.getAttribute('onclick').indexOf('openDisputeDetailModal') !== -1, 'Vendedor: card resolvido oferece "Ver Detalhes" (openDisputeDetailModal)');

  // ─── 6) Comprador volta a "Meu Perfil" — simula um NOVO carregamento de página (nova aba/contexto) ───
  const buyerCtx2 = makeContext(sharedLS, 'buyer-reload');
  loadFile(buyerCtx2, 'core/wkz-bus.js');
  loadFile(buyerCtx2, 'core/wkz-core.js');
  buyerCtx2.wkzHydrateBuyerDisputes();

  // cpViewDisputeProduct() é a MESMA função usada pelo botão real "Ver
  // Produto/Detalhe" — ela chama _cpShowModal (privada), que cria um
  // overlay real no DOM com id passado em opts.id ('cpDisputeProductModal').
  // Inspecionamos esse elemento em vez de tentar interceptar a função
  // privada.
  buyerCtx2.window.cpViewDisputeProduct('#WKZ-9042');
  const modalEl = buyerCtx2._doc.getElementById('cpDisputeProductModal');
  assert(!!modalEl, 'Comprador (nova aba/reload): "Ver Produto/Detalhe" funciona para a disputa depois de reidratar (bug relatado #1 corrigido — não "sumiu")');
  const modalHtml = modalEl && modalEl.children[0] ? modalEl.children[0].innerHTML : '';
  assert(modalHtml.indexOf('Reembolso') !== -1 || modalHtml.toLowerCase().indexOf('reembolso') !== -1 || modalHtml.toLowerCase().indexOf('favor') !== -1,
    'Comprador (nova aba/reload): resultado da mediação do admin (reembolso ao comprador) aparece SEM precisar reabrir manualmente (bug relatado #4 corrigido)');
  assert(modalHtml.indexOf('Smartphone Pro X 256GB Grafite') !== -1,
    'Comprador (nova aba/reload): nome do produto aparece corretamente no modal (antes ficava undefined/vazio)');

  console.log('\n' + (fail === 0 ? '✅ TODOS OS TESTES FUNCIONAIS PASSARAM' : ('❌ ' + fail + ' TESTE(S) FALHARAM')) + ` (${pass} ok / ${fail} falhas)`);
  process.exit(fail === 0 ? 0 : 1);
})();
