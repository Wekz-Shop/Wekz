# Sprint M27 — Segurança: Buyer (HTML completo) + 8 regressões críticas encontradas e corrigidas

Arquivos alterados: `core/wkz-core.js`, `buyer/wkz-buyer.html`, `buyer/wkz-buyer.js`,
`seller/wkz-seller.js` (correção retroativa de bugs da Sprint M26).
Nenhum arquivo de back-end tocado.

## Sendo direto sobre o status: esta sprint NÃO fecha o Buyer

O pedido era "o último da fila" — mas o Buyer é maior e mais arriscado do
que os outros três somados, e no meio do caminho encontrei um problema
sério o suficiente pra merecer parar, investigar a fundo, e corrigir antes
de continuar. Resultado desta sprint:

- **`wkz-buyer.html` (HTML estático): 484 de 488 convertidos.** Só ficaram
  de fora os mesmos 2 casos de sempre (callback com função anônima,
  chamada de API do clipboard) — ver seção de itens deixados de propósito.
- **`wkz-buyer.js` (templates dinâmicos): ainda não iniciado.** São ~150
  ocorrências restantes (167 no catálogo original, ~17 já identificadas
  como candidatas a adiamento pelo mesmo motivo de sempre — callback com
  função anônima no botão de "Comprar Agora"). Fica pra próxima sprint.

## O achado mais importante da sprint: um padrão de bug sistêmico

Ao investigar o Buyer, descobri que partes do código **leem o próprio
atributo `onclick` de volta**, via regex ou seletor CSS
(`[onclick*="..."]`), como forma indireta de descobrir informação (qual
produto, qual tema de FAQ, qual pedido) — em vez de guardar esse dado num
lugar dedicado. Isso nunca dava problema enquanto `onclick` existia, mas
cada conversão para `data-action` **remove esse atributo**, quebrando
essas leituras silenciosamente — sem erro no console, sem crash, só um
comportamento sutilmente errado.

Fiz uma varredura completa em todos os 8 arquivos tocados desde a Sprint
M22 e encontrei **8 ocorrências reais**, das quais **duas já estavam em
sprints entregues**:

| # | Onde | O que quebrava | Sprint que causou | Status |
|---|---|---|---|---|
| 1 | `wkz-core.js` `searchFaqs()` | Busca de FAQ com campo vazio sempre voltava pro tema "pedidos", ignorando o tema realmente selecionado | M25 (Legal) | **Corrigido agora** |
| 2 | `wkz-seller.js` `kzNegSetMargin()` | Chip de margem clicado parava de ficar visualmente marcado como ativo | M26 (Seller) | **Corrigido agora** |
| 3 | `wkz-seller.js` sync pós-despacho | Botão "Marcar como Enviado" nunca atualizava pra "Ver Rastreio" depois de confirmar o despacho — ficava mostrando a ação errada indefinidamente | M26 (Seller) | **Corrigido agora** |
| 4 | `wkz-core.js` `_cpMarkPendingReviewDone()` | Item de avaliação pendente nunca era marcado como concluído após enviar a avaliação | Esta sprint (ainda não entregue) | Corrigido antes de entregar |
| 5 | `wkz-buyer.js` sync do coração de favoritos | Ícone de coração nos cards de produto parava de refletir se o item está na wishlist | Esta sprint | Corrigido antes de entregar |
| 6 | `wkz-buyer.js` sync do botão seguir loja | Texto "Seguir Loja"/"Deixar de Seguir" parava de refletir o estado real | Esta sprint | Corrigido antes de entregar |
| 7 | `wkz-buyer.js` botão "Comparar" nos cards | Botão de comparação de produtos parava de aparecer nos cards | Esta sprint | Corrigido antes de entregar |
| 8 | `wkz-core.js` `cpRefreshOrders()` | Spinner de "Sincronizando…" parava de aparecer (função ainda funcionava, só perdia o feedback visual) | Esta sprint | Corrigido antes de entregar |

Os itens 1, 2 e 3 são **regressões reais em sprints que você já tem no ar**
(M25 e M26). Não são hipotéticos — são bugs que já estavam acontecendo.

**Como corrigi:** cada leitor agora tenta primeiro `data-args` (via
`JSON.parse`, pegando a posição certa do array), e só cai no regex/seletor
antigo baseado em `onclick` como último recurso — então continua
funcionando tanto em elementos já convertidos quanto em qualquer um que,
por algum motivo, ainda não tenha sido. Verifiquei com uma varredura
adicional que **não existem outras ocorrências desse padrão** em nenhum
dos 8 arquivos (nem em Admin/Legal, que já estavam limpos).

## Capacidades novas no dispatcher (`wkz-core.js`)

- **`$var:nome`** — lê uma variável global no momento do clique (ex.:
  `currentPdpIndex`, que muda conforme o produto sendo visto).
