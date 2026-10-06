import { FormEvent, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { defaultShortcuts } from '../../data/mock';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { Shortcut } from '../../types';
import { ShortcutIcon } from './ShortcutIcon';

const MAX_CUSTOM_ICON_SIZE = 256 * 1024;
const CUSTOM_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function isCustomIcon(value?: string) {
  return Boolean(value?.startsWith('data:image/'));
}

function readCustomIcon(file: File) {
  if (!CUSTOM_ICON_TYPES.has(file.type)) {
    return Promise.reject(new Error('El icono debe ser PNG, JPEG, WebP o GIF.'));
  }
  if (file.size > MAX_CUSTOM_ICON_SIZE) {
    return Promise.reject(new Error('El icono no puede superar 256 KB.'));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('No se pudo leer el icono.'));
    reader.onerror = () => reject(new Error('No se pudo leer el icono.'));
    reader.readAsDataURL(file);
  });
}

type ShortcutContextMenu = {
  id: string;
  x: number;
  y: number;
};

type ShortcutEditorDialogProps = {
  label: string;
  url: string;
  customIcon?: string;
  iconError?: string;
  onLabelChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onIconChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveIcon: () => void;
  onCancel: () => void;
  onSave: (event: FormEvent) => void;
};

function ShortcutEditorDialog({
  label,
  url,
  customIcon,
  iconError,
  onLabelChange,
  onUrlChange,
  onIconChange,
  onRemoveIcon,
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
        <label className="shortcut-icon-picker">
          Icono personalizado
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onIconChange} />
        </label>
        {isCustomIcon(customIcon) && (
          <div className="shortcut-icon-preview">
            <img src={customIcon} alt="Vista previa del icono personalizado" />
            <button type="button" className="text-button" onClick={onRemoveIcon}>Quitar icono</button>
          </div>
        )}
        {iconError && <p className="shortcut-icon-error" role="alert">{iconError}</p>}
        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary-button">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  );
}

