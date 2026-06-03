import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth.store';

export default function AcceptInvitationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const setAuth = useAuthStore(s => s.setAuth);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: authApi.acceptInvitation,
    onSuccess: data => {
      setAuth(data);
      navigate('/');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Error al activar la cuenta');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate({ token, name, password });
  };

  if (!token) {
    return <div>Token de invitación inválido.</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0 }}>SOI</h1>
        <h2 style={{ margin: 0, fontWeight: 400 }}>Activar cuenta</h2>
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <input
          type="text"
          placeholder="Tu nombre completo"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Activando...' : 'Activar cuenta'}
        </button>
      </form>
    </div>
  );
}
