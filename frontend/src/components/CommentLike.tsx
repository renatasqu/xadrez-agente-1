import { useState } from "react";

export function CommentLike() {
  const [liked, setLiked] = useState(false);
  return <div className="comment-like-area">
    <label htmlFor="project-comment">Seu comentário</label>
    <textarea id="project-comment" rows={5} placeholder="O que você achou do projeto?" />
    <p>Seu rascunho fica nesta sessão. Ainda não é publicado.</p>
    <button type="button" className="botao-pixel" aria-pressed={liked} onClick={() => setLiked(value => !value)}><span aria-hidden="true">♡ </span>Like</button>
  </div>;
}
