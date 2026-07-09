import { useUIStore } from '../../store/ui.store';
import { NewAppointmentModal } from './NewAppointmentModal';
import { NewPatientModal } from './NewPatientModal';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { UploadPhotosModal } from './UploadPhotosModal';

export function ModalHost() {
  const modal = useUIStore(s => s.modal);
  const closeModal = useUIStore(s => s.closeModal);

  return (
    <>
      <NewAppointmentModal
        open={modal?.kind === 'newAppointment'}
        onClose={closeModal}
        defaultPatientId={modal?.props?.patientId}
      />
      <NewPatientModal
        open={modal?.kind === 'newPatient'}
        onClose={closeModal}
        editPatientId={modal?.props?.patientId}
      />
      <RegisterPaymentModal
        open={modal?.kind === 'registerPayment'}
        onClose={closeModal}
        defaultPatientId={modal?.props?.patientId}
      />
      <UploadPhotosModal
        open={modal?.kind === 'uploadPhotos'}
        onClose={closeModal}
        defaultPatientId={modal?.props?.patientId}
      />
    </>
  );
}
