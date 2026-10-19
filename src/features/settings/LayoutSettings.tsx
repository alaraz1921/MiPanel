import { useLocalStorage } from '../../hooks/useLocalStorage';
import { DEFAULT_LAYOUT, MAX_LAYOUT_GAP, normalizeLayout, validLayoutGap, type PanelLayout } from './layout';

export function LayoutSettings() {
  const [stored, setLayout] = useLocalStorage('mipanel.layout', DEFAULT_LAYOUT);
  const layout = normalizeLayout(stored);
  function change(key: keyof PanelLayout, value: string) {
    const gap = value === '' ? null : Number(value);
    if (validLayoutGap(gap)) setLayout((current) => ({ ...normalizeLayout(current), [key]: gap }));
  }
  return <section className="panel settings-section" id="distribucion" aria-labelledby="layout-settings-title">
    <h2 id="layout-settings-title">Distribución</h2>
    <div className="layout-settings-fields">
      <label>Distancia entre accesos directos y buscador (px)
        <input type="number" min={0} max={MAX_LAYOUT_GAP} step={1} placeholder="Automático" value={layout.searchGap ?? ''}
          aria-describedby="layout-settings-help" onChange={(event) => change('searchGap', event.target.value)} />
      </label>
      <label>Distancia entre buscador y paneles de tareas/calendario (px)
        <input type="number" min={0} max={MAX_LAYOUT_GAP} step={1} placeholder="Automático" value={layout.panelsGap ?? ''}
          aria-describedby="layout-settings-help" onChange={(event) => change('panelsGap', event.target.value)} />
      </label>
    </div>
    <p id="layout-settings-help" className="settings-help">De 0 a {MAX_LAYOUT_GAP} píxeles. Vacío (Automático) conserva la distribución actual adaptable a la pantalla. Los cambios se guardan al modificar cada valor.</p>
    <button type="button" className="ghost-button" onClick={() => setLayout(DEFAULT_LAYOUT)}>Restablecer distancias automáticas</button>
  </section>;
}
