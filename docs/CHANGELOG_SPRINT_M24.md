# Sprint M24 — Segurança: Admin 100% migrado (onclick → dispatcher de ações)

Arquivos alterados: `core/wkz-core.js`, `admin/wkz-admin.html`, `admin/wkz-admin.js`.
Nenhum arquivo de back-end tocado.

Continuação do roadmap da Sprint M22 (`FIX-SEC-ONCLICK-01`), que tinha
resolvido só o caso estreito de "rolar até uma seção". Esta sprint ataca o
volume de verdade: o módulo **Admin** inteiro.

## O dispatcher genérico (`wkz-core.js`, `FIX-SEC-ONCLICK-02`)

O Admin tem dezenas de funções diferentes chamadas via `onclick`
(`switchAdminTab`, `secAction`, `applyTemplate`, `admApproveKyc`...) — um
ramo novo por função, como a M22 fez pra "rolar até seção", não escalaria.
Construí um dispatcher único e reutilizável pelos 4 módulos:

```
onclick="minhaFuncao('a', 'b')"
```
vira:
```
data-action="minhaFuncao" data-args='["a","b"]'
```

Sentinelas especiais dentro de `data-args` (nunca viram argumento literal):
- `"$this"` — o próprio elemento clicado (equivalente ao `this` implícito)
- `"$event"` — o objeto do evento
- `"$tabBtn:xxx"` — resolve pra `document.querySelector('[data-tab="xxx"]')`
  (caso específico: um card de KPI no Overview precisa passar o botão de
  uma aba *diferente* da clicada, pra marcar a aba certa como ativa)

`data-action2`/`data-args2` (opcionais) cobrem os casos de duas chamadas
encadeadas (`onclick="funcA();funcB();"`) sem precisar de uma estrutura
JSON mais complexa pra um punhado de casos.

Mais dois atributos pra formas de onclick que não são "chamar uma função
com argumentos": `data-nav-href` (`window.location.href=...`) e
`data-close-on-backdrop` (fechar modal só quando o clique é no fundo em
si, nunca em um filho — verificado com `ev.target === elemento`, não
`closest()`). E `data-click-target`, pro padrão de "botão estilizado que
dispara o seletor de arquivo nativo de um `<input type=file>` escondido".

**Isto não é um `eval` genérico**: só despacha pra funções que já existem
no escopo global da aplicação (`typeof window[nome] === 'function'`) —
nunca executa uma string arbitrária. Testado explicitamente contra
tentativas de abuso (nome inexistente, apontar pra algo que não é função,
JSON malformado) — ver seção de testes.

## Admin: 78 onclick estáticos (HTML) + 25 em templates JS → 0

Convertidos **todos** os onclick estáticos do `wkz-admin.html` via script
de substituição com contagem de verificação a cada padrão (não editei um
por um à mão — risco de erro de digitação alto demais pra 78 ocorrências).
E as 25 ocorrências dentro de templates JS do `wkz-admin.js`, com uma
observação de arquitetura que vale registrar: vários botões dentro de
linhas de tabela/card usavam `event.stopPropagation()` pra evitar que
clicar neles *também* disparasse o `onclick` da linha/card pai (ex.: botão
"Aprovar" dentro de uma linha que abre detalhe ao ser clicada). Com
delegação por `closest('[data-action]')`, isso deixa de ser necessário: o
elemento **mais próximo** do clique já vence sozinho, nunca chega a
considerar o `data-action` do ancestral. Removi os `stopPropagation()`
correspondentes (não foi esquecimento — é consequência direta da nova
arquitetura, documentada inline em cada ponto).

## Bug que eu mesmo introduzi e corrigi antes de entregar

Na primeira passada do script de conversão do HTML, uma barra invertida
espúria vazou pro fim de 48 atributos `data-args` (erro de escape numa
string raw do Python: `\\'` virou dois caracteres literais em vez de
fechar a string). Resultado: `data-args='["kyc","$this"]\'` — JSON
inválido, quebraria a leitura de argumentos silenciosamente. Pego pela
minha própria checagem de validação de JSON logo depois da conversão,
antes de rodar qualquer harness. Corrigido com um replace direcionado e
revalidado do zero.

## O que ficou de fora, de propósito

Dois casos no `wkz-admin.js` que não se encaixam bem no dispatcher genérico:
- `onclick="showToast(WKZ_ICO.search + '...')"` — expressão computada
  (concatenação de variável + string), não um argumento literal. Daria pra
  resolver em tempo de renderização do template e embutir como string
  fixa, mas a mensagem tem aspas internas que complicam o escape com
  segurança — 1 ocorrência, mensagem de "pré-visualização simulada", baixo
  valor pra correr esse risco agora.
