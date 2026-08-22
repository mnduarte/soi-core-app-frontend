import { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Icon } from '../common/Icon';
import { ModalHost } from '../modals/ModalHost';
import { ToastHost } from '../common/Toast';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import { useSessionGuard } from '../../hooks/useSessionGuard';
import { useClinicChanges } from '../../hooks/useClinicChanges';
import { SubscriptionBanner } from './SubscriptionBanner';
import { BottomNav, MobileFab } from './BottomNav';

export default function AppLayout() {
  // Sidebar angosto (solo íconos). Tres estados, no dos: `null` = como venía
  // por defecto (angosto en tablet, ancho en escritorio), y true/false = lo que
  // el usuario eligió a mano. Sin el `null` no se podría distinguir "nunca lo
  // tocó" de "lo quiere ancho", y en tablet el default pisaba su decisión.
  const [collapsed, setCollapsed] = useState<boolean | null>(() => {
    const v = localStorage.getItem('sidebarCollapsed');
    return v === '1' ? true : v === '0' ? false : null;
  });
  // Hasta 1199px el sidebar arranca angosto: en tablet 232px de menú para tres
  // ítems se comen la pantalla donde está el trabajo.
  const railPorDefecto = useIsMobile(1199);
  const rail = collapsed ?? railPorDefecto;
  const toggleCollapsed = () => {
    localStorage.setItem('sidebarCollapsed', rail ? '0' : '1');
    setCollapsed(!rail);
  };
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen);
  const isImpersonating = useAuthStore(s => s.isImpersonating);
  const user = useAuthStore(s => s.user);
  const clinic = useAuthStore(s => s.clinic);
  const clearAuth = useAuthStore(s => s.clearAuth);
  useIdleLogout();
  useSessionGuard();
  // Heartbeat de sync cross-device: refresca agenda/pacientes/ficha cuando algo
  // cambia en otro dispositivo, sin pollear cada lista por separado.
  useClinicChanges();

  const handleExitImpersonation = () => {
    clearAuth();
    // Try to close the tab — works only if the tab was opened by JS (which it
    // was, from the backoffice). Fall back to redirecting to login otherwise.
    window.close();
    window.location.href = '/login';
  };

  return (
    <>
      <div className="app-shell">
      {isImpersonating && (
        // Slate-900 bar sitting above the whole shell so it's impossible to
        // miss. The contrast is intentional — the operator should never forget
        // they're working inside someone else's account.
        <div
          style={{
            background: '#0F172A',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 1000,
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="user" size={14} />
          </span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            Estás viendo SOI como <b>{user?.name ?? 'OWNER'}</b>
            {clinic?.name ? ` · ${clinic.name}` : ''}
            <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 8, fontSize: 12 }}>
              Sesión de soporte — los cambios afectan datos reales
            </span>
          </div>
          <button
            className="btn btn--sm"
            onClick={handleExitImpersonation}
            style={{
              background: 'white',
              color: '#0F172A',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Salir de la sesión
          </button>
        </div>
      )}
      <SubscriptionBanner />
      <div className={`app ${rail ? 'app--rail' : 'app--wide'}`}>
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={rail} onToggleCollapsed={toggleCollapsed} />
        <div className="main">
          {/* En desktop/tablet la navegación vive en el sidebar; en celular
              (<768px) se reemplaza por la bottom nav + FAB de abajo. */}
          <Outlet />
          <BottomNav />
        </div>
      </div>
      </div>
      <MobileFab />
      <ModalHost />
      <ToastHost />
    </>
  );
}
