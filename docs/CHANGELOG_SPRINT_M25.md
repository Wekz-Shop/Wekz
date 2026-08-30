# Sprint M25 — Segurança: Legal 100% migrado + correção crítica na M24

Arquivos alterados: `core/wkz-core.js`, `legal/wkz-legal.html`,
`admin/wkz-admin.html` (correção retroativa de um bug da Sprint M24).
Nenhum arquivo de back-end tocado.

## Primeiro: uma correção retroativa importante

Ao validar esta sprint, criei uma checagem mais ampla que a usada na M24 (a
de lá só validava JSON dentro de `data-args`; esta cobre **qualquer**
atributo `data-*`) e encontrei o mesmo bug de escape da M24 — barra
invertida espúria vazando de uma string raw do Python — em **dois pontos
já entregues** no `wkz-admin.html`:

- `data-nav-href="../buyer/wkz-buyer.html\"` — o botão de logout do Admin
  navegaria para uma URL terminada em barra invertida, provavelmente
  quebrando a navegação.
- `data-click-target="disputaAttachInput\"` — o botão de anexar prova em
  disputa nunca encontraria o `<input>` de arquivo de verdade (o id real
  não tem barra invertida), então clicar nele não faria **nada**.

Os dois foram corrigidos aqui e revalidados com a suíte completa antes de
prosseguir com o trabalho novo desta sprint. Fica registrado porque é
exatamente o tipo de bug que "passa no teste" (a checagem de JSON da M24
não cobria esses dois atributos, que não são JSON) e só aparece de
verdade num clique real — reforça por que a checagem de barra invertida
virou parte permanente do meu processo a partir de agora, rodada em
**todos** os arquivos tocados desde a M22, não só o da sprint corrente.

## Legal: 77 onclick restantes → 0

A M22 já tinha convertido o Sumário de Termos (9 handlers). Esta sprint
fecha o resto: banner/modal de cookies (LGPD), central de notificações,
FAQ com filtro por tema, formulário de denúncia de fraude, e os 9 fluxos
de portal LGPD (acessar/corrigir/portabilidade/excluir dados, DPO).

Três casos precisaram de atenção redobrada, não só substituição mecânica:

1. **`wkzCmOverlayClick(event)`** (fechar o modal de cookies clicando fora
   dele) checava `evt.target === evt.currentTarget` — isso **quebraria**
   sob delegação, porque `currentTarget` deixa de ser o modal e passa a
   ser sempre `document` (é onde o listener está preso agora). Em vez de
   converter a função como estava, apontei direto pra
   `data-close-on-backdrop="wkzConsentCloseModal"` — o atributo dedicado
   que a Sprint M24 já tinha criado pra esse exato padrão, e que faz o
   check `ev.target === elemento` corretamente na própria delegação
   central, sem depender de `currentTarget`. `wkzCmOverlayClick` continua
   existindo no código (não removi a função), só deixou de ser chamada
   por este ponto específico.

2. **`lgpdCloseAll(event,this)`** faz seu próprio check interno
   (`if (e && e.target !== backdrop) return;`) — esse caso não tem o
   problema do `currentTarget` (usa `target`, que continua correto sob
   delegação), então convertido direto com as sentinelas `$event`+`$this`,
   preservando a assinatura original da função.

3. **`closeCookieBanner();MapsTo('pg-privacy');return false;`** — um
   `<a href="#">` que dependia do `return false` pra não saltar pro topo
   da página. Como `addEventListener` não tem equivalente a "return
   false", estendi o dispatcher central (`wkz-core.js`) pra chamar
   `ev.preventDefault()` **sempre**, antes de despachar qualquer ação —
   nenhum `data-action` já convertido (nos 4 módulos) depende do
   comportamento padrão do elemento acontecendo, então isto é seguro
   retroativamente também.

## Testes / Verificações

- **Checagem de barra invertida espúria**, agora cobrindo qualquer
  atributo `data-*` (não só `data-args`), rodada nos 6 arquivos tocados
  desde a M22: **0 corrompidos** (depois de corrigir os 2 da M24 e mais
  alguns encontrados nesta sprint antes da entrega).
- **Balanceamento de tags via parser HTML real**: `wkz-legal.html` e
  `wkz-admin.html`, 0 problemas.
- **Os 3 blocos `<script>` inline do `wkz-legal.html` executados de
  verdade** (não só regex no texto) — carreguei `wkz-core.js` +
  extraí e rodei cada bloco `<script>` do HTML num contexto Node
  compartilhado, confirmando que rodam sem lançar erro.
- **Toda função referenciada em `data-action`/`data-action2`/
  `data-close-on-backdrop`** (28 nomes distintos) confirmada existente no
  runtime.
- **Simulação de clique nos 3 casos especiais**: `lgpdCloseAll` disparado
  com clique no backdrop em si (deve fechar) e com clique num filho
  (função decide não fechar, via seu próprio check interno — nenhum
  `throw`, comportamento preservado); `preventDefault()` confirmado sendo
  chamado ao disparar qualquer ação (evita o salto do `href="#"`).
- **3 harnesses oficiais**: 100% passaram, i18n incluído.
- Dois alarmes falsos no caminho, ambos do meu próprio mock de teste (não
  do produto): faltava `IntersectionObserver` (usado pelo scrollspy do
  Sumário, recurso pré-existente, nada a ver com esta sprint) e eu tinha
  simplificado demais uma classe `FakeElement` num teste novo, esquecendo
  `insertBefore`. Os dois corrigidos no meu tooling de teste, não no
  produto.

## Roadmap atualizado (Sprint M22)

| Módulo | Antes | Depois |
|---|---|---|
| Admin | 0 | **0** (+correção retroativa de 2 bugs da M24) |
| Legal | 77 | **0** (+2 casos deixados de propósito, como Admin) |
| Seller | 321 (235+86) | 321 (sem alteração — inclui uma recontagem: 214+85=299 real, número original tinha um erro de digitação meu lá na auditoria inicial) |
| Buyer | 661 (494+167) | 655 (488+160 — pequena variação por ediçoes de sprints anteriores, sem relação com onclick) |

Próximo da fila: **Seller**, depois **Buyer** por último (onde fica o
checkout — o de maior risco, guardado pro fim de propósito desde a M22).

## Lembrete de processo

Arquivos entregues como download. Substituir `core/wkz-core.js`,
`legal/wkz-legal.html` **e também `admin/wkz-admin.html`** (a versão
corrigida desta sprint substitui a da M24, que tinha os 2 bugs descritos
acima) no repositório antes do próximo deploy. Teste manual recomendado:
banner de cookies (aceitar tudo, rejeitar, abrir modal de personalizar,
fechar clicando fora do modal), e no Admin — já corrigido aqui — o botão
de logout e o de anexar prova numa disputa.
