import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import loginButton from "../assets/login-button-transparent.png";
import registerButton from "../assets/register-button-transparent.png";
import authIllustration from "../assets/auth-illustration-transparent.png";
import { useAuth } from "./AuthContext";

type Field = "name" | "email" | "password" | "confirmation";

export function AuthPage({ register = false }: { register?: boolean }) {
  const auth = useAuth();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");
    const next: Partial<Record<Field, string>> = {};
    if (register && !name) next.name = "Informe seu nome.";
    if (!email) next.email = "Informe seu e-mail.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !(form.elements.namedItem("email") as HTMLInputElement).validity.valid) next.email = "Informe um e-mail válido.";
    if (!password.trim()) next.password = "Informe sua senha.";
    else if (register && password.length < 8) next.password = "Use uma senha com pelo menos 8 caracteres.";
    if (register && confirmation !== password) next.confirmation = "As senhas precisam ser iguais.";
    else if (register && !confirmation) next.confirmation = "Confirme sua senha.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { (form.elements.namedItem(first) as HTMLInputElement)?.focus(); return; }
    setSubmitting(true);
    try {
      if (register) await auth.register(name, email);
      else await auth.login(email, password);
      form.reset();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally { setSubmitting(false); }
  }

  function field(key: Field, label: string, type: string, autocomplete: string) {
    return <div className="auth-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input id={`${id}-${key}`} name={key} type={type} autoComplete={autocomplete} required
        minLength={register && key === "password" ? 8 : undefined}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} />
      {errors[key] && <p id={`${id}-${key}-error`} className="auth-field-error">{errors[key]}</p>}
    </div>;
  }

  return <main className="auth-screen">
    <section className="auth-brand" aria-label="Xadrez Multiagente">
      <img className="auth-logo" src={`${import.meta.env.BASE_URL}images/logo-xadrez-multiagente.png`} alt="Xadrez Multiagente" width="1983" height="793" />
      <span className="auth-eyebrow">CHESS. SMOOTHIE. BURRITOS</span>
      <h1>Seu próximo<br />grande lance.</h1>
      <p>Uma homenagem aos meus grandmasters favoritos: Hans e Judit. Além disso, o projeto reúne muita informação sobre xadrez, AlphaZero, Transformers, Stockfish e outros temas, além de um tabuleiro online interativo, tutor de estratégias, curiosidades e, por enquanto, é isso.</p>
      <div className="auth-art" aria-hidden="true">
        <img src={authIllustration} alt="" width="1672" height="941" />
      </div>
      <div className="auth-pixels" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    </section>
    <section className="auth-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{register ? "Criar sua conta:" : "Entrar na arena:"}</h2>
      <p className="auth-subtitle">{register ? "É uma demo. Não vai ter spam. Juro!" : "Não é uma arena. É um tabuleiro."}</p>
      <p className="auth-demo-note">Acesso pessoal de teste. Entre com seu e-mail e senha configurados.</p>
      <form onSubmit={submit} noValidate>
        {register && field("name", "Nome:", "text", "name")}
        {field("email", "E-mail:", "email", "email")}
        <div className="auth-password">
          {field("password", "Senha:", showPassword ? "text" : "password", register ? "new-password" : "current-password")}
          <button type="button" className="auth-password-toggle" aria-controls={`${id}-password`} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Ocultar senha" : "Mostrar senha"}</button>
        </div>
        {register && field("confirmation", "Confirmar senha:", showPassword ? "text" : "password", "new-password")}
        <div className="auth-validation" role="status" aria-live="polite" aria-atomic="true">{Object.keys(errors).length > 0 && <span>Revise os campos indicados. {Object.values(errors).join(" ")}</span>}{submitError}{submitting && "Verificando…"}</div>
        <button type="submit" className="auth-submit auth-submit-image" disabled={submitting} aria-label={register ? "Criar conta" : "Entrar"}>
          <img src={register ? registerButton : loginButton} alt="" />
        </button>
      </form>
      <p className="auth-switch">{register ? "Já tem uma conta?" : "Primeira vez por aqui?"} <a href={register ? "#/login" : "#/cadastro"}>{register ? "Entrar" : "Criar conta"}</a></p>
    </section>
  </main>;
}
