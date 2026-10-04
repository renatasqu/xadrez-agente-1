# Verificação do layout fluido

Referência: os dois ASCII do PDF, com o texto do pedido prevalecendo.

Chrome isolado: 375×812, 768×1024, 1280×900 e 1920×1080; também 812×375 (paisagem) e 900×600. Capturas e medidas estão nesta pasta.

O script verifica ausência de scroll horizontal, proporção quadrada, peças centralizadas com 90% da casa, altura medida de barra/controles/gaps, ordem mobile, histórico recolhível e sete controles. Também verifica os oito destinos do menu, destaque ativo, preservação do tabuleiro e pausa ao trocar de página, pop-ups, foco após mudança de breakpoint, os dois atalhos flutuantes e confirmação/cancelamento de Sair. A confirmação encerra a partida usando o reset existente e volta à Home.

Saúde/latência e respostas de análise são simuladas apenas no navegador de QA; esta verificação não atesta disponibilidade do backend.

Com preview e Chrome CDP isolado já iniciados:

```sh
CDP_URL=http://127.0.0.1:9227 PREVIEW_URL=http://127.0.0.1:5178 node qa-visual/fluid-layout/check-layout.mjs
```
