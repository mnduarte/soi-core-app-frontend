import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../../api/patients';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';

/**
 * Elegir un paciente escribiendo, con alta al final.
 *
 * Es el mismo gesto que la fila de anotar de la libreta y usa sus mismas
 * clases, pero con estado propio: el de allá está entretejido con el resto de
 * esa pantalla (abre el formulario de alta, anota con Enter, marca el campo
 * como "aterrizado"), y traerlo entero acá habría significado tocar la
 * pantalla más usada de la app para ganar nada.
 *
 * Acá aparece solo cuando el intérprete no encontró a nadie. Ese caso no es
 * raro —"de Federico" al final de la frase se le escapa— y sin un buscador era
 * un callejón sin salida: o creabas un paciente duplicado o volvías a dictar
 * todo. Con esto son dos segundos.
 */

interface Props {
  /** Lo que se entendió como nombre: arranca escrito y ya filtrando. */
  inicial?: string;
  onElegir: (p: Patient) => void;
  onCrear?: (nombre: string) => void;
  creando?: boolean;
  /** Sin alta: buscando los turnos de alguien no tiene sentido crearlo. */
  sinCrear?: boolean;
}

export function BuscadorPaciente({ inicial, onElegir, onCrear, creando, sinCrear }: Props) {
  const [texto, setTexto] = useState(inicial ?? '');
  const [abierto, setAbierto] = useState(true);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const { data } = useQuery({
    queryKey: ['patients', texto.trim()],
    queryFn: () => patientsApi.findAll(texto.trim() || undefined),
  });
  const resultados = useMemo(() => data ?? [], [data]);
  // "El dato todavía no existe" y no `isLoading`: en el render en que se abre,
  // la consulta recién se dispara y por un frame se pintaría "sin
  // coincidencias", que es la respuesta equivocada.
  const buscando = data === undefined;

  /**
   * Sin nada escrito la lista NO va alfabética: el backend ordena por apellido
   * y salían siempre los mismos. Se ordena por actividad reciente, porque a
   * quien más se agenda es al que acaba de ser atendido o al recién dado de
   * alta. (Mismo criterio que la libreta.)
   */
  const sugeridos = useMemo(() => {
    if (texto.trim()) return resultados.slice(0, 6);
    const cuando = (p: Patient) =>
      Math.max(
        p.lastVisitAt ? new Date(p.lastVisitAt).getTime() : 0,
        p.createdAt ? new Date(p.createdAt).getTime() : 0,
      );
    return [...resultados].sort((a, b) => cuando(b) - cuando(a)).slice(0, 6);
  }, [resultados, texto]);

  const exacto = resultados.some(
    p => `${p.name} ${p.lastName}`.trim().toLowerCase() === texto.trim().toLowerCase(),
  );

  return (
    <div className="bp">
      <Icon name="search" size={14} className="bp__lupa" />
      <input
        ref={ref}
        className="input bp__input"
        placeholder="Buscá el paciente…"
        value={texto}
        onChange={e => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={e => {
          if (e.key === 'Escape') setAbierto(false);
          if (e.key === 'Enter' && sugeridos.length === 1) {
            e.preventDefault();
            onElegir(sugeridos[0]);
          }
        }}
      />

      {abierto && (
        <div className="lb-menupop bp__pop">
          {buscando && <div className="bp__vacio">Buscando…</div>}
          {!buscando && sugeridos.length === 0 && !texto.trim() && (
            <div className="bp__vacio">Sin pacientes.</div>
          )}

          {/* Las opciones usan onMouseDown con preventDefault: así el input
              nunca pierde el foco al tocarlas y el blur no cierra la lista
              antes de que el click se registre. */}
          {!buscando && sugeridos.map(p => (
            <div
              key={p._id}
              className="bp__fila"
              onMouseDown={e => { e.preventDefault(); onElegir(p); }}
            >
              <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
              <span className="bp__nom">{p.name} {p.lastName}</span>
              {p.obraSocial && <small className="bp__os">{p.obraSocial}</small>}
            </div>
          ))}

          {/* Crear va ABAJO y siempre que haya texto sin coincidencia exacta:
              primero buscar entre los que existen, crear como último recurso.
              Al revés se llena de fichas duplicadas. */}
          {!sinCrear && onCrear && texto.trim().length >= 2 && !exacto && (
            <div
              className="bp__fila bp__fila--nuevo"
              onMouseDown={e => { e.preventDefault(); if (!creando) onCrear!(texto.trim()); }}
            >
              <Icon name="plus" size={13} />
              <span className="bp__nom">{creando ? 'Creando…' : `Crear a ${texto.trim()}`}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BuscadorPaciente;
