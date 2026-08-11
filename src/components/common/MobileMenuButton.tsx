import { Icon } from './Icon';
import { useUIStore } from '../../store/ui.store';

// Botón de menú (☰) del layout anterior. Con el rediseño "Libreta" ya NO se
// muestra en ningún breakpoint: desktop y tablet tienen el sidebar siempre
// visible (completo o como rail de íconos) y en celular la navegación es la
// bottom nav. La clase .topbar__menu quedó en display:none, así que esto
// renderiza nada; se conserva para no tocar los headers de las pantallas
// secundarias, que están fuera del alcance del rediseño.
export function MobileMenuButton() {
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen);
  return (
    <button
      className="topbar__menu"
      onClick={() => setSidebarOpen(true)}
      title="Menú"
      style={{ flexShrink: 0 }}
    >
      <Icon name="menu" size={18} />
    </button>
  );
}
