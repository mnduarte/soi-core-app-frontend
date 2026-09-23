import { useState } from 'react';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { Desplegable } from '../common/Desplegable';
import { patientAge } from '../../lib/format';
import { toWhatsAppNumber } from '../../lib/phone';
import type { Patient } from '../../api/patients';

/**
 * La tarjeta del paciente: quién es, sus antecedentes y sus datos personales.
 * La cara de adelante de la ficha de papel.
 *
 * Vive en su propio componente por una razón de RENDIMIENTO, no de orden.
 * Abrir "Info" es un cambio de estado, y mientras ese estado estaba en la
 * página entera cada toque volvía a dibujar la ficha completa —la lista de
 * trabajos, los pagos, los filtros— en el mismo commit en que arranca la
 * animación del alto. Esa animación corre en el hilo principal: si React está
 * ocupado, se crea pero no avanza, y en un teléfono eso se ve como un tirón y
 * después el panel ya puesto. Acá adentro, abrirlo solo redibuja la tarjeta.
 * Ver la memoria `medir-en-produccion` y el comentario de `animarHasta`.
 */
export function TarjetaPaciente({
  patient,
  isMobile,
  infoInicial = false,
  onEditar,
  onGaleria,
  onOdontograma,
  onCerrar,
}: {
  patient: Patient;
  isMobile: boolean;
  /** Llega en true desde el nombre del turno en la agenda (`?info=1`). */
  infoInicial?: boolean;
  onEditar: () => void;
  onGaleria: () => void;
  onOdontograma: () => void;
  onCerrar: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(infoInicial);

  const alergias = patient.medicalHistory?.allergies ?? [];
  const otrosAnte = [
    ...(patient.medicalHistory?.conditions ?? []),
    ...(patient.medicalHistory?.medications ?? []),
  ];
  const hayAntecedentes =
    alergias.length > 0 || otrosAnte.length > 0 || Boolean(patient.medicalHistory?.notes?.trim());

  // Solo lo que tiene valor: una lista llena de renglones vacíos es peor que
  // una lista corta, hace dudar de si el dato está o no está.
  const datosPersonales: [string, string][] = (
    [
      ['DNI', patient.dni],
      [
        'Nacimiento',
        patient.birthDate
          ? new Date(patient.birthDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })
          : undefined,
      ],
      ['Domicilio', patient.address],
      ['Localidad', patient.locality],
      ['Celular', patient.phone],
      ['Email', patient.email],
      ['Obra social', patient.obraSocial],
      ['N° de afiliado', patient.nAfiliado],
    ].filter(([, v]) => Boolean(v && String(v).trim())) as [string, string][]
  );

  return (
    <>
              {/* Encabezado del paciente: avatar + nombre + datos + acciones */}
              {/* Celular: tres renglones claros en vez de todo apretado contra
                  los botones — nombre y edad · datos · acciones. La edad sube al
                  título porque es una sola palabra y define al paciente junto
                  con el nombre; la localidad puede ser larga y va abajo. */}
              <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 14, flexWrap: isMobile ? 'wrap' : 'nowrap', padding: isMobile ? '14px 16px' : '16px 20px' }}>
                <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="lg" />
                <div style={{ minWidth: 0, flex: '1 1 0' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0, lineHeight: 1.25 }}>
                    {patient.name} {patient.lastName}
                    {isMobile && patientAge(patient) != null && (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        {'  ·  '}{patientAge(patient)} años
                      </span>
                    )}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, rowGap: 2, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-tertiary)', marginTop: isMobile ? 3 : 2 }}>
                    {!isMobile && patientAge(patient) != null && <span>{patientAge(patient)} años</span>}
                    {patient.obraSocial && <span>{patient.obraSocial}</span>}
                    {patient.locality && <span>{patient.locality}</span>}
                    {patient.phone && (
                      <a
                        href={`https://wa.me/${toWhatsAppNumber(patient.phone)}`}
                        target="_blank" rel="noreferrer" title="Abrir WhatsApp"
                        // En celular arranca renglón propio: es lo único de acá
                        // que se toca, y merece su propio blanco.
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success)', fontWeight: 600, textDecoration: 'none', ...(isMobile ? { flexBasis: '100%' } : {}) }}
                      >
                        <Icon name="whatsapp" size={14} /> {patient.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* Celular: renglón propio y bien espaciados (son destinos
                    distintos, no una botonera). Escritorio: a la derecha del
                    nombre, con texto. */}
                <div className="row" style={isMobile
                  ? { gap: 12, flexBasis: '100%', flexWrap: 'nowrap', marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }
                  : { gap: 8, marginLeft: 'auto', flexWrap: 'nowrap', flexShrink: 0 }}>
                  {/* Antes acá estaba "Editar", que abría el formulario. Para
                      MIRAR un dato —el DNI, el domicilio— había que entrar a la
                      pantalla de escribir, con el riesgo de tocar algo sin
                      querer. Ahora esto muestra los datos y editar es un botón
                      adentro: primero se lee, editar es la excepción. */}
                  <button
                    className={`btn btn--secondary btn--sm fr-infobtn ${isMobile ? 'btn--icon' : ''} ${infoOpen ? 'is-on' : ''}`}
                    title="Info personal del paciente"
                    aria-expanded={infoOpen}
                    onClick={() => setInfoOpen(v => !v)}
                    style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}
                  >
                    <Icon name="user" size={isMobile ? 16 : 14} /> {!isMobile && 'Info'}
                  </button>
                  <button className={`btn btn--secondary btn--sm ${isMobile ? 'btn--icon' : ''}`} title="Galería de fotos" onClick={onGaleria} style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}>
                    <Icon name="image" size={isMobile ? 16 : 14} /> {!isMobile && 'Galería'}
                  </button>
                  <button className={`btn btn--secondary btn--sm ${isMobile ? 'btn--icon' : ''}`} title="Odontograma" onClick={onOdontograma} style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}>
                    <Icon name="tooth" size={isMobile ? 16 : 14} /> {!isMobile && 'Odontograma'}
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Cambiar paciente" onClick={onCerrar} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </div>

              {/* Antecedentes: SIEMPRE a la vista, nunca adentro del
                  desplegable. En la ficha de papel la alergia está arriba de
                  todo, casi gritada, porque es lo que puede cambiar lo que se
                  hace en el sillón. Acá vivía escondida adentro del formulario
                  de edición. Si el paciente no tiene nada cargado, no ocupa
                  ningún lugar. */}
              {hayAntecedentes && (
                <div className="fr-ante">
                  <Icon name="alert" size={15} className="fr-ante__ic" />
                  <div className="fr-ante__txt">
                    {alergias.length > 0 && (
                      <div className="fr-ante__row">
                        <span className="fr-ante__lbl">Alergias</span>
                        {alergias.map(a => (
                          <span key={a} className="fr-ante__chip">{a}</span>
                        ))}
                      </div>
                    )}
                    {otrosAnte.length > 0 && (
                      <div className="fr-ante__row">
                        <span className="fr-ante__lbl">Antecedentes</span>
                        {otrosAnte.map(a => (
                          <span key={a} className="fr-ante__chip">{a}</span>
                        ))}
                      </div>
                    )}
                    {patient.medicalHistory?.notes && (
                      <div className="fr-ante__nota">{patient.medicalHistory.notes}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Info personal: se lee, no se escribe. Cerrado por defecto —la
                  ficha se abre muchas veces por día y casi siempre es para ver
                  qué falta hacer o cuánto debe; estos datos se cargan una vez y
                  casi no se vuelven a mirar. */}
              {/* 220ms y no los 140 de un menú: es un bloque grande, y a esa
                   velocidad el alto terminaba antes de que el ojo lo siguiera.
                   La curva arranca suave y resuelve rápido al final.
                   El contenido entra con su propia opacidad: sin eso lo que se
                   ve crecer es un rectángulo vacío, porque el texto ya estaba
                   entero desde el primer cuadro. Solo opacidad, sin desplazarlo:
                   moverlo sería una segunda animación peleando con el alto. */}
              {/* Más corta en el teléfono. Animar alto recalcula el layout de
                   todo lo que está debajo en CADA cuadro, y ahí abajo hay una
                   ficha entera: en un celular eso no llega a 60 por segundo por
                   más prolijo que esté el código. Con menos tiempo hay menos
                   cuadros caros, y lo que se pierde en suavidad se gana en que
                   no trastabille. */}
              <Desplegable
                abierto={infoOpen}
                clave={patient._id}
                ms={isMobile ? 150 : 220}
                curva="cubic-bezier(0.32, 0, 0.5, 1)"
              >
                {/* El fundido del contenido solo en escritorio: es una capa de
                    pintura más sobre los mismos píxeles que ya está moviendo el
                    alto, y en el teléfono es justo lo que sobra. */}
                <div className={`fr-info ${infoOpen && !isMobile ? 'fr-info--entra' : ''}`}>
                  {datosPersonales.length > 0 ? (
                    <dl className="fr-info__grid">
                      {datosPersonales.map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="fr-info__vacio">
                      Todavía no hay datos cargados de este paciente.
                    </p>
                  )}
                  <button
                    className="btn btn--secondary btn--sm fr-info__editar"
                    onClick={onEditar}
                  >
                    <Icon name="edit" size={14} /> Editar datos
                  </button>
                </div>
              </Desplegable>
    </>
  );
}
