# Sprint M22 — Segurança: primeiro passo da migração onclick → addEventListener

Arquivos alterados: `core/wkz-core.js`, `legal/wkz-legal.html`.
Nenhum arquivo de back-end tocado.

## Sendo direto sobre o tamanho real do problema

Na auditoria eu estimei "~1000 onclick inline" — o número real, contando
também os onclick gerados dentro de strings de template no JS (produtos,
lojas, cards renderizados dinamicamente), é **maior**:

| Módulo | HTML estático | Dentro de templates JS | Total |
|---|---|---|---|
| Buyer | 494 | 167 | 661 |
| Seller | 235 | 86 | 321 |
| Admin | 78 | 25 | 103 |
| Legal | 86 | — | 86 |
| **Total** | | | **~1.171** |

Isso muda a estratégia. Migrar tudo de uma vez, às cegas, sem navegador
real pra testar (este ambiente não tem acesso de rede pra abrir um
browser), é o tipo de mudança que pode quebrar checkout, carrinho ou
disputas silenciosamente — e só apareceria quando um comprador de verdade
esbarrasse nisso. Não vou fazer isso. Prefiro entregar uma base sólida e
testável, mesmo que isso signifique **não zerar 'unsafe-inline' nesta
sprint**.

**Importante: a CSP dos 4 módulos continua com `'unsafe-inline'` em
`script-src`.** Essa sprint não remove isso — ela cria o alicerce pra
remover, aos poucos, nas próximas.

## O que foi feito

### 1. Utilitário de delegação central (`wkz-core.js`)

24% dos onclick do projeto vivem dentro de HTML gerado dinamicamente
(`renderCats()`, `renderAdminStores()`, cards de produto, etc.) — ou seja,
o elemento não existe na página no momento do carregamento.
`addEventListener` direto em cada elemento não resolve isso sozinho (teria
que ser re-vinculado a cada re-renderização, fácil de esquecer ou
duplicar). A solução correta é **delegação de evento**: um único listener
no `document`, que funciona pra qualquer elemento presente no momento do
clique, estático ou recém-inserido via `innerHTML`.

Adicionei essa base em `wkz-core.js` (carregado pelos 4 módulos, então já
fica disponível em todos de graça): um listener de `click` e um de
`keydown` que reagem a qualquer elemento com atributo `data-scroll-to`.
Esse é só o primeiro "ramo" — o padrão é: cada tipo de interação (rolar
até seção, trocar de página, abrir modal, toggle...) vira um novo ramo
dentro do mesmo listener central, em vez de um listener novo por padrão.

### 2. Primeira conversão real, como prova de conceito (`wkz-legal.html`)

Convertidos os 9 links do Sumário de Termos de Uso: de
`onclick="document.getElementById('t1').scrollIntoView(...)"` para
`data-scroll-to="t1"`. Escolhi esse bloco como piloto porque é 100%
estático (não depende de re-render), o comportamento é determinístico e
fácil de verificar sem navegador, e o risco de regressão é o menor
possível do projeto inteiro.

De brinde: esses `<a>` nunca tiveram `href` nem eram focáveis por teclado
(bug de acessibilidade pré-existente, não introduzido por mim). Como já
estava mexendo neles, adicionei `tabindex="0" role="link"` e um listener
de `keydown` (Enter/Espaço) — também centralizado, sem precisar de
`onkeydown` inline por item como o padrão usado em outros pontos do
projeto (`trust-item`, por exemplo).

## Testes / Verificações

- **`node --check`** em `wkz-core.js`: sintaticamente válido.
- **3 harnesses oficiais** (`harness-admin-test.js`,
  `harness-buyer-test.js`, `harness-seller-test.js`) rodados contra o
  `wkz-core.js` novo — **100% passaram nos 3**, incluindo os 6 checks de
  regressão i18n do buyer. Como o core é compartilhado pelos 3 módulos,
  rodei os 3 de propósito (não só o do módulo editado).
- **Teste isolado da lógica de delegação** (script de apoio, não faz parte
  da entrega) simulando `closest()`/`getAttribute()`/`scrollIntoView()` —
  4 cenários verificados: clique direto no link, clique num filho do link
  (o caso que justifica usar `closest()` em vez de checar `ev.target`
  puro), clique em elemento não relacionado (não deve fazer nada) e
  `data-scroll-to` apontando pra um id inexistente (não deve lançar erro).
  Todos corretos.
- **Balanceamento de tags via parser HTML de verdade** (não regex — regex
  simples deu falso positivo numa checagem preliminar, then corrigido)
  rodado nos 4 arquivos HTML do projeto (`wkz-buyer.html`,
  `wkz-seller.html`, `wkz-admin.html`, `wkz-legal.html`): **zero
  problemas de estrutura** em todos.

## Plano para as próximas sprints (não fiz agora, registrando o roteiro)

Ordem sugerida, do menor pro maior risco:
1. **Admin** (103 onclick) — menor módulo, uso interno, menor exposição a
   usuário final.
2. **Legal** (77 onclick restantes) — já com o padrão rodando, mesma
   lógica de baixo risco (maioria é navegação/toggle, não fluxo de
   transação).
3. **Seller** (321 onclick) — módulo intermediário.
4. **Buyer** (661 onclick) — deixado por último de propósito: é onde fica
   checkout, carrinho e pagamento — a área onde uma regressão dói mais.

Só depois de migrar os 4 módulos por completo (incluindo os handlers
dentro de templates JS) é que `'unsafe-inline'` pode sair de `script-src`
com segurança. Cada sprint futura deveria fechar com **teste manual real
em navegador** antes do deploy — os harnesses Node confirmam que o código
não quebra ao carregar, mas não substituem clicar de verdade na interface.

## O que ficou de fora (fora do escopo desta sprint)

- Os ~1.162 onclick restantes no projeto.
- Remoção de `'unsafe-inline'` da CSP (só é seguro depois do item acima).
- Revisei os domínios externos já liberados na CSP (`picsum.photos`,
  `viacep.com.br`, `api.zippopotam.us`, YouTube) — todos estão realmente
  em uso, não havia gordura óbvia pra cortar aí.

## Lembrete de processo

Arquivos entregues como download. Substituir `core/wkz-core.js` e
`legal/wkz-legal.html` no repositório antes do próximo deploy — e, como
sempre, recomendo um teste manual rápido da página de Termos (clicar nos
9 itens do sumário, testar Tab+Enter no teclado) antes de confiar 100% na
prova de conceito.
