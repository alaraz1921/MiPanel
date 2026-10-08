import { useEffect, useRef, type ReactNode } from 'react';

export function ShortcutFolderDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="shortcut-folder-dialog" aria-labelledby="shortcut-folder-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="section-heading"><h2 id="shortcut-folder-title">{title}</h2>
      <button type="button" className="ghost-button" onClick={onClose}>Cerrar</button></div>
    {children}
  </dialog>;
}
