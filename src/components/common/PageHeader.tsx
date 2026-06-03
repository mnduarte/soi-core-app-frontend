import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div className="row" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}