- **`$query:seletor`** — seletor CSS genérico, pros poucos casos que
  `$tabBtn:`/`$this` não cobrem.
- **`data-action2-delay="ms"`** — atrasa a ação encadeada (ex.: fechar um
  painel e SÓ DEPOIS de uma pausa breve navegar pra outra página, pra não
  cortar a animação de fechamento pela metade).
- **`data-close-modal-class="id:classe"`** — a versão da M26 só suportava
  a classe `"open"`; o Buyer usa `"active"`/`"visible"` também, então
  generalizei com um formato `id:classe` opcional (sem `:`, continua
  assumindo `"open"` — compatibilidade total com Admin/Seller).
- **`data-close-on-backdrop="funcao:argumento"`** — a versão da M24 só
  chamava a função sem argumento nenhum; o Buyer tem casos como
  `closePdpSheet('bsHistorico')` que precisam saber QUAL sheet fechar.

Todas testadas isoladamente antes de qualquer conversão em massa (mesmo
processo das sprints anteriores).

## Outro problema de arquitetura resolvido no caminho

Duas funções (`wkzCmOverlayClick`, `closePdpSheetOnBg`) fechavam modal
comparando `evt.target === evt.currentTarget` — o mesmo problema já visto
na M25 (`currentTarget` sob delegação central vira sempre `document`,
nunca o elemento certo). Resolvido do mesmo jeito: pulei a função
intermediária e apontei direto pra função real de fechar
(`data-close-on-backdrop="wkzConsentCloseModal"` /
`data-close-on-backdrop="closePdpSheet:bsHistorico"`).

## Bug de escape (o de sempre) — pego e corrigido no caminho

Mais uma vez a barra invertida espúria apareceu (desta vez também em
`wkz-buyer.html`, incluindo um caso genuinamente diferente: um texto de
toast com apóstrofos internos que colidiam com o delimitador de aspas
simples do atributo — resolvido com entidade HTML `&#39;` em vez de
caractere literal). Corrigido e revalidado.

## O que ficou de propósito fora desta sprint (4 no HTML)

- **3×** `btnFeedback(this,()=>...)` — passa uma função como argumento,
  não representável em JSON. Mesma decisão das sprints anteriores.
- **1×** `navigator.clipboard.writeText(...)` — chamada de API do
  navegador encadeada com toast, categoria diferente (API nativa, não
  função da aplicação).

## Testes / Verificações

- **`node --check`** em `wkz-core.js`, `wkz-buyer.js`, `wkz-seller.js`:
  sintaxe válida.
- **Varredura de barra invertida espúria** nos 8 arquivos tocados desde
  a M22: 0 problemas.
- **JSON válido em todos os 333 `data-args`** do `wkz-buyer.html`
  (testado simulando a decodificação de entidades HTML que o navegador
  faz automaticamente).
- **Balanceamento de tags via parser HTML real**: 0 problemas.
- **`searchFaqs()` testado isoladamente**: confirma que lê o tema salvo
  em `data-args` (não cai mais no padrão "pedidos" por engano) — validado
  com um cenário reproduzindo exatamente o bug real antes do fix.
- **Varredura sistêmica**: busquei todo padrão de leitura de `onclick`
  (via `getAttribute`, seletor `[onclick*=...]`, ou similar) nos 8
  arquivos — encontrei e corrigi as 8 ocorrências listadas acima, e
  confirmei que outras 2 ocorrências parecidas (`.sidebar-nav-item`,
  `#dash-orders .rev-filter[onclick*="paid"]`) já eram código morto
  (seletor que não bate com nada, mesmo antes de qualquer conversão) —
  não são risco.
- **3 harnesses oficiais**: 100% passaram, i18n incluído, rodados do
  zero como última checagem.

## Roadmap atualizado (Sprint M22)

| Módulo | Status |
|---|---|
| Admin | ✅ completo (M24, corrigido M25) |
| Legal | ✅ completo (M22+M25, correção de bug M27) |
| Seller | ✅ 296/299 (M26, correção de 2 bugs M27) |
| Buyer | 🔶 HTML completo (484/488) — **templates JS pendentes** (~150) |

## Lembrete de processo

Arquivos entregues como download. Substituir `core/wkz-core.js`,
`buyer/wkz-buyer.html`, `buyer/wkz-buyer.js` **e `seller/wkz-seller.js`**
(correção retroativa — substitui a versão da M26) no repositório antes do
próximo deploy. Teste manual prioritário: favoritar/desfavoritar produtos
e conferir se o coração atualiza corretamente nos cards; buscar FAQ com
campo vazio tendo um tema não-padrão selecionado; no Seller, confirmar um
despacho e ver se o botão vira "Ver Rastreio".
