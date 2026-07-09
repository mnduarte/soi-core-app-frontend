import { createBrowserRouter, redirect } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';

function requireAuth() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return redirect('/login');
  return null;
}

const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/LoginPage').then(m => ({ Component: m.default })),
  },
  {
    path: '/accept-invitation',
    lazy: () => import('./pages/AcceptInvitationPage').then(m => ({ Component: m.default })),
  },
  {
    path: '/',
    loader: requireAuth,
    lazy: () => import('./components/layout/AppLayout').then(m => ({ Component: m.default })),
    children: [
      { index: true, lazy: () => import('./pages/DashboardPage').then(m => ({ Component: m.default })) },
      { path: 'agenda', lazy: () => import('./pages/AgendaPage').then(m => ({ Component: m.default })) },
      { path: 'patients', lazy: () => import('./pages/PatientsPage').then(m => ({ Component: m.default })) },
      // La ficha completa (perfil con odontograma) queda oculta por ahora:
      // clickear un paciente abre su Ficha rápida (cuenta corriente).
      { path: 'patients/:id', lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-rapida', lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-rapida/:id', lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      // Acceso a la ficha clásica (perfil completo) mientras migramos sus datos
      // a la Ficha rápida. "Pacientes viejos" lista y abre estas fichas.
      { path: 'pacientes-viejos', lazy: () => import('./pages/PatientsPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-clasica/:id', lazy: () => import('./pages/PatientProfilePage').then(m => ({ Component: m.default })) },
      { path: 'gallery', lazy: () => import('./pages/GalleryPage').then(m => ({ Component: m.default })) },
      { path: 'payments', lazy: () => import('./pages/PaymentsPage').then(m => ({ Component: m.default })) },
      { path: 'ayuda', lazy: () => import('./pages/HelpPage').then(m => ({ Component: m.default })) },
    ],
  },
]);

export default router;
