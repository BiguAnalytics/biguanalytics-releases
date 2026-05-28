// @ts-check

/**
 * @param {unknown} theme
 * @returns {'dark'|'light'}
 */
export function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * @param {unknown} theme
 * @param {{dataset?: Record<string, string>, style?: Record<string, string>}} [root]
 * @returns {'dark'|'light'}
 */
export function applyAppTheme(theme, root = document.documentElement) {
  const nextTheme = normalizeTheme(theme);
  if (root?.dataset) root.dataset.theme = nextTheme;
  if (root?.style) root.style.colorScheme = nextTheme;
  return nextTheme;
}

/**
 * @returns {Promise<'dark'|'light'>}
 */
export async function loadAndApplyTheme() {
  try {
    const settings = await window.api?.settings?.get?.();
    return applyAppTheme(settings?.theme);
  } catch {
    return applyAppTheme('dark');
  }
}
