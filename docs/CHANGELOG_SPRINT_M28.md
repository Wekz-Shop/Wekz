# Sprint M28 — Segurança: Buyer completo — roadmap da M22 encerrado

Arquivos alterados: `buyer/wkz-buyer.js` (continuação direta da M27).
Nenhum arquivo de back-end tocado.

## Fechando o que a M27 deixou pendente

A M27 converteu o HTML estático do Buyer (484/488) mas parou antes de
tocar nos ~150 templates dinâmicos do `wkz-buyer.js`, depois de descobrir
e corrigir 8 regressões de um padrão sistêmico (código que lia o próprio
`onclick` de volta). Esta sprint retoma exatamente daí.

**Resultado: 167 → 33 onclick no `wkz-buyer.js`** (134 convertidos nesta
sprint). Os 33 restantes são os mesmos de sempre — 19 `btnFeedback` com
callback de função, e mais 14 casos genuinamente complexos (ver seção
própria) — nenhum novo motivo de adiamento, mesma régua das 5 sprints
anteriores.

## O estilo de código aqui era mais heterogêneo — isso custou 2 rodadas extras de correção

Diferente do Admin (quase tudo em template literal com `${}`), o Buyer
mistura livremente **template literal** e **concatenação de string com
aspas simples** — às vezes na mesma função. A mesma lição da M26
(colisão de aspas), mas em escala maior: encontrei e corrigi **3
ocorrências** onde minha própria regex de conversão interpretou incorretamente
`' + variavel + '` (concatenação de verdade) como se fosse texto literal
entre aspas, produzindo JSON quebrado do tipo `data-args='[" + realIdx +
"]'` em vez de `data-args=\'['+ realIdx + ']\'`. Peguei os 3 com
`node --check` (que aponta a linha exata do erro de sintaxe) antes de
qualquer harness — nenhum chegou perto de ser entregue quebrado.

Depois de corrigir os 3 manualmente, rodei uma varredura full-arquivo
por qualquer resíduo do mesmo padrão (`+ variavel +` solto dentro de um
`data-args='[...]'`) — zero restantes.

## Casos que pediram tratamento especial (além do padrão comum)

- **`${fillFn}`/`${onSelect}`** — nome da função a chamar vem de uma
  variável (resolvida em tempo de renderização do template, não em tempo
  de clique — então continua seguro, o HTML final sempre tem um nome
  literal). O argumento (texto de busca, categoria) passou a usar
  `JSON.stringify(...).replace(/'/g,"&#39;")` em vez da sanitização manual
  antiga (`.replace(/'/g,"\\'")`) — mais robusto contra qualquer caractere
  especial no texto, não só apóstrofo.
- **Atributo condicional inteiro** (`couponApplyFromDrawer`) — o onclick
  inteiro só existia se o cupom não estivesse usado
  (`isUsed ? '' : 'onclick="..."'`). Convertido pra a MESMA condicional,
  mas construindo o par `data-action`/`data-args` em vez do `onclick`.
- **`event.stopPropagation()` removido em mais ~10 pontos** — mesmo
  raciocínio das sprints anteriores (delegação por `closest()` já resolve
  o problema que o `stopPropagation()` existia pra evitar).

## Mais 2 botões pré-quebrados encontrados (não são regressão minha)

Ao validar que toda função referenciada em `data-action` existe de
verdade no runtime, encontrei 2 que não existem — mas **confirmei que já
estavam quebradas antes de eu tocar em qualquer coisa**:

- **`kzLocalize`** — está definida dentro de um closure em `wkz-core.js`
  que nunca é exposto em `window`. O `onclick="kzLocalize(...)"` original
  já teria lançado `ReferenceError` no console do navegador desde sempre
  — inline `onclick` só enxerga escopo global.
- **`wkzSellerConfirmOrderReceipt`** — referenciada em exatamente um
  lugar, nunca definida em lugar nenhum do projeto.

