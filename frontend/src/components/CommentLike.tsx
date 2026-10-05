import { useState } from "react";

export function CommentLike() {
  const [liked, setLiked] = useState(false);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState("");
  function sendComment() {
    if (!comment.trim()) {
      setFeedback("Escreva um comentário antes de enviar.");
      return;
    }
    setFeedback("Envio demonstrativo: seu comentário não foi publicado nem salvo em um servidor.");
  }
  return <div className="comment-like-area">
    <label htmlFor="project-comment" className="comment-support"><strong>Escreva aqui.</strong>{" "}<span className="comment-support-ps">ps: sou uma ex-chef ainda me recuperando de Tripadvisor, iFood, Google Business, Yelp e tiktokers. Please be kind.</span></label>
    <textarea id="project-comment" rows={5} placeholder="O que você achou do projeto?" value={comment} onChange={event => { setComment(event.target.value); setFeedback(""); }} aria-describedby={feedback ? "comment-feedback" : undefined} />
    <div className="comment-actions">
    <button type="button" className="botao-pixel" aria-pressed={liked} onClick={() => setLiked(value => !value)}><span className="comment-like-heart" aria-hidden="true">♡ </span>Like</button>
      <button type="button" className="comment-send" disabled={!comment.trim()} onClick={sendComment}>Enviar</button>
    </div>
    <p id="comment-feedback" className="comment-feedback" role="status" aria-live="polite" aria-atomic="true" hidden={!feedback}>{feedback}</p>
  </div>;
}
