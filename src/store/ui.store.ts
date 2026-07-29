import { create } from 'zustand';

export type ModalKind = 'newAppointment' | 'newPatient' | 'registerPayment' | 'uploadPhotos';

export interface ModalProps {
  patientId?: string;
  defaultStart?: string;
  // Para subir fotos vinculadas a un movimiento (cuenta corriente).
  transactionId?: string;
  // Para subir fotos vinculadas a un trabajo (item del plan de tratamiento).
  treatmentItemId?: string;
  // Callback cuando el modal de fotos terminó de subir (para vincular después).
  onUploaded?: (
    refs: { sessionId: string; photoId: string; url: string; type?: string; title?: string; description?: string }[],
  ) => void;
}

export type ToastType = 'success' | 'error';

interface UIStore {
  modal: { kind: ModalKind; props: ModalProps } | null;
  toast: { msg: string; type: ToastType } | null;
  // Drawer del sidebar en mobile. Vive en el store para que el botón de menú
  // pueda ir en el header de cada página (y no en una tira aparte).
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  openModal: (kind: ModalKind, props?: ModalProps) => void;
  closeModal: () => void;
  showToast: (msg: string, type?: ToastType) => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>(set => ({
  modal: null,
  toast: null,
  sidebarOpen: false,
  setSidebarOpen: open => set({ sidebarOpen: open }),
  openModal: (kind, props = {}) => set({ modal: { kind, props } }),
  closeModal: () => set({ modal: null }),
  showToast: (msg, type = 'success') => set({ toast: { msg, type } }),
  clearToast: () => set({ toast: null }),
}));
