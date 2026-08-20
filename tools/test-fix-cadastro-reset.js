const vm = require('vm');
const fs = require('fs');

// Mesmo harness (FakeElement com registro real por id) usado em
// test-fix-cadastro.js — necessário pra validar de verdade o que os
// render*() do "Meu Perfil" escrevem no DOM antes/depois do reset.
const registry = {};

class FakeClassList {
  constructor() { this._s = new Set(); }
  add(c) { this._s.add(c); }
  remove(c) { this._s.delete(c); }
  toggle(c, f) {
    if (f === true) { this._s.add(c); return true; }
    if (f === false) { this._s.delete(c); return false; }
    if (this._s.has(c)) { this._s.delete(c); return false; }
    this._s.add(c); return true;
  }
  contains(c) { return this._s.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.childNodes = []; this.children = [];
    this.style = { setProperty(){}, removeProperty(){}, getPropertyValue(){ return ''; } };
    this.dataset = {};
    this.classList = new FakeClassList();
    this._attrs = {};
    this.parentNode = null;
    this.value = '';
    this._id = ''; this._html = ''; this._text = '';
    this.checked = false;
    this.disabled = false;
    this.selectedOptions = [];
  }
  get id() { return this._id; }
  set id(v) { if (this._id && registry[this._id] === this) delete registry[this._id]; this._id = v; if (v) registry[v] = this; }
  setAttribute(k, v) { if (k === 'id') this.id = v; this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] || null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    var idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx === -1) { this.childNodes.push(c); this.children.push(c); }
    else { this.childNodes.splice(idx, 0, c); this.children.splice(idx, 0, c); }
    c.parentNode = this; return c;
  }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); if (this._id) delete registry[this._id]; }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener() {} removeEventListener() {}
  querySelector(sel) {
    if (sel && sel.startsWith('.')) {
      var cls = sel.slice(1);
      var found = Object.values(registry).find(function(el) { return el.classList && el.classList.contains(cls); });
      return found || null;
    }
    return null;
  }
  querySelectorAll() { return []; }
  set innerHTML(v) { this._html = v; this.childNodes = []; this.children = []; }
  get innerHTML() { return this._html || ''; }
  set textContent(v) { this._text = String(v); this._html = this._text; }
  get textContent() { return this._text; }
  focus() {} click() {} scrollIntoView() {} insertAdjacentHTML() {}
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
}

const fakeDocument = {
  readyState: 'complete',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  getElementById(id) { return registry[id] || null; },
  querySelector(sel) {
    if (sel && sel.startsWith('.')) {
      var wantActive = sel.indexOf('.active') !== -1;
      var cls = sel.slice(1).replace('.active', '');
      var found = Object.values(registry).find(function(el) {
        return el.classList && el.classList.contains(cls) && (!wantActive || el.classList.contains('active'));
      });
      return found || null;
    }
    return null;
  },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {}, removeEventListener() {},
};

class FakeBroadcastChannel { constructor() { this.onmessage = null; } postMessage() {} close() {} }
class FakeDOMParser { parseFromString() { const root = new FakeElement('body'); return { body: root, querySelectorAll: () => [] }; } }

const localStore = {};
const sandbox = {
  console,
  window: {},
  document: fakeDocument,
  navigator: { userAgent: 'node-test', clipboard: undefined },
  location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
  localStorage: {
    getItem: k => (k in localStore ? localStore[k] : null),
    setItem: (k, v) => { localStore[k] = String(v); },
    removeItem: k => { delete localStore[k]; },
  },
  sessionStorage: (function () { let s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, clear: () => { s = {}; } }; })(),
  BroadcastChannel: FakeBroadcastChannel,
  DOMParser: FakeDOMParser,
  Proxy,
  Node: { ELEMENT_NODE: 1 },
  setTimeout: (function () {
    var budget = 200;
    return function (fn) { if (budget-- <= 0) return 0; try { fn(); } catch (e) { console.log('setTimeout cb error: ' + e.message); } return 0; };
  })(),
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (fn) => { fn(); return 0; },
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
  innerWidth: 1000, innerHeight: 900,
  showToast: () => {},
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;

