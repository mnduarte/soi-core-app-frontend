import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import router from './router';
import { useAuthStore } from './store/auth.store';
import { applyBrandColor } from './lib/brand';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Recolors the whole app to the logged-in clinic's brandColor (and resets to
// the default when there's no session). Runs on mount and whenever the color
// changes — covers login, impersonation and persisted-session rehydration.
function BrandColorSync() {
  const brandColor = useAuthStore(s => s.clinic?.brandColor);
  useEffect(() => {
    applyBrandColor(brandColor);
  }, [brandColor]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandColorSync />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
