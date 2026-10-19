export type PanelAppearance = { hideSearch: boolean; shortcutOpacity: number | null };
export const DEFAULT_APPEARANCE: PanelAppearance = { hideSearch: false, shortcutOpacity: null };

export function validShortcutOpacity(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100);
}

export function normalizeAppearance(value: unknown): PanelAppearance {
  if (!value || typeof value !== 'object') return DEFAULT_APPEARANCE;
  const appearance = value as Partial<PanelAppearance>;
  return {
    hideSearch: appearance.hideSearch === true,
    shortcutOpacity: validShortcutOpacity(appearance.shortcutOpacity) ? appearance.shortcutOpacity : null,
  };
}
