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

export function Masters({ visible = true }: { visible?: boolean }) {
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
      <h2 className="masters-subtitle">Chess e Cheez-It:</h2>
      <p className="masters-description">Um pouco sobre meus Grandmasters favoritos.</p>
    </header>
    <div className="masters-grid">
      {masters.map(master => <article key={master.id} className={`master-profile master-profile--${master.id}`} aria-labelledby={`master-${master.id}`}>
        <div className="master-art"><img src={master.image} alt={`Pixel-art de ${master.name === "JUDIT POLGÁR" ? "Judit Polgár" : master.id === "hans" ? "Hans Niemann" : "Magnus Carlsen"} diante de um tabuleiro de xadrez`} /></div>
        <div className="master-copy">
          <header className="master-heading"><h2 id={`master-${master.id}`}>{master.name}</h2><p className="master-rating" aria-live="polite" aria-busy={loading}>{loading && !ratings ? "Carregando rating..." : ratingLabel(ratings?.masters.find(player => player.fide_id === master.fideId), master.id === "judit")}</p></header>
          <div className="master-biography">{master.biography.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
          <aside className="master-fact" aria-labelledby={`fact-${master.id}`}><h3 id={`fact-${master.id}`}>VOCÊ SABIA?</h3><p>{master.fact}</p></aside>
        </div>
      </article>)}
    </div>
    <p className="masters-updated">{formattedDate ? `Ratings atualizados em: ${formattedDate}${ratings?.stale ? " · última atualização disponível" : ""}` : !loading ? "Dados indisponíveis" : "\u00a0"}</p>
  </div>;
}
