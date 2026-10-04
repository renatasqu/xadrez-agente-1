import { useEffect, useState } from "react";
import { curiosidades } from "../curiosidades";

export function CuriositiesCard() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex(current => (current + 1) % curiosidades.length), 180000);
    return () => clearInterval(timer);
  }, []);

  return <section className="curiosities-trigger curiosities-card" aria-label="Curiosidades da partida">
    <h2>CURIOSIDADES</h2>
    <strong>Você sabia?</strong>
    <p>{curiosidades[index].texto}</p>
    <small>{index + 1} de {curiosidades.length} · Próxima curiosidade em alguns minutos.</small>
  </section>;
}
