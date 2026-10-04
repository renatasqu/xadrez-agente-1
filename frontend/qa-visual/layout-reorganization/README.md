# Validação da reorganização do layout

Capturas do build de produção no Chrome local isolado, com respostas de saúde e análise simuladas apenas para a inspeção visual. Não representam uma medição do backend em produção. As capturas e verificações anteriores foram preservadas em suas pastas.

- Larguras verificadas: 320, 390, 820, 899, 900, 1024, 1280 e 1440 px.
- Sem transbordamento horizontal; tabuleiro quadrado; sete controles preservados.
- Desktop: quatro blocos na faixa superior, contexto separado, área central em flex com wrap, análises lado a lado e rodapé em duas colunas.
- Abaixo de 900 px: menu fechado inicialmente; sequência visual solicitada; Tutor/Lições lado a lado; histórico recolhível com contador e seleção preservados.
- Tutor, Lições, Curiosidades e Comentário/Like: abertura, Escape, foco, limites da janela e scroll interno verificados em 320, 820 e 1440 px.
- Menu mobile e navegação para histórico verificados em 320 px.
- Análise longa recebida e detalhes expandidos verificados em 320, 820 e 1440 px.
- Comentário/Like é uma interface local: rascunho e escolha permanecem enquanto o app está montado, sem publicação ou persistência no servidor.
- Sair é provisoriamente uma ação de retorno à Home, isolada no callback `onExit`, sem apagar partida ou armazenamento local.
- Não existem os dois botões circulares flutuantes descritos no código do app. Não foram criados componentes para controles externos.

Para repetir, iniciar o preview do frontend e um Chrome **isolado** com depuração remota, então executar:

```sh
CDP_URL=http://127.0.0.1:9227 PREVIEW_URL=http://127.0.0.1:5178 node qa-visual/layout-reorganization/check-layout.mjs
```

O script usa somente a página do preview e grava as capturas nesta pasta. As respostas simuladas são injetadas no navegador, sem editar as APIs do projeto.
