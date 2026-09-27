import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-500.css";
import "@fontsource/atkinson-hyperlegible-next/latin-600.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@fontsource/maple-mono/latin-400.css";
import "@fontsource/maple-mono/latin-500.css";
import "@fontsource/maple-mono/latin-600.css";
import "@fontsource/maple-mono/latin-700.css";
import "./index.css";
import App from "./App.tsx";
import { applyAppearance, readAppearance } from "./appearance";
import { armTapSounds } from "./sound";

applyAppearance(readAppearance());
armTapSounds();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
