import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { SESSION_EXPIRED } from "./auth/sessionEvents";
afterEach(()=>vi.unstubAllGlobals());
it("consulta rating/histórico com credenciais e reconcilia apenas id/version",async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({})});vi.stubGlobal("fetch",fetch);
 await api.rating();await api.ratingHistory();await api.reconcileRating("g",4);
 expect(fetch.mock.calls[0][0]).toContain('/rating');expect(fetch.mock.calls[1][0]).toContain('/rating/history?limit=5');
 expect(fetch.mock.calls.every(c=>c[1].credentials==='include')).toBe(true);
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({version:4});
});
it("401 conserva o fluxo de sessão expirada existente",async()=>{
 const expired=vi.fn();window.addEventListener(SESSION_EXPIRED,expired);
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({code:'unauthenticated',message:'Sessão expirada'})}));
 await expect(api.rating()).rejects.toThrow();expect(expired).toHaveBeenCalledTimes(1);window.removeEventListener(SESSION_EXPIRED,expired);
});
