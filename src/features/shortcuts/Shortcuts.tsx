import { FormEvent, useEffect, useRef, useState, type DragEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { defaultShortcuts } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import type { Shortcut } from '../../types';

function faviconUrl(pageUrl: string) {
  try {
    const parsed = new URL(pageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;

    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      const favicon = new URL(chrome.runtime.getURL('/_favicon/'));
      favicon.searchParams.set('pageUrl', parsed.toString());
      favicon.searchParams.set('size', '64');
      return favicon.toString();
    }

    return `${parsed.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = faviconUrl(shortcut.url);

  if (!iconUrl || failed) {
    return <span className="shortcut-icon-fallback" aria-hidden="true">{shortcut.icon ?? '🔗'}</span>;
  }

  return (
    <img
      className="shortcut-icon-image"
      src={iconUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

type ShortcutContextMenu = {
  id: string;
  x: number;
  y: number;
};

type ShortcutEditorDialogProps = {
  label: string;
  url: string;
  onLabelChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onCancel: () => void;
  onSave: (event: FormEvent) => void;
};

function ShortcutEditorDialog({
  label,
  url,
  onLabelChange,
  onUrlChange,
  onCancel,
  onSave,
}: ShortcutEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="shortcut-editor-dialog"
      aria-labelledby="shortcut-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form className="shortcut-editor" onSubmit={onSave}>
        <div>
          <span className="eyebrow">Acceso directo</span>
          <h3 id="shortcut-editor-title">Editar acceso</h3>
        </div>
        <label>
          Nombre
          <input value={label} onChange={(event) => onLabelChange(event.target.value)} autoFocus required />
        </label>
        <label>
          Enlace
          <input value={url} onChange={(event) => onUrlChange(event.target.value)} inputMode="url" required />
        </label>
        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary-button">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  );
}

export function Shortcuts() {
  const [shortcuts, setShortcuts] = useExtensionStorage<Shortcut[]>('mipanel.shortcuts', defaultShortcuts);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [draggedId, setDraggedId] = useState<string>();
  const [contextMenu, setContextMenu] = useState<ShortcutContextMenu>();
  const [editingShortcut, setEditingShortcut] = useState<Shortcut>();
  const [editingLabel, setEditingLabel] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [shortcutToDelete, setShortcutToDelete] = useState<Shortcut>();

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(undefined);
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [contextMenu]);

  function addShortcut(event: FormEvent) {
    event.preventDefault();
    const cleanLabel = label.trim();
    let cleanUrl = url.trim();
    if (!cleanLabel || !cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

    setShortcuts((current) => [
      ...current,
      { id: crypto.randomUUID(), label: cleanLabel, url: cleanUrl, icon: '🔗' },
    ]);
    setLabel('');
    setUrl('');
    setAdding(false);
  }

  function removeShortcut(id: string) {
    setShortcuts((current) => current.filter((shortcut) => shortcut.id !== id));
  }

  function openEditor(shortcut: Shortcut) {
    setContextMenu(undefined);
    setEditingShortcut(shortcut);
    setEditingLabel(shortcut.label);
    setEditingUrl(shortcut.url);
  }

  function saveShortcut(event: FormEvent) {
    event.preventDefault();
    if (!editingShortcut) return;
    const nextLabel = editingLabel.trim();
    let nextUrl = editingUrl.trim();
    if (!nextLabel || !nextUrl) return;
    if (!/^https?:\/\//i.test(nextUrl)) nextUrl = `https://${nextUrl}`;
    setShortcuts((current) => current.map((shortcut) => shortcut.id === editingShortcut.id
      ? { ...shortcut, label: nextLabel, url: nextUrl }
      : shortcut));
    setEditingShortcut(undefined);
  }

  function moveShortcut(id: string, direction: -1 | 1) {
    setShortcuts((current) => {
      const index = current.findIndex((shortcut) => shortcut.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function dropShortcut(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setShortcuts((current) => {
      const from = current.findIndex((shortcut) => shortcut.id === draggedId);
      const to = current.findIndex((shortcut) => shortcut.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId(undefined);
  }

  const contextShortcut = contextMenu
    ? shortcuts.find((shortcut) => shortcut.id === contextMenu.id)
    : undefined;

  return (
    <section className="shortcuts-section" aria-label="Accesos directos">
      <div className="shortcuts-actions">
        <button className="ghost-button" type="button" onClick={() => setAdding((value) => !value)}>
          {adding ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>

      {adding && (
        <form className="shortcut-form" onSubmit={addShortcut}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre" aria-label="Nombre del acceso" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="URL del acceso" />
          <button className="primary-button" type="submit">Guardar</button>
        </form>
      )}

      <div className="shortcut-grid">
        {shortcuts.map((shortcut) => (
          <div
            className={`shortcut-item${draggedId === shortcut.id ? ' dragging' : ''}`}
            key={shortcut.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              setDraggedId(shortcut.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropShortcut(event, shortcut.id)}
            onDragEnd={() => setDraggedId(undefined)}
            onContextMenu={(event) => {
              event.preventDefault();
              const x = Math.min(event.clientX, window.innerWidth - 210);
              const y = Math.min(event.clientY, window.innerHeight - 210);
              setContextMenu({ id: shortcut.id, x: Math.max(8, x), y: Math.max(8, y) });
            }}
          >
            <a href={shortcut.url} className="shortcut-link" title={`${shortcut.url} · Clic derecho para acciones`}>
              <span className="shortcut-icon" aria-hidden="true"><ShortcutIcon shortcut={shortcut} /></span>
              <span>{shortcut.label}</span>
            </a>
          </div>
        ))}
      </div>

      {contextMenu && contextShortcut && (
        <div
          className="shortcut-context-menu"
          role="menu"
          aria-label={`Acciones para ${contextShortcut.label}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => openEditor(contextShortcut)}>✎ <span>Editar</span></button>
          <button type="button" role="menuitem" onClick={() => { moveShortcut(contextShortcut.id, -1); setContextMenu(undefined); }}>← <span>Mover a la izquierda</span></button>
          <button type="button" role="menuitem" onClick={() => { moveShortcut(contextShortcut.id, 1); setContextMenu(undefined); }}>→ <span>Mover a la derecha</span></button>
          <div className="shortcut-context-divider" />
          <button
            type="button"
            role="menuitem"
            className="shortcut-context-delete"
            onClick={() => {
              setContextMenu(undefined);
              setShortcutToDelete(contextShortcut);
            }}
          >
            ♲ <span>Eliminar</span>
          </button>
        </div>
      )}

      {editingShortcut && (
        <ShortcutEditorDialog
          label={editingLabel}
          url={editingUrl}
          onLabelChange={setEditingLabel}
          onUrlChange={setEditingUrl}
          onCancel={() => setEditingShortcut(undefined)}
          onSave={saveShortcut}
        />
      )}

      {shortcutToDelete && (
        <ConfirmDialog
          title="Eliminar acceso directo"
          message={`¿Quieres eliminar “${shortcutToDelete.label}”? Esta acción no afecta al sitio web.`}
          confirmLabel="Eliminar"
          danger
          onCancel={() => setShortcutToDelete(undefined)}
          onConfirm={() => {
            removeShortcut(shortcutToDelete.id);
            setShortcutToDelete(undefined);
          }}
        />
      )}
    </section>
  );
}
