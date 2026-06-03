import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Icon } from '../common/Icon';
import { ModalHost } from '../modals/ModalHost';
import { ToastHost } from '../common/Toast';
import { useUIStore } from '../../store/ui.store';

function getCrumbs(pathname: string): string[] {
  if (pathname === '/') return ['Dashboard'];
  if (pathname.startsWith('/agenda')) return ['Agenda'];
  if (pathname.startsWith('/patients/')) return ['Pacientes', 'Ficha'];
  if (pathname.startsWith('/patients')) return ['Pacientes'];
  if (pathname.startsWith('/gallery')) return ['Galería'];
  if (pathname.startsWith('/payments')) return ['Pagos'];
  return ['Dashboard'];
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const openModal = useUIStore(s => s.openModal);
  const crumbs = getCrumbs(pathname);

  const topbarRight = (
    <>
      <button className="btn btn--ghost btn--icon" title="Notificaciones">
        <Icon name="bell" />
      </button>
      <button className="btn btn--primary" onClick={() => openModal('newAppointment')}>
        <Icon name="plus" /> <span>Nuevo turno</span>
      </button>
    </>
  );

  return (
    <>
      <div className="app">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main">
          <Topbar crumbs={crumbs} right={topbarRight} onMenuClick={() => setSidebarOpen(true)} />
          <Outlet />
        </div>
      </div>
      <ModalHost />
      <ToastHost />
    </>
  );
}
