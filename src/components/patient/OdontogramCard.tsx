import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../common/Icon';
import {
  odontogramsApi,
  type OdontogramOp,
  type ToothCondition,
  type ToothConditionStatus,
  type ToothState,
  type ToothSurface,
} from '../../api/odontograms';

// =============================================================================
// FDI numbering — split into quadrants. Within each row we render right-to-left
// for the right quadrant (so the central incisor is closest to the midline)
// and left-to-right for the left quadrant, matching how a dentist sees the
// patient's mouth from outside.
// =============================================================================
const TEETH_UPPER_R = [18, 17, 16, 15, 14, 13, 12, 11];
const TEETH_UPPER_L = [21, 22, 23, 24, 25, 26, 27, 28];
const TEETH_LOWER_R = [48, 47, 46, 45, 44, 43, 42, 41];
const TEETH_LOWER_L = [31, 32, 33, 34, 35, 36, 37, 38];

// =============================================================================
// Conditions catalog. Each entry tells the UI whether the user has to pick a
// face (`surface`) or whether it covers the whole tooth (`tooth`). The same
// condition code is what's persisted in the backend's `condition` field, so
// the table is the single source of truth shared by both sides.
// =============================================================================
type ConditionKind = 'surface' | 'tooth';
interface ConditionDef {
  code: string;
  short: string;
  label: string;
  kind: ConditionKind;
}

const CONDITIONS: ConditionDef[] = [
  // Por cara
  { code: 'CU', short: 'CU', label: 'Caries curable',     kind: 'surface' },
  { code: 'CI', short: 'CI', label: 'Caries incurable',   kind: 'surface' },
  { code: 'Ac', short: 'Ac', label: 'Obt. composite',     kind: 'surface' },
  { code: 'Am', short: 'Am', label: 'Obt. amalgama',      kind: 'surface' },
  { code: 'OS', short: 'OS', label: 'Obt. silicato',      kind: 'surface' },
  // Diente completo
  { code: 'E',   short: 'E',   label: 'Extracción',        kind: 'tooth' },
  { code: 'Cd',  short: 'Cd',  label: 'Diente ausente',    kind: 'tooth' },
  { code: 'C',   short: 'C',   label: 'Corona',            kind: 'tooth' },
  { code: 'Tms', short: 'Tms', label: 'Endodoncia',        kind: 'tooth' },
  { code: 'IM',  short: 'IM',  label: 'Implante',          kind: 'tooth' },
  { code: 'Pp',  short: 'P',   label: 'Pivot. perno',      kind: 'tooth' },
  { code: 'PR',  short: 'PR',  label: 'Prót. removible',   kind: 'tooth' },
  { code: 'Pu',  short: 'P',   label: 'Puente',            kind: 'tooth' },
  { code: 'Or',  short: 'Or',  label: 'Ortodoncia',        kind: 'tooth' },
  { code: 'Pd',  short: 'Pd',  label: 'Paredontosis',      kind: 'tooth' },
];

const findCondition = (code: string) => CONDITIONS.find(c => c.code === code);

// =============================================================================
// Status helpers — 2-color convention from the ficha de papel:
//   EXISTING (rojo) is the consolidated state, REQUIRED (azul) is plan work.
// =============================================================================
const STATUS_LABEL: Record<ToothConditionStatus, string> = {
  EXISTING: 'Existente',
  REQUIRED: 'Requerida',
};
const STATUS_VAR: Record<ToothConditionStatus, string> = {
  EXISTING: 'var(--status-existing)',
  REQUIRED: 'var(--status-required)',
};
const STATUS_CLASS: Record<ToothConditionStatus, string> = {
  EXISTING: 'existing',
  REQUIRED: 'required',
};

// =============================================================================
// SVG paths — five trapezoid/center surfaces inside a 32x32 viewBox.
// Same layout for every tooth: V at top, L at bottom, M at left, D at right,
// O in the centre. This is the standard "schematic" representation used in
// printed odontograms.
// =============================================================================
const SURFACE_PATHS: Record<Exclude<ToothSurface, 'all'>, string> = {
  V: 'M 0 0 L 32 0 L 22 10 L 10 10 Z',
  D: 'M 32 0 L 32 32 L 22 22 L 22 10 Z',
  L: 'M 0 32 L 32 32 L 22 22 L 10 22 Z',
  M: 'M 0 0 L 0 32 L 10 22 L 10 10 Z',
  O: 'M 10 10 L 22 10 L 22 22 L 10 22 Z',
};
const SURFACES: Array<Exclude<ToothSurface, 'all'>> = ['V', 'D', 'L', 'M', 'O'];

