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

- CSS scoping por módulo (`wkz-styles-full.css` continua monolítico)
- CSP para Buyer/Seller/Legal (bloqueada pela mesma limitação de onclick inline)
- Auditoria de acessibilidade (ARIA, skip links, focus visible)
- Gaps documentados: aba Denúncias do Seller sem dados, `openGlobalShippingModal()`, markup morto do `#toast` V1
- Teste real em navegador (Playwright) — ainda sem acesso de rede neste ambiente