export function Shortcuts() {
  const [shortcuts, setShortcuts] = useLocalStorage<Shortcut[]>('mipanel.shortcuts', defaultShortcuts);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [newCustomIcon, setNewCustomIcon] = useState<string>();
  const [newIconError, setNewIconError] = useState<string>();
  const [draggedId, setDraggedId] = useState<string>();
  const [contextMenu, setContextMenu] = useState<ShortcutContextMenu>();
  const [editingShortcut, setEditingShortcut] = useState<Shortcut>();
  const [editingLabel, setEditingLabel] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingCustomIcon, setEditingCustomIcon] = useState<string>();
  const [editingIconError, setEditingIconError] = useState<string>();
  const [shortcutToDelete, setShortcutToDelete] = useState<Shortcut>();
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressTriggered = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined);

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

  useEffect(() => () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  }, []);

  function addShortcut(event: FormEvent) {
    event.preventDefault();
    const cleanLabel = label.trim();
    let cleanUrl = url.trim();
    if (!cleanLabel || !cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

    setShortcuts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: cleanLabel,
        url: cleanUrl,
        icon: '🔗',
        customIcon: newCustomIcon,
      },
    ]);
    setLabel('');
    setUrl('');
    setNewCustomIcon(undefined);
    setNewIconError(undefined);
    setAdding(false);
  }

  function selectIcon(
    event: ChangeEvent<HTMLInputElement>,
    setIcon: (value: string | undefined) => void,
    setError: (value: string | undefined) => void,
  ) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;

    void readCustomIcon(file)
      .then((icon) => {
        setIcon(icon);
        setError(undefined);
      })
      .catch((iconError: unknown) => {
        setError(iconError instanceof Error ? iconError.message : 'No se pudo leer el icono.');
      });
  }

  function removeShortcut(id: string) {
    setShortcuts((current) => current.filter((shortcut) => shortcut.id !== id));
  }

  function openEditor(shortcut: Shortcut) {
    setContextMenu(undefined);
    setEditingShortcut(shortcut);
    setEditingLabel(shortcut.label);
    setEditingUrl(shortcut.url);
    setEditingCustomIcon(shortcut.customIcon);
    setEditingIconError(undefined);
  }

  function saveShortcut(event: FormEvent) {
    event.preventDefault();
    if (!editingShortcut) return;
    const nextLabel = editingLabel.trim();
    let nextUrl = editingUrl.trim();
    if (!nextLabel || !nextUrl) return;
    if (!/^https?:\/\//i.test(nextUrl)) nextUrl = `https://${nextUrl}`;
    setShortcuts((current) => current.map((shortcut) => shortcut.id === editingShortcut.id
      ? { ...shortcut, label: nextLabel, url: nextUrl, customIcon: editingCustomIcon }
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

  function openContextMenu(id: string, x: number, y: number) {
    const menuX = Math.min(x, window.innerWidth - 210);
    const menuY = Math.min(y, window.innerHeight - 210);
    setContextMenu({ id, x: Math.max(8, menuX), y: Math.max(8, menuY) });
  }

  function cancelLongPress() {
    if (!longPressTimer.current) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = undefined;
  }

  function startLongPress(event: PointerEvent<HTMLDivElement>, id: string) {
    cancelLongPress();
    longPressTriggered.current = false;
    if (event.pointerType !== 'touch') return;
    const { clientX, clientY } = event;
    touchStart.current = { x: clientX, y: clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = undefined;
      longPressTriggered.current = true;
      openContextMenu(id, clientX, clientY);
    }, 550);
  }

  function moveLongPress(event: PointerEvent<HTMLDivElement>) {
    const start = touchStart.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      cancelLongPress();
    }
  }

  const contextShortcut = contextMenu
    ? shortcuts.find((shortcut) => shortcut.id === contextMenu.id)
    : undefined;

  return (
    <section className="shortcuts-section" aria-label="Accesos directos">
      {adding && (
        <form className="shortcut-form" onSubmit={addShortcut}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre" aria-label="Nombre del acceso" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="URL del acceso" />
          <label className="shortcut-icon-picker">
            <span className="sr-only">Icono personalizado</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Icono personalizado"
              onChange={(event) => selectIcon(event, setNewCustomIcon, setNewIconError)}
            />
          </label>
          <button className="primary-button" type="submit">Guardar</button>
        </form>
      )}
      {adding && (isCustomIcon(newCustomIcon) || newIconError) && (
        <div className="shortcut-new-icon-status">
          {isCustomIcon(newCustomIcon) && (
            <><img src={newCustomIcon} alt="Vista previa del icono personalizado" /><button type="button" className="text-button" onClick={() => setNewCustomIcon(undefined)}>Quitar icono</button></>
          )}
          {newIconError && <span className="shortcut-icon-error" role="alert">{newIconError}</span>}
        </div>
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
            onPointerDown={(event) => startLongPress(event, shortcut.id)}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerMove={moveLongPress}
            onContextMenu={(event) => {
              event.preventDefault();
              openContextMenu(shortcut.id, event.clientX, event.clientY);
            }}
          >
            <a
              href={shortcut.url}
              className="shortcut-link"
              title={`${shortcut.url} · Clic derecho o mantén pulsado para acciones`}
              onKeyDown={(event) => {
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                openContextMenu(shortcut.id, bounds.left, bounds.bottom);
              }}
              onClick={(event) => {
                if (!longPressTriggered.current) return;
                event.preventDefault();
                longPressTriggered.current = false;
              }}
            >
              <span className="shortcut-icon" aria-hidden="true"><ShortcutIcon shortcut={shortcut} /></span>
              <span>{shortcut.label}</span>
            </a>
          </div>
        ))}
        <button
          type="button"
          className="shortcut-link shortcut-add-card"
          onClick={() => setAdding((value) => !value)}
          aria-expanded={adding}
        >
          <span className="shortcut-icon shortcut-add-icon" aria-hidden="true">+</span>
          <span>{adding ? 'Cancelar' : 'Añadir'}</span>
        </button>
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
          customIcon={editingCustomIcon}
          iconError={editingIconError}
          onLabelChange={setEditingLabel}
          onUrlChange={setEditingUrl}
          onIconChange={(event) => selectIcon(event, setEditingCustomIcon, setEditingIconError)}
          onRemoveIcon={() => setEditingCustomIcon(undefined)}
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
