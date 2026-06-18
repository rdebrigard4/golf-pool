export type Theme = 'light' | 'dark'

const KEY = 'golf-pool:theme'

const THEME_COLOR: Record<Theme, string> = {
  light: '#eef6f0',
  dark: '#06140d',
}

export function loadTheme(): Theme {
  const stored = localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme])
}

// Text size. The whole app is rem-based, so scaling the root font-size scales
// everything proportionally (including the rem-based sticky-column offsets).
export const FONT_SCALE_MIN = 0.8
export const FONT_SCALE_MAX = 1.4
export const FONT_SCALE_STEP = 0.1

const FONT_KEY = 'golf-pool:fontScale'

export function clampFontScale(n: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(n * 100) / 100))
}

export function loadFontScale(): number {
  const n = Number(localStorage.getItem(FONT_KEY))
  return Number.isFinite(n) && n > 0 ? clampFontScale(n) : 1
}

export function saveFontScale(scale: number): void {
  localStorage.setItem(FONT_KEY, String(scale))
}

export function applyFontScale(scale: number): void {
  document.documentElement.style.fontSize = `${16 * scale}px`
}
