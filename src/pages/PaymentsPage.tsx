import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions';

export default function PaymentsPage() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.findAll(),
  });

  if (isLoading) return <div>Cargando transacciones...</div>;

  return (
    <div>
      <h1>Pagos</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Fecha</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Tipo</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Monto</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(t => (
            <tr key={t._id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{new Date(t.createdAt).toLocaleDateString('es-AR')}</td>
              <td style={{ padding: 8 }}>{t.type}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>${t.amount.toFixed(2)}</td>
              <td style={{ padding: 8 }}>{t.description ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
