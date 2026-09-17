# Checklist de Revisão — Sprint M30 (i18n/moeda)

Como testar: abra `wkz-buyer.html`, troque o idioma pelo seletor 🌐 (agora
só 7 opções: PT/EN/ES/中文/FR/DE/JP) e a moeda pelo seletor 💲 (agora só
8 opções: BRL/USD/EUR/GBP/JPY/ARS/MXN/CNY). Repita os passos abaixo para
pelo menos 2-3 idiomas diferentes (sugiro EN, ZH e um terceiro à sua
escolha — são os mais prováveis de revelar algo que passou despercebido).

## 1. Seletores
- [ ] Idioma: só aparecem as 7 opções funcionais (sem coreano/árabe/etc.)
- [ ] Moeda: só aparecem as 8 opções funcionais (sem coroa sueca/won/etc.)
- [ ] Nomes das moedas no seletor traduzem junto com o idioma
- [ ] Título dos dois painéis ("Selecionar Idioma"/"Selecionar Moeda") traduz

## 2. Home
- [ ] Categorias, banners, grade de produtos (badges, botões, "vendidos")
- [ ] Preços convertem para a moeda escolhida

## 3. Categoria (ex.: clique em "Moda" ou "Eletrônicos")
- [ ] Título e breadcrumb da categoria traduzem
- [ ] Sidebar de filtros inteira (Faixa de Preço, Avaliação, Origem, Envio,
      Condição, botões Aplicar/Limpar)
- [ ] Dropdowns de ordenar/por página
- [ ] Grade de produtos + paginação (Anterior/Próxima)
- [ ] Troque o idioma **com a página de categoria já aberta** — deve
      re-traduzir tudo sem sair da página

## 4. Loja (clique em qualquer loja, ex.: "TechStore Brasil")
- [ ] Breadcrumb, badges (Verificado/Resposta rápida), botões (Seguir/Chat)
- [ ] Estatísticas (Vendas/Seguidores/Produtos/Avaliação)
- [ ] Cards de política (30 dias devolução, Produto original etc.)
- [ ] "Produtos da {Loja}" — em 中文/日本語 o nome da loja deve vir
      **antes** da palavra "商品" (ordem invertida), não depois
- [ ] Reviews + selo "Compra verificada"
- [ ] Troque o idioma com a loja já aberta — deve re-traduzir no lugar

## 5. Rodapé (role até o final de qualquer página)
- [ ] Os 4 títulos de coluna (Comprar/Vender/Suporte/WeKz) traduzem
- [ ] Todos os links dentro de cada coluna traduzem
- [ ] Os `title` (tooltip ao passar o mouse) das colunas Vender/Suporte
      ficam **em português mesmo** — decisão consciente (são referências a
      leis brasileiras específicas: CDC, MCI, NF-e)

## 6. Rastrear Pedido
- [ ] Banner amarelo de "Modo Demonstração" (o de cima, sempre visível)
- [ ] Busca WKZ-8821, WKZ-8654, WKZ-8412 e WKZ-8200 (os 4 chips de
      "Pedidos recentes") — stepper, histórico, ETA/contagem regressiva
- [ ] Card de custódia/pagamento (o bloco colorido com o botão de ação) —
      **revisão com atenção especial**, é o texto financeiro mais sensível
      que traduzi nesta sprint
- [ ] Nomes dos eventos do histórico (ex. "Liberado pela alfândega HK")
      **continuam em PT de propósito** — não é bug

## 7. Página de Produto (PDP)
- [ ] Widget de estoque (abra um produto com poucas unidades, se houver
      algum no mock) — "Restam apenas X!", "Em estoque" etc.
- [ ] Troque o idioma com a PDP aberta — deve re-traduzir no lugar

## 8. Carrinho
- [ ] Adicione produtos e **troque a moeda** — os preços do carrinho
      devem converter (antes ficavam sempre em R$, era um bug real)
- [ ] Estado vazio, botões +/-/salvar/remover, badge Flash Sale
- [ ] Sidebar de resumo (Subtotal/Frete/Desconto/Total/cupom)
- [ ] Esvazie o carrinho e confira o estado vazio também

## 9. Favoritos
- [ ] Aba Produtos: badges, botões, estado vazio, coleções
- [ ] Aba Lojas Seguidas: tags, botão "Deixar de Seguir", estado vazio

## O que ainda está pendente (fora desta sprint)
- Checkout completo (Pix/Cartão/Boleto, endereços, revisão do pedido)
- Chat/mensagens
- Ticker social da PDP ("N vendidos nas últimas 2h")
- Ferramenta de Comparar Produtos

## Se encontrar algo quebrado
Anote: (1) idioma ativo, (2) página, (3) o texto exato que ficou em PT ou
errado, e (4) se possível, um print. Isso acelera muito a correção.
