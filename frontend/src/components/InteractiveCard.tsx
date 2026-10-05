import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type Ref } from "react";
import { createPortal } from "react-dom";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  action: string;
  tooltipTitle?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** Native button semantics and existing handlers, with one shared card interaction. */
export function InteractiveCard({ action, tooltipTitle, ref, className = "", children,
  onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown, onClick, disabled,
  "aria-describedby": describedBy, ...props }: Props) {
  const id = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const visible = !disabled && !dismissed && (hovered || focused);

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      if (!button.current || !tooltip.current) return;
      const card = button.current.getBoundingClientRect();
      const tip = tooltip.current.getBoundingClientRect();
      const margin = 8;
      const above = card.top - tip.height - margin;
      setPosition({
        left: Math.max(margin, Math.min(card.left + (card.width - tip.width) / 2, window.innerWidth - tip.width - margin)),
        top: Math.max(margin, Math.min(above >= margin ? above : card.bottom + margin, window.innerHeight - tip.height - margin)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [visible, action, tooltipTitle]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setDismissed(true); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [visible]);

  return <>
    <button {...props} type={props.type ?? "button"} disabled={disabled}
      ref={node => {
        button.current = node;
        if (typeof ref === "function") return ref(node);
        if (ref) ref.current = node;
      }}
      className={`interactive-card ${className}`}
      aria-describedby={[describedBy, visible ? id : undefined].filter(Boolean).join(" ") || undefined}
      onPointerEnter={event => {
        if (event.pointerType !== "touch") { setHovered(true); setDismissed(false); }
        onPointerEnter?.(event);
      }}
      onPointerLeave={event => { setHovered(false); onPointerLeave?.(event); }}
      onFocus={event => {
        setFocused(event.currentTarget.matches(":focus-visible")); setDismissed(false); onFocus?.(event);
      }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      onClick={event => { setDismissed(true); onClick?.(event); }}
      onKeyDown={event => { if (event.key === "Escape") setDismissed(true); onKeyDown?.(event); }}
    >{children}</button>
    {visible && createPortal(<span ref={tooltip} id={id} role="tooltip" className="card-action-tooltip" style={position}>
      {tooltipTitle && <strong>{tooltipTitle}</strong>}
      <span>{action}</span>
    </span>, document.body)}
  </>;
}
