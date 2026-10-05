import { useEffect, useState } from "react";

const links = [
  ["#partida", "Partida"], ["#historico-partida", "Histórico"],
  ["#/masters", "Masters"], ["#/licoes", "Lições"],
  ["#/sobre", "Sobre"],
] as const;

interface Props {
  onLessons?: (opener: HTMLElement) => void;
  onCuriosities?: (opener: HTMLElement) => void;
  onExit?: () => void;
}
export function HeaderNavigation({ onExit }: Props = {}) {
  const [active, setActive] = useState(window.location.hash || "#partida");
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  useEffect(() => {
    const update = () => { setActive(window.location.hash || "#partida"); setPreferences(false); };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <div className="header-navigation">
    <button type="button" className="header-menu-toggle" aria-expanded={open} aria-controls="header-navigation-items" onClick={() => setOpen(!open)}><span aria-hidden="true">☰</span> Menu</button>
    <nav id="header-navigation-items" className={`header-navigation-items${open ? " is-open" : ""}`} aria-label="Navegação principal">
      {links.map(([href, label]) => <a key={href} href={href} aria-current={!preferences && active === href ? "location" : undefined} onClick={() => { setActive(href); setOpen(false); setPreferences(false);
        if (href === "#historico-partida") {
          const history = document.querySelector<HTMLDetailsElement>("#historico-partida details");
          if (history) history.open = true;
        } }}>{label}</a>)}
      <a href="#/" onClick={event => { setOpen(false); setPreferences(false); if (onExit) { event.preventDefault(); onExit(); } }}>Sair</a>
    </nav>
    {preferences && <section id="header-preferences" className="header-preferences" aria-label="Configurações">
      <h2>Configurações</h2>
      <p>As animações respeitam a preferência de movimento reduzido do seu dispositivo.</p>
      <p>Relógios mostram tempo de atividade, sem limite de competição.</p>
      <button type="button" onClick={() => setPreferences(false)}>Fechar configurações</button>
    </section>}
  </div>;
}
