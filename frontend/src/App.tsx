// Tabuleiro e missão em destaque; tutor lateral e lição ao final no celular.

import { useEffect, useRef, useState } from "react";
import { ErroDaApi, api } from "./api";
import { apagarUsuarioId, gravarUsuarioId, lerUsuarioId } from "./armazenamento";
import { BoardControls } from "./components/BoardControls";
import { Avatar } from "./components/Avatar";
import { useExercise } from "./exercises/useExercise";
import { ExercisePanel } from "./components/ExercisePanel";
import { Board, type BoardModeProps, type Exibicao } from "./components/Board";
import { Chat, type ItemDoChat, type ModoDoChat } from "./components/Chat";
import type { TipoDeEspera } from "./components/etapas";
import { Licao } from "./components/Licao";
import { Sobre } from "./components/Sobre";
import { StatusSaude } from "./components/StatusSaude";
import { FEN_INICIAL } from "./lances";
import { passosDaDemo } from "./demonstracao";
import { Reprodutor } from "./components/Reprodutor";
import type { Demonstracao, InfoLicao, RespostaLicao, Resposta } from "./types";

let proximoId = 1;
const INTERVALO_DA_DEMO_MS = 1200;

// Omit que respeita cada variante da união (o Omit comum junta as variantes).
type SemId<T> = T extends unknown ? Omit<T, "id"> : never;

function tituloDaLicao(licao: InfoLicao, retomando = false): string {
  return `${retomando ? "Retomando · " : ""}Lição ${licao.numero}/${licao.total} · ${licao.modulo} · ${licao.titulo}`;
}

