# Sprint M5 — Hardening (Fase 1: Segurança) — Changelog

Primeira fase do M5, priorizada pelo Weslan: **Segurança (CSP/XSS/rate limiting)**.

## 🔴 Vulnerabilidade real encontrada e corrigida: XSS armazenado no chat de disputas do Admin

**Vetor:** `sendDisputaMsg()` (Admin) captura texto de um `<textarea>` sem nenhuma sanitização e empilha em `d.msgs`. `renderDisputaChat()` renderizava `${m.text}` direto via `innerHTML`, sem `escapeHtml()`.

**Impacto real:** qualquer comprador ou vendedor participando de uma disputa poderia digitar `<img src=x onerror="...">` (ou `<script>`) como mensagem. Quando o **Admin** abrisse essa disputa para mediar, o payload executaria na sessão dele — um comprador comum conseguiria rodar código arbitrário com privilégios de administrador.

**Fix:** `escapeHtml(m.text)` nas duas definições de `renderDisputaChat` (a base e o patch que adiciona suporte a imagem — o patch é quem efetivamente vale, por rodar depois). Também removi HTML embutido na mensagem de sistema "📎 Prova visual: `<em>${fname}</em>`" (linha 2086) — `fname` vem de `file.name`, também é entrada do usuário; com o escape agora universal, manter a tag só mostraria `<em>` literal.

**Avaliado e descartado como não-explorável agora:**
- Reviews de produtos (`reviews.map(...)` sem escape) — são dados mockados estáticos, sem fluxo de submissão real (`grep reviews.push` não encontrou nada). Ainda vale escapar quando um backend real existir.
- `openDisputeReplyModal(pedido, produto, comprador, motivo, data)` no Seller — os argumentos vêm de `onclick` com strings **literais fixas no HTML**, não de dado dinâmico. Não exploitável como está.
- Chat da Kz IA Copilot (Admin) — `admKzIaAddBubble()` também não escapa, mas é auto-XSS (só o próprio Admin digita e vê): sem fronteira de privilégio cruzada, risco desprezível.

## 🔒 CSP estrita aplicada no Admin (`wkz-admin.html`)

