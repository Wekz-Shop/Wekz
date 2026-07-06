# Sprint M3 — Seller Hub — Changelog

**Saída:** `seller/wkz-seller.html` + `seller/wkz-seller.js`

## ✅ O que foi extraído

**JS (`wkz-seller.js`, 3.047 linhas, em 6 sub-etapas):**
- 3.1 Dashboard (abas) + Overview + Afiliados + Meus Produtos — origem 30243–30575
- 3.2 Avaliações + Assistente de Cadastro de Produto — origem 30576–31067
- 3.3 Utilitários de UI + Saque Cripto/PIX + Extrato — origem 31068–31508
- 3.4 Resposta a Avaliação/Disputa + Marketing + Relatórios — origem 31509–32489
- 3.5 Detalhe de Pedido + Etiqueta/Despacho + Configurações + `filterProducts` (carve-out isolado) — origem 32490–33060 + 33172–33179
- 3.6 Registro do Vendedor (CNPJ, multi-step) — origem 33520–33673

**HTML (`wkz-seller.html`, 8 páginas):**
`dashboard, auth-seller (reconstruída como página própria), pg-abrir-loja, pg-central-vendedor, pg-vender, pg-vender-taxas, pg-vender-politicas, pg-seller`

## 🔍 Verificação da pendência registrada no M2

**`syncOverviewKPIs()` NÃO tem o entrelaçamento que se temia.** Inspecionado a fundo: é chamada por `window.switchAdminTab()` (Admin) e lê `ADMIN_DISPUTES`/`ADMIN_PAYOUTS` — está fisicamente no território Admin (linha 40681), nunca é referenciada por `switchDashTab()` (Seller). São dois sistemas de abas completamente separados. Nada precisou ser movido; ficou só a confirmação de que a pendência não bloqueava o M3.

## 🔗 Reconexões cross-file (pendências do M2 resolvidas)

- A aba "Ser Vendedor" em `wkz-buyer.html` e os 5 links do footer que apontavam pra `wkz-seller.html` **agora resolvem de verdade** (o arquivo existe).
- `#auth-seller` foi **reconstruída como página própria** (`page-auth-seller`), já que originalmente era só uma sub-aba dentro do `#page-auth` compartilhado com o Buyer — não existia como "página" isolada no monólito. Reaproveita a estrutura visual `auth-wrap`/`auth-card` do Buyer.
- Links de dentro do Seller para Buyer (`auth`, `help`, `home`) e Legal (`pg-returns`, `pg-terms`, `pg-wekz`, `pg-antifraude`, `pg-privacy`) convertidos para `window.location.href` cross-file, mesmo padrão do M2.

## ⚠️ Gap de arquitetura documentado (não corrigido agora — decisão deliberada)

**Aba "Denúncias" do dashboard do Seller (`#dash-denuncias`) existe na UI mas não tem dados.** O patch original que populava essa aba (`renderReports()`) pertence ao sistema de denúncias que ficou inteiro em `wkz-buyer.js` no M2 — arquivo diferente, escopo de JS diferente, sem acesso cross-file possível sem um redesenho. **Comportamento atual: seguro, não quebra** (`switchDashTab()` não referencia `renderReports`/`reportsStore`; clicar na aba só mostra painel vazio com contador "0"). Fica para o Sprint M4/M5: o dado de denúncia é inerentemente multi-parte (Buyer registra, Seller responde, Admin arbitra) — provavelmente deveria migrar para Admin ou Core, não ficar exclusivo do Buyer.

**As 6 funções do sistema de disputa trilateral** (`wkzNotifySellerNewDispute`, `wkzCreateTrilateralDispute`, `wkzPropagateResolutionToSeller`, `wkzNotifyBuyerDisputeVerdict`, `wkzBuyerConfirmReceived`, `wkzSellerUpdateOrderStatus`) continuam deliberadamente fora de `wkz-seller.js`, mesmo fisicamente próximas ao código Seller no monólito (linhas 33061–33341) — leem `CP_DISPUTES`/`ADMIN_DISPUTES`, ambas no território Admin. Ficam para o M4.

## 🔬 Auditoria cirúrgica pós-entrega (ponta a ponta, antes do push)

