// Partida: chess.js. Demonstração: leitura. Exercício: tentativas para o backend.

import { createPortal } from "react-dom";
import { BoardControls } from "./BoardControls";
import { descricaoVisual } from "../exercises/pedagogia";
import { observarIdiomaDoTabuleiro } from "../acessibilidadeTabuleiro";
import { useEffect, useState, useRef, useMemo } from "react";
import type { ExerciseAction, ExerciseGoal, ExerciseSquare } from "../types";
import type { ExerciseVisual } from "../exercises/visual";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { PECAS_DO_TABULEIRO } from "../pixel/pecas";
import { destinosLegais, ladoDaPeca, situacao, tentarLance, vezDe } from "../lances";

// Posição mostrada no lugar da partida (demonstração): sem mexer peças, com o último lance
// destacado.
export interface Exibicao {
  fen: string;
  de: string | null;
  para: string | null;
}

interface BaseProps {
  study?: boolean;
  visible?: boolean; // Evita animar posições enquanto a arena está oculta.
  hideControls?: boolean;
  onMoveIntent?: (uci: string) => void;
  orientation?: "white" | "black";
  humanColor?: "white" | "black";
  estadoTexto?: string;
  terminado?: boolean;
  contextContainer?: HTMLElement | null;
  fen: string;
  ocupado: boolean;
  podeDesfazer: boolean;
  onLance: (fen: string) => void;
  onDesfazer: () => void;
  onReiniciar: () => void;
  onAnalisar: () => void;
}

export interface ExerciseBoardState {
  fen: string;
  goal: ExerciseGoal;
  concluido: boolean;
  visual?: ExerciseVisual;
  preview?: Exibicao | null;
  onTentativa: (action: ExerciseAction) => void;
}
export type BoardModeProps = (
  | { modo?: "normal"; exibicao?: Exibicao | null; exercicio?: never }
  | { modo: "demonstration"; exibicao: Exibicao; exercicio?: never }
  | { modo: "exercise"; exercicio: ExerciseBoardState; exibicao?: never }
);

export type BoardProps = BaseProps & BoardModeProps;

function ehCasa(square: string): square is ExerciseSquare {
  return /^[a-h][1-8]$/.test(square);
}

const CASA_BASE = { backgroundSize: "100% 100%", imageRendering: "pixelated" as const };
const CASA_CLARA = { ...CASA_BASE, backgroundColor: "var(--board-light)" };
const CASA_ESCURA = { ...CASA_BASE, backgroundColor: "var(--board-dark)" };

