# Sprint M9 — Filtros de Categoria: Origem (Nacional/Internacional), Faixa de
Preço editável, Facetas dedicadas por tipo de produto e Chips de filtro ativo

Arquivos alterados: `wkz-buyer.html`, `wkz-buyer.js`, `wkz-core.js`, `wkz-styles-full.css`.

## Contexto

Melhoria solicitada no sidebar de filtros das páginas de categoria (`page-category`),
com base em análise de concorrência: filtro de origem Nacional/Internacional
(com Estado do Brasil quando Nacional), faixa de preço com campos de valor
mínimo/máximo editáveis, e filtros dedicados ao tipo de produto de cada
categoria (ex.: Marca/Armazenamento em Eletrônicos, Tamanho/Cor em Moda).

## 0. Bug crítico encontrado e corrigido antes de tudo

`renderCatProducts()` nunca filtrava pela categoria aberta — usava
`[...products]` (o catálogo inteiro, 29 itens) em toda página de categoria.
Era por isso que a página de Eletrônicos do mockup mostrava "29 produtos
encontrados" em vez dos 7 reais. Duas causas-raiz, ambas corrigidas:

- `renderCatProducts()` não filtrava por `p.cat`. Agora usa
  `products.filter(p => p.cat === currentCatId)` como base de toda a pipeline
  de filtros.
- `DB.categories` (usado só para textos do header) tinha `id:'auto'`
  (produtos usam `cat:'automotivo'`) e `name:'Beleza & Saúde'` (a nav chama
  `openCategory('Beleza', ...)`), além de não ter entradas para Saúde/
  Ferramentas. `currentCatId` agora vem de `CAT_KEY_MAP` (mapa já existente
  em `wkz-buyer.js`, correto para as 12 categorias) em vez de `DB.categories`,
  então esse mismatch não afeta mais o filtro — mas os IDs/nomes também
  foram corrigidos por consistência de dados.

## 1. Dados: novos campos em `products[]` (wkz-core.js)

Cada um dos 29 produtos ganhou: `origin` (`'nacional'|'internacional'`),
`uf` (estado, só quando nacional) ou `country` (país de origem, só quando
internacional), `cond` (`'novo'|'usado'|'recondicionado'`), `frete` e `fast`
(booleans, usados pelo filtro de Envio), e `attrs` (objeto com os campos
específicos da categoria — ver item 3).

## 2. Origem: Nacional / Internacional + Estado/País

Novo grupo "Origem" no sidebar (Todas / 🇧🇷 Nacional / 🌍 Internacional).
Ao marcar Nacional, aparece um `<select>` de Estado (as 27 UFs, lista nova
em `DB.ufList`) com opções restritas às UFs que de fato existem entre os
produtos nacionais da categoria aberta. Ao marcar Internacional, aparece
um `<select>` de País de Origem com a mesma lógica. `onCatOriginChange()`
alterna a visibilidade e já reaplica o filtro.

## 3. Facetas dedicadas por categoria (`CATEGORY_FACETS`)

Config central em `wkz-buyer.js` mapeando `cat.id → [{key,label}]`:
Eletrônicos (Marca, Armazenamento), Moda (Tamanho, Cor), Beleza (Tipo de
Produto), Games (Plataforma), Casa & Deco (Ambiente), Esportes
(Modalidade), Bebê & Kids (Faixa Etária), Pet Shop (Tipo de Pet),
Automotivo (Tipo de Veículo), Livros (Gênero), Saúde (Categoria),
Ferramentas (Tipo). `renderCatExtraFacets()` gera os checkboxes e as
contagens 100% a partir do catálogo (nada hardcoded por fora do `attrs`
de cada produto) e injeta no container `#catExtraFacets`.

## 4. Faixa de Preço editável (Mín/Máx)

Mantido o slider (agora com `max` dinâmico = maior preço da categoria,
arredondado), e adicionados dois campos numéricos (Mín/Máx, reaproveitando
as classes `.filter-price-row`/`.filter-input-sm`/`.wkz-input--sm` já
usadas na barra de filtros da home). Digitar no Máx sincroniza o slider e
vice-versa (`syncCatPriceInputs()`/`updatePriceRange()`).

## 5. Envio e Condição — de decorativos para funcionais

`cfFree`/`cfFast` agora filtram de fato (`p.frete`/`p.fast`) e mostram a
contagem real da categoria (`updateCatFilterCounts()`), substituindo os
números fixos "38/12/24" do mockup. Removido o checkbox "Vendedor
Nacional" (redundante com o novo grupo Origem). Condição passou a ter
"Todas" como padrão (era "Novo" sem filtro nenhum por trás) e os 3 valores
agora batem com `p.cond`.

## 6. Estado vazio

Sem resultados após filtrar, o grid mostra uma mensagem de "Nenhum produto
encontrado" com atalho para limpar os filtros, em vez de uma grade em
branco sem explicação.

