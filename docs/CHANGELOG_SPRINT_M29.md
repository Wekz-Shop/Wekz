# Sprint M29 — Bugfix: placeholders `${WKZ_ICO.x}` aparecendo como texto literal

Arquivos alterados: `seller/wkz-seller.js`, `admin/wkz-admin.js`.
Reportado pelo usuário via prints das páginas "Meus Produtos" (modal
Editar Produto) e "Denúncias" do painel do vendedor.

## Causa raiz

`${WKZ_ICO.clock}` só é substituído pelo valor real quando está dentro de
uma **template literal** (crase `` ` ``). Em várias partes do projeto, o
mesmo texto foi escrito dentro de uma **string comum** (aspas simples,
concatenada com `+`) — nesse caso o JavaScript não interpreta `${...}`,
só imprime os caracteres literalmente. É um erro de digitação recorrente
(usar `${x}` por hábito, mesmo fora de uma template literal), não
relacionado a nenhuma das sprints de segurança anteriores.

## Como investiguei

Escrevi um analisador que percorre o arquivo caractere a caractere,
rastreando se cada trecho está dentro de aspas simples, aspas duplas ou
crase — e sinaliza todo `${...}` que aparece dentro de aspas simples/duplas
(onde não funciona). A primeira versão do analisador se confundia com
literais de regex (`/'/g`, usados em vários pontos do projeto pra
sanitizar apóstrofos), gerando falsos positivos — descartados após
checagem manual de amostra. Toda ocorrência real de `WKZ_ICO` quebrada foi
conferida individualmente antes de corrigir.

## O que foi corrigido

**`wkz-seller.js` — 15 ocorrências:**
- Modal "Editar Produto": o aviso `⚠ vazio na publicação` que aparece do
  lado de cada campo em branco (exatamente o do seu print).
- Página "Denúncias": ícone de escudo (vazio, defesa enviada, botão
  "Apresentar Defesa"), ícone de raio (botão de simular avanço), ícone de
  relógio (horário nos logs), e o card resumido de cada denúncia com **2**
  ícones quebrados na mesma linha (`${WKZ_ICO.clipboard}` + `${WKZ_ICO.clock}`
  — exatamente o do seu print).
- 3 rótulos do formulário de verificação KYC (RG/CPF, CNPJ, Comprovante).
- Mensagem de "Frete Grátis ativado" ao configurar cupom.
- Um `data-args` com chave dupla (`${pedido}}`) que sobrou de uma correção
  anterior — sem relação com o problema reportado, mas causaria o ID do
  pedido aparecer com um `}` sobrando no final.

**`wkz-admin.js` — 17 ocorrências:**
- As 12 respostas do assistente "Kz IA" (aba Painel Geral) — cada uma
  delas mostraria os ícones quebrados quando o admin fizesse uma pergunta.
- 4 telas de "lista vazia" (nenhuma loja/verificação/produto/disputa
  nesta categoria).
- 1 badge de risco na tabela de saques ("Risco alto"/"Verificar").

## Bug extra encontrado no caminho (não relacionado a ícones)

Na página de Denúncias do Seller, o botão "Copiar Rastreio" tinha o
próprio `onclick` corrompido (sintaxe inválida, sobrou de antes das
sprints de segurança alcançarem esse trecho específico) — clicar nele
lançaria erro em vez de copiar o código de rastreio. Corrigido junto,
convertido pro mesmo padrão `data-action` do resto do projeto. Também
notei que o ícone de prancheta é SVG (não emoji) — evitei colocá-lo
dentro do texto do toast por segurança (aspas do SVG quebrariam o JSON do
`data-args`, mesmo cuidado já tomado em sprints anteriores); o ícone
continua aparecendo normalmente no rótulo visível do botão.

## Testes / Verificações

- **`node --check`** em ambos os arquivos: sintaxe válida.
- **Analisador de string state** rodado de novo após as correções: 0
  ocorrências de `WKZ_ICO` quebrada restante em nenhum dos 3 arquivos
  (seller, admin, buyer — buyer já não tinha nenhuma).
- **Varredura de barra invertida espúria** (checagem padrão de todas as
  sprints de segurança): 0 problemas.
- **Harnesses oficiais do Admin e do Seller**: 100% passaram.

## Lembrete de processo

Arquivos entregues como download. Substituir `seller/wkz-seller.js` e
`admin/wkz-admin.js` no repositório. Recomendo abrir a página de
Denúncias do Seller e o modal de Editar Produto pra confirmar visualmente
que os ícones aparecem certos agora, e testar o assistente Kz IA no Admin
perguntando sobre "faturamento", "lojas", "segurança" e "moderação".
