# Sprint M23 — Gatilhos de conversão: carrinho abandonado

Arquivos alterados: `core/wkz-core.js`, `buyer/wkz-buyer.js`.
Nenhum arquivo de back-end tocado.

## Correção de rota, de novo — desta vez a meu favor

As 3 primeiras ideias da auditoria original de growth (prova social em
tempo real, barra de progresso de frete grátis, missões diárias) **já
estavam implementadas** — algumas de forma bem mais sofisticada do que eu
supus na auditoria (o "ticker" de prova social tem 5 tipos de mensagem
rotativos com pesos diferentes por nível de estoque; as missões diárias
têm reset automático à meia-noite com detecção de troca de dia). Fiz uma
varredura ampla (buyer.js **e** core.js, não só o primeiro arquivo que
olhei — errei nisso nas sprints anteriores) antes de propor qualquer coisa
nova, pra não reinventar o que já existe.

A única ideia da lista original que realmente não existia em lugar nenhum:
**lembrete de carrinho abandonado**. Essa entrou.

## O problema por trás do problema: o carrinho nem sequer sobrevivia a um F5

Antes de dar pra lembrar alguém de um carrinho abandonado, o carrinho
precisa continuar existindo depois que a pessoa fecha a aba e volta. Não
era o caso: `cartItemsData` nunca era salvo em `localStorage` — cada
carregamento de página começava com o carrinho zerado, mesmo com itens
adicionados minutos antes. Essa parte virou a maior fatia do trabalho
desta sprint, não o lembrete em si.

### 1. Persistência real do carrinho (`wkz-core.js`)

Estendido o mesmo mecanismo de snapshot já usado por pedidos, disputas e
pontos (`wkzSaveActivityState`/`wkzRestoreActivityState`) para incluir
`cartItemsData` e um novo campo `cartLastAddedTs`.

### 2. Bug real encontrado no caminho: `clearCart()` e `finalizeOrder()` nunca disparavam persistência

`cartItemsData` é um array reativo (`WkzBus.makeReactive`) que emite um
evento a cada mutação — **exceto** mutações de `.length`, ignoradas de
propósito pra não duplicar o evento. `clearCart()` e o fim do checkout
(`finalizeOrder()`) zeravam o carrinho com `cartItemsData.length = 0` —
exatamente o padrão que não dispara evento nenhum. Corrigido para
`.splice(0, cartItemsData.length)`, que muta via índices e passa pelo
Proxy normalmente. Sem isso, um pedido finalizado ainda apareceria no
carrinho depois de um F5 — o snapshot salvo ficaria com os itens já
comprados. Testado explicitamente (ver seção de testes).

### 3. Ponto único de persistência: `updateCartUI()`

Em vez de espalhar chamadas de salvamento pelas ~22 funções que mutam o
carrinho no projeto (risco real de esquecer uma — foi exatamente isso que
aconteceu com `clearCart`/`finalizeOrder`), centralizei a chamada dentro
de `updateCartUI()`, que **todas** elas já chamam depois de mutar o
carrinho.

### 4. O lembrete em si (`wkzCheckCartReminder`, `wkz-core.js`)

Regras: só aparece se (a) o carrinho não está vazio, (b) estamos na
página do Buyer (detectado via um elemento que só existe lá — sem precisar
de um sinalizador novo), (c) o último item foi adicionado há **30+
minutos** (pra não incomodar alguém que só navegou pra outra aba por 2
minutos) e (d) ainda não foi mostrado pra esse mesmo carrinho nesta sessão
de aba (`sessionStorage`, chave marcada com o timestamp — se a pessoa
adicionar algo novo depois, vira um carrinho "novo" e pode lembrar de
novo). Dispara 1,2s depois da página carregar (não instantaneamente — um
"bem-vindo de volta" chegando na hora do carregamento pareceria bug).

