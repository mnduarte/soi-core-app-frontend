import { apiClient } from './client';

export type AppointmentStatus =
  | 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type FichaStatus = 'PENDING' | 'DONE';

export interface Appointment {
  _id: string;
  // Opcional: en la libreta puede ser un turno con solo un nombre suelto
  // (patientName) sin ficha vinculada todavía.
  patientId?: string;
  patientName?: string;
  professionalId?: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  ficha?: FichaStatus | null;
  title?: string;
  notes?: string;
  reminderSent: boolean;
}

export interface CreateAppointmentInput {
  patientId?: string;
  patientName?: string;
  startsAt: string;
  endsAt: string;
  title?: string;
  notes?: string;
  // Confirma apilar sobreturno en un horario ya ocupado (saltea el chequeo).
  allowOverlap?: boolean;
}

export const appointmentsApi = {
  findAll: (params: { from?: string; to?: string; patientId?: string }) =>
    apiClient.get<{ data: Appointment[] }>('/appointments', { params }).then(r => r.data.data),

  findById: (id: string) =>
    apiClient.get<{ data: Appointment }>(`/appointments/${id}`).then(r => r.data.data),

  create: (dto: CreateAppointmentInput) =>
    apiClient.post<{ data: Appointment }>('/appointments', dto).then(r => r.data.data),

  update: (id: string, dto: Partial<Appointment>) =>
    apiClient.patch<{ data: Appointment }>(`/appointments/${id}`, dto).then(r => r.data.data),

  // Status transition. The backend auto-clears/sets `ficha` based on the new
  // status (COMPLETED → PENDING, NO_SHOW/CANCELLED → null) unless `ficha` is
  // also passed in the body.
  updateStatus: (id: string, status: AppointmentStatus) =>
    apiClient
      .patch<{ data: Appointment }>(`/appointments/${id}`, { status })
      .then(r => r.data.data),

  setFicha: (id: string, ficha: FichaStatus | null) =>
    apiClient
      .patch<{ data: Appointment }>(`/appointments/${id}`, { ficha })
      .then(r => r.data.data),

  markReminderSent: (id: string) =>
    apiClient
      .patch<{ data: Appointment }>(`/appointments/${id}/reminder-sent`)
      .then(r => r.data.data),

  remove: (id: string) =>
    apiClient.delete(`/appointments/${id}`),

  // Borrado físico (turnos son datos de agenda: se borran de verdad).
  hardRemove: (id: string) =>
    apiClient.delete(`/appointments/${id}/hard`),
};
