import { apiClient } from './client';

export interface Transaction {
  _id: string;
  patientId: string;
  type: 'PAYMENT' | 'REFUND' | 'VOID';
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

  create: (dto: { patientId: string; amount: number; paymentMethod?: string; description?: string }) =>
    apiClient.post<{ data: Transaction }>('/transactions', dto).then(r => r.data.data),

  void: (id: string) =>
    apiClient.post<{ data: unknown }>(`/transactions/${id}/void`).then(r => r.data.data),
};
