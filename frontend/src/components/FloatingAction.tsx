import { type MouseEventHandler } from "react";
import { InteractiveCard } from "./InteractiveCard";

type Props = {
  title: string;
  label: string;
  icon: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export function FloatingAction({ title, label, icon, onClick }: Props) {
  return <div className="floating-action">
    <InteractiveCard action={label} tooltipTitle={title} aria-label={label} onClick={onClick}>
      <img src={icon} alt="" draggable={false} />
    </InteractiveCard>
  </div>;
}
