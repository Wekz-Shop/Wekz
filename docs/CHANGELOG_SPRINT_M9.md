# Sprint M9 — Filtros de Categoria: Origem (Nacional/Internacional), Faixa de
Preço editável e Facetas dedicadas por tipo de produto

Arquivos alterados: `wkz-buyer.html`, `wkz-buyer.js`, `wkz-core.js`.

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

## Testes

- `npm run test:m1` (`harness-node.js`) e `npm run test:m2`
  (`harness-buyer-test.js`) — suites existentes, sem alteração — **passam**.
- Suite nova (`filter-test.js`, não commitada — script de verificação usado
  durante o desenvolvimento) cobre: filtro por categoria nas 12 categorias,
  preço min/máx, Origem (com Estado), Envio, Condição, facetas dinâmicas
  (incluindo clique simulado em checkbox de faceta), `clearCatFilters()` e
  estado vazio — **12/12 passam**.

## O que ficou de fora (proposital)

- Contagens dos checkboxes de Envio refletem a categoria inteira, não a
  interseção com os outros filtros já ativos (como um marketplace grande
  faz). Para um catálogo mock de 2–7 itens por categoria o ganho de
  realismo não compensa a complexidade agora; sinalizado para quando o
  catálogo for maior/real.
- Nenhuma mudança de layout/breakpoint mobile — o comportamento existente
  (`.listing-sidebar{display:none}` ≤900px) foi preservado como estava.
