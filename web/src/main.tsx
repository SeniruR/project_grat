import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applySiteTheme, readStoredTheme } from "./lib/theme";
import "./index.css";

applySiteTheme(readStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
