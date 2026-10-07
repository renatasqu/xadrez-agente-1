import { difficultyLabels, styleLabels, safeProfiles } from "../agentPresentation";
import type { AgentProfile } from "../types";
import { useEffect, useState } from "react";
import { api, type MastersRatings, type MasterRating } from "../api";
import hans from "../assets/masters/hans.png";
import magnus from "../assets/masters/magnus.png";
import judit from "../assets/masters/judit.png";
import "./Masters.css";

const masters = [
  {
    id: "hans", fideId: "2093596", name: "HANS NIEMANN", image: hans,
    biography: [
      "Hans Moke Niemann nasceu em 20 de junho de 2003, em São Francisco, Estados Unidos. Começou a se destacar ainda jovem e tornou-se Grande Mestre em 2021.",
      "Sua carreira ganhou grande atenção internacional em 2022, quando derrotou Magnus Carlsen de pretas na Sinquefield Cup. Depois disso, continuou competindo profissionalmente e se consolidou entre os fortes jogadores da nova geração.",
    ],
    fact: "Sua vitória sobre Carlsen na Sinquefield Cup de 2022 encerrou uma longa sequência de partidas clássicas sem derrota do norueguês.",
  },
  {
    id: "magnus", fideId: "1503014", name: "MAGNUS CARLSEN", image: magnus,
    biography: [
      "Sven Magnus Øen Carlsen nasceu em 30 de novembro de 1990, em Tønsberg, Noruega. Demonstrou grande talento desde criança e tornou-se Grande Mestre aos 13 anos.",
      "Em 2013, derrotou Viswanathan Anand e conquistou o título de Campeão Mundial. Conhecido por sua compreensão posicional, técnica em finais e capacidade de vencer posições aparentemente equilibradas, alcançou rating clássico de 2882.",
    ],
    fact: "Além do xadrez clássico, Carlsen conquistou diversos títulos mundiais de xadrez rápido e blitz.",
  },
  {
    id: "judit", fideId: "700070", name: "JUDIT POLGÁR", image: judit,
    biography: [
      "Judit Polgár nasceu em 23 de julho de 1976, em Budapeste, Hungria. Começou a jogar ainda criança e, em 1991, aos 15 anos, tornou-se Grande Mestre.",
      "Preferiu competir principalmente em torneios abertos, enfrentando diretamente os melhores jogadores do mundo. Chegou ao 8º lugar no ranking mundial absoluto e venceu nomes como Garry Kasparov, Anatoly Karpov e Viswanathan Anand.",
    ],
    fact: "Polgár foi a primeira mulher a entrar no top 10 do ranking mundial absoluto.",
  },
];

function ratingLabel(player: MasterRating | undefined, female: boolean) {
  if (!player) return "Rating indisponível";
  if (!player.active) return `${player.rating} FIDE · ${female ? "inativa" : "inativo"}`;
  return player.world_rank ? `#${player.world_rank} mundial · ${player.rating} FIDE` : `${player.rating} FIDE`;
}

