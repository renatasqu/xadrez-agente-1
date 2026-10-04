export interface Curiosidade { id: string; texto: string }

export const curiosidades: readonly Curiosidade[] = [
  { id: "cavalo-salta", texto: "O cavalo é a única peça que pode saltar sobre outras peças." },
  { id: "tabuleiro", texto: "O tabuleiro tem 64 casas, organizadas em oito linhas e oito colunas." },
  { id: "casa-direita", texto: "Ao preparar o tabuleiro, a casa do canto à direita de cada jogador deve ser clara." },
  { id: "dama-cor", texto: "Na posição inicial, a dama branca fica em uma casa clara e a dama preta em uma casa escura." },
  { id: "primeiro-lance", texto: "As brancas fazem o primeiro lance da partida." },
  { id: "bispo-cor", texto: "Um bispo permanece em casas da mesma cor durante toda a partida." },
  { id: "torre", texto: "A torre se move pelas linhas e colunas, sem saltar sobre outras peças." },
  { id: "dama", texto: "A dama combina os movimentos da torre e do bispo: pode seguir pelas linhas, colunas e diagonais." },
  { id: "rei", texto: "O rei se move uma casa por vez, exceto no roque. Ele não pode se mover para uma casa atacada." },
  { id: "peao", texto: "O peão avança para a frente, mas captura na diagonal. Ele nunca volta para trás." },
  { id: "peao-inicial", texto: "No primeiro movimento, um peão pode avançar duas casas se ambas estiverem livres." },
  { id: "promocao", texto: "Ao chegar à última fileira, um peão é promovido a dama, torre, bispo ou cavalo da mesma cor." },
  { id: "mais-damas", texto: "A promoção permite ter mais de uma dama no tabuleiro. A escolha não depende das peças já capturadas." },
  { id: "roque", texto: "O roque é um lance que movimenta o rei e uma torre. Ele só é permitido quando suas condições específicas são atendidas." },
  { id: "en-passant", texto: "A captura en passant só pode acontecer imediatamente após o avanço de duas casas do peão adversário que a tornou possível." },
  { id: "xeque-mate", texto: "Xeque-mate acontece quando o rei está em xeque e não há lance legal que elimine a ameaça." },
  { id: "afogamento", texto: "Se o jogador não tem nenhum lance legal e seu rei não está em xeque, ocorre afogamento: a partida termina empatada." },
  { id: "coordenadas", texto: "Na notação algébrica, as colunas vão de a até h e as fileiras de 1 até 8. Cada casa tem um endereço, como e4." },
  { id: "cavalo-cor", texto: "A cada movimento, o cavalo muda de uma casa clara para uma escura, ou de uma escura para uma clara." },
  { id: "diagonal", texto: "Todas as casas de uma mesma diagonal têm a mesma cor." },
];
