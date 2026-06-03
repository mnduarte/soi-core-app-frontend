interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 50,
        background: checked ? 'var(--brand-primary)' : 'var(--border-strong)',
        padding: 2,
        transition: 'background 0.18s',
        flexShrink: 0,
        cursor: 'pointer',
        border: 'none',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 50,
          background: 'white',
          transform: `translateX(${checked ? 16 : 0}px)`,
          transition: 'transform 0.18s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}

interface SectionLabelProps {
  children: React.ReactNode;
  hint?: string;
}

export function SectionLabel({ children, hint }: SectionLabelProps) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
        margin: '18px 0 10px',
        paddingBottom: 6,
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {children}
      {hint && (
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
          {hint}
        </span>
      )}
    </div>
  );
}