## 7. Chips de filtro ativo

Acima da grade de produtos (`#catActiveChips`), um chip por filtro ligado —
preço, avaliação, origem, estado, país, envio, condição, cada faceta de
categoria marcada — cada um com "✕" para remover **só aquele filtro**, sem
afetar os demais (ex.: remover o chip do Estado mantém "Nacional" ligado).
Quando há filtro ativo, aparece também "Limpar tudo" no fim da fileira.
`renderCatActiveChips()` é chamado dentro de `renderCatProducts()` e reusa
o mesmo estado já lido ali (sem reconsultar o DOM em duplicidade). Visual:
nova classe `.cat-chip` em `wkz-styles-full.css`, no mesmo padrão pill/teal
do `.filter-chip` já existente na barra de filtros da home.

## 8. Busca por palavra-chave dentro da categoria (funil de busca)

Novo campo no topo do sidebar ("Buscar nesta categoria"), acima de Faixa de
Preço. Filtra em tempo real (a cada tecla) por nome do produto, nome da
loja e qualquer valor de `attrs` (marca, tamanho, plataforma etc. —
digitar "Sony" acha o Fone Bluetooth mesmo sem "Sony" estar no título).
Busca ignora acento e maiúscula/minúscula, reaproveitando o helper
`_wkzNormalizeText()` já existente no projeto (usado hoje na busca de
FAQ) em vez de criar uma segunda implementação. Ganhou chip removível
próprio (🔎 "termo") e é limpo por `clearCatFilters()`.

## 9. Bug real encontrado e corrigido: campo de busca do topo "sumindo" em telas ~900–1180px

Reportado com prints em Modo Desktop do Chrome/Android (que simula um
viewport ~980–1024px). Causa raiz: `.topbar-actions` tem `flex-shrink:0`
(nunca encolhe) e só ficava compacto (ícone-only, sem "Meu Perfil"/"Vender"
por extenso) em `@media(max-width:768px)`. Entre 769–1180px essa
compactação ainda não entrava, então a barra de ações no formato "desktop
cheio" tomava quase todo o espaço da `.topbar-inner`, e como `.search-bar`
tem `overflow:hidden`, sobrava só o `<select>` "Todas" (tem `min-width:110px`
fixo) — o `<input>` de busca (sem min-width) e o botão de lupa eram
espremidos a ~0px, ficando efetivamente invisíveis. Não era exatamente
"pequeno", era espremido a zero — mas o efeito percebido bate exatamente
com o relato.

Correção: o breakpoint que já compacta `.topbar-actions` (mesma regra
testada e em produção em ≤768px) foi alargado para ≤1180px — resolve na
raiz, sem CSS novo. Como reforço (defesa em profundidade, caso o layout
mude de novo no futuro), `.search-wrap-top`/`.search-bar` ganharam
`min-width:180px` e `.search-bar input` ganhou `min-width:60px`, para que
esse tipo de "sumiço por espremido" não possa mais acontecer mesmo em
cenários não previstos.

**Nenhuma mudança no card "O marketplace que evolui com você"**: o campo
de busca ali (`#heroSearchInput`) já existe e já é funcional — dropdown de
sugestões em tempo real, Enter dispara a busca, integra com histórico
de busca. Conferido no código (`heroSearchType`/`heroSearchSubmit` em
`wkz-buyer.js`); não havia nada quebrado para corrigir aí.

## Testes

- `npm run test:m1` (`harness-node.js`) e `npm run test:m2`
  (`harness-buyer-test.js`) — suites existentes, sem alteração — **passam**.
- Suite nova (`filter-test.js`, não commitada — script de verificação usado
  durante o desenvolvimento): filtro por categoria nas 12 categorias, preço
  min/máx, Origem (com Estado), Envio, Condição, facetas dinâmicas,
  `clearCatFilters()`, estado vazio, chips de filtro ativo e busca por
  palavra-chave (nome/loja/atributo, acento-insensível, chip próprio) —
  **23/23 passam**.
- O fix do CSS da topbar (item 9) foi validado por leitura/raciocínio sobre
  as regras de flexbox e pela reprodução do cálculo de espaço (não há
  ferramenta de screenshot/browser real neste ambiente) — vale conferir
  visualmente em ~980-1024px assim que possível.

## O que ficou de fora (proposital)

- Contagens dos checkboxes de Envio refletem a categoria inteira, não a
  interseção com os outros filtros já ativos (como um marketplace grande
  faz). Para um catálogo mock de 2–7 itens por categoria o ganho de
  realismo não compensa a complexidade agora; sinalizado para quando o
  catálogo for maior/real.
- Nenhuma mudança de layout/breakpoint mobile — o comportamento existente
  (`.listing-sidebar{display:none}` ≤900px) foi preservado como estava.