// =============================================================================
// Marks model: tooth number → { surface → condition }. 'all' is one of the
// surface keys and is reserved for whole-tooth decorations.
// =============================================================================
type ToothMarks = Map<string, ToothCondition>;
type AllMarks = Map<number, ToothMarks>;

function buildMarks(teeth: ToothState[]): AllMarks {
  const out: AllMarks = new Map();
  for (const t of teeth) {
    const m: ToothMarks = new Map();
    for (const c of t.conditions) m.set(c.surface, c);
    out.set(t.toothNumber, m);
  }
  return out;
}

// =============================================================================
// Card
// =============================================================================
export function OdontogramCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  // Default to REQUIRED (azul) — the common case is marking new diagnostic
  // findings; the dentist will switch to EXISTING (rojo) when recording what
  // was already there at intake.
  const [status, setStatus] = useState<ToothConditionStatus>('REQUIRED');
  const [code, setCode] = useState('CU');

  const { data: odo } = useQuery({
    queryKey: ['odontogram', patientId],
    queryFn: () => odontogramsApi.get(patientId),
  });

  const serverMarks = useMemo(() => buildMarks(odo?.teeth ?? []), [odo]);
  const [marks, setMarks] = useState<AllMarks>(new Map());
  useEffect(() => setMarks(serverMarks), [serverMarks]);

  const mutation = useMutation({
    mutationFn: (ops: OdontogramOp[]) => odontogramsApi.applyOps(patientId, ops),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odontogram', patientId] }),
  });

  const handleSurfaceClick = (toothNumber: number, surface: Exclude<ToothSurface, 'all'>) => {
    const def = findCondition(code);
    if (!def) return;

    // Tooth-level conditions always write to the 'all' surface — the user can
    // click any zone, we still aggregate them to the whole tooth.
    const targetSurface: ToothSurface = def.kind === 'tooth' ? 'all' : surface;
    const current = marks.get(toothNumber)?.get(targetSurface);

    const next: AllMarks = new Map(marks);
    const toothMap = new Map(next.get(toothNumber) ?? new Map<string, ToothCondition>());

    let op: OdontogramOp;
    if (current && current.condition === code && current.status === status) {
      // Same condition+status on same surface → toggle off
      toothMap.delete(targetSurface);
      op = { type: 'remove_condition', toothNumber, surface: targetSurface };
    } else {
      const cond: ToothCondition = { surface: targetSurface, condition: code, status };
      toothMap.set(targetSurface, cond);
      op = { type: 'set_condition', toothNumber, condition: cond };
    }
    next.set(toothNumber, toothMap);
    setMarks(next);
    mutation.mutate([op]);
  };

  // Counts across all teeth × all surfaces.
  const counts = useMemo(() => {
    const c = { EXISTING: 0, REQUIRED: 0 } as Record<ToothConditionStatus, number>;
    for (const tooth of marks.values()) {
      for (const cond of tooth.values()) {
        if (cond.status in c) c[cond.status]++;
      }
    }
    return c;
  }, [marks]);

  const surfaceConds = CONDITIONS.filter(c => c.kind === 'surface');
  const toothConds = CONDITIONS.filter(c => c.kind === 'tooth');
  const selectedDef = findCondition(code);

  return (
    <div className="card">
      <div
        className="card__header"
        style={{ background: 'linear-gradient(180deg, #FAFBFD, var(--bg-surface))' }}
      >
        <div>
          <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="tooth" size={14} style={{ color: 'var(--brand-primary)' }} />
            Odontograma
          </div>
          <div className="card__sub">
            Click una cara para marcar (M/D/V/L/O) · doble-tap mismo botón = borrar
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn--ghost btn--sm">
            <Icon name="history" size={12} /> Versiones
          </button>
          <button className="btn btn--ghost btn--sm">
            <Icon name="download" size={12} /> Imprimir
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* ===== Status toggle ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', background: 'var(--bg-muted)', padding: 3, borderRadius: 8 }}>
            {(['EXISTING', 'REQUIRED'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`seg__btn ${status === s ? 'is-active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: status === s ? STATUS_VAR[s] : 'var(--text-secondary)',
                }}
              >
                <span className="dot" style={{ background: STATUS_VAR[s] }} /> {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            <span>
              <b style={{ color: 'var(--status-existing)' }}>{counts.EXISTING}</b> existentes
            </span>
            <span>
              <b style={{ color: 'var(--status-required)' }}>{counts.REQUIRED}</b> requeridas
            </span>
          </div>
        </div>

        {/* ===== Condition pills, grouped ===== */}
        <PillGroup
          label="Por cara"
          conditions={surfaceConds}
          selected={code}
          status={status}
          onPick={setCode}
        />
        <PillGroup
          label="Diente completo"
          conditions={toothConds}
          selected={code}
          status={status}
          onPick={setCode}
        />

        {selectedDef && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            Pincel activo:{' '}
            <span className="mono" style={{ fontWeight: 600, color: STATUS_VAR[status] }}>
              {selectedDef.short}
            </span>{' '}
            · {selectedDef.label} · {STATUS_LABEL[status].toLowerCase()}
            {selectedDef.kind === 'surface' && (
              <span style={{ color: 'var(--text-tertiary)' }}> · elegí la cara clickeando</span>
            )}
          </div>
        )}

        {/* ===== Grid ===== */}
        <div className="odo-layout">
          <div className="odo-grid">
            <ToothRow teeth={TEETH_UPPER_R} side="right" marks={marks} onClick={handleSurfaceClick} />
            <ToothRow teeth={TEETH_UPPER_L} side="left"  marks={marks} onClick={handleSurfaceClick} />
            <ToothRow teeth={TEETH_LOWER_R} side="right" marks={marks} onClick={handleSurfaceClick} isLower />
            <ToothRow teeth={TEETH_LOWER_L} side="left"  marks={marks} onClick={handleSurfaceClick} isLower />
          </div>

          <ReferenceCard />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
function PillGroup({
  label,
  conditions,
  selected,
  status,
  onPick,
}: {
  label: string;
  conditions: ConditionDef[];
  selected: string;
  status: ToothConditionStatus;
  onPick: (code: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          minWidth: 100,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {conditions.map(c => {
          const active = selected === c.code;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onPick(c.code)}
              title={c.label}
              className="mono"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 5,
                border: '1px solid',
                background: active ? STATUS_VAR[status] : 'var(--bg-surface)',
                color: active ? 'white' : 'var(--text-secondary)',
                borderColor: active ? STATUS_VAR[status] : 'var(--border-default)',
                cursor: 'pointer',
              }}
            >
              {c.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
function ToothRow({
  teeth,
  side,
  marks,
  onClick,
  isLower,
}: {
  teeth: number[];
  side: 'left' | 'right';
  marks: AllMarks;
  onClick: (toothNumber: number, surface: Exclude<ToothSurface, 'all'>) => void;
  isLower?: boolean;
}) {
  return (
    <div className={`odo-row odo-row--${side} ${isLower ? 'odo-row--lower' : 'odo-row--upper'}`}>
      {teeth.map(n => (
        <Tooth
          key={n}
          number={n}
          marks={marks.get(n) ?? new Map()}
          onSurfaceClick={s => onClick(n, s)}
        />
      ))}
    </div>
  );
}

// =============================================================================
function Tooth({
  number,
  marks,
  onSurfaceClick,
}: {
  number: number;
  marks: ToothMarks;
  onSurfaceClick: (surface: Exclude<ToothSurface, 'all'>) => void;
}) {
  const decoration = marks.get('all');
  const decoDef = decoration ? findCondition(decoration.condition) : undefined;

  // Code labels below the tooth — mirror the printed ficha. A tooth can carry
  // up to 6 entries (5 surfaces + the whole-tooth 'all'); we render up to
  // MAX_LABELS distinct codes and fold the rest into a "+N" indicator so the
  // row height stays stable. Duplicate codes across surfaces collapse into one
  // entry. E and Cd intentionally don't produce a text label — their X overlay
  // already says everything.
  const MAX_LABELS = 4;
  const labels: Array<{ code: string; short: string; status: ToothConditionStatus }> = [];
  const seen = new Set<string>();
  const pushLabel = (cond: ToothCondition) => {
    if (cond.condition === 'E' || cond.condition === 'Cd') return;
    if (seen.has(cond.condition)) return;
    const def = findCondition(cond.condition);
    if (!def) return;
    labels.push({ code: cond.condition, short: def.short, status: cond.status });
    seen.add(cond.condition);
  };
  // Tooth-level comes first so it gets prime visual position
  if (decoration) pushLabel(decoration);
  for (const surface of SURFACES) {
    const m = marks.get(surface);
    if (m) pushLabel(m);
  }
  const visible = labels.slice(0, MAX_LABELS);
  const hidden = labels.length - visible.length;

  return (
    <div className="odo-tooth">
      <div className="odo-tooth__num">{number}</div>
      <svg viewBox="0 0 32 32" className="odo-tooth__svg">
        {SURFACES.map(surface => {
          const m = marks.get(surface);
          const def = m ? findCondition(m.condition) : undefined;
          const cls = m && def?.kind === 'surface'
            ? `odo-surface odo-surface--${STATUS_CLASS[m.status]}`
            : 'odo-surface';
          return (
            <path
              key={surface}
              d={SURFACE_PATHS[surface]}
              className={cls}
              onClick={() => onSurfaceClick(surface)}
            />
          );
        })}
        {decoration && decoDef && (
          <ToothDecoration
            code={decoration.condition}
            status={decoration.status}
            short={decoDef.short}
          />
        )}
      </svg>
      <div
        className="odo-tooth__label"
        title={
          labels.length > 0
            ? labels.map(l => `${l.short} (${STATUS_LABEL[l.status].toLowerCase()})`).join(' · ')
            : undefined
        }
      >
        {visible.map(l => (
          <span key={l.code} style={{ color: STATUS_VAR[l.status] }}>
            {l.short}
          </span>
        ))}
        {hidden > 0 && <span className="odo-tooth__label-more">+{hidden}</span>}
      </div>
    </div>
  );
}

// =============================================================================
function ToothDecoration({
  code,
  status,
  short,
}: {
  code: string;
  status: ToothConditionStatus;
  short: string;
}) {
  const color = STATUS_VAR[status];
  switch (code) {
    case 'E':
      // Extracción indicada → red X (always pending color even if status differs
      // visually, the convention is explicit)
      return (
        <g className="odo-deco">
          <line x1="3" y1="3" x2="29" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <line x1="29" y1="3" x2="3" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case 'Cd':
      // Diente ausente → gray crossed-out, slightly thinner than E
      return (
        <g className="odo-deco">
          <line x1="3" y1="3" x2="29" y2="29" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" />
          <line x1="29" y1="3" x2="3" y2="29" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'C':
      // Corona → outer outline circle
      return (
        <g className="odo-deco">
          <circle cx="16" cy="16" r="15" fill="none" stroke={color} strokeWidth="1.8" />
        </g>
      );
    case 'Tms':
      // Endodoncia → vertical line through the centre
      return (
        <g className="odo-deco">
          <line x1="16" y1="2" x2="16" y2="30" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );
    case 'IM':
      // Implante → schematic "screw" with horizontal grooves
      return (
        <g className="odo-deco">
          <rect x="13" y="6" width="6" height="20" rx="1" fill="none" stroke={color} strokeWidth="1.5" />
          <line x1="13" y1="11" x2="19" y2="11" stroke={color} strokeWidth="1.2" />
          <line x1="13" y1="16" x2="19" y2="16" stroke={color} strokeWidth="1.2" />
          <line x1="13" y1="21" x2="19" y2="21" stroke={color} strokeWidth="1.2" />
        </g>
      );
    case 'Or':
      // Ortodoncia → bracket marks on V and L surfaces
      return (
        <g className="odo-deco">
          <rect x="11" y="2" width="10" height="3" fill={color} />
          <rect x="11" y="27" width="10" height="3" fill={color} />
        </g>
      );
    default:
      // Generic tooth-level label — render the code in the centre with the
      // status colour. Works as a fallback for PR, Pu, Pp, Pd.
      return (
        <g className="odo-deco">
          <text
            x="16"
            y="20"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fontFamily="var(--font-mono)"
            fill={color}
          >
            {short}
          </text>
        </g>
      );
  }
}

// =============================================================================
function ReferenceCard() {
  const Row = ({ swatch, label }: { swatch: 'existing' | 'required'; label: string }) => (
    <div className="row" style={{ gap: 6, fontSize: 11.5 }}>
      <span
        className="dot"
        style={{
          background:
            swatch === 'existing' ? 'var(--status-existing)' : 'var(--status-required)',
        }}
      />
      {label}
    </div>
  );

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Referencias
      </div>
      <div className="row" style={{ gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <Row swatch="existing" label="Existente (ya hecho)" />
        <Row swatch="required" label="Requerida (a hacer · entra al plan)" />
      </div>

      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          marginTop: 8,
          marginBottom: 6,
        }}
      >
        Caras
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
        <div><b className="mono">V</b> Vestibular / bucal</div>
        <div><b className="mono">L</b> Lingual / palatino</div>
        <div><b className="mono">M</b> Mesial</div>
        <div><b className="mono">D</b> Distal</div>
        <div><b className="mono">O</b> Oclusal / incisal</div>
      </div>

      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          marginTop: 12,
          marginBottom: 6,
        }}
      >
        Códigos
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
        {CONDITIONS.map(c => (
          <div key={c.code}>
            <span
              className="mono"
              style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 6 }}
            >
              {c.short}
            </span>
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}
