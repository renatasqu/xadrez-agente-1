// Apenas sinaliza perda de sessão; o token permanece no cookie HttpOnly.
export const SESSION_EXPIRED = "xadrez:session-expired";
export function sessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}
