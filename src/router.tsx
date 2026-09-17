import { createBrowserRouter, redirect } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { veClinico } from './lib/permisos';

function requireAuth() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return redirect('/login');
  return null;
}

// Pantallas con información clínica o de plata. El Asistente que llega por un
// link guardado o escribiendo la dirección vuelve a la agenda en vez de ver
// una pantalla rota llena de "sin permiso". Sin usuario todavía no se decide:
// de eso se ocupa requireAuth.
function requireClinico() {
  const { user } = useAuthStore.getState();
  if (user && !veClinico(user)) return redirect('/agenda');
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
      // La Agenda es la página por defecto (Dashboard descartado por ahora,
      // sigue accesible en /dashboard).
      { index: true, loader: () => redirect('/agenda') },
      { path: 'dashboard', loader: requireClinico, lazy: () => import('./pages/DashboardPage').then(m => ({ Component: m.default })) },
      { path: 'agenda', lazy: () => import('./pages/AgendaPage').then(m => ({ Component: m.default })) },
      { path: 'patients', loader: requireClinico, lazy: () => import('./pages/PatientsPage').then(m => ({ Component: m.default })) },
      // La ficha completa (perfil con odontograma) queda oculta por ahora:
      // clickear un paciente abre su Ficha rápida (cuenta corriente).
      { path: 'patients/:id', loader: requireClinico, lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-rapida', loader: requireClinico, lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-rapida/:id', loader: requireClinico, lazy: () => import('./pages/FichaRapidaPage').then(m => ({ Component: m.default })) },
      // Acceso a la ficha clásica (perfil completo) mientras migramos sus datos
      // a la Ficha rápida. "Pacientes viejos" lista y abre estas fichas.
      { path: 'pacientes-viejos', loader: requireClinico, lazy: () => import('./pages/PatientsPage').then(m => ({ Component: m.default })) },
      { path: 'ficha-clasica/:id', loader: requireClinico, lazy: () => import('./pages/PatientProfilePage').then(m => ({ Component: m.default })) },
      { path: 'gallery', loader: requireClinico, lazy: () => import('./pages/GalleryPage').then(m => ({ Component: m.default })) },
      { path: 'payments', loader: requireClinico, lazy: () => import('./pages/PaymentsPage').then(m => ({ Component: m.default })) },
      { path: 'ayuda', lazy: () => import('./pages/HelpPage').then(m => ({ Component: m.default })) },
    ],
  },
]);

export default router;
