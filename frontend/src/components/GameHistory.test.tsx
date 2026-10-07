import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { GameHistory } from "./GameHistory";
import { api } from "../api";
import type { Game, GameEvaluation, GameReplay, GameReviewResult } from "../types";
const game={id:"g",version:2,moves:["e2e4","e7e5"]} as Game;
const history:GameReplay={game_id:"g",version:2,initial_fen:"initial",current_fen:"final",result:"*",termination:"playing",steps:[{ply:1,move_number:1,color:"white",uci:"e2e4",san:"e4",fen:"first"},{ply:2,move_number:1,color:"black",uci:"e7e5",san:"e5",fen:"final"}]};
const evaluation:GameEvaluation={fen:"first",perspectiva:"white",pontos:20,mate:null,melhor_lance:"e4",melhor_lance_uci:"e2e4",linha:["e4","e5"],linha_uci:["e2e4","e7e5"],status:"ongoing",vencedor:null,profundidade:10};
const review:GameReviewResult={game_id:"g",version:2,ply:2,played:{uci:"e7e5",san:"e5",color:"black"},before:evaluation,after:{...evaluation,pontos:-10},cp_delta_white:-30};
function Harness(){const [selected,setSelected]=useState<number|null>(null);return <GameHistory game={game} disabled={false} selected={selected} onSelect={setSelected}/>;}
beforeEach(()=>{
 vi.restoreAllMocks();vi.spyOn(api,"gameReplay").mockResolvedValue(history);vi.spyOn(api,"reviewGame").mockResolvedValue(review);vi.spyOn(api,"gamePgn").mockResolvedValue('1. e4 e5 *\n');
 Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:export")});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
});
it("navega início/anterior/próximo/fim e SAN sem análise automática",async()=>{
 const choose=vi.fn();const view=render(<GameHistory game={game} disabled={false} selected={null} onSelect={choose}/>);
 fireEvent.click(await screen.findByText("Início do histórico"));expect(choose).toHaveBeenLastCalledWith(0,"initial");
 fireEvent.click(screen.getByText("Lance anterior"));expect(choose).toHaveBeenLastCalledWith(1,"first");
 view.rerender(<GameHistory game={game} disabled={false} selected={1} onSelect={choose}/>);
 fireEvent.click(screen.getByText("Próximo lance"));expect(choose).toHaveBeenLastCalledWith(2,"final");
 fireEvent.click(screen.getByText("Fim do histórico"));expect(choose).toHaveBeenLastCalledWith(2,"final");
 fireEvent.click(screen.getByRole("button", { name: "1. e4" }));expect(choose).toHaveBeenLastCalledWith(1,"first");
 fireEvent.click(screen.getByText("Voltar à posição atual"));expect(choose).toHaveBeenLastCalledWith(null);
 expect(api.reviewGame).not.toHaveBeenCalled();expect(api.gamePgn).not.toHaveBeenCalled();
 const submit = vi.spyOn(api, "submitHumanMove"), reconcile = vi.spyOn(api, "reconcileRating");
 const terminal = { ...game, terminal: true };
 view.rerender(<GameHistory game={terminal} disabled selected={null} onSelect={choose}/>);
 choose.mockClear();fireEvent.click(screen.getByRole("button", { name: "Rever partida" }));expect(choose).not.toHaveBeenCalled();
 view.rerender(<GameHistory game={terminal} disabled={false} selected={null} onSelect={choose}/>);
 fireEvent.click(screen.getByRole("button", { name: "Rever partida" }));expect(choose).toHaveBeenLastCalledWith(0,"initial");
 expect(submit).not.toHaveBeenCalled();expect(reconcile).not.toHaveBeenCalled();
});
it("análise explícita controla duplicatas e apresenta dados estruturados",async()=>{
 let resolve!:(r:GameReviewResult)=>void;vi.mocked(api.reviewGame).mockImplementation(()=>new Promise(r=>resolve=r));render(<Harness/>);
 const button=await screen.findByText("Analisar lance selecionado");fireEvent.click(button);fireEvent.click(button);
 expect(api.reviewGame).toHaveBeenCalledTimes(1);expect(api.reviewGame).toHaveBeenCalledWith("g",2,2);expect(screen.getByText("Stockfish analisando…")).toBeTruthy();
 await act(async()=>resolve(review));expect(screen.getByText("Antes: 20 CP")).toBeTruthy();expect(screen.getByText("Depois: -10 CP")).toBeTruthy();expect(screen.getByText("PV antes: e4 e5")).toBeTruthy();expect(screen.getByText("Variação para brancas: -30 CP")).toBeTruthy();
});
it("mate terminal é separado de CP",async()=>{
 vi.mocked(api.reviewGame).mockResolvedValue({...review,before:{...evaluation,pontos:null,mate:1},after:{...evaluation,pontos:null,mate:0,status:"checkmate",vencedor:"white"},cp_delta_white:null});render(<Harness/>);fireEvent.click(await screen.findByText("Analisar lance selecionado"));await screen.findByText("Antes: Mate em 1 a favor das brancas.");expect(screen.getByText("Depois: Xeque-mate. Vencedor: brancas.")).toBeTruthy();expect(screen.queryByText(/Variação para brancas/)).toBeNull();
});
it("resultado tardio de outro ply é descartado",async()=>{
 let resolve!:(r:GameReviewResult)=>void;vi.mocked(api.reviewGame).mockImplementation(()=>new Promise(r=>resolve=r));render(<Harness/>);fireEvent.click(await screen.findByText("Analisar lance selecionado"));fireEvent.click(screen.getByRole("button", { name: "1. e4" }));await act(async()=>resolve(review));expect(screen.queryByRole("region",{name:"Revisão Stockfish"})).toBeNull();
});
it("falha de análise permite nova solicitação",async()=>{
 vi.mocked(api.reviewGame).mockRejectedValueOnce(new Error("Motor indisponível"));render(<Harness/>);fireEvent.click(await screen.findByText("Analisar lance selecionado"));await screen.findByText("Motor indisponível");fireEvent.click(screen.getByText("Analisar lance selecionado"));await screen.findByText("Antes: 20 CP");
});
it("exportação autoritativa tem erro recuperável e download seguro",async()=>{
 vi.mocked(api.gamePgn).mockRejectedValueOnce(new Error("Exportação indisponível"));render(<Harness/>);fireEvent.click(screen.getByText("Exportar PGN"));await screen.findByText("Exportação indisponível");fireEvent.click(screen.getByText("Exportar PGN"));await screen.findByLabelText("PGN exportado");expect((screen.getByLabelText("PGN exportado") as HTMLTextAreaElement).value).toBe('1. e4 e5 *\n');expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalled());
});
it("histórico indisponível permite recarga",async()=>{
 vi.mocked(api.gameReplay).mockRejectedValueOnce(new Error("404"));render(<Harness/>);fireEvent.click(await screen.findByText("Recarregar histórico"));await screen.findByRole("button", { name: "1. e4" });
});
