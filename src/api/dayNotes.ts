import { apiClient } from './client';

export interface Priority {
  text: string;
  done: boolean;
}

export interface DayNote {
  _id?: string;
  day: string; // 'YYYY-MM-DD'
  notes?: string;
  priorities: Priority[];
}

export interface SaveDayNoteInput {
  day: string;
  notes?: string;
  priorities?: Priority[];
}

export const dayNotesApi = {
  get: (date: string) =>
    apiClient
      .get<{ data: DayNote }>('/day-notes', { params: { date } })
      .then(r => r.data.data),

  save: (input: SaveDayNoteInput) =>
    apiClient.put<{ data: DayNote }>('/day-notes', input).then(r => r.data.data),
};