function makeEl(id, tag) { const el = new FakeElement(tag || 'div'); el.id = id; return el; }
[
  'cpUserName', 'cpUserEmail', 'cpHdrName', 'cpHdrAvatarInitial',
  'r1nome', 'r1sob', 'r1nick', 'r1email', 'r2doc', 'r3cep', 'phoneDDI', 'phoneNumberInput',
  'regCountry', 'r2lang', 'r2curr', 'termsCheck', 'dataTransferCheck', 'ageCheck',
  'reg-step1', 'reg-step2', 'reg-step3', 'reg-step4', 'reg-success', 'regSuccessProfileCta',
  'rs1', 'rs2', 'rs3', 'rs4',
  'regPassword', 'r1pw2', 'termsCheckQuick', 'dataTransferCheckQuick', 'ageCheckQuick',
].forEach(id => makeEl(id));
registry['cpUserName'].textContent = 'Alexandre Kz';
registry['cpUserEmail'].textContent = 'alexandre@wekzshop.com';
registry['cpHdrName'].textContent = 'Alexandre Kz';
registry['cpHdrAvatarInitial'].textContent = 'A';
registry['termsCheck'].checked = false;
registry['dataTransferCheck'].checked = false;
registry['ageCheck'].checked = false;

function setSelectValue(id, value, label) {
  var el = registry[id];
  el.value = value;
  el.selectedOptions = [{ textContent: label }];
}
setSelectValue('regCountry', 'BR', '🇧🇷 Brasil');
setSelectValue('r2lang', '🇧🇷 Português (Brasil)', '🇧🇷 Português (Brasil)');
setSelectValue('r2curr', '🇧🇷 BRL — Real Brasileiro', '🇧🇷 BRL — Real Brasileiro');

var loginTab = makeEl('__loginTab', 'div'); loginTab.classList.add('auth-tab'); loginTab.classList.add('active'); loginTab.textContent = 'Entrar';
var registerTab = makeEl('__registerTab', 'div'); registerTab.classList.add('auth-tab'); registerTab.textContent = 'Cadastrar';

