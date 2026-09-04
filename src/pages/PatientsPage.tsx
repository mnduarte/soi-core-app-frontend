import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { patientsApi, type Patient } from '../api/patients';
import { useUIStore } from '../store/ui.store';
import { SectionHeader } from '../components/common/SectionHeader';
import { Icon } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useIsMobile } from '../hooks/useIsMobile';
import { fmtMoney, fmtShortDate, patientAge, relativeDay, relativeSoon } from '../lib/format';
import { toWhatsAppNumber } from '../lib/phone';

type Filter = 'all' | 'debt' | 'turno';

const debtOf = (p: Patient) => p.balance ?? 0;

export default function PatientsPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const isMobile = useIsMobile(767);
  const isTablet = useIsMobile(1199);

  // En "Pacientes viejos" cada paciente abre la ficha CLÁSICA (perfil completo);
  // en Pacientes normal abre la Ficha clínica (trabajos + pagos).
  const classic = pathname.startsWith('/pacientes-viejos');
  const openPatient = (patientId: string) =>
    navigate(classic ? `/ficha-clasica/${patientId}` : `/patients/${patientId}`);

  const onEdit = (p: Patient) => openModal('newPatient', { patientId: p._id });

  // Hard delete (con cascade). Confirmación fuerte porque es irreversible.
  const [toDelete, setToDelete] = useState<Patient | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => patientsApi.hardRemove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      showToast('Paciente eliminado');
    },
    onError: () => showToast('No se pudo eliminar', 'error'),
  });

  const [filter, setFilter] = useState<Filter>('all');
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  // El fundido se lanza acá y no con una `key` que remonte la tabla: remontar
  // 379 filas era lo que se sentía colgado. Se anima el <tbody>, que sobrevive
  // al cambio, mientras React reemplaza las filas adentro.
  const cambiarFiltro = (f: Filter) => {
    setFilter(f);
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quieto) return;
    bodyRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  };
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: patients = [], isLoading, isFetching } = useQuery({
    queryKey: ['patients', debouncedSearch],
    queryFn: () => patientsApi.findAll(debouncedSearch || undefined),
    // Un paciente cargado en otro dispositivo aparece acá sin recargar. El
    // refresh lo dispara el heartbeat central (useClinicChanges en AppLayout).
    // `placeholderData` mantiene en pantalla el resultado anterior mientras
    // llega el nuevo, así al tipear en el buscador la lista no parpadea a vacío.
    placeholderData: prev => prev,
  });
  // Refetch en curso (buscar, heartbeat) con datos ya en pantalla.
  const refreshing = isFetching && !isLoading;

  const debtCount = useMemo(() => patients.filter(p => debtOf(p) > 0).length, [patients]);
  const turnoCount = useMemo(() => patients.filter(p => !!p.nextVisitAt).length, [patients]);
  const shown = useMemo(
    () =>
      filter === 'debt'
        ? patients.filter(p => debtOf(p) > 0)
        : filter === 'turno'
          ? patients.filter(p => !!p.nextVisitAt)
          : patients,
    [patients, filter],
  );

  // DNI duplicados (mismo DNI en 2+ fichas) → banner de reconciliación.
  const dupDniGroups = useMemo(() => {
    const map = new Map<string, Patient[]>();
    for (const p of patients) {
      const dni = (p.dni ?? '').trim();
      if (!dni) continue;
      if (!map.has(dni)) map.set(dni, []);
      map.get(dni)!.push(p);
    }
    return [...map.entries()].filter(([, list]) => list.length > 1);
  }, [patients]);

  return (
    /* Columna fija: header + filtros quedan siempre visibles y solo scrollea
       la lista (con su encabezado de columnas pegado arriba). */
    <div
      className="content fade-in"
      style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
    >
      <SectionHeader
        kicker={classic ? 'Pacientes viejos' : 'Pacientes'}
        title={
          <>
            <em>{patients.length}</em> fichas {debouncedSearch ? 'encontradas' : 'activas'}
          </>
        }
      />

      {/* Barra de filtros */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: isMobile ? '10px 16px' : '12px 32px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <div
          className="search"
          style={{
            flex: 1,
            maxWidth: 380,
            minWidth: 160,
            background: '#fff',
            border: '1px solid var(--border-input)',
            height: 38,
          }}
        >
          <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
          <input
            placeholder={isMobile ? 'Buscar…' : 'Buscar por nombre, DNI, teléfono…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Spinner dentro del buscador mientras se re-consulta */}
          {refreshing && <span className="spinner" style={{ width: 14, height: 14 }} />}
        </div>

        <button
          className={`chip-pill ${filter === 'all' ? 'is-active' : ''}`}
          onClick={() => cambiarFiltro('all')}
        >
          Todos
        </button>
        <button
          className="chip-pill"
          onClick={() => cambiarFiltro(filter === 'debt' ? 'all' : 'debt')}
          style={{
            color: 'var(--danger)',
            fontWeight: 600,
            borderColor: filter === 'debt' ? 'var(--danger)' : 'var(--danger-border)',
            background: filter === 'debt' ? 'var(--danger-bg)' : '#fff',
          }}
        >
          Con deuda · {debtCount}
        </button>
        {/* En color de marca y no en rojo: tener turno no es un problema a
            resolver, es el estado normal. El rojo queda reservado para deuda. */}
        <button
          className="chip-pill"
          onClick={() => cambiarFiltro(filter === 'turno' ? 'all' : 'turno')}
          style={{
            color: 'var(--brand-primary)',
            fontWeight: 600,
            borderColor: filter === 'turno' ? 'var(--brand-primary)' : 'var(--brand-primary-100)',
            background: filter === 'turno' ? 'var(--brand-primary-50)' : '#fff',
          }}
        >
          Con turno · {turnoCount}
        </button>

        {!isMobile && (
          <button className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={() => openModal('newPatient')}>
            <Icon name="plus" /> <span>Nuevo paciente</span>
          </button>
        )}
      </div>

      <div
        style={{
          padding: isMobile ? '12px 12px 16px' : '20px 32px 24px',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* DNI duplicados — banner suave de reconciliación */}
        {dupDniGroups.length > 0 && (
          <div
            style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 14px',
              fontSize: 12.5,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>
              <Icon name="alert" size={14} />
              {dupDniGroups.length} DNI duplicado{dupDniGroups.length !== 1 ? 's' : ''} — revisá cuál queda y corregí el otro
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dupDniGroups.map(([dni, list]) => (
                <div key={dni} style={{ color: 'var(--text-secondary)' }}>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>DNI {dni}</span>:{' '}
                  {list.map((p, i) => (
                    <span key={p._id}>
                      {i > 0 && ' · '}
                      {p.name} {p.lastName}{' '}
                      <button
                        onClick={() => onEdit(p)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', fontSize: 12 }}
                      >
                        <Icon name="edit" size={11} style={{ verticalAlign: -1 }} /> (editar)
                      </button>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingList />
        ) : shown.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {filter === 'debt'
              ? 'Ningún paciente con deuda. ✓'
              : filter === 'turno'
                ? 'Nadie tiene turno agendado.'
                : debouncedSearch
                ? 'Sin resultados.'
                : 'Aún no hay pacientes cargados.'}
          </div>
        ) : isMobile ? (
          <CardsView patients={shown} onOpen={openPatient} refreshing={refreshing} />
        ) : (
          <TableView
            patients={shown}
            compact={isTablet}
            bodyRef={bodyRef}
            refreshing={refreshing}
            onOpen={openPatient}
            onEdit={onEdit}
            onDelete={setToDelete}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar a ${toDelete?.name ?? ''} ${toDelete?.lastName ?? ''}?`}
        message="Se borran también sus turnos y todo lo cargado en su ficha (cuenta corriente, odontograma, evoluciones). No se puede deshacer."
        confirmLabel="Eliminar paciente"
        danger
        requireTextConfirmation="eliminar"
        onConfirm={() => {
          if (toDelete) deleteMut.mutate(toDelete._id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// Carga inicial: filas fantasma con el ancho de las columnas reales. Es más
// tranquilizador que un "Buscando…" suelto — se ve que la lista está viniendo.
function LoadingList() {
  return (
    <div className="card" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '2px solid var(--border-default)', background: 'var(--bg-muted)', color: 'var(--text-label)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span className="spinner" style={{ width: 13, height: 13 }} /> Cargando pacientes…
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="lb-skeleton-row" style={{ opacity: 1 - i * 0.09 }}>
          <div className="lb-shimmer" style={{ width: 34, height: 34, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lb-shimmer" style={{ width: `${45 + ((i * 7) % 30)}%`, height: 12 }} />
            <div className="lb-shimmer" style={{ width: '22%', height: 9 }} />
          </div>
          <div className="lb-shimmer" style={{ width: 74, height: 20, borderRadius: 'var(--radius-sm)' }} />
        </div>
      ))}
    </div>
  );
}

// Badge de saldo: verde "Al día" o terracota "Debe $X"
function SaldoBadge({ p }: { p: Patient }) {
  const debt = debtOf(p);
  return debt > 0 ? (
    <span className="badge badge--danger badge--dot">Debe {fmtMoney(debt)}</span>
  ) : (
    <span className="badge badge--success badge--dot">Al día</span>
  );
}

function WhatsAppCell({ phone }: { phone?: string }) {
  if (!phone) return <span style={{ color: 'var(--text-placeholder)', fontSize: 13 }}>— sin teléfono</span>;
  return (
    <a
      href={`https://wa.me/${toWhatsAppNumber(phone)}`}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      style={{ color: 'var(--success)', fontWeight: 600, fontSize: 13, display: 'inline-flex', gap: 5, alignItems: 'center' }}
    >
      <Icon name="whatsapp" size={14} /> {phone}
    </a>
  );
}

// Tabla desktop / tablet. En tablet (compact) se caen TURNOS y WHATSAPP —
// WhatsApp pasa a ser una acción de fila.
/**
 * Cuántas filas se dibujan de entrada, y de a cuántas crece.
 *
 * El problema no era pintar: eran ~2.300 nodos (cada fila trae avatar, badge,
 * link y tres botones con SVG) construyéndose de una. Con 60 la primera pintada
 * es instantánea, y el resto entra solo al scrollear — que es cuando de verdad
 * hacen falta.
 */
const PAGINA = 60;

function TableView({
  patients,
  compact,
  bodyRef,
  refreshing,
  onOpen,
  onEdit,
  onDelete,
}: {
  patients: Patient[];
  compact: boolean;
  /** Se anima desde el chip al cambiar de filtro (ver `cambiarFiltro`). */
  bodyRef: React.RefObject<HTMLTableSectionElement | null>;
  refreshing: boolean;
  onOpen: (id: string) => void;
  onEdit: (p: Patient) => void;
  onDelete: (p: Patient) => void;
}) {
  const [visibles, setVisibles] = useState(PAGINA);
  // Al cambiar la lista (filtro o búsqueda) se vuelve a empezar. Se ajusta
  // durante el render y no en un efecto: así no queda un fotograma intermedio
  // dibujando las 379 filas de la lista anterior.
  const [listaVista, setListaVista] = useState(patients);
  if (patients !== listaVista) {
    setListaVista(patients);
    setVisibles(PAGINA);
  }

  const sentinela = useRef<HTMLTableRowElement | null>(null);
  const hayMas = patients.length > visibles;

  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hayMas) return;
    // Crece cuando la última fila se ACERCA a la pantalla, no cuando se llega
    // al final: con 400px de margen la lista simplemente sigue, sin corte ni
    // salto visible.
    const io = new IntersectionObserver(
      entradas => {
        if (entradas[0]?.isIntersecting) setVisibles(v => v + PAGINA);
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hayMas, visibles]);

  const enPantalla = patients.slice(0, visibles);

  return (
    // La hoja ocupa el alto disponible y el scroll vive ACÁ adentro, así el
    // buscador y el encabezado de columnas nunca se van de pantalla.
    <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={`table-scroll ${refreshing ? 'lb-refreshing' : ''}`} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* Anchos fijos: sin esto el navegador mide el CONTENIDO de cada columna,
          así que al filtrar —cuando muchas celdas pasan de "07/09/26" a "sin
          turno"— las columnas se recalculan y la tabla entera se corre de
          lugar. El usuario no cambió de pantalla: filtró. Nada debería moverse
          salvo qué filas hay. */}
      <table className="tbl tbl--fix">
        {/* En porcentajes que suman 100. Con anchos en píxeles, todo el sobrante
            caía en la primera columna y "Paciente" se comía la pantalla. */}
        <colgroup>
          <col style={{ width: compact ? '34%' : '27%' }} />
          <col style={{ width: compact ? '17%' : '13%' }} />
          <col style={{ width: compact ? '18%' : '14%' }} />
          {!compact && <col style={{ width: '9%' }} />}
          <col style={{ width: compact ? '15%' : '12%' }} />
          {!compact && <col style={{ width: '13%' }} />}
          <col style={{ width: compact ? '16%' : '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Última visita</th>
            {/* Sobrevive en tablet aunque caiga "Turnos": saber cuándo vuelve
                es más útil que cuántas veces vino. */}
            <th>Próximo turno</th>
            {!compact && <th>Turnos</th>}
            <th>Saldo</th>
            {!compact && <th>WhatsApp</th>}
            <th style={{ textAlign: 'right' }}></th>
          </tr>
        </thead>
        {/* SIN `key`. Ponerla remontaba las 379 filas de cero en cada cambio
            de filtro —destruir todo y volver a crearlo— y eso era el cuelgue.
            Sin key, React reutiliza las filas que sobreviven (tienen `key` por
            paciente) y solo saca las que se van. El fundido se dispara por
            código desde el chip, que no necesita remontar nada. */}
        <tbody ref={bodyRef}>
          {enPantalla.map(p => {
            const age = patientAge(p);
            const meta = [age != null ? `${age} años` : null, p.locality].filter(Boolean).join(' · ');
            return (
              <tr key={p._id} onClick={() => onOpen(p._id)}>
                <td>
                  <div className="row" style={{ gap: 11 }}>
                    <Avatar name={p.name} lastName={p.lastName} id={p._id} size="md" />
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600 }}>
                        {p.name} {p.lastName}
                      </div>
                      {meta && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{meta}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {fmtShortDate(p.lastVisitAt)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-label)' }}>{relativeDay(p.lastVisitAt)}</div>
                </td>
                <td>
                  {p.nextVisitAt ? (
                    <>
                      <div className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {fmtShortDate(p.nextVisitAt)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--brand-primary)', fontWeight: 600 }}>
                        {relativeSoon(p.nextVisitAt)}
                        {/* Con varios agendados se avisa que hay más, sin
                            intentar mostrarlos: en una celda de una línea sería
                            ilegible, y el detalle está a un click en la ficha.
                            Callarlo sería peor: la lista afirmaría que tiene
                            uno solo. */}
                        {(p.nextCount ?? 0) > 1 && (
                          <span
                            style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}
                            title={`Tiene ${p.nextCount} turnos agendados`}
                          >
                            {' '}+{(p.nextCount ?? 1) - 1}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    // Sin turno agendado NO es un hueco: es la lista de a
                    // quiénes hay que llamar. Por eso se dice, no se deja vacío.
                    <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                      sin turno
                    </span>
                  )}
                </td>
                {!compact && (
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {p.appointmentsCount ?? 0}
                  </td>
                )}
                <td><SaldoBadge p={p} /></td>
                {!compact && <td><WhatsAppCell phone={p.phone} /></td>}
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 8, justifyContent: 'flex-end' }}>
                    {compact && p.phone && (
                      <a
                        className="lb-act lb-act--wsp"
                        href={`https://wa.me/${toWhatsAppNumber(p.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Recordar por WhatsApp"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="lb-act__ic"><Icon name="whatsapp" size={16} /></span>
                        <span className="lb-act__lbl">Recordar</span>
                      </a>
                    )}
                    <button
                      className="lb-act"
                      title="Abrir ficha clínica"
                      onClick={e => { e.stopPropagation(); onOpen(p._id); }}
                    >
                      <span className="lb-act__ic"><Icon name="clipboard" size={16} /></span>
                      <span className="lb-act__lbl">Ficha</span>
                    </button>
                    <button
                      className="lb-act"
                      title="Editar paciente"
                      onClick={e => { e.stopPropagation(); onEdit(p); }}
                    >
                      <span className="lb-act__ic"><Icon name="user" size={16} /></span>
                      <span className="lb-act__lbl">Paciente</span>
                    </button>
                    <button
                      className="lb-act"
                      title="Eliminar paciente"
                      onClick={e => { e.stopPropagation(); onDelete(p); }}
                    >
                      <span className="lb-act__ic" style={{ color: 'var(--danger)' }}><Icon name="trash" size={16} /></span>
                      <span className="lb-act__lbl">Borrar</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {/* Fila invisible que avisa cuándo hace falta dibujar más. */}
          {hayMas && (
            <tr ref={sentinela} aria-hidden style={{ height: 1 }}>
              <td colSpan={compact ? 5 : 7} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Celular: tarjetas apiladas (no tabla) — nombre, última visita y saldo de un vistazo.
function CardsView({
  patients,
  onOpen,
  refreshing,
}: {
  patients: Patient[];
  onOpen: (id: string) => void;
  refreshing: boolean;
}) {
  return (
    <div
      className={`card ${refreshing ? 'lb-refreshing' : ''}`}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
    >
      {patients.map(p => {
        const age = patientAge(p);
        return (
          <div
            key={p._id}
            onClick={() => onOpen(p._id)}
            style={{
              display: 'flex',
              gap: 11,
              alignItems: 'center',
              padding: '13px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <Avatar name={p.name} lastName={p.lastName} id={p._id} size="md" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600 }}>
                {p.name} {p.lastName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {[age != null ? `${age} años` : null, `visto ${relativeDay(p.lastVisitAt)}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <SaldoBadge p={p} />
              {p.phone ? (
                <a
                  href={`https://wa.me/${toWhatsAppNumber(p.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }}
                >
                  <Icon name="whatsapp" size={13} /> Recordar
                </a>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>sin teléfono</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
