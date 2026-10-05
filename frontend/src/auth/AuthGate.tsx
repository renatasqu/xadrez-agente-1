import { useEffect, useState } from "react";
import { App } from "../App";
import { useAuth } from "./AuthContext";
import { AuthPage } from "./AuthPage";

export function AuthGate() {
  const { isAuthenticated, loading, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (loading) return;
    const authRoute = hash === "#/login" || hash === "#/cadastro";
    if (!isAuthenticated && !authRoute) window.location.hash = "/login";
    else if (isAuthenticated && (authRoute || !hash)) window.location.hash = "/partida";
  }, [hash, isAuthenticated, loading]);

  if (loading) return <main className="auth-screen" role="status">Verificando seu acesso…</main>;
  if (!isAuthenticated) return <AuthPage key={hash === "#/cadastro" ? "register" : "login"} register={hash === "#/cadastro"} />;
  return <>{logoutError && <p role="alert">{logoutError}</p>}<App onLogout={() => { void logout().catch(error => setLogoutError(error instanceof Error ? error.message : "Não foi possível sair.")); }} /></>;
}
