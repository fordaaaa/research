export type ThemeName = "paper" | "ocean" | "night";
export type FontName = "readable" | "maple";

export interface Appearance {
  theme: ThemeName;
  font: FontName;
}

const DEFAULT: Appearance = { theme: "paper", font: "readable" };

export function readAppearance(): Appearance {
  try {
    const theme = localStorage.getItem("notaeo:theme");
    const font = localStorage.getItem("notaeo:font");
    return {
      theme: theme === "ocean" || theme === "night" ? theme : DEFAULT.theme,
      font: font === "maple" ? font : DEFAULT.font,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem("notaeo:theme", appearance.theme);
    localStorage.setItem("notaeo:font", appearance.font);
  } catch {
    // The visual choice still applies for this session when storage is unavailable.
  }
}

export function applyAppearance(appearance: Appearance): void {
  document.documentElement.dataset.theme = appearance.theme;
  document.documentElement.dataset.font = appearance.font;
}
