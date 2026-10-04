// Guarda o id anônimo das lições no localStorage. Em navegação privada ou com o armazenamento
// bloqueado, localStorage pode lançar erro: nesse caso guardamos só na memória (o progresso
// vale até fechar a aba).

const CHAVE = "xadrez-agente:usuario_id";
let naMemoria: string | null = null;

export function lerUsuarioId(): string | null {
  try {
    return window.localStorage.getItem(CHAVE) ?? naMemoria;
  } catch {
    return naMemoria;
  }
}

export function gravarUsuarioId(id: string): void {
  naMemoria = id;
  try {
    window.localStorage.setItem(CHAVE, id);
  } catch {
    // sem localStorage: fica só na memória
  }
}

export function apagarUsuarioId(): void {
  naMemoria = null;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // nada a fazer
  }
}
