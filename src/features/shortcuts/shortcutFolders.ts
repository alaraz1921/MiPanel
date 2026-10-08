import type { Shortcut } from '../../types';

export function shortcutsInFolder(shortcuts: Shortcut[], folderId?: string) {
  return shortcuts.filter((shortcut) => shortcut.folderId === folderId);
}

export function moveToFolder(shortcuts: Shortcut[], id: string, folderId?: string) {
  const shortcut = shortcuts.find((item) => item.id === id);
  if (!shortcut || shortcut.kind === 'folder') return shortcuts;
  if (folderId && !shortcuts.some((item) => item.id === folderId && item.kind === 'folder' && !item.folderId)) return shortcuts;
  return shortcuts.map((item) => item.id === id ? { ...item, folderId } : item);
}

export function removeShortcutItem(shortcuts: Shortcut[], id: string) {
  // Eliminar una carpeta nunca elimina sus enlaces.
  return shortcuts.filter((item) => item.id !== id).map((item) => item.folderId === id ? { ...item, folderId: undefined } : item);
}

export function reorderShortcut(shortcuts: Shortcut[], id: string, targetId: string) {
  const from = shortcuts.findIndex((item) => item.id === id);
  const to = shortcuts.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || shortcuts[from].folderId !== shortcuts[to].folderId) return shortcuts;
  const next = [...shortcuts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
