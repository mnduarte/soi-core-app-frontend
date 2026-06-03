import { create } from 'zustand';

export type ModalKind = 'newAppointment' | 'newPatient' | 'registerPayment' | 'uploadPhotos';

export interface ModalProps {
  patientId?: string;
  defaultStart?: string;
}

interface UIStore {
  modal: { kind: ModalKind; props: ModalProps } | null;
  toast: string | null;
  openModal: (kind: ModalKind, props?: ModalProps) => void;
  closeModal: () => void;
  showToast: (msg: string) => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>(set => ({
  modal: null,
  toast: null,
  openModal: (kind, props = {}) => set({ modal: { kind, props } }),
  closeModal: () => set({ modal: null }),
  showToast: msg => set({ toast: msg }),
  clearToast: () => set({ toast: null }),
}));