- `onclick="this.requestFullscreen && this.requestFullscreen()"` — chama
  um método nativo diretamente no elemento clicado, não uma função global
  do projeto. Formato fundamentalmente diferente do resto (o dispatcher
  assume `window[nome]`, não `elemento[nome]`). 1 ocorrência, botão de
  "expandir tela cheia", cosmético.

Ambos com `onclick` de verdade ainda funcionando, sem alteração.

## Testes / Verificações

Sprint com o teste mais extenso até aqui, porque converter ~99 pontos de
interação de uma vez pede mais do que "não lançou erro ao carregar":

- **Dispatcher isolado, 7 cenários** (antes de tocar em qualquer HTML):
  args literais, sentinela `$this`, sentinela `$tabBtn:`, ação encadeada
  (`data-action2`), e 3 cenários de abuso — nome de função inexistente,
  apontar pra algo que existe mas não é função (`location`), JSON
  malformado. Todos seguros (não lançam erro, não fazem nada indevido).
- **Balanceamento de tags via parser HTML real** (não regex) no
  `wkz-admin.html` após a conversão: 0 problemas.
- **Validade de JSON em 100% dos `data-args`** do HTML estático: pego e
  corrigido o bug da barra invertida (acima) por causa desta checagem.
- **Toda função referenciada existe no runtime**: extraí os 24 nomes
  distintos usados em `data-action`/`data-action2`/`data-close-on-backdrop`
  no HTML real e confirmei, carregando `wkz-core.js`+`wkz-admin.js` de
  verdade, que cada um resolve pra uma function de fato.
- **Todo id em `data-click-target` existe no HTML**, e **toda referência
  `$tabBtn:xxx` tem um botão `[data-tab="xxx"]` correspondente** — os dois
  únicos "vínculos" que o dispatcher não valida sozinho em tempo de
  execução (falhariam silenciosamente se alguém renomeasse uma aba sem
  atualizar a outra ponta).
- **Simulação de cliques reais**: extraí elementos de verdade do HTML
  renderizado e simulei o clique através do dispatcher, confirmando
  `switchAdminTab("kyc", $this)` resolve o elemento certo, e que um
  clique num **filho** do modal-backdrop não fecha o modal (só um clique
  no backdrop em si fecha — testado nos dois sentidos).
- **Renderização real**: chamei `renderSaques()`, `renderDisputas()`,
  `renderAdminKyc()`, `renderAdminStores()`, `renderKzRadar()` de verdade
  com os dados-semente do próprio arquivo, capturei o HTML efetivamente
  gerado e validei os `data-args` **desse HTML renderizado** (não só do
  código-fonte) — 44 atributos, todos com JSON válido.
- **3 harnesses oficiais**: 100% passaram, i18n incluído.
- Um alarme falso no meio do caminho: minha simulação de renderização
  disparou um `ReferenceError` de um timer assíncrono não relacionado
  (sistema de missões, de sprints anteriores) — investiguei antes de
  assumir que era bug meu, e confirmei que é o mock de teste (meu
  `getElementById` sempre retorna algo, mesmo pra ids que não existem)
  sendo mais permissivo que o DOM real. Na página real do Admin,
  `#cpMissaoList` não existe, a guarda (`if (document.getElementById(...))`)
  bloqueia esse código corretamente. Não é uma regressão desta sprint.

## Roadmap atualizado (Sprint M22)

| Módulo | Antes desta sprint | Depois |
|---|---|---|
| Admin | 103 (78+25) | **0** (+2 casos deixados de propósito) |
| Legal | 77 restantes | 77 (sem alteração) |
| Seller | 321 | 321 (sem alteração) |
| Buyer | 661 | 661 (sem alteração) |

Próxima da fila, pelo roadmap original: **Legal** (resto — a TOC já foi
feita na M22), depois Seller, Buyer por último. `'unsafe-inline'` na CSP
continua necessário até os 4 módulos estarem completos.

## Lembrete de processo

Arquivos entregues como download. Substituir `core/wkz-core.js`,
`admin/wkz-admin.html` e `admin/wkz-admin.js` no repositório antes do
próximo deploy. Recomendo um teste manual real no Admin antes de ir pra
produção: trocar de aba pelos cards do Overview, aprovar/recusar um KYC,
abrir e fechar os modais clicando fora, resolver uma disputa pelo Kz
Copilot, e conferir os botões "Antecipar/Aprovar/Reter" na tabela de
saques (a área com os `stopPropagation()` removidos é a que mais merece
esse teste manual, mesmo com toda a simulação já feita aqui).
