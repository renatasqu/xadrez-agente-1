/** Rotas de apresentação; não alteram o estado oficial da Game. */
export type AppPage = "match" | "history" | "masters" | "lessons" | "about" | "practice" | "curiosities" | "home";
export const pageHashes: Record<AppPage, string> = {
  match: "#/partida", history: "#/historico", masters: "#/masters", lessons: "#/licoes",
  about: "#/sobre", practice: "#/pratica", curiosities: "#/curiosidades", home: "#/",
};
const legacy: Record<string, AppPage> = {
  "#partida": "match", "#historico-partida": "history", "#/historico-partida": "history",
  "#explorar": "practice", "#agentes": "practice", "#sobre-projeto": "about",
};
export function pageFromHash(hash = window.location.hash): AppPage {
  return (Object.keys(pageHashes) as AppPage[]).find(page => pageHashes[page] === hash) ?? legacy[hash] ?? "match";
}
export function canonicalizeHash(): AppPage {
  const page = pageFromHash();
  if (window.location.hash !== pageHashes[page]) {
    window.history.replaceState(window.history.state, "", pageHashes[page]);
  }
  return page;
}