export function Masters({ visible = true, selectedId, onSelect }: { visible?: boolean; selectedId?: string; onSelect?: (id: string) => void }) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let active = true; setCatalogLoading(true); setCatalogError(false);
    api.agents().then(data => { if (active) { const rows = safeProfiles(data); setProfiles(rows); setCatalogError(!rows.length); } })
      .catch(() => { if (active) setCatalogError(true); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [visible, attempt]);
  const [ratings, setRatings] = useState<MastersRatings | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    api.mastersRatings().then(data => { if (!cancelled) setRatings(data); })
      .catch(() => {
        if (!cancelled) setRatings(previous => previous ? { ...previous, stale: true } : null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);
  const updatedDate = ratings?.updated_at ? new Date(ratings.updated_at) : null;
  const formattedDate = updatedDate && !Number.isNaN(updatedDate.getTime())
    ? updatedDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  return <div className="masters-gallery">
    <header className="masters-heading">
      <span className="masters-pixels" aria-hidden="true" />
      <h1 id="masters-title">MASTERS:</h1>
      <p>Conheça os estilos, compare os agentes e escolha seu próximo adversário.</p>
      <p className="masters-identity">Os perfis usam Stockfish e heurísticas do projeto. Os inspirados são interpretações educacionais: não reproduzem fielmente jogadores reais e não implicam participação ou endosso.</p>
    </header>
    <section className="agent-catalog" aria-label="Catálogo de agentes">
      <h2>Escolha como treinar</h2>
      <p>Dificuldade indica força aproximada no projeto. Estilo indica preferências entre lances aceitáveis. Nenhum nível corresponde a Elo/FIDE.</p>
      {catalogLoading && <p role="status">Carregando agentes…</p>}
      {catalogError && <p role="alert">Não foi possível carregar os agentes. <button type="button" className="botao-pixel" onClick={() => setAttempt(n => n + 1)}>Recarregar agentes</button></p>}
      {[false, true].map(inspired => <section key={String(inspired)} aria-label={inspired ? "Perfis inspirados" : "Agentes de treino"}>
        <h3>{inspired ? "Perfis inspirados" : "Agentes de treino"}</h3>
        <div className="agent-profile-grid">{profiles.filter(p => Boolean(p.inspiration) === inspired).map(profile => <article className="agent-profile-card" key={profile.id} aria-labelledby={`profile-${profile.id}`}>
          <p className="support-label">{profile.inspiration ? "Interpretação educacional" : "Agente genérico"}</p>
          <h4 id={`profile-${profile.id}`}>{profile.display_name}</h4>
          <dl><div><dt>Dificuldade</dt><dd>{difficultyLabels[profile.difficulty]}</dd></div><div><dt>Estilo</dt><dd>{styleLabels[profile.style]}</dd></div></dl>
          <p>{profile.description}</p>
          {onSelect && <button type="button" className="botao-pixel" aria-pressed={selectedId === profile.id} onClick={() => onSelect(profile.id)} aria-label={`Jogar contra este perfil: ${profile.display_name}`}>{selectedId === profile.id ? "Selecionado · " : ""}Jogar contra este perfil</button>}
        </article>)}</div>
      </section>)}
      <p className="catalog-help">Escolher um perfil prepara a Partida. Você ainda escolhe seu lado e confirma o início. Uma partida já aberta é preservada.</p>
    </section>
    <details className="masters-editorial">
      <summary>Sobre os enxadristas reais · conteúdo editorial e FIDE</summary>
      <h2 className="masters-subtitle">Chess e Cheez-It:</h2>
      <p>Um pouco sobre meus Grandmasters favoritos.</p>
      <p>Os ratings FIDE abaixo pertencem aos enxadristas reais, não aos agentes do projeto.</p>
    <div className="masters-grid">
      {masters.map(master => <article key={master.id} className={`master-profile master-profile--${master.id}`} aria-labelledby={`master-${master.id}`}>
        <div className="master-art"><img src={master.image} alt={`Pixel-art de ${master.name === "JUDIT POLGÁR" ? "Judit Polgár" : master.id === "hans" ? "Hans Niemann" : "Magnus Carlsen"} diante de um tabuleiro de xadrez`} /></div>
        <div className="master-copy">
          <header className="master-heading"><h3 id={`master-${master.id}`}>{master.name}</h3><p className="master-rating" aria-live="polite" aria-busy={loading}>{loading && !ratings ? "Carregando rating..." : ratingLabel(ratings?.masters.find(player => player.fide_id === master.fideId), master.id === "judit")}</p></header>
          <div className="master-biography">{master.biography.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
          <aside className="master-fact" aria-labelledby={`fact-${master.id}`}><h4 id={`fact-${master.id}`}>VOCÊ SABIA?</h4><p>{master.fact}</p></aside>
        </div>
      </article>)}
    </div>
    <p className="masters-updated">{formattedDate ? `Ratings atualizados em: ${formattedDate}${ratings?.stale ? " · última atualização disponível" : ""}` : !loading ? "Dados indisponíveis" : "\u00a0"}</p>
    </details>
  </div>;
}
