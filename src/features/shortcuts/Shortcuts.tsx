import { FormEvent, useState, type DragEvent } from 'react';
import { defaultShortcuts } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import type { Shortcut } from '../../types';

function faviconUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
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

export function Shortcuts() {
  const [shortcuts, setShortcuts] = useExtensionStorage<Shortcut[]>('mipanel.shortcuts', defaultShortcuts);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [draggedId, setDraggedId] = useState<string>();

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
          >
            <a href={shortcut.url} className="shortcut-link" title={shortcut.url}>
              <span className="shortcut-icon" aria-hidden="true"><ShortcutIcon shortcut={shortcut} /></span>
              <span>{shortcut.label}</span>
            </a>
            <div className="shortcut-order-actions">
              <button type="button" aria-label={`Mover ${shortcut.label} a la izquierda`} title="Mover a la izquierda" onClick={() => moveShortcut(shortcut.id, -1)}>←</button>
              <button type="button" aria-label={`Mover ${shortcut.label} a la derecha`} title="Mover a la derecha" onClick={() => moveShortcut(shortcut.id, 1)}>→</button>
            </div>
            <button
              type="button"
              className="remove-shortcut"
              aria-label={`Eliminar ${shortcut.label}`}
              title={`Eliminar ${shortcut.label}`}
              onClick={() => removeShortcut(shortcut.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