// Sem animação para quem pede movimento reduzido no sistema.
const MOVIMENTO_REDUZIDO =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Board(props: BoardProps) {
  const boardRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    if (boardRoot.current) return observarIdiomaDoTabuleiro(boardRoot.current);
  }, []);
  const { fen, ocupado, podeDesfazer, onLance, onDesfazer, onReiniciar, onAnalisar } = props;
  // exibicao sem modo mantém compatibilidade com consumidores existentes.
  const modo = props.modo ?? (props.exibicao ? "demonstration" : "normal");
  const exibicao = modo === "demonstration" ? props.exibicao : null;
  const exercicio = props.modo === "exercise" ? props.exercicio : null;
  const fenExibido = exercicio?.preview?.fen ?? exercicio?.fen ?? exibicao?.fen ?? fen;
  const emDemo = modo === "demonstration";
  const emExercicio = modo === "exercise";
  const fimDaPosicao = useMemo(() => new Chess(fen).isGameOver(), [fen]);
  const ladoHumano = props.humanColor === "white" ? "w" : props.humanColor === "black" ? "b" : null;
  const bloqueado = ocupado || Boolean(modo === "normal" && ladoHumano && vezDe(fen) !== ladoHumano) || Boolean(modo === "normal" && (props.terminado || fimDaPosicao)) || emDemo || Boolean(exercicio && (
    exercicio.concluido || exercicio.preview || exercicio.goal.type === "answer_position_question"));
  const controlesBloqueados = ocupado || modo !== "normal";
  const [promocao, setPromocao] = useState<{ de: string; para: string; fen: string } | null>(null);
  useEffect(() => setPromocao(null), [fenExibido, modo, ocupado]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  useEffect(() => setSelecionada(null), [fenExibido, modo]);
  const destinos = selecionada ? destinosLegais(fenExibido, selecionada) : [];

  function jogar(de: string, para: string): boolean {
    setSelecionada(null);
    if (bloqueado) return false;
    if (exercicio) {
      if (ehCasa(de) && ehCasa(para) && de !== para && ladoDaPeca(fenExibido, de)) {
        exercicio.onTentativa({ type: "move", source: de, destination: para });
      }
      // Não move de forma otimista: só resulting_fen pode alterar a posição exibida.
      return false;
    }
    const candidatos = new Chess(fen).moves({ verbose: true }).filter(m => m.from === de && m.to === para);
    if (candidatos.some(m => m.promotion)) { setPromocao({ de, para, fen }); return false; }
    const novo = tentarLance(fen, de, para);
    if (!novo) return false;
    if (props.onMoveIntent) { props.onMoveIntent(de + para); return false; }
    onLance(novo);
    return true;
  }

  function tocar(casa: string) {
    if (exercicio) {
      if (!ehCasa(casa)) return;
      if (selecionada) {
        if (selecionada === casa) setSelecionada(null);
        else jogar(selecionada, casa); // Mesmo fora dos destinos sugeridos pelo chess.js.
      } else if (ladoDaPeca(fenExibido, casa)) setSelecionada(casa);
      return;
    }
    if (selecionada && destinos.includes(casa)) {
      jogar(selecionada, casa);
    } else if (ladoDaPeca(fen, casa) === vezDe(fen)) {
      setSelecionada(casa === selecionada ? null : casa);
    } else {
      setSelecionada(null);
    }
  }

  // Destaques sem apagar o ladrilho: só uma borda interna.
  const estilos: Record<string, React.CSSProperties> = {};
  if (exibicao) {
    if (exibicao.de) estilos[exibicao.de] = { boxShadow: "inset 0 0 0 4px var(--azul-magnus-escuro)" };
    if (exibicao.para) estilos[exibicao.para] = { boxShadow: "inset 0 0 0 4px var(--ouro)" };
  } else {
    if (selecionada) estilos[selecionada] = { boxShadow: "inset 0 0 0 4px var(--ouro)" };
    for (const casa of destinos) estilos[casa] = { boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.75)" };
  }

  if (exercicio?.visual) {
    const visual = exercicio.visual;
    for (const casa of visual.highlightedSquares) {
      estilos[casa] = { boxShadow: "inset 0 0 0 4px var(--ouro)" };
    }
    for (const casa of visual.targetSquares) estilos[casa] = { boxShadow: "inset 0 0 0 4px var(--fogo-hans)" };
    if (visual.sourceSquare) estilos[visual.sourceSquare] = { boxShadow: "inset 0 0 0 4px var(--azul-magnus-escuro)" };
    if (visual.attackerSquare) estilos[visual.attackerSquare] = { boxShadow: "inset 0 0 0 6px var(--azul-magnus-escuro)" };
    if (visual.mateSquare) estilos[visual.mateSquare] = { boxShadow: "inset 0 0 0 5px var(--perigo)" };
    if (visual.destinationSquare) estilos[visual.destinationSquare] = { boxShadow: "inset 0 0 0 4px var(--ouro)" };
    for (const casa of visual.blockedSquares ?? []) estilos[casa] = { outline: "3px dashed var(--perigo)", outlineOffset: "-5px" };
    for (const casa of visual.dangerSquares ?? []) estilos[casa] = { ...estilos[casa], boxShadow: "inset 0 0 0 4px var(--perigo)" };
  }

  for (const casa of exercicio?.visual?.errorSquares ?? []) {
    estilos[casa] = { ...estilos[casa], outline: "3px dashed var(--perigo)", outlineOffset: "-5px" };
  }
  for (const casa of exercicio?.visual?.hintSquares ?? []) {
    estilos[casa] = { ...estilos[casa], backgroundImage: "radial-gradient(circle, #16825d 2px, transparent 3px)",
      backgroundSize: "9px 9px", backgroundPosition: "center bottom", backgroundRepeat: "repeat-x" };
  }
  if (exercicio?.preview) {
    if (exercicio.preview.de) estilos[exercicio.preview.de] = { boxShadow: "inset 0 0 0 4px var(--azul-magnus-escuro)" };
    if (exercicio.preview.para) estilos[exercicio.preview.para] = { boxShadow: "inset 0 0 0 4px var(--ouro)" };
  }

  const context = <>
      <div className={"board-context board-context--" + modo} aria-label="Contexto do tabuleiro">
        <span className="font-pixel">{emExercicio ? "EXERCÍCIO" : emDemo ? "DEMONSTRAÇÃO" : props.study ? "PRÁTICA" : "PARTIDA"}</span>
        <span>{emExercicio ? "Missão de prática" : emDemo ? "Observe a sequência" : props.onMoveIntent ? "Você contra a IA" : "Explore uma posição"}</span>
      </div>
      <p className="text-center font-pixel text-[0.6rem] leading-relaxed" aria-live="polite">
        {emDemo ? props.study ? "Demonstração: sua posição de estudo está guardada." : "Demonstração: a sua partida está guardada." : emExercicio ? "Exercício" : props.estadoTexto ?? situacao(fen)}
      </p>
  </>;

  return (
    <section ref={boardRoot} aria-label="Tabuleiro" className="board-stage flex flex-col gap-4">
      {props.contextContainer ? createPortal(context, props.contextContainer) : context}
      {promocao && <div role="dialog" aria-modal="false" aria-label="Escolha a promoção" onKeyDown={event => { if (event.key === "Escape") setPromocao(null); }}>
        <p>Promover peão para:</p>
        {(["q", "r", "b", "n"] as const).map((peca, i) => <button key={peca} type="button" autoFocus={i === 0}
          onClick={() => {
            if (!bloqueado && promocao.fen === fen) {
              const novo = tentarLance(fen, promocao.de, promocao.para, peca);
              if (novo) { if (props.onMoveIntent) props.onMoveIntent(promocao.de + promocao.para + peca); else onLance(novo); }
            }
            setPromocao(null);
          }}>{["Dama", "Torre", "Bispo", "Cavalo"][i]}</button>)}
        <button type="button" onClick={() => setPromocao(null)}>Cancelar promoção</button>
      </div>}
      <div className="moldura-tabuleiro w-full">
        <Chessboard
          options={{
            position: fenExibido,
            boardOrientation: props.orientation ?? "white",
            pieces: PECAS_DO_TABULEIRO,
            showAnimations: !MOVIMENTO_REDUZIDO && props.visible !== false,
            animationDurationInMs: 400,
            lightSquareStyle: CASA_CLARA,
            darkSquareStyle: CASA_ESCURA,
            squareStyles: estilos,
            allowDragging: !bloqueado && !promocao,
            canDragPiece: ({ square }) => !bloqueado && !promocao && (!ladoHumano || Boolean(square && ladoDaPeca(fenExibido, square) === ladoHumano)),
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              !bloqueado && !promocao && targetSquare ? jogar(sourceSquare, targetSquare) : false,
            onSquareClick: ({ square }) => !bloqueado && !promocao && tocar(square),
          }}
        />
      </div>

      {exercicio?.visual && <div aria-label="Destaques do exercício" className="text-center text-xs" aria-live="polite">
        {descricaoVisual(exercicio.visual).map((text) => <p key={text}>{text}</p>)}
        {exercicio.preview && <p>Prévia da refutação: {exercicio.preview.de ?? "posição inicial"}{exercicio.preview.para ? ` → ${exercicio.preview.para}` : ""}. Volte ao exercício para tentar novamente.</p>}
      </div>}
      {!props.hideControls && <BoardControls ocupado={controlesBloqueados} podeDesfazer={podeDesfazer}
        onAnalisar={onAnalisar} onDesfazer={onDesfazer} onReiniciar={onReiniciar} />}
    </section>
  );
}