vm.createContext(sandbox);
let failed = false;
function loadFile(path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try { vm.runInContext(code, sandbox, { filename: path }); console.log('✅ carregado: ' + label); }
  catch (e) { console.log('❌ ERRO ao carregar ' + label + ': ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); failed = true; }
}
loadFile('core/wkz-bus.js', 'wkz-bus.js');
loadFile('core/wkz-core.js', 'wkz-core.js');
loadFile('buyer/wkz-buyer.js', 'wkz-buyer.js');

// [Nota do harness] Estes elementos do "Meu Perfil" só são registados AGORA
// (depois dos 3 arquivos carregados) de propósito: existe um setTimeout
// pré-existente em wkz-core.js que auto-renderiza as Missões do Dia assim
// que #cpMissaoList existe no DOM — no navegador real isso nunca é um
// problema (os 3 <script> já terminaram de carregar bem antes de qualquer
// timeout dessa página disparar), mas o setTimeout síncrono deste mock
// dispararia ANTES de wkz-buyer.js (dono da função global t()) carregar,
// se estes ids já estivessem no registry durante o loadFile() de cima.
function makeEl2(id, tag) { const el = new FakeElement(tag || 'div'); el.id = id; return el; }
[
  'cpStatHeroOrders', 'cpStatHeroSaved', 'cpStatHeroPoints', 'cpStatHeroSince',
  'cpStatNego', 'cpCopilotSaved', 'cpCopilotMsg', 'cpStatPoints',
  'cpOrderList', 'cpPurchaseHistoryList', 'cpDisputeContainer', 'cpHistoryList',
  'cpWalletGrid', 'cpCouponList',
  'cpMissaoList', 'cpMissaoBarFill', 'cpMissaoPct', 'cpMissoesCard',
  'cpReferralActiveCount', 'cpReferralCreditsTotal', 'cpWalletCreditsStrip', 'cpWalletCreditsValue',
  'cpReferralRewardAmt1', 'cpReferralRewardAmt2', 'cpReferralRewardAmt3', 'cpReferralRewardAmt4',
  'cpReferralMinAmt1', 'cpReferralMinAmt2', 'cpReferralMinAmt3',
  'cpEditProgressLabel', 'cpEditProgressBar',
  'cpEditName', 'cpEditEmail', 'cpEditPhone', 'cpEditDoc', 'cpEditCep',
  'cpEditCountry', 'cpCountryLabel', 'cpEditLang', 'cpEditCurr',
].forEach(id => makeEl2(id));
// Simula os stats hero exatamente como o HTML real (hardcoded, persona
// "Alexandre") ANTES de qualquer cadastro rodar nesta sessão de teste.
registry['cpStatHeroOrders'].textContent = '12';
registry['cpStatHeroSaved'].textContent = 'R$ 242,86';
registry['cpStatHeroPoints'].textContent = '8.340';
registry['cpStatHeroSince'].textContent = 'Mar 2024';

function assert(cond, msg) { if (!cond) { console.log('❌ FALHOU: ' + msg); failed = true; } else { console.log('✅ ' + msg); } }

console.log('\n── Cenário: conta A se cadastra e GERA atividade real (compra, missão, indicação) ──');
(function () {
  registry['r1nome'].value = 'Alexandre';
  registry['r1sob'].value = 'Kz';
  registry['r1nick'].value = 'alexandre.kz';
  registry['r1email'].value = 'alexandre@teste.com';
  registry['r2doc'].value = '111.111.111-11';
  registry['phoneDDI'].textContent = '+55';
  registry['phoneNumberInput'].value = '11 90000-0001';
  registry['r3cep'].value = '01000-000';
  registry['termsCheck'].checked = true;
  registry['dataTransferCheck'].checked = true;
  registry['ageCheck'].checked = true;
  sandbox.finishRegister();

  // Simula uma compra real concluída (mesma chamada usada por ckoutNext())
  sandbox.window.cpRegisterNewPurchase({ id: 'WKZ-1001', name: 'Produto Teste A', qty: 1, amountBRL: 199.9 });
  // Simula pontos ganhos (mesmo caminho usado pelas Missões do Dia)
  var userPoints = vm.runInContext('userPoints', sandbox);
  userPoints.lifetime = 5000; userPoints.balance = 5000;
  // Simula indicação convertida
  sandbox.window.cpSimulateReferralConversion();

  assert(registry['cpOrderList'].innerHTML.indexOf('WKZ-1001') !== -1, 'pré-condição: pedido WKZ-1001 da conta A aparece no rastreador');
  assert(registry['cpPurchaseHistoryList'].innerHTML.length > 0, 'pré-condição: histórico de compras da conta A não está vazio');
  assert(registry['cpStatHeroOrders'].textContent === '1', 'pré-condição: contador "Pedidos" do hero passou a refletir a compra real (não mais o "12" fixo)');
  var ref = vm.runInContext('window.WKZ_REFERRAL_STATE', sandbox);
  assert(ref.creditsBRL > 0 && ref.activeReferrals > 0, 'pré-condição: créditos de indicação da conta A > 0');
})();

console.log('\n── Teste: [FIX-CADASTRO-03] conta B se cadastra em seguida (MESMA aba, sem reload) — perfil deve nascer zerado ──');
(function () {
  registry['r1nome'].value = 'Weslan';
  registry['r1sob'].value = '';
  registry['r1nick'].value = '';
  registry['r1email'].value = 'weslan06@gmail.com';
  registry['r2doc'].value = '';           // conta B NÃO informa CPF
  registry['phoneNumberInput'].value = ''; // conta B NÃO informa telefone
  registry['r3cep'].value = '';            // conta B NÃO informa CEP
  registry['termsCheck'].checked = true;
  registry['dataTransferCheck'].checked = true;
  registry['ageCheck'].checked = true;
  sandbox.finishRegister();

  assert(registry['cpUserName'].textContent === 'Weslan', 'nome da conta B aplicado corretamente');

  assert(registry['cpOrderList'].innerHTML.indexOf('WKZ-1001') === -1, 'rastreador de encomendas NÃO mostra mais o pedido da conta A');
  assert(registry['cpStatHeroOrders'].textContent === '0', '"Pedidos" volta a 0 pra conta nova (não herdou o pedido da conta A nem ficou nos "12" fixos)');
  assert(registry['cpStatHeroSaved'].textContent !== 'R$ 242,86', '"Economizado" não fica mais nos R$ 242,86 da conta A/demo: ' + registry['cpStatHeroSaved'].textContent);
  assert(/0,00$/.test(registry['cpStatHeroSaved'].textContent), '"Economizado" volta a um valor zerado pra conta nova: ' + registry['cpStatHeroSaved'].textContent);
  assert(registry['cpStatHeroSince'].textContent !== 'Mar 2024', '"Membro desde" não é mais o valor fixo da demo');
  var hoje = new Date();
  var mAbbr = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var esperado = mAbbr[hoje.getMonth()] + ' ' + hoje.getFullYear();
  assert(registry['cpStatHeroSince'].textContent === esperado, '"Membro desde" reflete a data real do cadastro: ' + registry['cpStatHeroSince'].textContent + ' (esperado ' + esperado + ')');

  var userPoints = vm.runInContext('userPoints', sandbox);
  assert(userPoints.lifetime === 0 && userPoints.balance === 0, 'pontos (userPoints) zerados pra conta nova — não herdou os 5.000 pts simulados da conta A: lifetime=' + userPoints.lifetime + ' balance=' + userPoints.balance);

  var ref = vm.runInContext('window.WKZ_REFERRAL_STATE', sandbox);
  assert(ref.creditsBRL === 0 && ref.activeReferrals === 0, 'créditos/indicações de indicação zerados pra conta nova');

  var extra = vm.runInContext('WKZ_PROFILE_EXTRA', sandbox);
  assert(extra.phone === '', 'telefone da conta B fica vazio (não herdou o +55 11 90000-0001 da conta A)');
  assert(extra.doc === '', 'CPF da conta B fica vazio (não herdou o 111.111.111-11 da conta A)');
  assert(extra.cep === '', 'CEP da conta B fica vazio (não herdou o 01000-000 da conta A)');

  var saved = JSON.parse(sandbox.localStorage.getItem('wkz_registered_profile'));
  assert(saved.extra && saved.extra.memberSince === esperado, '"Membro desde" da conta B também foi persistido em localStorage (sobrevive a reload)');
})();

console.log('\n── Teste: [FIX-CADASTRO-03] bônus de "+100 pts perfil completo" credita nos pontos REAIS (não mais texto fixo "8.440") ──');
(function () {
  // Preenche os campos que cpUpdateProfileCompletion() lê ao vivo do DOM,
  // simulando perfil 100% completo pra conta B (que começou 0/0 nesta sessão).
  registry['cpEditPhone'].value = '+55 21 98888-0000';
  registry['cpEditDoc'].value = '222.222.222-22';
  registry['cpEditCep'].value = '20000-000';
  registry['cpEditName'].value = 'Weslan';
  registry['cpEditEmail'].value = 'weslan06@gmail.com';
  registry['cpEditCountry'].value = 'BR';
  registry['cpCountryLabel'].textContent = '🇧🇷 Brasil';
  registry['cpEditLang'].value = '🇧🇷 Português (Brasil)';
  registry['cpEditCurr'].value = '🇧🇷 BRL — Real Brasileiro';
  vm.runInContext("WKZ_USER_INTERESTS.push('moda')", sandbox); // 4º item da checklist de completude

  var userPointsBefore = vm.runInContext('userPoints', sandbox);
  assert(userPointsBefore.lifetime === 0, 'pré-condição: conta B ainda com 0 pts antes de completar o perfil');

  sandbox.window.cpEditProfile();               // abre o modal (cria overlay #cpEditProfileModal)
  sandbox.window._cpHandleModalConfirm('cpEditProfileModal'); // clica "Guardar Alterações"

  var userPointsAfter = vm.runInContext('userPoints', sandbox);
  assert(userPointsAfter.lifetime === 100 && userPointsAfter.balance === 100,
    'perfil 100% completo credita +100 pts REAIS em userPoints (não mais o texto fixo "8.440"): lifetime=' + userPointsAfter.lifetime);

  var ptsEl = registry['cpStatHeroPoints'];
  assert(ptsEl.textContent !== '8.440', '#cpStatHeroPoints não mostra mais o valor fixo "8.440" da persona antiga: ' + ptsEl.textContent);

  var extraAfter = vm.runInContext('WKZ_PROFILE_EXTRA', sandbox);
  assert(extraAfter._bonusAwarded === true, 'flag de idempotência marcada — evita creditar de novo em próximos saves');

  // Salva de novo (perfil já completo) — não deve creditar +100 uma segunda vez
  sandbox.window.cpEditProfile();
  sandbox.window._cpHandleModalConfirm('cpEditProfileModal');
  var userPointsTwice = vm.runInContext('userPoints', sandbox);
  assert(userPointsTwice.lifetime === 100, 'salvar novamente com perfil já 100% completo NÃO credita +100 pts de novo (idempotente): lifetime=' + userPointsTwice.lifetime);
})();

console.log('\n' + (failed ? '❌ HÁ FALHAS — ver acima' : '✅ TODOS OS TESTES FUNCIONAIS PASSARAM'));
process.exitCode = failed ? 1 : 0;
