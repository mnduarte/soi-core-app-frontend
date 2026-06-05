import { apiClient } from './client';

// CHARGE suma deuda (DEBE), PAYMENT la resta (HABER). El saldo del backend es
// deuda-positiva: > 0 = el paciente debe; < 0 = saldo a favor.
export type TransactionType = 'CHARGE' | 'PAYMENT' | 'REFUND' | 'VOID';

export interface Transaction {
  _id: string;
  patientId: string;
  type: TransactionType;
  amount: number;
  paymentMethod: string;
  description?: string;
  voidedAt?: string;
  createdAt: string;
}

export const transactionsApi = {
  findAll: (patientId?: string) =>
    apiClient.get<{ data: Transaction[] }>('/transactions', { params: { patientId } }).then(r => r.data.data),

  getBalance: (patientId: string) =>
    apiClient.get<{ data: { balance: number } }>(`/transactions/balance/${patientId}`).then(r => r.data.data),

  // Cobro (HABER). Baja el saldo.
  create: (dto: { patientId: string; amount: number; paymentMethod?: string; description?: string }) =>
    apiClient.post<{ data: Transaction }>('/transactions', { ...dto, type: 'PAYMENT' }).then(r => r.data.data),

  // Cargo manual (DEBE). Sube el saldo.
  createCharge: (dto: { patientId: string; amount: number; description?: string }) =>
    apiClient.post<{ data: Transaction }>('/transactions', { ...dto, type: 'CHARGE' }).then(r => r.data.data),

  void: (id: string) =>
    apiClient.post<{ data: unknown }>(`/transactions/${id}/void`).then(r => r.data.data),
};
