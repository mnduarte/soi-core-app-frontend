import { Icon } from '../common/Icon';
import { DURACIONES } from './horarios';

/**
 * Elegir hora y duración de un turno.
 *
 * Vivía adentro de LibretaView. Salió a componente propio cuando "Anotar
 * dictando" necesitó lo mismo: elegir la hora con el selector nativo del
 * navegador no sabe en qué horarios atiende el consultorio ni cuáles están
 * ocupados, así que ofrecía las 24 horas del día y las 03:17 entre ellas.
 *
 * Es presentacional a propósito: no sabe de dónde salen los slots ni quién
 * está ocupado. Quien lo usa decide eso y decide también qué pasa al elegir
 * —en la libreta, además de fijar la hora, salta el foco al paciente—.
 */

interface Props {
  /** HH:MM elegido. */
  time: string;
  duration: number;
  slots: string[];
  /** Horarios del día que ya tienen turno: se marcan y avisan sobreturno. */
  taken: Set<string>;
  onTime: (t: string) => void;
  onDuration: (d: number) => void;
  /** Sin esto no se ofrece cambiar los horarios del consultorio. */
  onPersonalizar?: () => void;
  /** Para posicionarlo: la libreta lo cuelga del botón de la hora. */
  style?: React.CSSProperties;
}

export function SelectorHorario({
  time, duration, slots, taken, onTime, onDuration, onPersonalizar, style,
}: Props) {
  return (
    <div
      className="lb-menupop"
      style={{
        transformOrigin: 'top left',
        width: 420,
        maxWidth: '92vw',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        padding: 14,
        ...style,
      }}
    >
      <div className="sh-tit">Duración</div>
      <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {DURACIONES.map(d => (
          <button
            key={d}
            type="button"
            className={`seg__btn ${duration === d ? 'is-active' : ''}`}
            onClick={() => onDuration(d)}
          >
            {d}m
          </button>
        ))}
      </div>

      <div className="sh-tit">Slots del día</div>
      <div className="slot-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {slots.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onTime(t)}
            className={`mono slot ${taken.has(t) ? 'slot--taken' : ''} ${t === time ? 'slot--sel' : ''}`}
            title={taken.has(t) ? 'Ya hay turno — se anota como sobreturno' : 'Libre'}
          >
            {t}
          </button>
        ))}
      </div>

      {/* La referencia de la leyenda es el mismo cuadrado pintado que se ve en
          la grilla, no otro símbolo: si el ejemplo no se parece a lo que hay
          que buscar, no explica nada. */}
      <div className="slot-leyenda">
        <span className="slot-leyenda__box" />
        ocupado (se apila como sobreturno)
      </div>

      {onPersonalizar && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onPersonalizar(); }}
          className="lb-chip lb-chip--add"
          style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
        >
          <Icon name="settings" size={13} /> Personalizar horarios
        </button>
      )}
    </div>
  );
}

export default SelectorHorario;
