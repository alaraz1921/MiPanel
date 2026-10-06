import { useState } from 'react';
import type { Shortcut } from '../../types';

export function faviconUrl(pageUrl: string) {
  try {
    const parsed = new URL(pageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

// Dibujos locales monocromos, sin imágenes de fondo ni servicios externos.
const fallbackPaths = {
  mail: 'M3 5h18v14H3z M3 5l9 8 9-8 M3 19l6-7 M21 19l-6-7',
  calendar: 'M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4 M8 13h1 M12 13h1 M16 13h1 M8 17h1 M12 17h1',
  tasks: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M7 12l3 3 7-7',
  cloud: 'M7 19h11a4 4 0 0 0 1-8 6 6 0 0 0-11-3 4 4 0 0 0-5 4 4 4 0 0 0 4 7',
  chat: 'M3 4h18v12H10l-6 4v-4H3z M7 8h10 M7 12h7',
  map: 'M12 14s6-5 6-9a6 6 0 0 0-12 0c0 4 6 9 6 9 M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M7 14l-3 1-2 7 7-2 6 2 7-2-3-7-2 1 M9 16v4 M15 16v6',
  education: 'M2 9l10-6 10 6-10 6z M6 12v6c4 3 8 3 12 0v-6 M22 9v8',
  weather: 'M8 14h10a4 4 0 0 0 0-8 5 5 0 0 0-9-1 4 4 0 0 0-1 9 M6 17l-1 3 M11 17l-1 3 M16 17l-1 3 M3 3l1 1 M10 1v2 M1 9h2',
  code: 'M8 5l-7 7 7 7 M16 5l7 7-7 7 M14 3l-4 18',
  shopping: 'M2 3h3l3 13h12l2-9H6 M11 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0 M20 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  ai: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2c-6 6-6 14 0 20 6-6 6-14 0-20',
};

export function fallbackKind(shortcut: Pick<Shortcut, 'label' | 'url'>): keyof typeof fallbackPaths {
  const text = `${shortcut.label} ${shortcut.url}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/gmail|outlook|correo|mail/.test(text)) return 'mail';
  if (/calendar|calendario|agenda/.test(text)) return 'calendar';
  if (/to-do|todo\.live|tasks|tareas|task|notion/.test(text)) return 'tasks';
  if (/onedrive|drive|dropbox|nube|cloud/.test(text)) return 'cloud';
  if (/chatgpt|gemini|copilot|claude/.test(text)) return 'ai';
  if (/chat|whatsapp|telegram|mensaj/.test(text)) return 'chat';
  if (/maps|mapa|mapas|ubicacion/.test(text)) return 'map';
  if (/educa|escuela|colegio|school|universidad|classroom/.test(text)) return 'education';
  if (/tiempo|weather|clima|aemet/.test(text)) return 'weather';
  if (/github|gitlab|supabase|codigo|code/.test(text)) return 'code';
  if (/tienda|compra|shop|amazon/.test(text)) return 'shopping';
  return 'globe';
}

export function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const [failedFavicon, setFailedFavicon] = useState<string>();
  const [failedCustom, setFailedCustom] = useState<string>();
  const iconUrl = faviconUrl(shortcut.url);
  if (shortcut.customIcon?.startsWith('data:image/') && shortcut.customIcon !== failedCustom) {
    return <img className="shortcut-icon-image" src={shortcut.customIcon} alt="" onError={() => setFailedCustom(shortcut.customIcon)} />;
  }
  if (iconUrl && iconUrl !== failedFavicon) {
    return <img className="shortcut-icon-image" src={iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedFavicon(iconUrl)} />;
  }
  return (
    <svg className="shortcut-icon-image" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={fallbackPaths[fallbackKind(shortcut)]} />
    </svg>
  );
}
