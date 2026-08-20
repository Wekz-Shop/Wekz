# Sprint M16 — Reset completo do "Meu Perfil" ao criar uma conta nova (FIX-CADASTRO-03)

Arquivos alterados: `wkz-core.js`, `wkz-buyer.js`.
Arquivo novo: `test-fix-cadastro-reset.js`.

## Bug reportado

Print enviado: após um novo cadastro (usuário "Weslan"), a página "Meu
Perfil" continuava mostrando 12 Pedidos, R$ 242,86 economizados, 8.340 pts,
nível "Cyber", "Membro desde Mar 2024", 4 encomendas no Rastreador, 5
compras no Histórico e 3 entradas no Micro-Histórico — todos dados da
persona de demonstração "Alexandre", herdados por qualquer conta nova
criada no mesmo navegador. Risco real: dois usuários diferentes veriam
exatamente as mesmas informações de atividade na própria conta.

## Causa raiz

O nome/email/telefone/CPF/CEP já eram sincronizados corretamente com os
dados reais digitados no cadastro (fix de um sprint anterior,
FIX-CADASTRO-01). O problema estava em outra camada: os datasets que
alimentam pedidos, histórico de compras, disputas, cartões salvos,
pontos/nível e "Membro desde" são inicializados **uma única vez**, no
carregar do script, com os valores fixos da persona "Alexandre" — e nunca
eram limpos depois. Qualquer cadastro novo só sobrescrevia identidade,
nunca atividade.

Dois bugs adicionais da mesma família foram encontrados durante a
investigação e corrigidos juntos, por estarem na mesma superfície:

1. O contador "Pedidos" do hero (`#cpStatHeroOrders`) era um "12" fixo no
   HTML e nunca era atualizado por nada — nem por uma compra real
   concluída durante a própria sessão.
2. O bônus de "+100 pts por perfil 100% completo" escrevia um texto fixo
   `"8.440"` (= 8.340 da Alexandre + 100) em vez de somar aos pontos reais
   da conta — ficaria ainda mais visível/quebrado com o reset (conta nova
   em 0 pts "pulando" pra 8.440 do nada).
3. Telefone/CPF/CEP/país de uma conta anterior vazavam pra uma conta nova
   sempre que o cadastro seguinte pulasse essas etapas (todas opcionais no
   fluxo completo, e nem coletadas no cadastro rápido) — mesma classe de
   bug do reportado, só que em campos de identidade em vez de atividade.

## Correção

- **`window.wkzResetProfileForNewAccount()`** (novo, em `wkz-core.js`):
  zera pedidos, histórico de compras, disputas e cartões salvos; deixa o
  micro-histórico só com "Conta criada — bem-vindo(a)"; re-renderiza tudo.
- **`window.cpResetMissoes()`** (novo, em `wkz-core.js`): zera o progresso
  das Missões do Dia.
- **`_wkzResetForNewRegistration()`** (novo, em `wkz-buyer.js`): ponto
  único chamado por `finishRegister()` e `regQuickFinish()` — chama as duas
  funções acima, zera `userPoints`, `WKZ_REFERRAL_STATE`,
  `WKZ_USER_INTERESTS`, avatar, e telefone/CPF/CEP/país; calcula e persiste
  o "Membro desde" real (mês/ano do cadastro, via `WKZ_PROFILE_EXTRA`,
  sobrevive a reload do mesmo jeito que os outros campos extra).
- Reforço em **`cpLogout()`**: como é uma SPA (não recarrega a página ao
  sair), chama o mesmo reset — sem isso, cadastrar de novo sem dar reload
  manual entre as duas contas ainda herdaria dados da sessão anterior.
- `cpSyncOrdersHeroCount()` (novo): mantém `#cpStatHeroOrders` sincronizado
  com o histórico de compras real, chamado no reset, numa compra nova
  (`cpRegisterNewPurchase`) e sempre que "Meu Perfil" abre.
- Bônus de perfil completo agora credita de verdade em `userPoints` (com
  flag de idempotência `WKZ_PROFILE_EXTRA._bonusAwarded`, pra não somar de
  novo a cada "Guardar Alterações") e reusa `cpSyncLevelDisplay()` /
  `cpRefreshLevelGuide()` em vez de escrever texto fixo no DOM.

Idioma/moeda (`WKZ_PROFILE_EXTRA.lang`/`.curr`) foram **mantidos**
intencionalmente entre contas — mesmo raciocínio de UX já usado em
`cpLogout()` para `wkzLang`/`wkzCurrency` (não são dado pessoal
identificável, diferente de telefone/CPF/CEP).

## Testes

- `test-fix-cadastro-reset.js` (novo): registra a conta A, gera atividade
  real (compra, pontos, indicação), registra a conta B **na mesma aba, sem
  reload**, e confirma que B nasce com pedidos/histórico/pontos/indicações/
  telefone/CPF/CEP zerados e "Membro desde" com a data real — além do
  bônus de perfil completo creditando certo e de forma idempotente.
- Suíte de regressão completa (10 arquivos: cadastro, kzlive, home/
  paginação, disputas, comunicados, form-select, harnesses buyer/seller/
  admin) — **0 falhas**.
