import { create } from 'zustand';

export type ModalKind = 'newAppointment' | 'newPatient' | 'registerPayment' | 'uploadPhotos';

export interface ModalProps {
  patientId?: string;
  defaultStart?: string;
}

export type ToastType = 'success' | 'error';

interface UIStore {
  modal: { kind: ModalKind; props: ModalProps } | null;
  toast: { msg: string; type: ToastType } | null;
  openModal: (kind: ModalKind, props?: ModalProps) => void;
  closeModal: () => void;
  showToast: (msg: string, type?: ToastType) => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>(set => ({
  modal: null,
  toast: null,
  openModal: (kind, props = {}) => set({ modal: { kind, props } }),
  closeModal: () => set({ modal: null }),
  showToast: (msg, type = 'success') => set({ toast: { msg, type } }),
  clearToast: () => set({ toast: null }),
}));
