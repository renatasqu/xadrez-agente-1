import type { ProfileRequest } from "./agentPresentation";
import { tutorContextLabel, type TutorPositionContext } from "./tutorContext";
// Arena da partida; tutor e lições acessíveis sob demanda.

import { HistoryOverview } from "./components/HistoryOverview";
import { canonicalizeHash, pageFromHash, pageHashes, type AppPage } from "./navigation";
import { RatingPanel } from "./components/RatingPanel";
import { AiGame, type AiGameHandle } from "./components/AiGame";
import { createPortal } from "react-dom";
import { useMatchLayout } from "./match/useMatchLayout";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ErroDaApi, api } from "./api";
import { apagarUsuarioId, gravarUsuarioId, lerUsuarioId } from "./armazenamento";
import { AgentHeaderCard, AgentThinking, MoveHistory, recordedMoves, type MatchSide } from "./match/MatchArena";
import { MatchControls } from "./match/MatchControls";
import { useExercise } from "./exercises/useExercise";
import { ExercisePanel } from "./components/ExercisePanel";
import { Board, type BoardModeProps, type Exibicao } from "./components/Board";
import { Chat, type ItemDoChat, type ModoDoChat } from "./components/Chat";
import type { TipoDeEspera } from "./components/etapas";
import { CuriositiesCard } from "./components/CuriositiesCard";
import { CommentLike } from "./components/CommentLike";
import { ContentModal } from "./components/ContentModal";
import { RespostaDoAgente } from "./components/Mensagem";
import { Carregando } from "./components/Carregando";
import { EXERCISE_LABELS } from "./exercises/pedagogia";
import { lessonCatalog } from "./lessonCatalog";
import { Licao } from "./components/Licao";
import { Masters } from "./components/Masters";
import { Sobre } from "./components/Sobre";
import { BrandLogo } from "./components/BrandLogo";
import { HeaderNavigation } from "./components/HeaderNavigation";
import { StatusSaude } from "./components/StatusSaude";
import { InteractiveCard } from "./components/InteractiveCard";
import { FloatingAction } from "./components/FloatingAction";
import tutorIcon from "./assets/tutor-computador.png";
import lessonsIcon from "./assets/licoes-smoothie-transparente.png";
import { FEN_INICIAL, jogoDoHistorico, estadoPartida, textoEstado } from "./lances";
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