O próprio plano de arquitetura original já apontava: *"CSP real com `script-src 'self'` sem `'unsafe-inline'` é impraticável enquanto Admin e Buyer dividem o mesmo HTML com 1000+ onclick inline... Separando o Admin, você pode aplicar CSP estrita só nesse subdomínio."* Isso já foi feito no Sprint M4 (Admin isolado em arquivo próprio) — então apliquei agora:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none';
```

Confirmado antes de aplicar: nenhum script/CDN externo no arquivo (só `core/wkz-bus.js`, `core/wkz-core.js`, `wkz-admin.js`, ambos locais), nenhum uso de `eval()`/`new Function()` (que quebraria sem `'unsafe-eval'`).

**Limitação assumida conscientemente:** `'unsafe-inline'` continua necessário pros 71 `onclick` inline + estilos `style=""` do Admin. Removê-los por completo (convertendo pra `addEventListener` + classes CSS) é um refactor maior — arriscado de fazer sem regressão num módulo que acabei de validar ponta a ponta no M4. Mesmo assim, a CSP atual já bloqueia a classe de ataque mais comum de um XSS bem-sucedido (injetar `<script src="dominio-externo">`), além de plugins legados (`object-src 'none'`) e clickjacking (`frame-ancestors 'none'`).

**Buyer/Seller/Legal ainda sem CSP** — têm 460+221 onclick inline respectivamente, a mesma limitação que o plano original descreve para "o resto do app". Fica para uma fase dedicada do M5.

## 🆕 `wkzRateLimit()` + `wkzStore` implementados (nunca existiram)

O plano de arquitetura (Seção 5, Bloco 2) já previa esses dois utilitários desde o Sprint M1 — mas eles **nunca foram implementados no monólito v2.9.36** (confirmado por busca exaustiva na extração do M1). Não é extração, é infraestrutura nova:

- **`wkzStore.set/get/remove`** — wrapper de `localStorage` com expiração (TTL), falha graciosamente (nunca lança erro) se o storage não estiver disponível.
- **`wkzRateLimit(actionKey, maxAttempts, windowMs)`** — limitador client-side baseado em `wkzStore`, retorna `true`/`false` se a ação pode prosseguir.

**Conectado nos 3 pontos de maior risco:**
1. `doLogin()` (Buyer) — 5 tentativas/minuto
2. `sendBroadcast()` (Admin) — 3 a cada 5 min (o mais rígido: atinge toda a base de usuários)
3. `sendDisputaMsg()` (Admin) — 20/minuto (mais generoso, é chat legítimo)

**Nota de segurança honesta:** isto é mitigação client-side (UX contra clique duplo/spam grosseiro). Um atacante determinado pode sempre limpar o `localStorage` ou chamar a lógica diretamente — rate limiting real precisa ser do lado do servidor (quando o Supabase/backend entrar em cena, Seção 10 do plano). Documentado explicitamente no código, não é vendido como proteção definitiva.

## 🧪 Validação

- `node --check` limpo em `core/wkz-core.js`, `buyer/wkz-buyer.js`, `seller/wkz-seller.js`, `admin/wkz-admin.js`
- Harnesses M1-M4 rodando de ponta a ponta sem erro após todos os fixes
- Parser HTML sem erros em `wkz-admin.html` após a CSP

## ⏭️ Pendente pro resto do Sprint M5

- CSP para Buyer/Seller/Legal (bloqueada pela mesma limitação de onclick inline)
- Teste real em navegador (Playwright) — ainda sem acesso de rede neste ambiente

## Fase 3: CSS scoping por módulo

### Análise antes de qualquer corte

Extraí todas as classes usadas no HTML estático de cada módulo e cruzei:

| | Total de classes | Exclusivas do módulo |
|---|---|---|
| Buyer | 923 | 699 (76%) |
| Seller | 279 | 94 (34%) |
| **Admin** | **217** | **211 (97%)** |
| Legal | 122 | 38 (31%) |

**Admin é o único candidato seguro.** 97% das suas classes não aparecem em nenhum outro módulo — risco mínimo de "roubar" uma regra que Buyer/Seller/Legal precisam. Seller/Legal têm sobreposição substancial com Buyer (178 e 77 classes compartilhadas, respectivamente); fatiar esses exigiria validação visual real que não está disponível neste ambiente. **Só o Admin foi fatiado nesta fase.**

### Achado importante durante a extração: análise de HTML estático não bastava

A maior parte da UI real do Admin (cards de disputa, revisão de KYC, aprovação de loja, saques) é **renderizada dinamicamente via JS** (`renderDisputas()`, `renderAdminKyc()`, etc.), não existe como HTML estático. Uma primeira extração baseada só nas classes do HTML estático teria deixado ~90 classes de fora (praticamente toda a UI de cartões/disputas/KYC) — descoberto e corrigido antes de finalizar, cruzando também os literais `class="..."` dentro das template strings do JS.

Também descobri e adicionei separadamente (não capturado pela extração por seletor `.classe`/`#id`):
- 12 blocos `@keyframes` (animações usadas via `animation:` mas não referenciadas como seletor)
- Sistema base `.page`/`.page.active` (visibilidade de página) + `.wkz-input`/`.wkz-select` (inputs/selects) — Admin precisa mesmo só tendo uma página própria
- `.btn-primary` e `.order-status`/`.status-paid` — genuinamente compartilhados com o Seller, duplicados aqui em segurança (mesmo padrão de `FRAUD_REPORTS`/`formatLogTime` no core)

### Resultado

