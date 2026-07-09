import { apiClient } from './client';

// CHARGE suma deuda (DEBE), PAYMENT la resta (HABER). El saldo del backend es
// deuda-positiva: > 0 = el paciente debe; < 0 = saldo a favor.
export type TransactionType = 'CHARGE' | 'PAYMENT' | 'REFUND' | 'VOID';

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

export interface Transaction {
  _id: string;
  patientId: string;
  type: TransactionType;
  amount: number;
  paymentMethod: string;
  description?: string;
  date?: string;
  voidedAt?: string;
  createdAt: string;
}

export interface MovementInput {
  patientId: string;
  type: 'CHARGE' | 'PAYMENT';
  amount: number;
  paymentMethod?: PaymentMethod;
  description?: string;
  date?: string; // ISO
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

  // Ficha rápida: alta de un movimiento (Cargo o Pago) con fecha y método.
  addMovement: (dto: MovementInput) =>
    apiClient.post<{ data: Transaction }>('/transactions', dto).then(r => r.data.data),

  updateMovement: (id: string, dto: Partial<MovementInput>) =>
    apiClient.patch<{ data: Transaction }>(`/transactions/${id}`, dto).then(r => r.data.data),

  // Borrado físico (ficha rápida).
  remove: (id: string) =>
    apiClient.delete(`/transactions/${id}`),

  void: (id: string) =>
    apiClient.post<{ data: unknown }>(`/transactions/${id}/void`).then(r => r.data.data),
};
