import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applySiteTheme } from "./lib/theme";
import "./index.css";

applySiteTheme("open");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