`admin/wkz-admin-styles.css` criado (2.643 linhas, ~18% do tamanho do arquivo completo). `admin/wkz-admin.html` agora carrega esse arquivo em vez de `shared/wkz-styles-full.css`. **`shared/wkz-styles-full.css` não foi alterado** — Buyer/Seller/Legal continuam usando ele exatamente como antes; esta foi uma adição pura, sem remoção, então o "pior caso" de qualquer erro fica isolado ao Admin.

### 🧪 Validação

- Balanceamento de chaves `{}`: 651/651
- Parser HTML: zero erros em `wkz-admin.html` após a troca
- Nenhum `url()` com caminho relativo que quebraria pela nova localização do arquivo (só uma `data:image/svg+xml` inline)
- Harness Node: `wkz-admin.js` continua rodando de ponta a ponta sem erro (CSS não afeta isso, mas confirma que nada mais quebrou)
- **Validação visual real ainda pendente** — esta é a fase de maior risco do M5 por não ter navegador disponível aqui; recomendo testar com atenção especial: abas do dashboard, modais (disputa/saque/KYC/etiqueta), cards renderizados dinamicamente.

## Fase 2: Gaps documentados + Acessibilidade

### Gaps fechados

1. **`openGlobalShippingModal()`** — chamada pelo hero-card "Logística Global" da Home desde o M2, mas a função nunca tinha sido movida pro JS (só o `onclick` existia). Adicionada (3 linhas, só navega pra página já extraída). Confirmado via grep que `openGlobalShippingModalLegacy()` nunca é chamada em lugar nenhum do monólito — código morto real, não extraída.

2. **Markup morto do `#toast` V1** removido de `wkz-buyer.html` — confirmado sem nenhuma referência real em JS (`showToast` V2 cria seu próprio elemento `#wkz-toast-v2` dinamicamente).

3. **Aba "Denúncias" do Seller sem dados** — reavaliado, decisão mantida (não fabricar). Confirmei que `reportsStore` (Buyer) e `ADMIN_REPORTS` (Admin) são estruturas de dados genuinamente diferentes (uma é ticket individual do comprador, outra é fila agregada de moderação) — não são duplicatas que dá pra simplesmente consolidar. Busquei no monólito por uma terceira estrutura "visão do vendedor sobre denúncias" e **não existe** — inventar uma agora seria fabricação, o mesmo erro da primeira tentativa descartada do M4. Fica como limitação arquitetural documentada até existir um backend real.

### 🐛 Bug real de acessibilidade encontrado e corrigido: skip link quebrado em 3 dos 4 módulos

O mecanismo de skip-link (`initSkipLink()`, extraído corretamente no M1) cria um link `<a href="#main-content">Ir para o conteúdo principal</a>` no topo da página — mas seu fallback (para quando `#main-content` não existe) procurava especificamente por `#page-home`, que **só existe no Buyer**. Resultado: em Seller, Admin e Legal, o skip link aparecia visualmente (ao dar Tab) mas **não levava a lugar nenhum** — uma barreira real de acessibilidade pra quem navega só por teclado, justamente nos módulos que mais precisam (Admin lida com disputas/saques/KYC).

**Fix:** adicionado `id="main-content"` diretamente no `<main>` de Buyer/Seller/Admin, e no `<body>` do Legal (que não tem `<main>`). Zero dependência do fallback específico do Buyer.

### ✅ Confirmado já correto (nenhuma ação necessária)

- `:focus-visible` universal (não escopado a classes específicas), com outline teal 2px + offset — já cobre todo elemento focável nos 4 módulos, extraído corretamente no M1.
- `@media (prefers-reduced-motion: reduce)` já respeita a preferência do sistema.
- Skip-link em si (a criação do link, não o alvo) já funcionava nos 4 módulos via `wkzMaintenanceInit()`.

## 🧪 Validação

- `node --check` limpo nos 5 arquivos tocados nesta fase
- Harnesses M1-M4 rodando de ponta a ponta sem erro
- Parser HTML sem erros nos 4 módulos (`buyer`, `seller`, `admin`, `legal`)