O toast reaproveita `showToast()` (já existente) com um link "continue de
onde parou" — que usa `data-nav-to="cart"`, um **segundo ramo** do mesmo
listener de delegação central criado na Sprint M22 (`FIX-SEC-ONCLICK-01`).
Esse link nasce sem `onclick`, não é conversão de nada que existia antes —
continua a mesma linha da sprint de segurança, sem abrir uma exceção nova.

## Testes / Verificações

Esta foi a sprint com mais idas e vindas de teste até aqui — vale registrar
o processo, porque teve um erro meu no meio do caminho que é bom deixar
documentado:

- **Primeira rodada de teste deu falso negativo**: o teste de restauração
  do carrinho falhava, e passei um tempo tentando debugar um "bug" que não
  existia — a pasta de teste (`/tmp/wkztest/core/`) ainda tinha a cópia do
  `wkz-core.js` da **Sprint M22**, sem os fixes desta sprint. Corrigido
  copiando a versão atual antes de re-testar. Fica registrado porque é
  exatamente o tipo de erro bobo que pode levar a "corrigir" algo que já
  estava certo, ou pior, a desistir de uma correção boa achando que não
  funciona.
- **3 harnesses oficiais** rodados do zero contra os arquivos finais:
  **100% passaram** nos 3, i18n incluído.
- **Teste de restauração cross-módulo**: simulei localStorage com um
  snapshot do Buyer (carrinho com 1 item) e carreguei o módulo **Admin**
  (sem `wkz-buyer.js`) — confirma que `wkzRestoreActivityState()` não
  quebra outros módulos e que o carrinho é restaurado corretamente
  (`cartItemsData.length === 1` após restaurar). De brinde: investiguei se
  as chamadas não-guardadas a `renderOrders()`/`renderWallet()`/etc.
  dentro dessa função quebrariam módulos sem Buyer — **não quebram**,
  porque essas funções vivem dentro do próprio `wkz-core.js`, não do
  `wkz-buyer.js` como eu tinha suposto. Testei antes de "corrigir" algo
  que não precisava.
- **Teste de `clearCart()`**: adiciona item → salva → chama `clearCart()`
  de verdade → confirma que o snapshot salvo reflete carrinho vazio (não
  só que `cartItemsData` ficou vazio em memória, mas que a persistência
  em si acompanhou).
- **Teste de `finalizeOrder()`**: mesmo padrão, simulando o fim real do
  checkout.
- **6 cenários do lembrete de carrinho** (`wkzCheckCartReminder`,
  testada diretamente, sem depender do `setTimeout` de 1,2s): carrinho
  vazio (nada), item recente <30min (nada), item com 45min (mostra, texto
  singular correto), segunda chamada com mesmo carrinho (não repete),
  3 unidades de 2 produtos diferentes (texto no plural, "3 itens"), fora
  da página do Buyer (nunca mostra). Todos corretos.
- **2 cenários do novo ramo de delegação** (`data-nav-to`): clique no link
  do toast aciona `MapsTo('cart')`; clique num elemento `data-scroll-to`
  não aciona `MapsTo` por engano (os dois ramos não colidem).
- **Suíte completa rodada do zero, junto, no final** (8 testes: 3
  harnesses oficiais + 5 meus) — todos passaram na mesma bateria, não só
  isoladamente.

## O que ficou de fora (fora do escopo desta sprint)

- Os outros ~1.163 `onclick` do projeto (segurança, sprint em andamento
  desde M22 — o `data-nav-to` desta sprint é aditivo a esse trabalho, não
  substitui o restante).
- Qualquer notificação de carrinho abandonado **fora do site** (e-mail,
  push) — não é possível em fase de front-end estrito sem back-end.

## Lembrete de processo

Arquivos entregues como download. Substituir `core/wkz-core.js` e
`buyer/wkz-buyer.js` no repositório antes do próximo deploy. Recomendo um
teste manual real: adicionar um item ao carrinho, editar
`window._wkzCartLastAddedTs` no console pra simular 45 minutos atrás
(`window._wkzCartLastAddedTs = Date.now() - 45*60*1000`), dar F5, e
confirmar visualmente que o toast aparece com o link funcionando.
