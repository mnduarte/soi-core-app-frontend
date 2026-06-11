import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi, type LookupResponse } from '../api/auth';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Icon } from '../components/common/Icon';
import { BrandLogo } from '../components/common/BrandLogo';

// Decodes a JWT payload without verifying its signature. We only need the
// embedded `imp` flag + ids to bootstrap the impersonation UI; the backend
// already verified the token when our request lands.
function decodeJwt<T>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as T;
  } catch {
    return null;
  }
}

interface ImpJwt {
  sub: string;
  email: string;
  clinicId: string;
  role: string;
  isClinical: boolean;
  imp?: boolean;
}

type Step = 'identifier' | 'password' | 'setup';

// Pull a usable first name out of the full name. Matches what dentists
// would call themselves in conversation — "Matías" rather than "Matías Duarte".
function firstNameOf(full?: string): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] ?? '';
}

function pickErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  const inner = raw && typeof raw === 'object' ? (raw as { message?: unknown }).message : raw;
  if (Array.isArray(inner)) return inner.join(', ');
  if (typeof inner === 'string') return inner;
  return fallback;
}

function pickErrorCode(err: unknown): string | undefined {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (raw && typeof raw === 'object') {
    const code = (raw as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

// error = red (wrong credentials / validation). notice = amber (account
// status: suspended, expired, session ended) so they're clearly different.
function Banner({ kind, text }: { kind: 'error' | 'notice'; text: string }) {
  const isErr = kind === 'error';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        background: isErr ? 'var(--danger-bg)' : '#FEF3C7',
        color: isErr ? 'var(--danger)' : '#92400E',
        border: isErr ? 'none' : '1px solid #FCD34D',
        padding: '10px 12px',
        borderRadius: 8,
        fontSize: 12.5,
        marginBottom: 12,
        lineHeight: 1.45,
      }}
    >
      <Icon name="alert" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const setImpersonation = useAuthStore(s => s.setImpersonation);

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  // Account-status messages (suspended, expired, evicted, idle). Rendered in a
  // distinct amber style so they don't read like a wrong-password error.
  const [notice, setNotice] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // ?imp=TOKEN handler: invoked when the operator clicks "Impersonate" in the
  // backoffice. We decode the JWT to confirm it's actually an impersonation
  // token, then bootstrap the auth store and route to the dashboard. The token
  // itself drives every subsequent request via the axios interceptor.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const impToken = params.get('imp');
    if (!impToken) return;
    const payload = decodeJwt<ImpJwt>(impToken);
    if (!payload?.imp) return;
    (async () => {
      try {
        useAuthStore.setState({ accessToken: impToken });
        const [clinicRes, userRes] = await Promise.all([
          apiClient.get<{ data: { _id: string; name: string; brandColor: string; status: string } }>('/clinics/me'),
          apiClient.get<{ data: { _id: string; email: string; name: string; role: string; isClinical: boolean } }>('/users/me'),
        ]);
        const clinic = clinicRes.data.data;
        const user = userRes.data.data;
        setImpersonation({
          accessToken: impToken,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            isClinical: user.isClinical,
          },
          clinic: {
            id: clinic._id,
            name: clinic.name,
            isReadonly: false,
          },
        });
        window.history.replaceState({}, '', '/');
        navigate('/', { replace: true });
      } catch {
        useAuthStore.setState({ accessToken: null });
        setError('No se pudo iniciar la sesión de impersonación.');
      }
    })();
  }, [navigate, setImpersonation]);

  const lookupMutation = useMutation({
    mutationFn: authApi.lookup,
    onSuccess: (data, requestedIdentifier) => {
      if (!data.exists) {
        setError('No encontramos ese usuario. Revisá lo que ingresaste.');
        setStep('identifier');
        return;
      }
      setIdentifier(requestedIdentifier);
      setLookup(data);
      setStep(data.mustChangePassword ? 'setup' : 'password');
    },
    onError: err => setError(pickErrorMessage(err, 'No pudimos validar el usuario.')),
  });

  // Auto-run the lookup when the page loads with ?u=username. Lets us drop
  // the user straight onto the welcome screen instead of making them retype
  // what we already have.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('idle') === '1') {
      setNotice('Tu sesión se cerró por inactividad. Ingresá de nuevo.');
    } else if (params.get('reason') === 'session-replaced') {
      setNotice('Tu sesión se cerró porque entraste desde otro dispositivo.');
    } else if (params.get('reason') === 'suspended') {
      setNotice('Esta cuenta está suspendida. Escribinos para reactivarla.');
    } else if (params.get('reason') === 'expired') {
      setNotice('La suscripción venció. Escribinos para reactivar tu cuenta.');
    }
    const u = params.get('u');
    if (!u) return;
    if (params.get('imp')) return;
    setIdentifier(u);
    lookupMutation.mutate(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: data => {
      setAuth(data);
      navigate('/');
    },
    onError: err => {
      if (pickErrorCode(err) === 'MUST_CHANGE_PASSWORD') {
        setStep('setup');
        setNotice('Es tu primera vez: creá una contraseña nueva para entrar.');
        return;
      }
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = pickErrorMessage(err, 'Error al iniciar sesión');
      // 403 = cuenta bloqueada (suspendida / vencida) → aviso ámbar, no un error
      // rojo de credenciales. 401 = contraseña incorrecta → error rojo.
      if (status === 403) setNotice(msg);
      else setError(msg);
    },
  });

  const setupMutation = useMutation({
    mutationFn: authApi.setupPassword,
    onSuccess: data => {
      setAuth(data);
      navigate('/');
    },
    onError: err => setError(pickErrorMessage(err, 'No pudimos crear la contraseña.')),
  });

  const forgotMutation = useMutation({
    mutationFn: authApi.requestPasswordReset,
    onSuccess: () => setForgotSent(true),
  });

  const openForgot = () => {
    setForgotIdentifier(identifier);
    setForgotNote('');
    setForgotSent(false);
    forgotMutation.reset();
    setForgotOpen(true);
  };

  const submitForgot = (e: FormEvent) => {
    e.preventDefault();
    const id = forgotIdentifier.trim();
    if (!id) return;
    forgotMutation.mutate({ identifier: id, note: forgotNote.trim() || undefined });
  };

  const handleIdentifierSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Ingresá tu usuario.');
      return;
    }
    lookupMutation.mutate(trimmed);
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    loginMutation.mutate({ identifier, password });
  };

  const handleSetupSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('La nueva contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setupMutation.mutate({
      identifier,
      currentPassword: tempPassword,
      newPassword,
    });
  };

  const goBackToIdentifier = () => {
    setStep('identifier');
    setError('');
    setPassword('');
    setTempPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLookup(null);
  };

  const displayFirst = firstNameOf(lookup?.displayName);

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
            Todo tu consultorio,<br />en un solo lugar.
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
            Pacientes, agenda, ficha odontológica, fotos y pagos — ordenado,
            rápido y a mano desde cualquier dispositivo.
          </p>

          <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
            {[
              { v: 'Agenda', l: 'turnos y recordatorios' },
              { v: 'Fichas', l: 'odontograma y fotos' },
              { v: 'Pagos', l: 'cuenta corriente' },
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
        {step === 'identifier' && (
          <form onSubmit={handleIdentifierSubmit} className="login-card login-step">
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
              Empezá por tu usuario.
            </div>

            {notice && <Banner kind="notice" text={notice} />}
            {error && <Banner kind="error" text={error} />}

            <label className="field-label">Usuario</label>
            <input
              className="input"
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              style={{ marginBottom: 20 }}
            />

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              style={{ width: '100%' }}
              disabled={lookupMutation.isPending}
            >
              {lookupMutation.isPending ? 'Verificando…' : 'Continuar'}
              {!lookupMutation.isPending && <Icon name="arrowRight" size={14} />}
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
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="login-card login-step">
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
              Bienvenido{displayFirst ? `, ${displayFirst}` : ''}
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
              Hola {displayFirst || 'de nuevo'} 👋
            </h2>
            <div className="page-sub" style={{ marginBottom: 28 }}>
              {lookup?.clinic?.name
                ? `Ingresá tu contraseña para entrar a ${lookup.clinic.name}.`
                : 'Ingresá tu contraseña para continuar.'}
            </div>

            {notice && <Banner kind="notice" text={notice} />}
            {error && <Banner kind="error" text={error} />}

            <div className="row row--between" style={{ marginBottom: 6 }}>
              <label className="field-label" style={{ marginBottom: 0 }}>
                Usuario
              </label>
              <button
                type="button"
                onClick={goBackToIdentifier}
                style={{
                  fontSize: 11.5,
                  color: 'var(--brand-primary-600)',
                  fontWeight: 500,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Cambiar
              </button>
            </div>
            <input
              className="input"
              type="text"
              value={identifier}
              readOnly
              style={{ marginBottom: 12, opacity: 0.7 }}
            />

            <div className="row row--between" style={{ marginBottom: 6 }}>
              <label className="field-label" style={{ marginBottom: 0 }}>
                Contraseña
              </label>
              <button
                type="button"
                onClick={openForgot}
                style={{
                  fontSize: 11.5,
                  color: 'var(--brand-primary-600)',
                  fontWeight: 500,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ¿Olvidaste?
              </button>
            </div>
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                style={{ width: '100%', paddingRight: 42 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showPassword ? 'Ocultar' : 'Mostrar'}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: 6,
                  display: 'flex',
                }}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              style={{ width: '100%' }}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Ingresando…' : 'Ingresar al consultorio'}
              {!loginMutation.isPending && <Icon name="arrowRight" size={14} />}
            </button>
          </form>
        )}

        {forgotOpen && (
          <div
            onClick={() => setForgotOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 16,
            }}
          >
            <form
              onClick={e => e.stopPropagation()}
              onSubmit={submitForgot}
              className="login-card"
              style={{
                maxWidth: 420,
                width: '100%',
                position: 'relative',
                background: 'var(--bg-surface, white)',
                borderRadius: 12,
                padding: 28,
                boxShadow: 'var(--shadow-xl, 0 20px 60px rgba(0,0,0,0.25))',
              }}
            >
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                aria-label="Cerrar"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>

              {forgotSent ? (
                <>
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      margin: '0 0 8px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Pedido enviado ✅
                  </h2>
                  <div className="page-sub" style={{ marginBottom: 20 }}>
                    Avisamos al administrador. Te va a enviar una contraseña nueva por WhatsApp.
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    style={{ width: '100%' }}
                    onClick={() => setForgotOpen(false)}
                  >
                    Entendido
                  </button>
                </>
              ) : (
                <>
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      margin: '0 0 8px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Recuperar contraseña
                  </h2>
                  <div className="page-sub" style={{ marginBottom: 20 }}>
                    Avisamos al administrador y te envía una contraseña nueva por WhatsApp.
                  </div>

                  <label className="field-label">Tu usuario</label>
                  <input
                    className="input"
                    type="text"
                    value={forgotIdentifier}
                    onChange={e => setForgotIdentifier(e.target.value)}
                    required
                    autoFocus
                    style={{ marginBottom: 12 }}
                  />

                  <label className="field-label">
                    Contanos qué pasó <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(opcional)</span>
                  </label>
                  <textarea
                    className="input"
                    value={forgotNote}
                    onChange={e => setForgotNote(e.target.value)}
                    rows={3}
                    maxLength={280}
                    placeholder="Ej: no recuerdo la contraseña que puse"
                    style={{ marginBottom: 20, resize: 'vertical', fontFamily: 'inherit' }}
                  />

                  <button
                    type="submit"
                    className="btn btn--primary btn--lg"
                    style={{ width: '100%' }}
                    disabled={forgotMutation.isPending || !forgotIdentifier.trim()}
                  >
                    {forgotMutation.isPending ? 'Enviando…' : 'Enviar pedido'}
                  </button>
                </>
              )}
            </form>
          </div>
        )}

        {step === 'setup' && (
          <form onSubmit={handleSetupSubmit} className="login-card login-step">
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
              Bienvenido{displayFirst ? `, ${displayFirst}` : ''}
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
              ¡Hola {displayFirst || ''}! 👋
            </h2>
            <div className="page-sub" style={{ marginBottom: 28 }}>
              {lookup?.clinic?.name
                ? `Vamos a configurar tu contraseña para ${lookup.clinic.name}.`
                : 'Vamos a configurar tu contraseña para que solo vos puedas entrar.'}
            </div>

            {notice && <Banner kind="notice" text={notice} />}
            {error && <Banner kind="error" text={error} />}

            <label className="field-label">Contraseña temporal</label>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--text-tertiary)',
                marginTop: -4,
                marginBottom: 6,
              }}
            >
              La que te enviamos por WhatsApp.
            </div>
            <input
              className="input"
              type="password"
              value={tempPassword}
              onChange={e => setTempPassword(e.target.value)}
              required
              autoFocus
              autoComplete="one-time-code"
              style={{ marginBottom: 12 }}
            />

            <label className="field-label">Nueva contraseña</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{ marginBottom: 12 }}
            />

            <label className="field-label">Repetir nueva contraseña</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{ marginBottom: 20 }}
            />

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              style={{ width: '100%' }}
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? 'Creando…' : 'Crear contraseña y entrar'}
              {!setupMutation.isPending && <Icon name="arrowRight" size={14} />}
            </button>

            <div
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              <button
                type="button"
                onClick={goBackToIdentifier}
                style={{
                  color: 'var(--brand-primary-600)',
                  fontWeight: 500,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                }}
              >
                Usar otro usuario
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
