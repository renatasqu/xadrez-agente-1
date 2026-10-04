import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Apenas apresentação: mede o espaço ocupado fora do quadrado do tabuleiro. */
export function useMatchLayout(active: boolean) {
  const layoutRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 899px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const root = layoutRef.current;
    if (!active || !root) return;
    const context = root.querySelector<HTMLElement>(".match-context-strip");
    const controls = root.querySelector<HTMLElement>(".arena-control-strip");
    const workspace = root.querySelector<HTMLElement>(".board-workspace");
    const column = root.querySelector<HTMLElement>(".match-game-column");
    if (!context || !controls || !workspace || !column) return;
    let frame = 0;
    const gap = (element: HTMLElement) => Number.parseFloat(getComputedStyle(element).rowGap) || 0;
    const measure = () => {
      const square = workspace.querySelector<HTMLElement>(".moldura-tabuleiro");
      if (!square) return;
      const extra = Math.max(0, workspace.getBoundingClientRect().height - square.getBoundingClientRect().height);
      const height = context.getBoundingClientRect().height + controls.getBoundingClientRect().height
        + gap(root) + (mobile ? gap(root) : gap(column)) + extra;
      const previous = Number.parseFloat(root.style.getPropertyValue("--chrome-h"));
      if (!Number.isFinite(previous) || Math.abs(previous - height) > .5) root.style.setProperty("--chrome-h", `${height}px`);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [root, context, controls, workspace, column].forEach(element => observer.observe(element));
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [active, mobile]);
  return { layoutRef, mobile };
}
