import { useEffect, useRef, useState } from "react";
import "./CuriositiesCard.css";

const SLIDE_DURATION = 10_000;
const slides = [
  { file: "leela-chess-zero.png", alt: "Curiosidade sobre Leela Chess Zero" },
  { file: "transformers.png", alt: "Curiosidade sobre Transformers" },
  { file: "judit-polgar.png", alt: "Curiosidade sobre Judit Polgár" },
  { file: "hans-niemann.png", alt: "Curiosidade sobre Hans Niemann" },
];

export function CuriositiesCard() {
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(SLIDE_DURATION);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    let advanced = false;
    const timer = setTimeout(() => {
      advanced = true;
      remaining.current = SLIDE_DURATION;
      setPrevious(index);
      setIndex(current => (current + 1) % slides.length);
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      if (!advanced) remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [index, paused]);

  return <section className="curiosities-trigger curiosities-card" aria-label="Curiosidades da partida"
    tabIndex={0}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <h2>CURIOSIDADES</h2>
    <div className="curiosities-carousel" aria-roledescription="carrossel" aria-label="Imagens de curiosidades">
      {slides.map((slide, slideIndex) => <img key={slide.file}
        className="curiosities-slide" data-active={slideIndex === index}
        data-previous={slideIndex === previous}
        data-animated={previous !== null}
        src={`${import.meta.env.BASE_URL}images/curiosidades/${slide.file}`}
        alt={slide.alt} aria-hidden={slideIndex !== index}
        width={1536} height={1024} draggable={false} />)}
    </div>
  </section>;
}
