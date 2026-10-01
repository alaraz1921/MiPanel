import { FormEvent, useState } from 'react';
import { defaultShortcuts } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import type { Shortcut } from '../../types';

export function Shortcuts() {
  const [shortcuts, setShortcuts] = useExtensionStorage<Shortcut[]>('mipanel.shortcuts', defaultShortcuts);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

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
          <div className="shortcut-item" key={shortcut.id}>
            <a href={shortcut.url} className="shortcut-link" title={shortcut.url}>
              <span className="shortcut-icon" aria-hidden="true">{shortcut.icon ?? '🔗'}</span>
              <span>{shortcut.label}</span>
            </a>
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
