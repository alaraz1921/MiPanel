import { useLocalStorage } from '../../hooks/useLocalStorage';
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance';

export function AppearanceSettings() {
  const [stored, setAppearance] = useLocalStorage('mipanel.appearance', DEFAULT_APPEARANCE);
  const appearance = normalizeAppearance(stored);
  return <section className="panel settings-section" id="apariencia" aria-labelledby="appearance-settings-title">
    <h2 id="appearance-settings-title">Apariencia</h2>
    <label className="completed-filter"><input type="checkbox" checked={appearance.hideSearch}
      onChange={(event) => setAppearance((current) => ({ ...normalizeAppearance(current), hideSearch: event.target.checked }))} />Ocultar el buscador</label>
    <p className="settings-help">Al ocultarlo se conserva su espacio y las distancias configuradas, sin mover los paneles.</p>
    <label className="shortcut-opacity-setting">Opacidad del fondo de las tarjetas de accesos directos
      <input type="range" min={0} max={100} step={1} value={appearance.shortcutOpacity ?? 27}
        aria-describedby="shortcut-opacity-help" aria-valuetext={appearance.shortcutOpacity === null ? 'Predeterminada' : `${appearance.shortcutOpacity} %`}
        onChange={(event) => setAppearance((current) => ({ ...normalizeAppearance(current), shortcutOpacity: Number(event.target.value) }))} />
      <span>{appearance.shortcutOpacity === null ? 'Predeterminada' : `${appearance.shortcutOpacity} %`}</span>
    </label>
    <p className="settings-help" id="shortcut-opacity-help">De 0 % (transparente) a 100 % (opaco). Afecta al fondo de las tarjetas del panel y de las carpetas, no a sus iconos ni nombres.</p>
    <button type="button" className="ghost-button" onClick={() => setAppearance((current) => ({ ...normalizeAppearance(current), shortcutOpacity: null }))}>Restablecer opacidad predeterminada</button>
  </section>;
}
