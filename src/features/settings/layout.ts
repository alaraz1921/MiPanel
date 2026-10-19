export type PanelLayout = { searchGap: number | null; panelsGap: number | null };
export const DEFAULT_LAYOUT: PanelLayout = { searchGap: null, panelsGap: null };
export const MAX_LAYOUT_GAP = 2000;

export function validLayoutGap(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LAYOUT_GAP);
}

export function normalizeLayout(value: unknown): PanelLayout {
  if (!value || typeof value !== 'object') return DEFAULT_LAYOUT;
  const layout = value as Partial<PanelLayout>;
  return {
    searchGap: validLayoutGap(layout.searchGap) ? layout.searchGap : null,
    panelsGap: validLayoutGap(layout.panelsGap) ? layout.panelsGap : null,
  };
}
