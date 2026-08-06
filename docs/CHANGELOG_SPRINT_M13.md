# Sprint M13 — Emojis nativos → Ícones SVG (Meu Perfil + Painel do Vendedor)

Arquivos alterados: `wkz-core.js`, `wkz-form-select.js`, `wkz-buyer.html`, `wkz-buyer.js`,
`wkz-seller.html`, `wkz-seller.js`.
Arquivo novo (teste, não faz parte do produto): `tools/test-form-select-icons.js`.

## Pedido

Substituir todos os emojis nativos por ícones SVG em "Meu Perfil" (comprador) e no
Painel do Vendedor, de forma cirúrgica (por etapas, sem quebrar nada que já funciona).

## Metodologia

Auditoria automática por arquivo: contagem de todo caractere na faixa Unicode de
emojis, com 3 exceções deliberadas (mantidas como estavam):

1. **Símbolos tipográficos** (→ ← ↑ ↓ ↕ ↔ ↩ ✓ ✕ ✗ ★ ☆) — não são "emoji nativos"
   coloridos; renderizam como glifo simples e uniforme em qualquer fonte, exatamente
   como um ícone já renderizaria. Trocá-los teria custo sem benefício visual real.
2. **Bandeiras de país** (🇧🇷🇺🇸🇵🇹 etc., no seletor de idioma/país) — são
   identificadores funcionais (dizem QUAL país/idioma), não decoração.
3. **O seletor de emoji do produto** (`wkz-seller.js`, function `addProdGoStep`/
   array `emojis` com 28 opções + fallback 📦) — é uma feature intencional em que
   o vendedor ESCOLHE um emoji como "foto" provisória do produto quando não tem uma
   imagem real. É conteúdo, não decoração de UI; converter isso mudaria a natureza
   da funcionalidade (de "escolher um emoji" para "escolher um ícone genérico"),
   então ficou fora deste pedido — sinalizado como possível item à parte.
   O mesmo padrão existe no lado do comprador (rastreio/catálogo) e foi igualmente
   preservado por consistência.

## Etapa 1 — Meu Perfil

- **`wkz-form-select.js`** (compartilhado por Comprador/Vendedor/Admin): os 23
  ícones de dropdown + 2 fallbacks, que eram emoji, agora são SVG. Removidos 15
  atributos `data-icon="<emoji>"` redundantes no HTML (o dicionário já detecta o
  ícone certo pelo `data-title`).
- **`wkz-core.js`** (módulo "Meu Perfil", `CP_ICO`): 10 toasts que ainda usavam
  emoji cru foram trocados; adicionado 1 ícone que faltava (`cart`).
- **`wkz-buyer.html`**: 8 emojis trocados por SVG inline. Dois deles (💰🧪)
  estavam dentro de texto traduzível (`data-i18n`) — o ícone foi movido para fora
  da parte traduzida e o emoji removido das traduções nos **7 idiomas** (PT, EN,
  ES, ZH, FR, DE, JA), para não reaparecer ao trocar de idioma.

## Etapa 2 — Painel do Vendedor

Foi necessário construir uma biblioteca de ícones nova: `window.WKZ_ICO` (`wkz-core.js`),
com **74 ícones SVG**, já que o vendedor não tinha nenhum sistema de ícones prévio
(diferente do comprador, que já tinha o `CP_ICO` parcialmente pronto de uma sprint
anterior). É global e independente do `CP_ICO` — não alterei o `CP_ICO` para não
arriscar quebrar o que já funcionava em "Meu Perfil".

Como `wkz-seller.js` embute os emojis dentro de *strings* JavaScript (não em texto
solto), a substituição precisou entender o contexto de cada ocorrência para inserir
a referência ao ícone sem quebrar a sintaxe:
- Dentro de string simples (`'...'`) → quebra por concatenação: `WKZ_ICO.x + '...'`
- Dentro de template literal (`` `...` ``) → interpolação: `` ${WKZ_ICO.x} ``
- Dentro de aspas *escapadas* (ex.: `onclick="showToast(\'...\')"` dentro de HTML
  gerado por template literal) → preserva o escape em ambos os lados

Essa lógica foi aplicada a **352 ocorrências** (207 em `wkz-seller.js`, 145 em
`wkz-seller.html`), cobrindo 78 emojis únicos diferentes.

### Um bug real pego durante o processo

Uma primeira versão do script de substituição continha um trecho de código morto
(rascunho não removido) que corrompia sintaxe em casos onde o emoji vinha logo
depois de uma aspa **já usada como abertura de string** (ex.: dentro de um
`status === 'paused' ? '⏸ Pausado' : ...`), duplicando o operador de concatenação.
Pego pelo `node --check` antes de qualquer teste — o arquivo nunca chegou a ser
publicado nesse estado. Corrigido e reprocessado do zero a partir do checkpoint
limpo anterior (nenhuma das correções de sprints anteriores foi perdida).

## Testes

- `node --check` em todos os arquivos alterados — passa.
- Suíte de regressão completa (`tools/harness-node.js`,
  `seller/harness-seller-test.js`, `admin/harness-admin-test.js`,
  `buyer/harness-buyer-test.js`, incluindo o teste de paridade de chaves i18n) —
  todos passam.
- `tools/test-disputes-flow.js` (18/18) e `tools/test-broadcast-flow.js` (8/8) —
  sem regressão (confirma que mexer nos emojis de `wkz-seller.js` não afetou a
  lógica de disputas/comunicados corrigida nas sprints M11/M12).
- **Novo:** `tools/test-form-select-icons.js` — confirma que o dicionário de ícones
  dos dropdowns não contém mais nenhum emoji e que o painel renderizado (com um
  select real, simulado) mostra SVG em vez de emoji. 8/8.
- Scan automático final: 0 emojis "reais" restantes em `wkz-buyer.html` (seção
  Meu Perfil), `wkz-seller.html` e `wkz-seller.js`, fora das 3 exceções.

## O que ficou de fora (fora do pedido original)

- **Painel do Admin** e páginas fora de "Meu Perfil" no comprador (home, catálogo,
  carrinho, checkout) — não foram tocadas. `WKZ_ICO` já está pronto e disponível
  globalmente se um próximo passo quiser estender a troca para lá.
- O sistema de emoji-como-thumbnail de produto (comprador e vendedor) — feature
  intencional, não decoração; ver seção "Metodologia" acima.