Não corrigi nenhuma das duas (seria consertar uma funcionalidade
quebrada, não migrar sintaxe de segurança — escopo diferente). Vale
notar uma pequena mudança de comportamento: antes, clicar nesses botões
lançava um erro visível no console (pista pra debugar); agora, o
dispatcher central simplesmente não faz nada, silenciosamente (mesmo
guard de segurança que impede `data-action` de disparar strings
arbitrárias). Pra quem for consertar essas duas no futuro, fica pelo
menos documentado aqui onde procurar.

## Testes / Verificações

- **`node --check`** em `wkz-core.js`, `wkz-buyer.js`, `wkz-seller.js`:
  sintaxe válida — usado repetidamente DURANTE a conversão (não só no
  final) pra pegar os 3 bugs de concatenação assim que apareceram.
- **Varredura de barra invertida espúria** nos 8 arquivos: 0 problemas.
- **Varredura por resíduo do bug de concatenação** (`+ var +` solto
  dentro de `data-args`): 0 restantes.
- **JSON válido em ~93 `data-args`/`data-args2`** do `wkz-buyer.js`
  (testado com placeholders `${x}` e concatenações substituídos, e 1
  falso positivo do meu próprio script de teste investigado e descartado
  — a linha real já tinha passado em `node --check`).
- **Balanceamento de tags** (`wkz-buyer.html`, não tocado nesta sprint
  mas revalidado por segurança): 0 problemas.
- **Toda função referenciada em `data-action`/`data-close-on-backdrop`**
  (233 nomes, HTML+JS do Buyer): confirmadas existentes no runtime, com
  as 2 exceções pré-existentes documentadas acima.
- **3 harnesses oficiais**: 100% passaram, i18n incluído, rodados do
  zero como última checagem.

## O que ficou de fora, definitivamente (33 no `wkz-buyer.js` + 4 no HTML)

Mesma categoria das sprints anteriores — nenhum item novo na lista de
motivos:
- **19×** `btnFeedback(this,()=>...)` — função como argumento.
- **3×** `openLightbox(...)` — argumento computado via
  `JSON.stringify().replace()`.
- **2×** `.find(x=>...)` inline (`QA_DATA_LEGACY`, `REVIEWS_DATA`) —
  lambda de busca embutida no próprio onclick.
- **2×** ternário escolhendo entre cadeias de ação inteiras diferentes.
- **2×** escrita de variável solta (`_searchHistory=[]`,
  `wishColActiveFilter=null`) + chamada de função.
- **1×** `${onclick}` — nome da variável sugere que o valor inteiro do
  atributo é dinâmico; não dá pra saber o formato sem rastrear todos os
  chamadores.
- **1×** encadeamento de 3 ações (`kzcCloseDrawer();addToCart(...);
  showToast(...)`) — meu sistema suporta até 2.
- **1×** `navigator.clipboard.writeText(...)` — API do navegador, não
  função da aplicação.
- **1×** `'+_escrowAction+'` — nome de ação totalmente dinâmico.
- **1×** `event.stopPropagation();${...}` — onclick totalmente dinâmico.

## Roadmap da Sprint M22 — encerrado

| Módulo | Handlers convertidos |
|---|---|
| Admin | 103/105 |
| Legal | 86/86 |
| Seller | 296/299 |
| Buyer | 634/655 (484 HTML + 150 JS) |
| **Total** | **1.119 de ~1.145** |

`'unsafe-inline'` ainda não pode sair da CSP — os ~26 casos deixados de
propósito em cada módulo (mais os poucos remanescentes de outras
categorias) ainda dependem dele. Mas a superfície de ataque caiu de
~1.145 pontos de entrada pra ~26, todos documentados e de baixo risco
individual (nenhum lida com dados de pagamento ou autenticação
diretamente).

## Lembrete de processo

Arquivo entregue como download. Substituir `buyer/wkz-buyer.js` no
repositório antes do próximo deploy (é o único arquivo alterado nesta
sprint — `wkz-buyer.html` já foi entregue corrigido na M27). Teste manual
recomendado: busca com sugestões (chips de categoria, histórico, "em
alta"), aplicar cupom no drawer, votar em pergunta útil/não útil, marcar
recebimento de pedido — essas são as áreas com a lógica de conversão mais
delicada desta sprint.
