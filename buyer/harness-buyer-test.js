const vm = require('vm');
const fs = require('fs');
class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.childNodes = [];
    this.children = [];
    this.attributes = [];
    this.style = {};
    this.dataset = {};
    this.classList = { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
    this._attrs = {};
    this.parentNode = null;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] || null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c) { this.childNodes.unshift(c); this.children.unshift(c); c.parentNode = this; return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); return c; }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  focus() {}
  click() {}
  insertAdjacentHTML(pos, html) { /* no-op no mock — suficiente pra não travar */ }
}

const fakeDocument = {
  readyState: 'complete',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {},
  removeEventListener() {},
};

class FakeBroadcastChannel {
  constructor() { this.onmessage = null; }
  postMessage() {}
  close() {}
}

class FakeDOMParser {
  parseFromString(input) {
    const root = new FakeElement('body');
    return { body: root, querySelectorAll: () => [] };
  }
}

// Registro de todos os timers criados, para dar clearAll no final e o
// processo poder sair sem depender de process.exit() forçado.
const _timers = [];
function fakeSetTimeout(fn, ms) { const id = setTimeout(fn, ms); _timers.push(id); return id; }
function fakeSetInterval(fn, ms) { const id = setInterval(fn, ms); _timers.push(id); return id; }

const sandbox = {
  console,
  window: {},
  document: fakeDocument,
  navigator: { userAgent: 'node-harness', clipboard: undefined },
  location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
  localStorage: (function () {
    let store = {};
    return {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    };
  })(),
  BroadcastChannel: FakeBroadcastChannel,
  DOMParser: FakeDOMParser,
  Proxy,
  Node: { ELEMENT_NODE: 1 },
  setTimeout: fakeSetTimeout,
  clearTimeout,
  setInterval: fakeSetInterval,
  clearInterval,
  requestAnimationFrame: (fn) => fakeSetTimeout(fn, 0),
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class FakeMutationObserver { observe() {} disconnect() {} },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.addEventListener = function (evt, fn) {
  sandbox._winListeners = sandbox._winListeners || {};
  (sandbox._winListeners[evt] = sandbox._winListeners[evt] || []).push(fn);
};
sandbox.removeEventListener = function () {};
sandbox.dispatchEvent = function () { return true; };

vm.createContext(sandbox);
let hadError = false;
function loadFile(path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: path });
    console.log('✅ ' + label);
  } catch (e) {
    console.log('❌ ' + label + ' — ' + e.message);
    console.log(e.stack.split('\n').slice(0, 5).join('\n'));
    hadError = true;
  }
}
loadFile('core/wkz-bus.js', 'wkz-bus.js');
loadFile('core/wkz-core.js', 'wkz-core.js');
loadFile('buyer/wkz-buyer.js', 'wkz-buyer.js (arquivo final montado)');

