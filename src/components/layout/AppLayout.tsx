import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Icon } from '../common/Icon';
import { ModalHost } from '../modals/ModalHost';
import { ToastHost } from '../common/Toast';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import { useSessionGuard } from '../../hooks/useSessionGuard';
import { SubscriptionBanner } from './SubscriptionBanner';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openModal = useUIStore(s => s.openModal);
  const isImpersonating = useAuthStore(s => s.isImpersonating);
  const user = useAuthStore(s => s.user);
  const clinic = useAuthStore(s => s.clinic);
  const clearAuth = useAuthStore(s => s.clearAuth);
  useIdleLogout();
  useSessionGuard();

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
      <div className="app">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main">
          {/* Barra mínima solo-mobile: acceso al menú (sidebar drawer) + acción
              rápida. En desktop el sidebar está siempre visible y cada página ya
              tiene su propio encabezado, así que no hace falta ninguna tira. */}
          <div className="mobile-topbar">
            <button className="topbar__menu" onClick={() => setSidebarOpen(true)} title="Menú">
              <Icon name="menu" size={18} />
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn--primary btn--sm" onClick={() => openModal('newAppointment')}>
              <Icon name="plus" size={13} /> <span>Nuevo turno</span>
            </button>
          </div>
          <Outlet />
        </div>
      </div>
      </div>
      <ModalHost />
      <ToastHost />
    </>
  );
}
