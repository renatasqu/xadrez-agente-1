import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AgentComment } from "./AgentComment";
import { api } from "../api";
import type { Game, GameCommentary } from "../types";
const game={id:"g",version:2,human_color:"white",initial_fen:"8/8/8/8/8/8/8/8 w - - 0 1",moves:["e2e4","e7e5"]} as Game;
const comment={game_id:"g",version:2,ply:2,persona_id:"structure",persona_version:1,profile_version:1,status:"available",facts:{uci:"e7e5",san:"e5"},text:"Lance oficial: e5. Foco pedagógico: estrutura."} as GameCommentary;
beforeEach(()=>vi.restoreAllMocks());
it("busca lance da IA persistido e mostra texto como metadata",async()=>{
 const fetch=vi.spyOn(api,"gameCommentary").mockResolvedValue(comment);render(<AgentComment game={game}/>);
 await screen.findByText(comment.text);expect(fetch).toHaveBeenCalledWith("g",2,2);
});
it("falha do comentário é neutra e nunca solicita movimento",async()=>{
 vi.spyOn(api,"gameCommentary").mockRejectedValue(new Error("offline"));const move=vi.spyOn(api,"submitHumanMove");const retry=vi.spyOn(api,"resumeAgent");render(<AgentComment game={game}/>);
 await screen.findByText("Comentário pedagógico indisponível nesta posição.");expect(move).not.toHaveBeenCalled();expect(retry).not.toHaveBeenCalled();
});
it("não solicita comentário sem lance da IA; com pretas usa primeiro lance",async()=>{
 const request=vi.spyOn(api,"gameCommentary").mockResolvedValue({...comment,version:1,ply:1,facts:{...comment.facts,uci:"e2e4"}});
 const view=render(<AgentComment game={{...game,version:1,moves:["e2e4"]}}/>);expect(request).not.toHaveBeenCalled();
 view.rerender(<AgentComment game={{...game,human_color:"black",version:1,moves:["e2e4"]}}/>);await screen.findByText(comment.text);expect(request).toHaveBeenCalledWith("g",1,1);
});
it("resposta tardia de Game anterior é descartada",async()=>{
 let resolve!:(v:GameCommentary)=>void;vi.spyOn(api,"gameCommentary").mockImplementation(()=>new Promise(r=>resolve=r));
 const view=render(<AgentComment game={game}/>);view.rerender(<AgentComment game={{...game,id:"other",version:0,moves:[]}}/>);
 await act(async()=>resolve(comment));expect(screen.queryByText(comment.text)).toBeNull();
});
it("texto com UCI diferente/HTML é exibido sem executar nem injetar",async()=>{
 vi.spyOn(api,"gameCommentary").mockResolvedValue({...comment,text:"<script>e2e5 g1f3</script>"});const move=vi.spyOn(api,"submitHumanMove");render(<AgentComment game={game}/>);
 await screen.findByText("<script>e2e5 g1f3</script>");expect(document.querySelector('aside script')).toBeNull();expect(move).not.toHaveBeenCalled();
});