export function App({ onLogout }: { onLogout?: () => void } = {}) {
  const [profileRequest, setProfileRequest] = useState<ProfileRequest | null>(null);
  const [aiMode, setAiMode] = useState(pageFromHash() !== "practice");
  const [aiVisited, setAiVisited] = useState(pageFromHash() !== "practice");
  const aiGameRef = useRef<AiGameHandle>(null);
  const [aiGameActive, setAiGameActive] = useState(false);
  const [aiFen, setAiFen] = useState<string | null>(null);
  const [officialTutor, setOfficialTutor] = useState<{ context: TutorPositionContext | null; key: string }>({ context: null, key: "" });
  const onOfficialTutorContext = useCallback((context: TutorPositionContext | null, key: string) => {
    setOfficialTutor(previous => previous.key === key ? previous : { context, key });
  }, []);
  const [page, setPage] = useState<AppPage>(canonicalizeHash);
  const { layoutRef, mobile } = useMatchLayout(page === "practice" && !aiMode);
  const [desktopTutorHost, setDesktopTutorHost] = useState<HTMLDivElement | null>(null);
  const [desktopLessonsHost, setDesktopLessonsHost] = useState<HTMLDivElement | null>(null);
  const [mobileAccessHost, setMobileAccessHost] = useState<HTMLDivElement | null>(null);
  const [historico, setHistorico] = useState<string[]>([FEN_INICIAL]);
  const [itens, setItens] = useState<ItemDoChat[]>([]);
  const [esperando, setEsperando] = useState<TipoDeEspera | null>(null);
  const [modal, setModal] = useState<"tutor" | "lessons" | "curiosities" | "comment" | "about" | "documentation" | null>(() => pageFromHash() === "about" ? "about" : null);
  const [boardContextHost, setBoardContextHost] = useState<HTMLDivElement | null>(null);
  const currentPage = useRef(page);
  const aboutOpener = useRef<HTMLElement | null>(null);
  const aboutReturn = useRef<AppPage>("match");
  const modalOpener = useRef<HTMLElement | null>(null);
  const [tutorLesson, setTutorLesson] = useState<string | null>(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [lessonError, setLessonError] = useState<Resposta | null>(null);
  const [licao, setLicao] = useState<RespostaLicao | null>(null);
  const exercicio = useExercise();
  const exerciseId = useRef<string | null>(null);
  const [refutacao, setRefutacao] = useState<Exibicao | null>(null);
  const retomou = useRef(false);
  const jogo = useMemo(() => jogoDoHistorico(historico), [historico]);
  const estado = useMemo(() => estadoPartida(jogo), [jogo]);
  const fen = jogo.fen();
  const [matchPaused, setMatchPaused] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [activity, setActivity] = useState({ w: 0, b: 0 });
  const [analyses, setAnalyses] = useState<Partial<Record<MatchSide, { fen: string; resposta: Resposta }>>>({});
  const matchSide: MatchSide = fen.split(" ")[1] === "b" ? "b" : "w";
  const moves = useMemo(() => recordedMoves(historico), [historico]);
  const historyIndex = selectedPosition ?? historico.length - 1;
  function resetMatch() {
    setHistorico([FEN_INICIAL]); setSelectedPosition(null); setHistoryPlaying(false);
    setMatchPaused(false); setActivity({ w: 0, b: 0 }); setAnalyses({});
  }
  // Demonstração: a partida da pessoa (historico) fica intacta; o tabuleiro só mostra os passos.
  const [demo, setDemo] = useState<Demonstracao | null>(null);
  const [passo, setPasso] = useState(0);
  const [tocando, setTocando] = useState(false);
  const passos = demo ? passosDaDemo(demo.fen_inicial, demo.lances) : [];
  useEffect(() => {
    if (aiMode || historico.length < 2 || matchPaused || selectedPosition !== null || exercicio.exercise || esperando || demo || estado.ended) return;
    const timer = setInterval(() => setActivity(value => ({ ...value, [matchSide]: value[matchSide] + 1 })), 1000);
    return () => clearInterval(timer);
  }, [aiMode, historico.length, matchPaused, selectedPosition, exercicio.exercise, esperando, matchSide, demo, fen]);

  useEffect(() => {
    if (!historyPlaying || selectedPosition === null || exercicio.exercise || demo) return;
    if (selectedPosition >= historico.length - 1) { setHistoryPlaying(false); setSelectedPosition(null); return; }
    const timer = setTimeout(() => setSelectedPosition(index => index === null ? null : index + 1), 1200);
    return () => clearTimeout(timer);
  }, [historyPlaying, selectedPosition, historico.length, exercicio.exercise, demo]);


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
    setTutorLesson(null);
    setAiMode(false);
    setModal(null);
    exerciseId.current = id;
    setSelectedPosition(null); setHistoryPlaying(false);
    setDemo(null); setTocando(false); setRefutacao(null);
    void exercicio.carregar(id);
  }
  useEffect(() => {
    if (exercicio.exercise && page === "practice") document.getElementById("match-board")?.scrollIntoView?.({ block: "start" });
  }, [exercicio.exercise?.id, page]);

  function fecharExercicio() {
    setRefutacao(null);
    exercicio.fechar();
  }

  function verNoTabuleiro(nova: Demonstracao) {
    setTutorLesson(null);
    setAiMode(false);
    setModal(null);
    fecharExercicio();
    setSelectedPosition(null); setHistoryPlaying(false);
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

  function mostrarResposta(resposta: Resposta, erro = false, titulo?: string, contextKey?: string, contextLabel?: string) {
    adicionar({ tipo: "resposta", resposta: { ...resposta,
      concept_ids: resposta.concept_ids ?? [], related_exercise_ids: resposta.related_exercise_ids ?? [],
    }, erro, titulo, contextKey, contextLabel });
  }

  function aplicarLicao(dados: RespostaLicao, retomando = false) {
    gravarUsuarioId(dados.usuario_id);
    setLicao(previous => dados.concluido && !dados.licao && previous ? {
      ...previous, concluido: true,
    } : dados);
    if (dados.conteudo) {
      const titulo = dados.licao ? tituloDaLicao(dados.licao, retomando) : undefined;
      mostrarResposta({ ...dados.conteudo,
        concept_ids: dados.conteudo.concept_ids ?? dados.concept_ids ?? [],
        related_exercise_ids: dados.conteudo.related_exercise_ids ?? dados.related_exercise_ids ?? [],
      }, false, titulo, JSON.stringify(["lesson", dados.licao?.numero]), `Lição · ${dados.licao?.titulo ?? "Percurso"}`);
    }
  }

  /** Roda uma chamada mostrando o indicador de espera; erros viram mensagem com `.resposta`. */
  async function executar<T>(tipo: TipoDeEspera, chamada: () => Promise<T>, aoTerminar: (dados: T) => void, onError?: (resposta: Resposta) => void, positionKey?: string, positionLabel?: string) {
    setEsperando(tipo);
    try {
      aoTerminar(await chamada());
    } catch (erro) {
      if (erro instanceof ErroDaApi) { mostrarResposta(erro.resposta, true, undefined, positionKey, positionLabel); onError?.(erro.resposta); }
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
    api
      .licaoAtual(usuarioId ?? undefined)
      .then((dados) => aplicarLicao(dados, true))
      .catch((erro) => {
        if (erro instanceof ErroDaApi && erro.status === 400) apagarUsuarioId(); // id inválido
        if (erro instanceof ErroDaApi && erro.status !== 404) setLessonError(erro.resposta);
      }).finally(() => setLessonLoading(false));
  }, []);

  async function perguntar(texto: string, anexarPosicao: boolean, modo: ModoDoChat) {
    const key = tutorKey;
    const contextLabel = tutorContextLabel(tutorContext);
    const context = tutorContext ?? (anexarPosicao && page === "practice" && !tutorLesson ? { source: "exploration" as const, fen: shownFen } : undefined);
    adicionar({ tipo: "pergunta", texto: modo === "recomendar" ? `Qual documento me ajuda? ${texto}` : texto, contextKey: key, contextLabel });
    setEsperando(modo === "recomendar" ? "recomendar" : "chat");
    try {
      const resposta = modo === "recomendar" ? await api.recomendar(texto) : await api.perguntar(texto, undefined, context ?? undefined);
      adicionar({ tipo: "resposta", resposta, erro: false, contextKey: key, contextLabel });
    } catch (erro) {
      if (erro instanceof ErroDaApi) adicionar({ tipo: "resposta", resposta: erro.resposta, erro: true, contextKey: key, contextLabel });
      else adicionar({ tipo: "resposta", resposta: { resposta: "Tutor indisponível. Tente novamente.", fontes: [], agente: "roteador", confianca: 0 }, erro: true, contextKey: key, contextLabel });
    } finally {
      setEsperando(null);
    }
  }

  function analisar() {
    const key = tutorKey;
    const label = tutorContextLabel(tutorContext);
    const analysisFen = page === "match" ? aiFen ?? fen : shownFen;
    adicionar({ tipo: "pergunta", texto: "Analise esta posição.", contextKey: key, contextLabel: label });
    executar("analise", () => api.analisar(analysisFen), (r) => {
      setAnalyses(value => ({ ...value, [analysisFen.split(" ")[1] === "b" ? "b" : "w"]: { fen: analysisFen, resposta: r } }));
      mostrarResposta(r, false, undefined, key, label);
    }, undefined, key, label);
  }

  function proximaLicao() {
    setLessonError(null);
    executar("licao", () => api.proximaLicao(lerUsuarioId()), (dados) => aplicarLicao(dados), setLessonError);
  }

  const tabuleiro: BoardModeProps =
    exercicio.exercise && exercicio.resulting_fen ? {
      modo: "exercise", exercicio: { fen: exercicio.resulting_fen, goal: exercicio.exercise.goal,
        concluido: exercicio.concluido, visual: exercicio.visual, preview: refutacao,
        onTentativa: (action) => { setRefutacao(null); void exercicio.tentar(action); } },
    } : demo && passos[passo] ? { modo: "demonstration", exibicao: passos[passo] }
      : selectedPosition !== null ? { modo: "demonstration", exibicao: {
          fen: historico[historyIndex], de: moves[historyIndex - 1]?.source ?? null, para: moves[historyIndex - 1]?.destination ?? null,
        } } : { modo: "normal" };
  const shownFen = (exercicio.exercise ? refutacao?.fen : null) ?? exercicio.resulting_fen ?? (demo ? passos[passo]?.fen : historico[historyIndex]) ?? fen;
  const tutorContext: TutorPositionContext | null = tutorLesson ? null : page === "match" && aiMode ? officialTutor.context
    : page === "practice" && modal !== "lessons" ? { source: exercicio.exercise ? "exercise" : "exploration", fen: shownFen } : null;
  const tutorKey = tutorLesson ? JSON.stringify(["lesson", licao?.licao?.numero]) : JSON.stringify([page, tutorContext, page === "match" ? officialTutor.key : exercicio.exercise?.id ?? null]);

  const shownSide: MatchSide = shownFen.split(" ")[1] === "b" ? "b" : "w";

  function openArea(area: "tutor" | "lessons" | "curiosities" | "comment" | "about" | "documentation", opener: HTMLElement) {
    setTutorLesson(null);
    modalOpener.current = opener;
    if (area === "about" && page !== "about") {
      aboutReturn.current = currentPage.current;
      aboutOpener.current = opener;
      setModal("about");
      window.location.hash = pageHashes.about;
      return;
    }
    setModal(area);
  }
  function goHome() {
    if (!window.confirm("Deseja sair da partida?")) return;
    setModal(null);
    resetMatch();
    fecharExercicio();
    setDemo(null); setTocando(false);
    window.location.hash = "/";
  }
  async function openSavedGame(id: string, review: boolean) {
    if (!aiGameRef.current || !await aiGameRef.current.loadSavedGame(id, review)) {
      throw new Error("Não foi possível abrir esta partida. Aguarde qualquer operação em andamento e tente novamente.");
    }
    setModal(null);
    window.location.hash = pageHashes.match;
  }
  function closeAbout() {
    setModal(null);
    if (pageFromHash() === "about") window.location.hash = pageHashes[aboutReturn.current];
  }
  useEffect(() => {
    const navigate = () => {
      const next = canonicalizeHash();
      if (next === "about") {
        if (currentPage.current !== "about") aboutReturn.current = currentPage.current;
        modalOpener.current = aboutOpener.current ?? document.querySelector<HTMLElement>('a[href="#/sobre"]');
        setModal("about");
      } else {
        aboutOpener.current = null;
        setModal(previous => previous === "about" ? null : previous);
      }
      if (next === "match" || next === "history") setAiVisited(true);
      if (next === "match") setAiMode(true);
      if (next === "practice") setAiMode(false);
      if (next !== "practice") {
        setMatchPaused(true); setHistoryPlaying(false); setTocando(false);
      }
      setTutorLesson(null);
      currentPage.current = next;
      setPage(next);
      requestAnimationFrame(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
    };
    window.addEventListener("hashchange", navigate);
    navigate();
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  function practiceFromArea(id: string) { window.location.hash = pageHashes.practice; abrirExercicio(id); }
  function demonstrationFromArea(value: Demonstracao) { window.location.hash = pageHashes.practice; verNoTabuleiro(value); }
  function retainOpener(element: HTMLButtonElement | null) {
    if (element && modalOpener.current?.dataset.modalTrigger === element.dataset.modalTrigger) modalOpener.current = element;
  }

  const lessonsContent = <>
        <header className="pedagogy-heading"><h1>Lições de xadrez</h1><p>Aprendizado guiado, das regras aos finais. Avance no seu ritmo.</p></header>
        <Licao licao={licao?.licao ?? null} concluido={licao?.concluido ?? false} ocupado={lessonLoading || esperando !== null} onProxima={proximaLicao}
          relatedExerciseIds={licao?.related_exercise_ids ?? licao?.conteudo?.related_exercise_ids ?? []} onPractice={practiceFromArea} />
        {(lessonLoading || esperando === "licao") && <Carregando tipo="licao" />}
        {licao?.conteudo && <div className="lesson-content" aria-label="Conteúdo da lição">
          <h2>{licao.licao?.titulo ?? "Conteúdo da lição"}</h2>
          {licao.licao && <p><strong>Objetivo: </strong>{lessonCatalog[licao.licao.numero - 1]?.objetivo ?? `Entender ${licao.licao.titulo}.`}</p>}<RespostaDoAgente resposta={{ ...licao.conteudo,
          concept_ids: licao.conteudo.concept_ids ?? licao.concept_ids ?? [],
          related_exercise_ids: licao.conteudo.related_exercise_ids ?? licao.related_exercise_ids ?? [],
        }} onVerNoTabuleiro={demonstrationFromArea} onPractice={practiceFromArea} /></div>}
        {lessonError && <RespostaDoAgente resposta={lessonError} erro />}
        <div className="pedagogy-actions"><a href="#/pratica" onClick={() => setModal(null)}>Ir para Prática</a><a href="#/partida" onClick={() => setModal(null)}>Jogar contra IA</a></div>
        <button type="button" className="modal-tutor-link" onClick={event => { if (modal !== "lessons") modalOpener.current = event.currentTarget; setTutorLesson(licao?.licao?.titulo ?? null); setModal("tutor"); }}>Abrir conversa do tutor</button>
  </>;

  return (
    <div className="min-h-screen">
      <div className="arena-shell" inert={modal !== null ? true : undefined} onClickCapture={event => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href="#/sobre"]');
        if (link && window.location.hash === "#/sobre") openArea("about", link);
      }}>
        <header className="game-header">
          <BrandLogo />
          <div className="header-main-group">
            <HeaderNavigation onExit={onLogout ?? goHome} />
            <RatingPanel compact />
          </div>
          <div className="header-server-status">
            <StatusSaude />
          </div>
        </header>
        {page === "practice" && !aiMode && <section className="standalone-page practice-intro" aria-label="Prática de xadrez">
          <header className="pedagogy-heading"><h1>Prática</h1><p>Esta é uma área de treino. Suas ações aqui não alteram uma partida oficial nem seu rating.</p></header>
          <div className="pedagogy-actions"><a href="#/licoes">Voltar às lições</a><button className="botao-pixel" type="button" onClick={() => { window.location.hash = pageHashes.match; }}>Jogar contra IA</button></div>
          <h2>Exercícios</h2><p>Escolha um objetivo. Você receberá feedback e poderá tentar novamente.</p>
          <div className="practice-options">{Object.entries(EXERCISE_LABELS).map(([id, item]) => <button type="button" className="botao-pixel" key={id} disabled={exercicio.loading || esperando !== null} onClick={() => abrirExercicio(id)}>{item.nome}</button>)}</div>
          <h2>{exercicio.exercise ? "Treino guiado no tabuleiro" : demo ? "Demonstração no tabuleiro" : "Exploração de posições"}</h2>
          <p>{exercicio.exercise ? "Siga o objetivo abaixo do tabuleiro. O Tutor ajuda a entender a posição exibida." : "Mova os dois lados para estudar. Analise a posição ou peça ajuda ao Tutor."}</p>
          {!exercicio.exercise && <button type="button" className="botao-pixel" onClick={() => { fecharExercicio(); voltarAMinhaPosicao(); setSelectedPosition(null); setMatchPaused(false); document.getElementById("match-board")?.scrollIntoView({ block: "start" }); }}>Explorar no tabuleiro</button>}
        </section>}
        <div hidden={page !== "match" || !aiMode}>{aiVisited && <AiGame profileRequest={profileRequest} ref={aiGameRef} visible={page === "match" && aiMode} onPosition={setAiFen} onTutorContext={onOfficialTutorContext} onGameActive={setAiGameActive} onTutor={opener => openArea("tutor", opener)} />}</div>
        <main className="game-layout arena-layout" id="partida" ref={layoutRef} hidden={page !== "practice" || aiMode}>
          <div className="match-upper-strip">
            <div className="agent-headers"><AgentHeaderCard study side="w" active={shownSide === "w"} seconds={activity.w} /><AgentHeaderCard study side="b" active={shownSide === "b"} seconds={activity.b} /></div>
            <div className="desktop-tutor-slot" ref={setDesktopTutorHost} />
            <MoveHistory moves={moves} selected={historyIndex} disabled={Boolean(exercicio.exercise || demo)} onSelect={index => { setSelectedPosition(index); setHistoryPlaying(false); }} />
          </div>
          <div className="match-context-strip" ref={setBoardContextHost} />
          <div className="match-central">
            <div className="match-game-column">
            <div className="board-workspace arena-board-main" id="match-board">
              <Board study
                key={exercicio.exercise?.id ?? "partida"}
                {...tabuleiro}
                hideControls
                contextContainer={boardContextHost}
                fen={fen}
                estadoTexto={estado.ended ? estado.winner ? `Xeque-mate! Vitória das ${estado.winner === "w" ? "brancas" : "pretas"} no treino.` : textoEstado(estado) : `${estado.status === "check" ? "Xeque! " : ""}Vez das ${shownSide === "w" ? "brancas" : "pretas"} no treino.`}
                terminado={estado.ended}
                ocupado={esperando !== null || exercicio.loading || (matchPaused && !exercicio.exercise && !demo)}
                podeDesfazer={historico.length > 1}
                onLance={(novo) => { if (estado.ended || selectedPosition !== null) return; setHistorico((h) => { const proximo = [...h, novo]; try { jogoDoHistorico(proximo); return proximo; } catch { return h; } }); }}
                onDesfazer={() => setHistorico((h) => (h.length > 1 ? h.slice(0, -1) : h))}
                onReiniciar={resetMatch}
                onAnalisar={analisar}
              />
              <ExercisePanel state={exercicio} visual={exercicio.visual}
                onHint={() => { setRefutacao(null); void exercicio.pedirDica(); }}
                onAction={(action) => { setRefutacao(null); void exercicio.tentar(action); }}
                onClose={fecharExercicio} onPreview={setRefutacao}
                onRetry={() => { if (exerciseId.current) abrirExercicio(exerciseId.current); }} onTutor={opener => openArea("tutor", opener)} onChoose={() => { fecharExercicio(); document.querySelector(".practice-intro")?.scrollIntoView?.({ block: "start" }); }} />
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

            </div>
          <div className="match-lower-strip">
            <div className="arena-control-strip">
              <MatchControls study index={historyIndex} total={historico.length - 1}
                paused={selectedPosition !== null ? !historyPlaying : matchPaused}
                disabled={esperando !== null || exercicio.loading || Boolean(exercicio.exercise || demo)}
                onFirst={() => { setSelectedPosition(0); setHistoryPlaying(false); }}
                onPrevious={() => { setSelectedPosition(Math.max(0, historyIndex - 1)); setHistoryPlaying(false); }}
                onNext={() => { setHistoryPlaying(false); const next = historyIndex + 1; setSelectedPosition(next >= historico.length - 1 ? null : next); }}
                onLive={() => { setSelectedPosition(null); setHistoryPlaying(false); }}
                onToggle={() => { if (selectedPosition !== null) setHistoryPlaying(value => !value); else setMatchPaused(value => !value); }}
                onAnalyze={analisar} onReset={resetMatch}
                onUndo={() => { setSelectedPosition(null); setHistoryPlaying(false); setHistorico(h => h.length > 1 ? h.slice(0, -1) : h); }} />
            </div>
          </div>
            </div>
            <aside className="match-sidebar" aria-label="Acompanhamento do treino">
              <section className="current-turn" aria-label="Turno atual"><span className="eyebrow">{exercicio.exercise ? "Turno do exercício" : "Posição de estudo"}</span><p>{shownSide === "w" ? "Brancas" : "Pretas"} jogam{matchPaused && !exercicio.exercise && !demo ? " · exploração pausada" : ""}</p></section>
              <div className="desktop-lessons-slot" ref={setDesktopLessonsHost} />
              <CuriositiesCard />
              <div className="arena-reasoning" id="agentes">
                <div className="reasoning-title"><span className="eyebrow">Dois lados. Novas perspectivas.</span><h2>Análises da posição:</h2></div>
                <AgentThinking side="w" analysis={analyses.w?.resposta} stale={Boolean(analyses.w && analyses.w.fen !== fen)} busy={esperando === "analise" && matchSide === "w"} />
                <AgentThinking side="b" analysis={analyses.b?.resposta} stale={Boolean(analyses.b && analyses.b.fen !== fen)} busy={esperando === "analise" && matchSide === "b"} />
              </div>
              <InteractiveCard action="Abrir espaço de comentários" type="button" className="content-trigger comment-trigger" aria-haspopup="dialog" aria-controls="comment-modal" onClick={event => openArea("comment", event.currentTarget)}><span>DEIXE SEU COMENTÁRIO / LIKE</span><small>Abra seu espaço de comentários</small></InteractiveCard>
              <div id="sobre-projeto" data-page="about" className="project-access">
                <InteractiveCard action="Ver informações sobre o projeto" type="button" className="content-trigger" aria-haspopup="dialog" aria-controls="about-modal" onClick={event => openArea("about", event.currentTarget)}><span>SOBRE O PROJETO</span></InteractiveCard>
                <InteractiveCard action="Abrir documentação" type="button" className="content-trigger" aria-haspopup="dialog" aria-controls="documentation-modal" onClick={event => openArea("documentation", event.currentTarget)}><span>DOCUMENTAÇÃO</span></InteractiveCard>
              </div>
            </aside>
          </div>
          <div className="mobile-access-row" ref={setMobileAccessHost} />
        </main>
        <section className="standalone-page" data-page="history" aria-label="Histórico de partidas" hidden={page !== "history"}>
          {page === "history" && <HistoryOverview onOpen={openSavedGame} />}
        </section>
        <section className="masters-page" data-page="masters" role="region" aria-label="MASTERS:" aria-labelledby="masters-title" hidden={page !== "masters"}>
          <Masters visible={page === "masters"} selectedId={profileRequest?.id} onSelect={id => {
              setProfileRequest(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }));
              setAiVisited(true); window.location.hash = pageHashes.match;
            }} />
        </section>
        <section className="standalone-page" data-page="lessons" aria-label="Lições de xadrez" hidden={page !== "lessons"}>
          {page === "lessons" && modal !== "lessons" && lessonsContent}
        </section>
        <section className="standalone-page" data-page="curiosities" aria-label="Curiosidades" hidden={page !== "curiosities"}>
          <h2>CURIOSIDADES</h2><p>Este espaço vai reunir curiosidades sobre o xadrez.</p>
        </section>

        <section className="standalone-page" data-page="home" aria-label="Tela inicial" hidden={page !== "home"}>
          <h2>Seu próximo grande lance.</h2><p>Explore. Aprenda. Jogue.</p><a className="botao-pixel" href="#/partida">Iniciar partida</a>
        </section>
      </div>
      {(mobile ? mobileAccessHost : desktopTutorHost) && createPortal(
        <InteractiveCard action="Abrir tutor" type="button" data-modal-trigger="tutor" ref={retainOpener} className="content-trigger tutor-trigger" aria-haspopup="dialog" aria-controls="tutor-modal" onClick={event => { setTutorLesson(null); modalOpener.current = event.currentTarget; setModal("tutor"); }}><span>CHAME TUTOR</span><small>Perguntas, análises e fontes</small></InteractiveCard>, (mobile ? mobileAccessHost : desktopTutorHost)!)}
      {desktopLessonsHost && createPortal(
        <InteractiveCard action="Abrir lições" type="button" data-modal-trigger="lessons" ref={retainOpener} className="content-trigger lessons-trigger" aria-haspopup="dialog" aria-controls="lessons-modal" onClick={event => { modalOpener.current = event.currentTarget; setModal("lessons"); }}><span>LIÇÕES</span><small>{licao?.licao ? `Lição ${licao.licao.numero}/${licao.licao.total}` : licao?.concluido ? "Percurso concluído" : "Seu percurso de aprendizagem"}</small></InteractiveCard>, desktopLessonsHost)}
      <div className={`floating-actions${page === "practice" || page === "lessons" || page === "masters" ? " study-shortcuts" : ""}`} aria-label="Atalhos" hidden={modal !== null || (page === "match" && aiMode && aiGameActive)}>
        <FloatingAction title="Seu Tutor" label="Abrir tutor" icon={tutorIcon} onClick={event => openArea("tutor", event.currentTarget)} />
        <FloatingAction title="Lições" label="Abrir lições" icon={lessonsIcon} onClick={event => openArea("lessons", event.currentTarget)} />
      </div>
      <ContentModal id="tutor-modal" title="SEU TUTOR" open={modal === "tutor"} onClose={() => { setTutorLesson(null); setModal(null); }} returnFocusRef={modalOpener}>
        <Chat allowPosition={Boolean(tutorContext) || (page === "practice" && !tutorLesson)} topic={tutorLesson} context={tutorContext} contextKey={tutorKey} itens={itens} esperando={esperando} onEnviar={perguntar} onVerNoTabuleiro={demonstrationFromArea} onPractice={practiceFromArea} />
      </ContentModal>
      <ContentModal id="lessons-modal" title="LIÇÕES" open={modal === "lessons"} onClose={() => setModal(null)} returnFocusRef={modalOpener}>
        {(page !== "lessons" || modal === "lessons") && lessonsContent}
      </ContentModal>
      <ContentModal id="curiosities-modal" title="CURIOSIDADES" open={modal === "curiosities"} onClose={() => setModal(null)} returnFocusRef={modalOpener}>
        <p>Este espaço vai reunir curiosidades sobre o xadrez.</p>
      </ContentModal>
      <ContentModal id="comment-modal" title="COMENTÁRIO / LIKE:" open={modal === "comment"} onClose={() => setModal(null)} returnFocusRef={modalOpener}>
        <CommentLike />
      </ContentModal>
      <ContentModal id="about-modal" title="SOBRE O PROJETO:" open={modal === "about"} onClose={closeAbout} returnFocusRef={modalOpener}>
        <Sobre section="about" />
      </ContentModal>
      <ContentModal id="documentation-modal" title="DOCUMENTAÇÃO:" open={modal === "documentation"} onClose={() => setModal(null)} returnFocusRef={modalOpener}>
        <Sobre section="documentation" onTutor={() => setModal("tutor")} onAnalyses={() => setModal(null)} />
      </ContentModal>
    </div>
  );
}
