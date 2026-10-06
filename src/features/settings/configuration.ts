import { defaultShortcuts } from '../../data/mock';
import { replaceStoredPreferences } from '../../storage/localStorageAdapter';
import type { Shortcut } from '../../types';

export const MAX_CONFIGURATION_BYTES = 16 * 1024 * 1024;
const KEYS = {
  shortcuts: 'mipanel.shortcuts',
  backgroundImage: 'mipanel.backgroundImage',
  microsoftSelectedListId: 'mipanel.microsoft.selectedListId',
  googleVisibleCalendarIds: 'mipanel.google.visibleCalendarIds',
} as const;

export type PanelConfiguration = {
  format: 'mipanel-configuration';
  version: 1;
  exportedAt: string;
  settings: {
    shortcuts: Shortcut[];
    backgroundImage: string;
    microsoftSelectedListId: string;
    googleVisibleCalendarIds: string[];
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El archivo no contiene una configuración válida de MiPanel.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
    throw new Error(`El campo «${name}» no es válido.`);
  }
  return value;
}

function image(value: unknown, name: string, maxBytes: number, icon = false) {
  if (typeof value !== 'string') throw new Error(`La imagen «${name}» no es válida.`);
  if (!value) return '';
  // Las imágenes se representan como datos, nunca como HTML o enlaces ejecutables.
  if (value.length > Math.ceil(maxBytes / 3) * 4 + 100) {
    throw new Error(`La imagen «${name}» supera el tamaño permitido.`);
  }
  const match = /^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length % 4 !== 0
    || (icon && !['png', 'jpeg', 'webp', 'gif'].includes(match[1].toLowerCase()))) {
    throw new Error(`La imagen «${name}» no es válida.`);
  }
  const bytes = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (bytes > maxBytes) throw new Error(`La imagen «${name}» supera el tamaño permitido.`);
  return value;
}

export function validateConfiguration(value: unknown): PanelConfiguration {
  const input = record(value);
  if (input.format !== 'mipanel-configuration') throw new Error('Este archivo no es una copia de configuración de MiPanel.');
  if (input.version !== 1) throw new Error('La versión de esta copia no es compatible con MiPanel.');
  const exportedAt = text(input.exportedAt, 'fecha de exportación', 50);
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('La fecha de exportación no es válida.');
  const settings = record(input.settings);
  if (!Array.isArray(settings.shortcuts) || settings.shortcuts.length > 200) {
    throw new Error('La copia debe contener una lista de hasta 200 accesos directos.');
  }
  const ids = new Set<string>();
  const shortcuts = settings.shortcuts.map((value, index): Shortcut => {
    const shortcut = record(value);
    const id = text(shortcut.id, 'identificador del acceso', 200);
    if (ids.has(id)) throw new Error('La copia contiene accesos con identificadores repetidos.');
    ids.add(id);
    const label = text(shortcut.label, 'nombre del acceso', 500);
    const url = text(shortcut.url, 'enlace del acceso', 8192);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error(`El enlace de «${label}» no es válido.`); }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`El enlace de «${label}» debe usar HTTP o HTTPS.`);
    return {
      id, label, url,
      ...(shortcut.icon !== undefined ? { icon: text(shortcut.icon, 'icono del acceso', 100, true) } : {}),
      ...(shortcut.customIcon !== undefined
        ? { customIcon: image(shortcut.customIcon, `icono ${index + 1}`, 256 * 1024, true) }
        : {}),
    };
  });
  if (!Array.isArray(settings.googleVisibleCalendarIds) || settings.googleVisibleCalendarIds.length > 1000) {
    throw new Error('La selección de calendarios no es válida.');
  }
  const googleVisibleCalendarIds = settings.googleVisibleCalendarIds.map((id) => text(id, 'calendario', 2048));
  if (new Set(googleVisibleCalendarIds).size !== googleVisibleCalendarIds.length) {
    throw new Error('La selección contiene calendarios repetidos.');
  }
  // Reconstruir solo los campos permitidos: jamás importar sesiones o claves arbitrarias.
  return {
    format: 'mipanel-configuration', version: 1, exportedAt,
    settings: {
      shortcuts,
      backgroundImage: image(settings.backgroundImage, 'fondo', 4 * 1024 * 1024),
      microsoftSelectedListId: text(settings.microsoftSelectedListId, 'lista de Microsoft', 2048, true),
      googleVisibleCalendarIds,
    },
  };
}

export function parseConfiguration(content: string) {
  if (new TextEncoder().encode(content).byteLength > MAX_CONFIGURATION_BYTES) {
    throw new Error('La copia no puede superar 16 MB.');
  }
  let value: unknown;
  try { value = JSON.parse(content) as unknown; } catch { throw new Error('El archivo no contiene JSON válido.'); }
  return validateConfiguration(value);
}

export function exportConfiguration(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  function read(key: string, fallback: unknown) {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw) as unknown; } catch { throw new Error('Una preferencia local no es válida. No se ha generado la copia.'); }
  }
  const configuration = validateConfiguration({
    format: 'mipanel-configuration', version: 1, exportedAt: new Date().toISOString(),
    settings: {
      shortcuts: read(KEYS.shortcuts, defaultShortcuts),
      backgroundImage: read(KEYS.backgroundImage, ''),
      microsoftSelectedListId: read(KEYS.microsoftSelectedListId, ''),
      googleVisibleCalendarIds: read(KEYS.googleVisibleCalendarIds, []),
    },
  });
  const content = JSON.stringify(configuration, null, 2);
  if (new TextEncoder().encode(content).byteLength > MAX_CONFIGURATION_BYTES) {
    throw new Error('La configuración supera el máximo de 16 MB por copia.');
  }
  return content;
}

export function importConfiguration(configuration: PanelConfiguration) {
  const { settings } = validateConfiguration(configuration);
  replaceStoredPreferences({
    [KEYS.shortcuts]: settings.shortcuts,
    [KEYS.backgroundImage]: settings.backgroundImage,
    [KEYS.microsoftSelectedListId]: settings.microsoftSelectedListId,
    [KEYS.googleVisibleCalendarIds]: settings.googleVisibleCalendarIds,
  });
}