export function App() {
  const [historico, setHistorico] = useState<string[]>([FEN_INICIAL]);
  const [itens, setItens] = useState<ItemDoChat[]>([]);
  const [esperando, setEsperando] = useState<TipoDeEspera | null>(null);
  const [licao, setLicao] = useState<RespostaLicao | null>(null);
  const exercicio = useExercise();
  const exerciseId = useRef<string | null>(null);
  const [refutacao, setRefutacao] = useState<Exibicao | null>(null);
  const retomou = useRef(false);
  const fen = historico[historico.length - 1];
  // Demonstração: a partida da pessoa (historico) fica intacta; o tabuleiro só mostra os passos.
  const [demo, setDemo] = useState<Demonstracao | null>(null);
  const [passo, setPasso] = useState(0);
  const [tocando, setTocando] = useState(false);
  const passos = demo ? passosDaDemo(demo.fen_inicial, demo.lances) : [];

  useEffect(() => {
    if (!tocando || exercicio.exercise) return;
    if (passo >= passos.length - 1) {
      setTocando(false);
      return;
    }
    const relogio = setTimeout(() => setPasso((p) => p + 1), INTERVALO_DA_DEMO_MS);
    return () => clearTimeout(relogio);
  }, [tocando, passo, passos.length, exercicio.exercise]);

  function abrirExercicio(id: string) {
    exerciseId.current = id;
    setDemo(null); setTocando(false); setRefutacao(null);
    void exercicio.carregar(id);
  }
  function fecharExercicio() {
    setRefutacao(null);
    exercicio.fechar();
  }

  function verNoTabuleiro(nova: Demonstracao) {
    fecharExercicio();
    setDemo(nova);
    setPasso(0);
    setTocando(true);
  }

  function voltarAMinhaPosicao() {
    setDemo(null);
    setTocando(false);
  }

  function adicionar(item: SemId<ItemDoChat>) {
    setItens((atuais) => [...atuais, { ...item, id: proximoId++ } as ItemDoChat]);
  }

  function mostrarResposta(resposta: Resposta, erro = false, titulo?: string) {
    adicionar({ tipo: "resposta", resposta: { ...resposta,
      concept_ids: resposta.concept_ids ?? [], related_exercise_ids: resposta.related_exercise_ids ?? [],
    }, erro, titulo });
  }

  function aplicarLicao(dados: RespostaLicao, retomando = false) {
    gravarUsuarioId(dados.usuario_id);
    setLicao(dados);
    if (dados.conteudo) {
      const titulo = dados.licao ? tituloDaLicao(dados.licao, retomando) : undefined;
      mostrarResposta({ ...dados.conteudo,
        concept_ids: dados.conteudo.concept_ids ?? dados.concept_ids ?? [],
        related_exercise_ids: dados.conteudo.related_exercise_ids ?? dados.related_exercise_ids ?? [],
      }, false, titulo);
    }
  }

  /** Roda uma chamada mostrando o indicador de espera; erros viram mensagem com `.resposta`. */
  async function executar<T>(tipo: TipoDeEspera, chamada: () => Promise<T>, aoTerminar: (dados: T) => void) {
    setEsperando(tipo);
    try {
      aoTerminar(await chamada());
    } catch (erro) {
      if (erro instanceof ErroDaApi) mostrarResposta(erro.resposta, true);
      else throw erro;
    } finally {
      setEsperando(null);
    }
  }

  // Ao abrir: se já existe um id guardado, retoma a lição atual.
  useEffect(() => {
    if (retomou.current) return; // o StrictMode roda o efeito duas vezes no desenvolvimento
    retomou.current = true;
    const usuarioId = lerUsuarioId();
    if (!usuarioId) return;
    api
      .licaoAtual(usuarioId)
      .then((dados) => aplicarLicao(dados, true))
      .catch((erro) => {
        if (erro instanceof ErroDaApi && erro.status === 400) apagarUsuarioId(); // id inválido
        // 404: ainda não começou; sem servidor: a luz de status já avisa
      });
  }, []);

  function perguntar(texto: string, anexarPosicao: boolean, modo: ModoDoChat) {
    if (modo === "recomendar") {
      adicionar({ tipo: "pergunta", texto: `Qual documento me ajuda? ${texto}` });
      executar("recomendar", () => api.recomendar(texto), (r) => mostrarResposta(r));
      return;
    }
    adicionar({ tipo: "pergunta", texto: anexarPosicao ? `${texto}\n(posição: ${fen})` : texto });
    executar("chat", () => api.perguntar(texto, anexarPosicao ? fen : undefined), (r) => mostrarResposta(r));
  }

  function analisar() {
    adicionar({ tipo: "pergunta", texto: "Analise esta posição." });
    executar("analise", () => api.analisar(fen), (r) => mostrarResposta(r));
  }

  function proximaLicao() {
    executar("licao", () => api.proximaLicao(lerUsuarioId()), (dados) => aplicarLicao(dados));
  }

  const tabuleiro: BoardModeProps =
    exercicio.exercise && exercicio.resulting_fen ? {
      modo: "exercise", exercicio: { fen: exercicio.resulting_fen, goal: exercicio.exercise.goal,
        concluido: exercicio.concluido, visual: exercicio.visual, preview: refutacao,
        onTentativa: (action) => { setRefutacao(null); void exercicio.tentar(action); } },
    } : demo && passos[passo] ? { modo: "demonstration", exibicao: passos[passo] }
      : { modo: "normal" };

  return (
    <div className="min-h-screen">
      <header className="game-header">
        <h1 className="font-pixel text-sm text-gelo-escuro sm:text-base">Xadrez Agente</h1>
        <div className="flex items-center gap-3">
          <Avatar lado="gelo" />
          <span className="font-pixel text-[0.6rem] text-slate-400">×</span>
          <Avatar lado="fogo" />
        </div>
        <div className="ml-auto">
          <StatusSaude />
        </div>
      </header>
      <main className="game-layout">
        <div className="board-workspace">
          <Board
            key={exercicio.exercise?.id ?? "partida"}
            {...tabuleiro}
            hideControls
            fen={fen}
            ocupado={esperando !== null || exercicio.loading}
            podeDesfazer={historico.length > 1}
            onLance={(novo) => setHistorico((h) => [...h, novo])}
            onDesfazer={() => setHistorico((h) => (h.length > 1 ? h.slice(0, -1) : h))}
            onReiniciar={() => setHistorico([FEN_INICIAL])}
            onAnalisar={analisar}
          />
          <ExercisePanel state={exercicio} visual={exercicio.visual}
            onAction={(action) => { setRefutacao(null); void exercicio.tentar(action); }}
            onClose={fecharExercicio} onPreview={setRefutacao}
            onRetry={() => { if (exerciseId.current) abrirExercicio(exerciseId.current); }} />
          {!exercicio.exercise && demo && passos.length > 0 && (
            <Reprodutor
              descricao={demo.descricao}
              passos={passos}
              passo={passo}
              tocando={tocando}
              onIr={(novo) => {
                setTocando(false);
                setPasso(Math.max(0, Math.min(novo, passos.length - 1)));
              }}
              onTocar={(tocar) => {
                if (tocar && passo >= passos.length - 1) setPasso(0);
                setTocando(tocar);
              }}
              onVoltar={voltarAMinhaPosicao}
            />
          )}

          <BoardControls ocupado={esperando !== null || exercicio.loading || tabuleiro.modo !== "normal"}
            podeDesfazer={historico.length > 1} onAnalisar={analisar}
            onDesfazer={() => setHistorico((h) => h.length > 1 ? h.slice(0, -1) : h)}
            onReiniciar={() => setHistorico([FEN_INICIAL])} />
        </div>
        <Chat itens={itens} esperando={esperando} onEnviar={perguntar} onVerNoTabuleiro={verNoTabuleiro} onPractice={abrirExercicio} />
        <Licao licao={licao?.licao ?? null} concluido={licao?.concluido ?? false} ocupado={esperando !== null} onProxima={proximaLicao}
            relatedExerciseIds={licao?.related_exercise_ids ?? licao?.conteudo?.related_exercise_ids ?? []}
            onPractice={abrirExercicio} />
      </main>
      <Sobre />
    </div>
  );
}
