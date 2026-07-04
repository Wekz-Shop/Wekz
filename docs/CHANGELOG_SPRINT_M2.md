# Sprint M2 — Buyer Core — Changelog

**Saída:** `buyer/wkz-buyer.html` + `buyer/wkz-buyer.js` + `legal/wkz-legal.html` + `shared/wkz-styles-full.css`

## ✅ O que foi extraído

**JS (`wkz-buyer.js`, 11.184 linhas, origem 19820–34165 do monólito, em 5 sub-etapas):**
- 2.1 Home/Catálogo + Carrinho + Wishlist + i18n
- 2.2 PDP + decoradores + Q&A + Cupons + Checkout/Devoluções
- 2.3 Busca/Frete/Categoria/Loja/Rastreio/Ajuda
- 2.4 Registro do Comprador
- 2.5 Sistema de Denúncias

**HTML (`wkz-buyer.html`, 23 páginas, origem linhas 11099–19377):**
`home, product, cart, checkout, auth (só login+registro), stores, wishlist, category, store-detail, tracking, help, client-profile, search, live, logistica-global` + 6 landings de compra (`pg-comprar*`, `pg-flash-info`, `pg-live-info`) + footer/overlays globais.

**Novo módulo `wkz-legal.html`** (não estava no plano original): 11 páginas institucionais/legais (Central de Ajuda, Disputas, Termos, LGPD, Antifraude, Garantia, WCAG etc.), com router próprio. Decisão de arquitetura: conteúdo compartilhado entre TODAS as personas em vez de duplicado em cada módulo (LGPD/CDC exige fonte única).

**`shared/wkz-styles-full.css`** (14.911 linhas): todo o CSS global consolidado em um arquivo único, carregado por todos os módulos. Decisão de escopo: CSS não foi fatiado por módulo nesta etapa (risco de quebra visual silenciosa sem navegador real disponível para validar); fatiar fica para o Sprint M5.

## 🔧 Bugs reais encontrados e corrigidos durante a extração

1. **`tick()` sem guard de nulo** — countdown da flash sale rodava em `setInterval` global e quebrava a cada segundo em qualquer página fora da Home. 3 dos 9 elementos não tinham o guard que os outros 6 já tinham. Corrigido para seguir o mesmo padrão.
2. **`switchAuthTab()` sem guard de nulo** — ao remover `#auth-seller` de `wkz-buyer.html` (virou navegação cross-file), a função quebraria até para trocar entre login/registro, porque iterava as 3 abas sem checar se o elemento existe. Corrigido.
3. **`showToast()` V1 duplicada e morta** (Patch 3) — removida; a V2 (com progress bar) já vive em `wkz-core.js`.

## 🧩 Achado de arquitetura: `openProduct()` não são duplicatas

O plano original (Patch 2) supunha 3 definições concorrentes de `openProduct()`. Na prática é uma **cadeia de decoradores funcional**: base (renderiza PDP) → KZ Price Alert Engine → KZ Comparator Engine, cada um capturando e chamando a versão anterior. Preservada intacta, sem consolidação — não era um bug.

## 🔗 Navegação cross-file (novo, não previsto no plano original)

Como o site virou multi-arquivo, links que antes eram `showPage('x')` (troca de div na mesma página) agora precisam virar `window.location.href='outro-modulo.html#x'` quando o destino mudou de arquivo:
- Em `wkz-buyer.html`: aba "Ser Vendedor" → `../seller/wkz-seller.html#auth-seller`; 16 links do footer → `wkz-legal.html` (11) e `wkz-seller.html` (5).
- Em `wkz-legal.html`: links para `home`, `client-profile`, `help`, `pg-comprar` → `wkz-buyer.html#...`.
- **`wkz-seller.html` ainda não existe** (Sprint M3) — esses links vão dar 404 até lá, exatamente como aconteceu com `wkz-buyer.html` no fechamento do M1. Fica registrado aqui para não ser uma surpresa de novo.
- `wkz-legal.html` e `wkz-buyer.html` leem `location.hash` no `DOMContentLoaded` para abrir a página certa quando chegam de outro módulo.

## ⚠️ Pendências / decisões que precisam de revisão futura

- **Sistema de denúncias** (`toggleDefesaForm`/`submitDefesa`, "defesa do vendedor") ficou inteiro em `wkz-buyer.js` por coesão de dados com `reportsStore`, mas parte dele (visualizar/gerenciar denúncias) pode pertencer ao Admin (M4) — revisar quando o Admin for extraído.
- O patch que integra a aba "denúncias" ao `switchDashTab()` do Seller Dashboard foi excluído daqui — fica para o M3 reconectar.
- `openGlobalShippingModal()` (3 linhas, `MapsTo('logistica-global')`) não foi extraído — gap pequeno, fácil de adicionar depois.
- CSS não fatiado por módulo (ver decisão acima) — `wkz-buyer.html`, `wkz-legal.html` e futuramente Seller/Admin carregam o mesmo arquivo `wkz-styles-full.css` inteiro.

## 🧪 Validação realizada nesta máquina (sem navegador real — sem acesso de rede)

- `node --check` em todos os arquivos JS: OK
- Harness Node (execução real via `vm`, DOM mockado): `wkz-bus.js` + `wkz-core.js` + `wkz-buyer.js` rodam de ponta a ponta sem erro, incluindo o bootstrap `renderAll()`
- Parser HTML nativo (Python `html.parser`) contra `wkz-buyer.html`: zero erros de fechamento de tag, pilha totalmente balanceada
- **Teste real em navegador (visual + funcional) ainda não feito** — fica para você, conforme combinado.
