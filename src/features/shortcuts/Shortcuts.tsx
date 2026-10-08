import { FormEvent, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { defaultShortcuts } from '../../data/mock';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { Shortcut } from '../../types';
import { ShortcutIcon } from './ShortcutIcon';
import { ShortcutFolderDialog } from './ShortcutFolderDialog';
import { moveToFolder, removeShortcutItem, reorderShortcut, shortcutsInFolder } from './shortcutFolders';

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
  folders: Shortcut[];
  folderId: string;
  isFolder: boolean;
  onFolderChange: (value: string) => void;
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
  folders, folderId, isFolder, onFolderChange,
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
          <h3 id="shortcut-editor-title">{isFolder ? 'Editar carpeta' : 'Editar acceso'}</h3>
        </div>
        <label>
          Nombre
          <input value={label} onChange={(event) => onLabelChange(event.target.value)} autoFocus required />
        </label>
        {!isFolder && <label>
          Enlace
          <input value={url} onChange={(event) => onUrlChange(event.target.value)} inputMode="url" required />
        </label>}
        {!isFolder && <label>Carpeta<select value={folderId} onChange={(event) => onFolderChange(event.target.value)}>
          <option value="">Panel principal</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
        </select></label>}
        {!isFolder && <label className="shortcut-icon-picker">
          Icono personalizado
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onIconChange} />
        </label>}
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
  const [openInNewTab] = useLocalStorage('mipanel.shortcuts.openInNewTab', false);
  const [activeFolderId, setActiveFolderId] = useState<string>();
  const [addingFolder, setAddingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState('');
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
    if (!cleanLabel || (!addingFolder && !cleanUrl)) return;
    if (!addingFolder && !/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

    setShortcuts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: cleanLabel,
        url: addingFolder ? '' : cleanUrl,
        kind: addingFolder ? 'folder' : undefined,
        folderId: addingFolder ? undefined : activeFolder?.id,
        icon: '🔗',
        customIcon: newCustomIcon,
      },
    ]);
    setLabel('');
    setUrl('');
    setNewCustomIcon(undefined);
    setNewIconError(undefined);
    setAdding(false);
    setAddingFolder(false);
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
    setShortcuts((current) => removeShortcutItem(current, id));
  }

  function openEditor(shortcut: Shortcut) {
    setContextMenu(undefined);
    setEditingShortcut(shortcut);
    setEditingLabel(shortcut.label);
    setEditingUrl(shortcut.url);
    setEditingFolderId(shortcut.folderId ?? '');
    setEditingCustomIcon(shortcut.customIcon);
    setEditingIconError(undefined);
  }

  function saveShortcut(event: FormEvent) {
    event.preventDefault();
    if (!editingShortcut) return;
    const nextLabel = editingLabel.trim();
    let nextUrl = editingUrl.trim();
    if (!nextLabel || (editingShortcut.kind !== 'folder' && !nextUrl)) return;
    if (editingShortcut.kind !== 'folder' && !/^https?:\/\//i.test(nextUrl)) nextUrl = `https://${nextUrl}`;
    setShortcuts((current) => moveToFolder(current.map((shortcut) => shortcut.id === editingShortcut.id
      ? { ...shortcut, label: nextLabel, url: shortcut.kind === 'folder' ? '' : nextUrl, customIcon: editingCustomIcon }
      : shortcut), editingShortcut.id, editingFolderId || undefined));
    setEditingShortcut(undefined);
  }

  function moveShortcut(id: string, direction: -1 | 1) {
    setShortcuts((current) => {
      const item = current.find((shortcut) => shortcut.id === id);
      if (!item) return current;
      const siblings = shortcutsInFolder(current, item.folderId);
      const index = siblings.findIndex((shortcut) => shortcut.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return current;
      return reorderShortcut(current, id, siblings[targetIndex].id);
    });
  }

  function dropShortcut(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setShortcuts((current) => {
      const target = current.find((shortcut) => shortcut.id === targetId);
      const dragged = current.find((shortcut) => shortcut.id === draggedId);
      if (target?.kind === 'folder' && dragged?.kind !== 'folder') return moveToFolder(current, draggedId, targetId);
      return reorderShortcut(current, draggedId, targetId);
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

  const folders = shortcuts.filter((shortcut) => shortcut.kind === 'folder');
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);

  function closeFolder() {
    setActiveFolderId(undefined);
    setContextMenu(undefined);
    setAdding(false);
    setAddingFolder(false);
  }

  const addForm = <>
      {adding && (
        <form className="shortcut-form" onSubmit={addShortcut}>
          {!activeFolder && <select aria-label="Tipo de acceso" value={addingFolder ? 'folder' : 'link'} onChange={(event) => setAddingFolder(event.target.value === 'folder')}>
            <option value="link">Enlace</option><option value="folder">Carpeta</option>
          </select>}
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre" aria-label="Nombre del acceso" />
          {!addingFolder && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="URL del acceso" />}
          {!addingFolder && <label className="shortcut-icon-picker">
            <span className="sr-only">Icono personalizado</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Icono personalizado"
              onChange={(event) => selectIcon(event, setNewCustomIcon, setNewIconError)}
            />
          </label>}
          <button className="primary-button" type="submit">Guardar</button>
        </form>
      )}
      {adding && !addingFolder && (isCustomIcon(newCustomIcon) || newIconError) && (
        <div className="shortcut-new-icon-status">
          {isCustomIcon(newCustomIcon) && (
            <><img src={newCustomIcon} alt="Vista previa del icono personalizado" /><button type="button" className="text-button" onClick={() => setNewCustomIcon(undefined)}>Quitar icono</button></>
          )}
          {newIconError && <span className="shortcut-icon-error" role="alert">{newIconError}</span>}
        </div>
      )}

      </>;

  function renderGrid(folderId?: string) {
    return <div className="shortcut-grid">
        {shortcutsInFolder(shortcuts, folderId).map((shortcut) => (
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
            {shortcut.kind === 'folder' ? <button type="button" className="shortcut-link shortcut-folder-card"
              aria-haspopup="dialog" title={`${shortcut.label} · Clic derecho o mantén pulsado para acciones`}
              onKeyDown={(event) => {
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                openContextMenu(shortcut.id, bounds.left, bounds.bottom);
              }}
              onClick={() => {
                if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                setContextMenu(undefined); setAdding(false); setAddingFolder(false); setActiveFolderId(shortcut.id);
              }}>
              <span className="shortcut-icon" aria-hidden="true">
                {shortcutsInFolder(shortcuts, shortcut.id).length ? <span className="shortcut-folder-preview">
                  {shortcutsInFolder(shortcuts, shortcut.id).slice(0, 4).map((child) => <ShortcutIcon key={child.id} shortcut={child} />)}
                </span> : <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.6"><path d="M3 7V5h7l2 2h9v13H3Z" /></svg>}
              </span><span>{shortcut.label}</span>
            </button> : <a
              href={shortcut.url}
              target={openInNewTab ? '_blank' : undefined}
              rel={openInNewTab ? 'noopener noreferrer' : undefined}
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
            </a>}
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
    ;
  }

  const menu = contextMenu && contextShortcut && (
        <div
          className="shortcut-context-menu"
          role="menu"
          aria-label={`Acciones para ${contextShortcut.label}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => openEditor(contextShortcut)}>✎ <span>Editar</span></button>
          {contextShortcut.kind !== 'folder' && contextShortcut.folderId && <button type="button" role="menuitem" onClick={() => {
            setShortcuts((current) => moveToFolder(current, contextShortcut.id)); setContextMenu(undefined);
          }}>↗ <span>Sacar al panel</span></button>}
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
      );

  return (
    <section className="shortcuts-section" aria-label="Accesos directos">
      {!activeFolder && addForm}
      {renderGrid()}
      {!activeFolder && menu}
      {activeFolder && <ShortcutFolderDialog title={activeFolder.label} onClose={closeFolder}>
        {addForm}
        {shortcutsInFolder(shortcuts, activeFolder.id).length === 0 && <p>Esta carpeta está vacía. Añade un enlace o mueve uno desde «Editar».</p>}
        {renderGrid(activeFolder.id)}
        {menu}
      </ShortcutFolderDialog>}

      {editingShortcut && (
        <ShortcutEditorDialog
          folders={folders}
          folderId={editingFolderId}
          isFolder={editingShortcut.kind === 'folder'}
          onFolderChange={setEditingFolderId}
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
          title={shortcutToDelete.kind === 'folder' ? 'Eliminar carpeta' : 'Eliminar acceso directo'}
          message={shortcutToDelete.kind === 'folder' ? `¿Quieres eliminar “${shortcutToDelete.label}”? Sus enlaces volverán al panel principal, no se eliminarán.` : `¿Quieres eliminar “${shortcutToDelete.label}”? Esta acción no afecta al sitio web.`}
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
