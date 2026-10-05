import { InteractiveCard } from "./InteractiveCard";
import { EXERCISE_LABELS } from "../exercises/pedagogia";
interface Props {
  ids?: string[];
  onPractice?: (id: string) => void;
  disabled?: boolean;
}
export function RelatedPractice({ ids = [], onPractice, disabled = false }: Props) {
  if (!onPractice || !ids.length) return null;
  return <section aria-label="Prática relacionada" className="related-practice">
    <p className="support-label">Prática relacionada</p>
    <div className="practice-options">
    {[...new Set(ids)].map((id) => <InteractiveCard action="Abrir exercício deste conceito" key={id} type="button" disabled={disabled}
      className="practice-cta"
      aria-label={`Praticar este conceito: ${EXERCISE_LABELS[id]?.nome ?? "Exercício de xadrez"}`}
      onClick={() => onPractice(id)}>
      Praticar este conceito <span className="text-xs">· {EXERCISE_LABELS[id]?.nome ?? "Exercício de xadrez"}</span>
    </InteractiveCard>)}
    </div>
  </section>;
}
