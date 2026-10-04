/** A versão atual de react-chessboard não expõe a configuração de idioma do arraste. */
export function observarIdiomaDoTabuleiro(root: HTMLElement): () => void {
  function traduzirElemento(node: HTMLElement) {
    if (node.id && node.childElementCount === 0) {
      const texto = "Para selecionar uma peça arrastável, pressione a barra de espaço. Durante o arraste, use as setas para movê-la. Pressione espaço novamente para soltá-la na nova posição ou Escape para cancelar.";
      if (node.textContent?.includes("To pick up a draggable item")) node.textContent = texto;
    }
    if (node.getAttribute("aria-roledescription") === "draggable") {
      node.setAttribute("aria-roledescription", "peça arrastável");
    }
    if (node.id.startsWith("DndLiveRegion-")) {
      const original = node.textContent ?? "";
      const texto = original
        .replace(/^Picked up draggable item (.+)\.$/, "Peça $1 selecionada.")
        .replace(/^Draggable item (.+) was moved over droppable area (.+)\.$/, "Peça $1 movida sobre a casa $2.")
        .replace(/^Draggable item (.+) is no longer over a droppable area\.$/, "Peça $1 fora de uma casa de destino.")
        .replace(/^Draggable item (.+) was dropped over droppable area (.+)$/, "Peça $1 solta sobre a casa $2.")
        .replace(/^Dragging was cancelled\. Draggable item (.+) was dropped\.$/, "Arraste cancelado. Peça $1 solta.")
        .replace(/^Draggable item (.+) was dropped\.$/, "Peça $1 solta.");
      if (texto !== original) node.textContent = texto;
    }
  }
  function traduzirArvore(node: HTMLElement) {
    traduzirElemento(node);
    node.querySelectorAll<HTMLElement>("[id], [aria-roledescription]").forEach(traduzirElemento);
  }
  traduzirArvore(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (target) traduzirElemento(target);
      for (const added of record.addedNodes) {
        if (added instanceof HTMLElement) traduzirArvore(added);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["aria-roledescription"] });
  return () => observer.disconnect();
}
