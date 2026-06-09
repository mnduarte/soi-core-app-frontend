import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { GallerySession } from '../../api/gallery';

interface CompareViewProps {
  sessions: GallerySession[];
}

// Picks the first photo of each session as the "cover" for that session.
// Prefers intraoral since those are the natural before/after subjects;
// falls back to whatever is there.
function coverPhoto(session: GallerySession): string | null {
  const intraoral = session.photos.find(p => p.type === 'INTRAORAL');
  return intraoral?.url ?? session.photos[0]?.url ?? null;
}

export function CompareView({ sessions }: CompareViewProps) {
  // Only sessions with at least one photo can act as A or B.
  const usable = useMemo(() => sessions.filter(s => s.photos.length > 0), [sessions]);

  // Default A = oldest session, B = newest, so the user lands on a real
  // before/after comparison instead of two of the same.
  const [a, setA] = useState(() => Math.max(0, usable.length - 1));
  const [b, setB] = useState(0);
  const [pos, setPos] = useState(50);

  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    // Clamp if the underlying list shrinks (e.g. session deleted).
    if (a >= usable.length) setA(usable.length - 1);
    if (b >= usable.length) setB(0);
  }, [usable.length, a, b]);

  if (usable.length < 2) {
    return (
      <div
        style={{
          padding: 60,
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 13,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
        }}
      >
        Necesitás al menos 2 sesiones con fotos para comparar antes/después.
      </div>
    );
  }

  const sessionA = usable[a];
  const sessionB = usable[b];
  const urlA = coverPhoto(sessionA);
  const urlB = coverPhoto(sessionB);

  const handleMove = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const p = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPos(p);
  };

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">Comparador antes / después</div>
          <div className="card__sub">
            Arrastrá el slider para comparar. Cambiá las sesiones desde la base.
          </div>
        </div>
      </div>

      <div style={{ padding: 24, background: 'var(--bg-muted)' }}>
        <div
          ref={ref}
          onMouseDown={e => {
            dragging.current = true;
            handleMove(e.clientX);
          }}
          onMouseMove={e => {
            if (dragging.current) handleMove(e.clientX);
          }}
          onMouseUp={() => (dragging.current = false)}
          onMouseLeave={() => (dragging.current = false)}
          onTouchMove={e => handleMove(e.touches[0].clientX)}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 760,
            aspectRatio: '4/3',
            margin: '0 auto',
            borderRadius: 14,
            overflow: 'hidden',
            cursor: 'ew-resize',
            userSelect: 'none',
            boxShadow: 'var(--shadow-lg)',
            background: '#0F1218',
          }}
        >
          {/* "After" — full layer */}
          {urlB && (
            <img
              src={urlB}
              alt={sessionB.title}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              draggable={false}
            />
          )}
          {/* "Before" — clipped layer */}
          {urlA && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: `polygon(0 0, ${pos}% 0, ${pos}% 100%, 0 100%)`,
              }}
            >
              <img
                src={urlA}
                alt={sessionA.title}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                draggable={false}
              />
            </div>
          )}

          {/* Labels */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              color: 'white',
              fontSize: 11.5,
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
            }}
          >
            ANTES · {new Date(sessionA.createdAt).toLocaleDateString('es-AR')}
          </div>
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              color: 'white',
              fontSize: 11.5,
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
            }}
          >
            {new Date(sessionB.createdAt).toLocaleDateString('es-AR')} · DESPUÉS
          </div>

          {/* Slider handle */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${pos}%`,
              transform: 'translateX(-50%)',
              width: 2,
              background: 'white',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 36,
                height: 36,
                borderRadius: 50,
                background: 'white',
                boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-primary-600)',
              }}
            >
              <Icon name="arrowLeft" size={12} style={{ marginRight: -2 }} />
              <Icon name="arrowRight" size={12} style={{ marginLeft: -2 }} />
            </div>
          </div>
        </div>

        {/* Session picker */}
        <div
          style={{
            maxWidth: 760,
            margin: '20px auto 0',
            padding: '12px 14px',
            background: 'var(--bg-surface)',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
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
            Sesiones
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {usable.map((s, i) => {
              const isA = i === a;
              const isB = i === b;
              const cover = coverPhoto(s);
              return (
                <button
                  key={s._id}
                  onClick={() => {
                    // Click toggles between A and B based on direction: clicking
                    // an earlier session sets A, a later one sets B. Clicking the
                    // current A swaps to B, etc.
                    if (isA) setA(i);
                    else if (isB) setB(i);
                    else if (i > a) setB(i);
                    else setA(i);
                  }}
                  style={{
                    flexShrink: 0,
                    width: 110,
                    padding: 8,
                    border: '1.5px solid',
                    borderColor: isA
                      ? 'var(--brand-primary)'
                      : isB
                      ? 'var(--success)'
                      : 'var(--border-subtle)',
                    borderRadius: 8,
                    background: isA || isB ? 'var(--bg-surface)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      aspectRatio: '1/1',
                      borderRadius: 6,
                      background: cover
                        ? `url(${cover}) center/cover`
                        : 'var(--bg-muted)',
                      marginBottom: 6,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {new Date(s.createdAt).toLocaleDateString('es-AR')}
                  </div>
                  {isA && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--brand-primary-600)',
                        fontWeight: 600,
                        marginTop: 3,
                      }}
                    >
                      ANTES ←
                    </div>
                  )}
                  {isB && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--success)',
                        fontWeight: 600,
                        marginTop: 3,
                      }}
                    >
                      DESPUÉS →
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
