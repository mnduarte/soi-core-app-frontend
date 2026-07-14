import { Icon } from './Icon';
import { useUIStore } from '../../store/ui.store';

// Botón de menú (☰) que abre el drawer del sidebar. Solo se ve en mobile
// (la clase .topbar__menu es display:none y pasa a inline-flex ≤1024px).
// Va dentro del header de cada página, alineado con el ícono + título.
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
