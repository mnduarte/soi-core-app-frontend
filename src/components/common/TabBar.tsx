interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <div
          key={t.key}
          className={`tab ${active === t.key ? 'is-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="tab__count">{t.count}</span>}
        </div>
      ))}
    </div>
  );
}
