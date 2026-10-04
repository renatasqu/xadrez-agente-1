import { useEffect, useRef, type ReactNode, type RefObject } from "react";

interface Props {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** Mantém o conteúdo montado ao fechar, incluindo rascunho e navegação. */
export function ContentModal({ id, title, open, onClose, returnFocusRef, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open || !panel.current) return;
    const root = panel.current;
    const previous = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0 && document.documentElement.clientWidth > 0) document.body.style.paddingRight = `${scrollbar}px`;
    (root.querySelector<HTMLElement>("textarea") ?? root.querySelector<HTMLElement>(".modal-body button:not(:disabled)") ?? root.querySelector<HTMLElement>("button") ?? root).focus();

    const keydown = (event: KeyboardEvent) => {
      // O leitor de documentos tem seu próprio Escape; fecha primeiro a janela interna.
      const nested = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (event.key === "Escape" && nested) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close.current(); return;
      }
      if (event.key !== "Tab") return;
      const scope = nested ?? root;
      const focusable = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
        .filter(element => !element.closest('[hidden], [inert]') && !element.closest('details:not([open]) :not(summary)'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); scope.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      const opener = returnFocusRef?.current ?? previous;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, returnFocusRef]);

  return <div className="match-modal-backdrop" hidden={!open} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} className="match-modal">
      <header className="modal-heading"><h2 id={`${id}-title`}>{title}</h2><button type="button" onClick={onClose} aria-label={`Fechar ${title.toLowerCase()}`}>Fechar <span aria-hidden="true">×</span></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
