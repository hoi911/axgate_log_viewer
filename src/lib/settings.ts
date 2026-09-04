import { DEFAULT_SETTINGS, type Settings } from "./types";

const KEY = "axgate-log-viewer.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      density: parsed.density ?? DEFAULT_SETTINGS.density,
      pageSize: parsed.pageSize === 50 || parsed.pageSize === 200 ? parsed.pageSize : 100,
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      hiddenColumns: parsed.hiddenColumns ?? {},
      extraColumns: parsed.extraColumns ?? {},
      filterPresets: parsed.filterPresets ?? {},
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function resolveTheme(mode: Settings["theme"]): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}
