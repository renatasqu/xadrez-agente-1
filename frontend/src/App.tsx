// Arena da partida; tutor e lições acessíveis sob demanda.

import { HistoryOverview } from "./components/HistoryOverview";
import { canonicalizeHash, pageFromHash, pageHashes, type AppPage } from "./navigation";
import { RatingPanel } from "./components/RatingPanel";
import { AiGame, type AiGameHandle } from "./components/AiGame";
import { createPortal } from "react-dom";
import { useMatchLayout } from "./match/useMatchLayout";
import { useEffect, useRef, useState, useMemo } from "react";
import { ErroDaApi, api } from "./api";
import { apagarUsuarioId, gravarUsuarioId, lerUsuarioId } from "./armazenamento";
import { AgentHeaderCard, AgentThinking, CurrentTurn, MoveHistory, recordedMoves, type MatchSide } from "./match/MatchArena";
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
  const [aiMode, setAiMode] = useState(pageFromHash() !== "practice");
  const [aiVisited, setAiVisited] = useState(pageFromHash() !== "practice");
  const aiGameRef = useRef<AiGameHandle>(null);
  const [aiGameActive, setAiGameActive] = useState(false);
  const [aiFen, setAiFen] = useState<string | null>(null);
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
    setAiMode(false);
    setModal(null);
    exerciseId.current = id;
    setSelectedPosition(null); setHistoryPlaying(false);
    setDemo(null); setTocando(false); setRefutacao(null);
    void exercicio.carregar(id);
  }
  function fecharExercicio() {
    setRefutacao(null);
    exercicio.fechar();
  }

  function verNoTabuleiro(nova: Demonstracao) {
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
  async function executar<T>(tipo: TipoDeEspera, chamada: () => Promise<T>, aoTerminar: (dados: T) => void, onError?: (resposta: Resposta) => void) {
    setEsperando(tipo);
    try {
      aoTerminar(await chamada());
    } catch (erro) {
      if (erro instanceof ErroDaApi) { mostrarResposta(erro.resposta, true); onError?.(erro.resposta); }
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
        // 404: ainda não começou; sem servidor: a luz de status já avisa
      });
  }, []);

  function perguntar(texto: string, anexarPosicao: boolean, modo: ModoDoChat) {
    if (modo === "recomendar") {
      adicionar({ tipo: "pergunta", texto: `Qual documento me ajuda? ${texto}` });
      executar("recomendar", () => api.recomendar(texto), (r) => mostrarResposta(r));
      return;
    }
    adicionar({ tipo: "pergunta", texto: anexarPosicao ? `${texto}\n(posição: ${aiMode ? aiFen ?? fen : fen})` : texto });
    executar("chat", () => api.perguntar(texto, anexarPosicao ? (aiMode ? aiFen ?? undefined : fen) : undefined), (r) => mostrarResposta(r));
  }

  function analisar() {
    adicionar({ tipo: "pergunta", texto: "Analise esta posição." });
    executar("analise", () => api.analisar(aiMode ? aiFen ?? fen : fen), (r) => {
      setAnalyses(value => ({ ...value, [matchSide]: { fen, resposta: r } }));
      mostrarResposta(r);
    });
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
  const shownFen = exercicio.resulting_fen ?? (demo ? passos[passo]?.fen : historico[historyIndex]) ?? fen;
  const shownSide: MatchSide = shownFen.split(" ")[1] === "b" ? "b" : "w";

  function openArea(area: "tutor" | "lessons" | "curiosities" | "comment" | "about" | "documentation", opener: HTMLElement) {
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
        <Licao licao={licao?.licao ?? null} concluido={licao?.concluido ?? false} ocupado={esperando !== null} onProxima={proximaLicao}
          relatedExerciseIds={licao?.related_exercise_ids ?? licao?.conteudo?.related_exercise_ids ?? []} onPractice={practiceFromArea} />
        {esperando === "licao" && <Carregando tipo="licao" />}
        {licao?.conteudo && <div className="lesson-content"><RespostaDoAgente resposta={{ ...licao.conteudo,
          concept_ids: licao.conteudo.concept_ids ?? licao.concept_ids ?? [],
          related_exercise_ids: licao.conteudo.related_exercise_ids ?? licao.related_exercise_ids ?? [],
        }} onVerNoTabuleiro={demonstrationFromArea} onPractice={practiceFromArea} /></div>}
        {lessonError && <RespostaDoAgente resposta={lessonError} erro />}
        <button type="button" className="modal-tutor-link" onClick={() => setModal("tutor")}>Abrir conversa do tutor</button>
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
        {page === "practice" && !aiMode && <div><button type="button" onClick={() => { window.location.hash = pageHashes.match; }}>Jogar contra IA</button></div>}
        <div hidden={page !== "match" || !aiMode}>{aiVisited && <AiGame ref={aiGameRef} visible={page === "match" && aiMode} onPosition={setAiFen} onGameActive={setAiGameActive} onTutor={opener => openArea("tutor", opener)} />}</div>
        <main className="game-layout arena-layout" id="partida" ref={layoutRef} hidden={page !== "practice" || aiMode}>
          <div className="match-upper-strip">
            <div className="agent-headers"><AgentHeaderCard side="w" active={shownSide === "w"} seconds={activity.w} /><AgentHeaderCard side="b" active={shownSide === "b"} seconds={activity.b} /></div>
            <div className="desktop-tutor-slot" ref={setDesktopTutorHost} />
            <MoveHistory moves={moves} selected={historyIndex} disabled={Boolean(exercicio.exercise || demo)} onSelect={index => { setSelectedPosition(index); setHistoryPlaying(false); }} />
          </div>
          <div className="match-context-strip" ref={setBoardContextHost} />
          <div className="match-central">
            <div className="match-game-column">
            <div className="board-workspace arena-board-main" id="match-board">
              <Board
                key={exercicio.exercise?.id ?? "partida"}
                {...tabuleiro}
                hideControls
                contextContainer={boardContextHost}
                fen={fen}
                estadoTexto={textoEstado(estado)}
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

            </div>
          <div className="match-lower-strip">
            <div className="arena-control-strip">
              <MatchControls index={historyIndex} total={historico.length - 1}
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
            <aside className="match-sidebar" aria-label="Acompanhamento da partida">
              <CurrentTurn side={shownSide} label={exercicio.exercise ? "Turno do exercício" : demo || selectedPosition !== null ? "Posição em exibição" : matchPaused ? "Partida pausada" : undefined} />
              <div className="desktop-lessons-slot" ref={setDesktopLessonsHost} />
              <CuriositiesCard />
              <div className="arena-reasoning" id="agentes">
                <div className="reasoning-title"><span className="eyebrow">Dois lados. Novas perspectivas.</span><h2>Análises da partida:</h2></div>
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
          <Masters visible={page === "masters"} />
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
        <InteractiveCard action="Abrir tutor" type="button" data-modal-trigger="tutor" ref={retainOpener} className="content-trigger tutor-trigger" aria-haspopup="dialog" aria-controls="tutor-modal" onClick={event => { modalOpener.current = event.currentTarget; setModal("tutor"); }}><span>CHAME TUTOR</span><small>Perguntas, análises e fontes</small></InteractiveCard>, (mobile ? mobileAccessHost : desktopTutorHost)!)}
      {desktopLessonsHost && createPortal(
        <InteractiveCard action="Abrir lições" type="button" data-modal-trigger="lessons" ref={retainOpener} className="content-trigger lessons-trigger" aria-haspopup="dialog" aria-controls="lessons-modal" onClick={event => { modalOpener.current = event.currentTarget; setModal("lessons"); }}><span>LIÇÕES</span><small>{licao?.licao ? `Lição ${licao.licao.numero}/${licao.licao.total}` : licao?.concluido ? "Percurso concluído" : "Seu percurso de aprendizagem"}</small></InteractiveCard>, desktopLessonsHost)}
      <div className="floating-actions" aria-label="Atalhos" hidden={modal !== null || (aiMode && aiGameActive)}>
        <FloatingAction title="Seu Tutor" label="Abrir tutor" icon={tutorIcon} onClick={event => openArea("tutor", event.currentTarget)} />
        <FloatingAction title="Lições" label="Abrir lições" icon={lessonsIcon} onClick={event => openArea("lessons", event.currentTarget)} />
      </div>
      <ContentModal id="tutor-modal" title="SEU TUTOR" open={modal === "tutor"} onClose={() => setModal(null)} returnFocusRef={modalOpener}>
        <Chat itens={itens} esperando={esperando} onEnviar={perguntar} onVerNoTabuleiro={demonstrationFromArea} onPractice={practiceFromArea} />
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