Pedido específico do Weslan: reconferir tudo antes de anexar no GitHub. Processo: comparar cada função declarada no monólito (30243–33673) contra o que realmente foi parar em `wkz-seller.js`; testar todo `onclick` do HTML contra as funções existentes; testar todo `getElementById()` do JS contra os IDs existentes no HTML.

**Bugs reais encontrados e corrigidos:**

1. **`regNextStep()` vazou pro Seller.** Alias do fluxo de registro do Buyer (chama `regGoStep`, inexistente aqui) — vazou por estar na linha adjacente a `sellerGoStep` no monólito (33670/33671). Não era chamada em lugar nenhum de `wkz-seller.html` (sem crash), mas era lixo cross-module solto. Removida.

2. **Navbar compartilhada (topbar+bottomnav) com 14 funções órfãs.** Busca, filtros, categorias, cupom e "WeKz Boost" só existem em `wkz-buyer.js` — copiar o navbar verbatim pro Seller (mesmo padrão que o Weslan usou no Buyer) geraria `ReferenceError` em qualquer clique nesses elementos. Como o Dashboard do Vendedor não tem catálogo próprio, esses 14 pontos de clique agora navegam para `wkz-buyer.html` em vez de chamar uma função inexistente.

3. **`kzNegSetMargin()`/`kzNegSaveSettings()` — botões estáticos sem função.** Dentro do modal de editar produto existem botões de configuração do "Kz Negotiator" que, no monólito original, já eram comentados como *"Kz Negotiator **admin** helpers"* e logavam em `admAuditAdd(...,'Admin WeKz')` — ou seja, mesmo no monólito isso era uma política administrada centralmente, não uma configuração por vendedor. Adicionado um stub seguro que não fabrica a funcionalidade real (isso é trabalho do Sprint M4), só evita o crash com uma mensagem honesta ("administrado centralmente pela WeKz").

4. **`filterDenuncias()` — mesmo padrão do item 3.** Botões de filtro dentro da aba "Denúncias" (já documentada como sem dados, ver seção anterior) chamavam uma função que só existe em `wkz-buyer.js`. Stub seguro adicionado (só alterna a classe `active` visualmente).

5. **Bug de arquitetura reintroduzido no `core/wkz-core.js`** (fora do escopo do Seller, mas bloqueava a validação ponta a ponta): conteúdo novo do módulo "Client Profile" reatribuía `window._wkzNavHooks` diretamente em duas ocorrências — exatamente o mesmo bug já corrigido no Sprint M1 para o `WkzApp`. Corrigido para usar `registerNavHook()`, mesmo padrão já estabelecido.

**Verificado e confirmado SEM problema** (falsos-positivos da varredura inicial, descartados após inspeção):
- ~90 IDs que o JS busca via `getElementById()` e não existem no HTML estático — na maioria são elementos criados dinamicamente por geradores de modal (`_wkzModal`, `openKYCModal`, etc.) ou têm `if(el)`/`typeof fn === 'function'` guardando cada acesso (`refreshProductEverywhere`, `page-pg-flash` sync). Nenhum crash real.
- "Seller Premium" (planos Starter/Pro com comissão/prazo) — inicialmente pareceu ser feature de comprador por causa do nome; confirmado que é plano de assinatura do **vendedor**, pertence mesmo ao Seller.
- `wkzOpenKYCModal` e os inputs `#kycRG/#kycCNPJ/#kycComp` — confirmados criados dinamicamente dentro do próprio modal antes de qualquer botão poder acioná-los.

**Resultado final:** `node --check` limpo, harness Node executa `wkz-bus.js`+`wkz-core.js`+`wkz-seller.js` de ponta a ponta sem erro, parser HTML com zero erros estruturais, zero `onclick` órfão restante em todo `wkz-seller.html`.

## 🧪 Validação realizada nesta máquina

- `node --check` em todas as 6 sub-etapas + arquivo final: OK
- Harness Node (execução real via `vm`): `wkz-bus.js` + `wkz-core.js` + `wkz-seller.js` rodam de ponta a ponta sem erro
- Parser HTML nativo contra `wkz-seller.html`: zero erros de fechamento, pilha balanceada, 8 páginas confirmadas
- Auditoria cirúrgica completa (ver seção acima): toda função de HTML resolvida, todo DOM ref de JS confirmado seguro
- `test-m3.html` criado (mesmo padrão do M2) — teste real em navegador ainda pendente, fica com você.

