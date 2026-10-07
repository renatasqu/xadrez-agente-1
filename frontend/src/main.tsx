import "@fontsource/press-start-2p";
import "./index.css";
import "./visual-foundation.css";
import "./match-presentation.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider><AuthGate /></AuthProvider>
  </StrictMode>,
);
