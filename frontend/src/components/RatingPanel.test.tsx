import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { RatingPanel } from "./RatingPanel";
import type { PlayerRating, RatingEvent } from "../types";
const initial: PlayerRating = { rating:1200,initial_rating:1200,games_rated:0,rating_system:"internal_elo",rating_system_version:1 };
beforeEach(()=>{vi.restoreAllMocks();vi.spyOn(api,"rating").mockResolvedValue(initial);vi.spyOn(api,"ratingHistory").mockResolvedValue([]);});
it("carrega pontuação inicial e explica a diferença de FIDE",async()=>{
 render(<RatingPanel/>);await screen.findByText("Rating do Xadrez Multiagente: 1200");expect(screen.getByText(/Não corresponde a rating FIDE/)).toBeTruthy();expect(api.rating).toHaveBeenCalledTimes(1);
});
it.each([["win",16,"Vitória"],["loss",-16,"Derrota"],["draw",0,"Empate"]])("histórico %s mostra delta real sem duplicar após remontagem",async(result,delta,label)=>{
 vi.mocked(api.rating).mockResolvedValue({...initial,rating:1200+Number(delta),games_rated:1});
 vi.mocked(api.ratingHistory).mockResolvedValue([{game_id:"g",result,delta,after:1200+Number(delta),opponent_agent_id:"balanced"}] as RatingEvent[]);
 const view=render(<RatingPanel/>);await screen.findByText(new RegExp(label));view.unmount();render(<RatingPanel/>);await screen.findByText(new RegExp(label));expect(screen.getAllByText(new RegExp(label))).toHaveLength(1);
});
it("conclusão atualiza dados do servidor",async()=>{
 render(<RatingPanel/>);await screen.findByText("Rating do Xadrez Multiagente: 1200");vi.mocked(api.rating).mockResolvedValue({...initial,rating:1216,games_rated:1});
 await act(async()=>window.dispatchEvent(new Event("xadrez:rating-updated")));await screen.findByText("Rating do Xadrez Multiagente: 1216");
});
it("erro é recuperável e resposta antiga é descartada",async()=>{
 vi.mocked(api.rating).mockRejectedValueOnce(new Error());render(<RatingPanel/>);fireEvent.click(await screen.findByText("Tentar atualizar rating"));await screen.findByText("Rating do Xadrez Multiagente: 1200");
});
it("resposta anterior não sobrescreve refresh após terminal",async()=>{
 let resolve!:(value:PlayerRating)=>void;vi.mocked(api.rating).mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({...initial,rating:1216});
 render(<RatingPanel/>);await act(async()=>window.dispatchEvent(new Event("xadrez:rating-updated")));await screen.findByText("Rating do Xadrez Multiagente: 1216");
 await act(async()=>resolve(initial));expect(screen.queryByText("Rating do Xadrez Multiagente: 1200")).toBeNull();
});
