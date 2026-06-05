import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { Icon } from '../components/common/Icon';
import { BrandLogo } from '../components/common/BrandLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: data => {
      setAuth(data);
      navigate('/');
    },
    onError: (err: unknown) => {
      const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      // El backend envuelve el error: message puede ser string, un objeto { message } o un array (validación).
      const inner = raw && typeof raw === 'object' ? (raw as { message?: unknown }).message : raw;
      const msg = Array.isArray(inner) ? inner.join(', ') : typeof inner === 'string' ? inner : undefined;
      setError(msg ?? 'Error al iniciar sesión');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="login-wrap">
      {/* Left visual side */}
      <div className="login-side">
        <div className="row" style={{ gap: 12 }}>
          <BrandLogo size={36} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>SOI</div>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            Gestión odontológica
          </div>
          <h1
            style={{
              fontSize: 42,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              margin: 0,
              maxWidth: 420,
              color: 'white',
            }}
          >
            Tu consultorio,<br />sin papeles ni Excel.
          </h1>
          <p
            style={{
              fontSize: 15,
              opacity: 0.75,
              marginTop: 16,
              maxWidth: 380,
              lineHeight: 1.55,
            }}
          >
            Pacientes, agenda, ficha, fotos y pagos. Pensado para usar todo el
            día — y sentirse rápido en cualquier dispositivo.
          </p>

          <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
            {[
              { v: '8–16', l: 'pacientes/día' },
              { v: '600', l: 'fichas activas' },
              { v: '10s', l: 'ficha lista' },
            ].map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11.5, opacity: 0.5 }}>© 2026 SOI · Hecho en Argentina</div>

        <svg
          style={{ position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none' }}
          width="100%"
          height="100%"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Right form */}
      <div className="login-form-side">
        <form onSubmit={handleSubmit} className="login-card">
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Bienvenido
          </div>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--text-primary)',
            }}
          >
            Ingresá a tu consultorio
          </h2>
          <div className="page-sub" style={{ marginBottom: 28 }}>
            Usá tu mail y contraseña.
          </div>

          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12.5,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <label className="field-label">Email</label>
          <input
            className="input"
            type="text"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            style={{ marginBottom: 12 }}
          />

          <div className="row row--between" style={{ marginBottom: 6 }}>
            <label className="field-label" style={{ marginBottom: 0 }}>Contraseña</label>
            <a href="#" style={{ fontSize: 11.5, color: 'var(--brand-primary-600)', fontWeight: 500 }}>
              ¿Olvidaste?
            </a>
          </div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ marginBottom: 20 }}
          />

          <button
            type="submit"
            className="btn btn--primary btn--lg"
            style={{ width: '100%' }}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Ingresando…' : 'Ingresar al consultorio'}
            {!loginMutation.isPending && <Icon name="arrowRight" size={14} />}
          </button>

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              marginTop: 20,
            }}
          >
            ¿Sos nuevo?{' '}
            <a href="#" style={{ color: 'var(--brand-primary-600)', fontWeight: 500 }}>
              Empezá tu prueba gratis
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
