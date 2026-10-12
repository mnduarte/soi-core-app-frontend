import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../common/Icon';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../common/Avatar';
import { clinicsApi } from '../../api/clinics';
import { CustomTreatmentsModal } from '../common/CustomTreatmentsModal';
import { CustomSlotsModal } from '../common/CustomSlotsModal';
import { CustomCategoriesModal } from '../common/CustomCategoriesModal';
import { ConsentTemplatesModal } from '../common/ConsentTemplatesModal';
import { MiPerfilModal } from '../common/MiPerfilModal';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth';
import { withTitle } from '../../lib/format';
import { linkSoporte } from '../../lib/soporte';

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

type Editor = 'perfil' | 'trabajos' | 'horarios' | 'categorias' | 'plantillas' | null;

export function CuentaSheet({ onClose }: { onClose: () => void }) {
  const { user, clinic, clearAuth } = useAuthStore();
  const [editor, setEditor] = useState<Editor>(null);
  // Los cuatro editores de configuración del consultorio viven acá. Tres ya
  // existían sueltos (se abrían desde donde se usan); esto les da una casa
  // sin reescribirlos. El cuarto, las plantillas, no tenía ninguna.
  const { data: settings } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: clinicsApi.getSettings,
  });
  const esDueno = user?.role === 'OWNER';
  // Plantillas primero: es lo único de esta lista que puede frenar la
  // atención de un paciente, y además lo más nuevo. Los otros tres se
  // configuran una vez y no se vuelven a tocar.
  const filas = [
    { k: 'plantillas' as const, ic: 'clipboard' as const, t: 'Plantillas de consentimiento', s: esDueno ? 'El texto legal que firma el paciente' : 'Solo el dueño puede editarlas', v: settings?.consentTemplates?.length },
    { k: 'trabajos' as const, ic: 'list' as const, t: 'Trabajos frecuentes', s: 'Los chips de la agenda y la ficha', v: settings?.quickTreatments?.length },
    { k: 'horarios' as const, ic: 'clock' as const, t: 'Horarios de atención', s: 'Los turnos que ofrece la libreta', v: settings?.slotTimes?.length },
    { k: 'categorias' as const, ic: 'image' as const, t: 'Categorías de fotos', s: 'Cómo se clasifican las imágenes', v: settings?.photoCategories?.length },
  ];
  const navigate = useNavigate();
  const { pathname } = useLocation();

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

        {/* Mi cuenta. Por ahora una sola fila, pero es la que importa para
            los consentimientos: el nombre y la matrícula de acá son los que
            quedan congelados en un documento que firma un paciente. */}
        <div className="cu-sec">
          <div className="cu-sec__tit">Mi cuenta</div>
          <button type="button" className="cu-fila" onClick={() => setEditor('perfil')}>
            <span className="cu-fila__ic cu-fila__ic--mio"><Icon name="user" size={16} /></span>
            <span className="cu-fila__txt">
              <b>Mi perfil</b>
              <small>Nombre, matrícula y especialidad</small>
            </span>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>

        {/* Configuración del consultorio. Las filas abren los modales que ya
            existen: no se reescribió ninguno, solo se les dio un lugar desde
            donde llegar sin tener que pasar por la pantalla que los usa. */}
        <div className="cu-sec">
          <div className="cu-sec__tit">Consultorio</div>
          {filas.map(f => (
            <button key={f.k} type="button" className="cu-fila" onClick={() => setEditor(f.k)}>
              <span className="cu-fila__ic"><Icon name={f.ic} size={16} /></span>
              <span className="cu-fila__txt">
                <b>{f.t}</b>
                <small>{f.s}</small>
              </span>
              {f.v ? <span className="cu-fila__v mono">{f.v}</span> : null}
              {f.k === 'plantillas' && !esDueno && <span className="cu-fila__owner">OWNER</span>}
              <Icon name="chevronRight" size={14} />
            </button>
          ))}
        </div>

        {/* Primero consultar, después salir: es lo que más se va a usar de acá,
            y además evita que el único botón de la hoja sea el de irse. */}
        <a
          className="btn btn--secondary"
          href={linkSoporte(user, clinic, pathname)}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
        >
          <Icon name="whatsapp" size={15} /> Contacto
        </a>

        <button className="btn btn--secondary" onClick={() => void salir()}>
          <Icon name="undo" size={15} /> Cerrar sesión
        </button>
        <button className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>

      <CustomTreatmentsModal
        open={editor === 'trabajos'}
        initial={settings?.quickTreatments ?? []}
        onClose={() => setEditor(null)}
      />
      <CustomSlotsModal
        open={editor === 'horarios'}
        initial={settings?.slotTimes ?? []}
        onClose={() => setEditor(null)}
      />
      <CustomCategoriesModal
        open={editor === 'categorias'}
        initial={settings?.photoCategories ?? []}
        onClose={() => setEditor(null)}
      />
      {editor === 'plantillas' && <ConsentTemplatesModal onClose={() => setEditor(null)} />}
      {editor === 'perfil' && <MiPerfilModal onClose={() => setEditor(null)} />}
    </div>,
    document.body,
  );
}
