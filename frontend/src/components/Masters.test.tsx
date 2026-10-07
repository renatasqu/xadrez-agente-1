import { act, fireEvent, render as renderView, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type MastersRatings } from "../api";
import { Masters } from "./Masters";

function render(element: Parameters<typeof renderView>[0]) {
  const view = renderView(element);
  fireEvent.click(screen.getByText("Sobre os enxadristas reais · conteúdo editorial e FIDE"));
  return view;
}

const data: MastersRatings = {
  updated_at: "2026-10-05T12:00:00Z", stale: false, source: "https://ratings.fide.com/",
  masters: [
    { name: "Hans", fide_id: "2093596", rating: 2701, world_rank: 23, active: true },
    { name: "Magnus", fide_id: "1503014", rating: 2801, world_rank: 1, active: true },
    { name: "Judit", fide_id: "700070", rating: 2601, world_rank: 99, active: false },
  ],
};
beforeEach(() => vi.spyOn(api, "agents").mockResolvedValue([]));
afterEach(() => vi.restoreAllMocks());

it("exibe ranking ativo, omite ranking de inativa e usa a data do backend", async () => {
  vi.spyOn(api, "mastersRatings").mockResolvedValue(data);
  render(<Masters />);
  expect(await screen.findByText("#23 mundial · 2701 FIDE")).toBeTruthy();
  expect(screen.getByText("#1 mundial · 2801 FIDE")).toBeTruthy();
  expect(screen.getByText("2601 FIDE · inativa")).toBeTruthy();
  expect(screen.queryByText(/#99 mundial/)).toBeNull();
  expect(screen.queryByText("Grande Mestre", { exact: true })).toBeNull();
  expect(screen.getByText("Ratings atualizados em: 05/10/2026")).toBeTruthy();
  expect(screen.getByText("Chess e Cheez-It:")).toBeTruthy();
  expect(screen.getByText("Um pouco sobre meus Grandmasters favoritos.")).toBeTruthy();
});

it("mantém os perfis durante loading e consulta uma vez por abertura", async () => {
  let resolve!: (value: MastersRatings) => void;
  const request = vi.spyOn(api, "mastersRatings").mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<Masters />);
  expect(screen.getAllByText("Carregando rating...")).toHaveLength(3);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  view.rerender(<Masters />);
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => resolve(data));
  expect(screen.queryByText("Carregando rating...")).toBeNull();
});

it("mostra indisponibilidade sem esconder biografias ou curiosidades", async () => {
  vi.spyOn(api, "mastersRatings").mockRejectedValue(new Error("offline"));
  render(<Masters />);
  expect(await screen.findAllByText("Rating indisponível")).toHaveLength(3);
  expect(screen.getAllByRole("heading", { name: "VOCÊ SABIA?" })).toHaveLength(3);
  expect(screen.getByText(/Hans Moke Niemann nasceu/)).toBeTruthy();
});

it("mostra último cache do backend com a data original", async () => {
  vi.spyOn(api, "mastersRatings").mockResolvedValue({ ...data, stale: true });
  render(<Masters />);
  expect(await screen.findByText("Ratings atualizados em: 05/10/2026 · última atualização disponível")).toBeTruthy();
  expect(screen.getByText("#1 mundial · 2801 FIDE")).toBeTruthy();
});

it("trata resposta sem cache e não consulta enquanto a página está oculta", async () => {
  const request = vi.spyOn(api, "mastersRatings").mockResolvedValue({ ...data, masters: [], updated_at: null, stale: true });
  const view = render(<Masters visible={false} />);
  expect(request).not.toHaveBeenCalled();
  view.rerender(<Masters visible />);
  expect(await screen.findAllByText("Rating indisponível")).toHaveLength(3);
  expect(screen.getByText("Dados FIDE indisponíveis. Consulte os perfis de jogo no catálogo acima.")).toBeTruthy();
});

it("conserva a última resposta se uma abertura posterior falhar", async () => {
  vi.spyOn(api, "mastersRatings").mockResolvedValueOnce(data).mockRejectedValueOnce(new Error("offline"));
  const view = render(<Masters />);
  await screen.findByText("#1 mundial · 2801 FIDE");
  view.rerender(<Masters visible={false} />);
  view.rerender(<Masters visible />);
  await act(async () => {});
  expect(screen.getByText("Ratings atualizados em: 05/10/2026 · última atualização disponível")).toBeTruthy();
  expect(within(screen.getByRole("article", { name: "MAGNUS CARLSEN" })).getByText("#1 mundial · 2801 FIDE")).toBeTruthy();
});

it("usa catálogo oficial, separa treino/inspirados e escolha não escreve Game ou rating", async () => {
  const profiles = [
    { id: "training_beginner", display_name: "Treino inicial", difficulty: "beginner", style: "balanced", description: "Treino disponível", profile_version: 1 },
    { id: "judit_inspired", display_name: "Perfil inspirado em Judit", difficulty: "advanced", style: "tactical", description: "Interpretação educacional", inspiration: "Judit", profile_version: 1 },
  ] as const;
  vi.mocked(api.agents).mockResolvedValue([...profiles]);
  vi.spyOn(api, "mastersRatings").mockRejectedValue(new Error("offline"));
  const create = vi.spyOn(api, "createGame"), rating = vi.spyOn(api, "reconcileRating"), select = vi.fn();
  render(<Masters onSelect={select} selectedId="judit_inspired" />);
  const training = screen.getByRole("region", { name: "Agentes de treino" });
  expect(await within(training).findByText("Treino inicial")).toBeTruthy();
  expect(within(training).getByText("Iniciante")).toBeTruthy();
  const inspired = screen.getByRole("region", { name: "Perfis inspirados" });
  expect(within(inspired).getByText("Avançado")).toBeTruthy();
  expect(within(inspired).getByText("tático")).toBeTruthy();
  const button = within(inspired).getByRole("button", { name: "Jogar com este perfil: Perfil inspirado em Judit" });
  expect(button.getAttribute("aria-pressed")).toBe("true"); fireEvent.click(button);
  expect(select).toHaveBeenCalledWith("judit_inspired");
  expect(create).not.toHaveBeenCalled(); expect(rating).not.toHaveBeenCalled();
  expect(screen.getByText(/não reproduzem fielmente/)).toBeTruthy();
  expect(await screen.findAllByText("Rating indisponível")).toHaveLength(3);
});
