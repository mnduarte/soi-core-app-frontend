import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth';
import { withTitle } from '../../lib/format';

/**
 * Quién sos y cómo salir, en el celular.
 *
 * En el teléfono el menú lateral está oculto —la navegación es la barra de
 * abajo—, y con él quedaban escondidos el nombre del consultorio, el tipo de
 * usuario y el botón de salir. O sea: no había forma de cerrar sesión desde un
 * celular. Esto es lo que faltaba, no una pantalla nueva.
 *
 * Va por portal al `body`: cualquier ancestro con `transform` —y la app anima
 * varias cosas— rompe `position: fixed` y lo dejaría anclado a media pantalla.
 */
function rolLabel(role?: string, isClinical?: boolean) {
  if (role === 'OWNER') return 'Titular';
  return isClinical ? 'Profesional' : 'Asistente';
}

export function CuentaSheet({ onClose }: { onClose: () => void }) {
  const { user, clinic, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const salir = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    // Si el servidor no contesta se sale igual: quedarse adentro porque falló
    // la red es lo contrario de lo que se pidió.
    if (refreshToken) await authApi.logout(refreshToken).catch(() => null);
    clearAuth();
    navigate('/login');
  };

  return createPortal(
    <div className="cuenta-fondo" onClick={onClose}>
      <div
        className="cuenta-hoja"
        role="dialog"
        aria-label="Tu cuenta"
        onClick={e => e.stopPropagation()}
      >
        <div className="cuenta-hoja__quien">
          <Avatar name={user?.name ?? ''} id={user?.id ?? ''} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div className="cuenta-hoja__nombre">{withTitle(user?.name, user?.title)}</div>
            <div className="cuenta-hoja__rol">
              {rolLabel(user?.role, user?.isClinical)}
              {clinic?.name ? ` · ${clinic.name}` : ''}
            </div>
          </div>
        </div>

        <button className="btn btn--secondary" onClick={() => void salir()}>
          <Icon name="undo" size={15} /> Cerrar sesión
        </button>
        <button className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}