/* ════════════════════════════════════════════════════════════════════
   REGRESSÃO I18N — cobre os 3 bugs reportados (troca de idioma não
   propagava para header/nav/footer/hero; categorias hardcoded em PT;
   botão "Meu Perfil" sem gancho de tradução).

   NOTA TÉCNICA: TRANSLATIONS/categories/CAT_I18N_MAP/currentLang são
   declarados com const/let no arquivo carregado — essas bindings NÃO
   ficam acessíveis como propriedade do sandbox (ex.: sandbox.TRANSLATIONS
   é undefined), só o objeto global (var/function declarations) fica.
   Por isso, os testes que precisam ler essas variáveis rodam como um
   script próprio dentro do MESMO contexto vm (vm.runInContext), que
   compartilha o ambiente léxico global com os arquivos já carregados.
   ════════════════════════════════════════════════════════════════════ */
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runI18nRegressionTests() {
  const results = [];
  function test(name, fn) {
    try { fn(); results.push(['✅', name]); }
    catch (e) { results.push(['❌', name + ' — ' + e.message]); hadError = true; }
  }

  // ── 1. wkzSelectLang/wkzSelectCurrency DEVEM chamar updateLang/updateCurrency
  //    diretamente (regressão do bug do dispatchEvent('change') sintético que
  //    nunca disparava applyTranslations() de fato). Função declarada com
  //    `function`, então fica acessível via sandbox normalmente. ────────────
  test('wkzSelectLang(code) chama updateLang(code) diretamente', () => {
    const orig = sandbox.updateLang;
    let calledWith = null;
    sandbox.updateLang = function (l) { calledWith = l; };
    try { sandbox.wkzSelectLang('zh'); } finally { sandbox.updateLang = orig; }
    assert(calledWith === 'zh', 'updateLang não foi chamado com o código esperado (recebeu: ' + calledWith + ')');
  });

  test('wkzSelectCurrency(code) chama updateCurrency(code) diretamente', () => {
    const orig = sandbox.updateCurrency;
    let calledWith = null;
    sandbox.updateCurrency = function (c) { calledWith = c; };
    try { sandbox.wkzSelectCurrency('EUR'); } finally { sandbox.updateCurrency = orig; }
    assert(calledWith === 'EUR', 'updateCurrency não foi chamado com o código esperado (recebeu: ' + calledWith + ')');
  });

  // ── 2/3/4. Testes que precisam ler TRANSLATIONS/categories/CAT_I18N_MAP —
  //    rodam como script dentro do próprio contexto vm (ver nota acima). ───
  const inContextProbe = `
    (function () {
      var out = { ok: true, failures: [] };
      function fail(msg) { out.ok = false; out.failures.push(msg); }

      // Paridade de chaves entre os 7 idiomas
      var ptKeys = Object.keys(TRANSLATIONS.pt);
      Object.keys(TRANSLATIONS).forEach(function (lang) {
        var keys = Object.keys(TRANSLATIONS[lang]);
        var missing = ptKeys.filter(function (k) { return !(k in TRANSLATIONS[lang]); });
        var extra = keys.filter(function (k) { return !(k in TRANSLATIONS.pt); });
        if (missing.length) fail(lang + ' está faltando chaves: ' + missing.join(', '));
        if (extra.length) fail(lang + ' tem chaves extras não presentes no PT: ' + extra.join(', '));
      });

      // Toda categoria precisa ter chave i18n mapeada e existente em PT
      var semChave = categories.filter(function (c) { return !CAT_I18N_MAP[c.n]; }).map(function (c) { return c.n; });
      if (semChave.length) fail('Categorias sem chave i18n: ' + semChave.join(', '));
      var semTraducao = categories.filter(function (c) { return !TRANSLATIONS.pt[CAT_I18N_MAP[c.n]]; }).map(function (c) { return c.n; });
      if (semTraducao.length) fail('Categorias cuja chave i18n não existe em TRANSLATIONS.pt: ' + semTraducao.join(', '));

      // myProfile em todos os idiomas
      var semMyProfile = Object.keys(TRANSLATIONS).filter(function (lang) { return !TRANSLATIONS[lang].myProfile; });
      if (semMyProfile.length) fail('myProfile ausente/vazio em: ' + semMyProfile.join(', '));

      return out;
    })()
  `;
  test('TRANSLATIONS: todos os idiomas têm exatamente as mesmas chaves do PT', () => {
    const out = vm.runInContext(inContextProbe, sandbox, { filename: 'i18n-probe.js' });
    assert(out.ok, out.failures.filter(f => f.indexOf('chaves') === 0 || /chaves/.test(f)).join(' | ') || 'falhas de paridade de chaves');
  });
  test('CAT_I18N_MAP cobre 100% das categorias de `categories`', () => {
    const out = vm.runInContext(inContextProbe, sandbox, { filename: 'i18n-probe.js' });
    const catFails = out.failures.filter(f => /[Cc]ategoria/.test(f));
    assert(catFails.length === 0, catFails.join(' | '));
  });
  test('TRANSLATIONS.*.myProfile existe em todos os idiomas', () => {
    const out = vm.runInContext(inContextProbe, sandbox, { filename: 'i18n-probe.js' });
    const mpFails = out.failures.filter(f => /myProfile/.test(f));
    assert(mpFails.length === 0, mpFails.join(' | '));
  });

  // ── 5. renderCats() precisa traduzir o nome da categoria via t() — troca
  //    currentLang para 'zh' DENTRO do contexto vm (assignment simples, não
  //    `let`/`const` novo, então atualiza a binding real já existente) e
  //    confirma que o HTML gerado usa a tradução zh, não o nome cru em PT. ─
  test('renderCats() traduz o nome da categoria via t()', () => {
    const fakeGrid = { innerHTML: '' };
    const origGetById = sandbox.document.getElementById;
    sandbox.document.getElementById = function (id) {
      if (id === 'catsGrid') return fakeGrid;
      return origGetById.call(this, id);
    };
    try {
      vm.runInContext("currentLang = 'zh';", sandbox, { filename: 'i18n-set-lang.js' });
      sandbox.renderCats();
      const zhElectronics = vm.runInContext('TRANSLATIONS.zh.catElectronics', sandbox, { filename: 'i18n-read.js' });
      assert(fakeGrid.innerHTML.includes(zhElectronics),
        'Grade de categorias não usou a tradução zh de "Eletrônicos" (' + zhElectronics + ')');
      // Nota: o onclick="filterCatKey('eletronicos','Eletrônicos',this)" mantém
      // o nome PT DE PROPÓSITO como identificador interno canônico (usado por
      // CAT_KEY_MAP/filtros em outros pontos do app) — só o texto EXIBIDO em
      // .cat-name precisa estar traduzido, por isso checamos essa tag específica.
      assert(!fakeGrid.innerHTML.includes('class="cat-name">Eletrônicos<'),
        'O texto exibido (.cat-name) ainda está hardcoded em PT ("Eletrônicos") mesmo com idioma zh ativo');
    } finally {
      sandbox.document.getElementById = origGetById;
      vm.runInContext("currentLang = 'pt';", sandbox, { filename: 'i18n-reset-lang.js' });
    }
  });

  console.log('\n── Regressão i18n ──');
  results.forEach(([icon, name]) => console.log(icon + ' ' + name));
}

if (!hadError) {
  try {
    runI18nRegressionTests();
  } catch (e) {
    console.log('❌ Falha ao rodar suíte de regressão i18n — ' + e.message);
    hadError = true;
  }
}

_timers.forEach(id => { clearTimeout(id); clearInterval(id); });
console.log(hadError ? '\n⚠️ HOUVE FALHAS' : '\n✅ wkz-buyer.js roda de ponta a ponta sem erro');
process.exitCode = hadError ? 1 : 0;
