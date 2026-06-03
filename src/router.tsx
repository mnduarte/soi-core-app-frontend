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
      { path: 'patients/:id', lazy: () => import('./pages/PatientProfilePage').then(m => ({ Component: m.default })) },
      { path: 'gallery', lazy: () => import('./pages/GalleryPage').then(m => ({ Component: m.default })) },
      { path: 'payments', lazy: () => import('./pages/PaymentsPage').then(m => ({ Component: m.default })) },
    ],
  },
]);

export default router;
