import { apiClient } from './client';
import { toWebP } from '../lib/image';

// Categoría de la foto: string libre, personalizable por consultorio.
export type PhotoType = string;

// Defaults cuando el consultorio no configuró categorías propias.
export const DEFAULT_PHOTO_CATEGORIES = ['Intraoral', 'Extraoral', 'Radiografía'];

// Referencia a una foto recién subida (para vincularla luego a un movimiento
// que todavía no existe cuando se abre el modal desde el formulario).
export interface UploadedPhotoRef {
  sessionId: string;
  photoId: string;
  url: string;
  type?: string;
  // Título/descripción que puso el usuario en el modal (viven en la sesión).
  title?: string;
  description?: string;
}

export interface GalleryPhoto {
  _id: string;
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  type: PhotoType;
  caption?: string;
  description?: string;
  transactionId?: string;
  toothNumber?: number;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface GallerySession {
  _id: string;
  patientId: string;
  title: string;
  notes?: string;
  photos: GalleryPhoto[];
  createdAt: string;
  updatedAt: string;
}

// Signed params for direct browser → Cloudinary upload. The backend hashes
// these with the API secret so the secret never reaches the client.
export interface CloudinaryUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export const galleryApi = {
  listSessions: (patientId: string) =>
    apiClient
      .get<{ data: GallerySession[] }>(`/patients/${patientId}/gallery/sessions`)
      .then(r => r.data.data),

  createSession: (patientId: string, dto: { title: string; notes?: string }) =>
    apiClient
      .post<{ data: GallerySession }>(`/patients/${patientId}/gallery/sessions`, dto)
      .then(r => r.data.data),

  updateSession: (
    patientId: string,
    sessionId: string,
    dto: { title?: string; notes?: string },
  ) =>
    apiClient
      .patch<{ data: GallerySession }>(
        `/patients/${patientId}/gallery/sessions/${sessionId}`,
        dto,
      )
      .then(r => r.data.data),

  deleteSession: (patientId: string, sessionId: string) =>
    apiClient.delete(`/patients/${patientId}/gallery/sessions/${sessionId}`),

  updatePhoto: (
    patientId: string,
    sessionId: string,
    photoId: string,
    dto: { type?: PhotoType; caption?: string; description?: string; transactionId?: string },
  ) =>
    apiClient
      .patch<{ data: GallerySession }>(
        `/patients/${patientId}/gallery/sessions/${sessionId}/photos/${photoId}`,
        dto,
      )
      .then(r => r.data.data),

  addPhoto: (
    patientId: string,
    sessionId: string,
    photo: {
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      type?: PhotoType;
      caption?: string;
      description?: string;
      transactionId?: string;
    },
  ) =>
    apiClient
      .post<{ data: GallerySession }>(
        `/patients/${patientId}/gallery/sessions/${sessionId}/photos`,
        photo,
      )
      .then(r => r.data.data),

  removePhoto: (patientId: string, sessionId: string, photoId: string) =>
    apiClient.delete(
      `/patients/${patientId}/gallery/sessions/${sessionId}/photos/${photoId}`,
    ),

  getUploadParams: (patientId: string) =>
    apiClient
      .get<{ data: CloudinaryUploadParams }>(
        `/patients/${patientId}/gallery/upload-params`,
      )
      .then(r => r.data.data),

  // Uploads a single file directly to Cloudinary using signed params. The
  // browser hits Cloudinary, not our backend — keeps our server out of the
  // file path so big uploads don't tie up Nest.
  uploadToCloudinary: async (
    file: File,
    params: CloudinaryUploadParams,
    onProgress?: (pct: number) => void,
  ): Promise<CloudinaryUploadResult> => {
    // Convertimos a WebP (con reescala) antes de subir: mejor calidad/peso y
    // menos storage. Cae al original si el navegador no puede (HEIC, etc.).
    const toSend = await toWebP(file);
    const formData = new FormData();
    formData.append('file', toSend);
    formData.append('api_key', params.apiKey);
    formData.append('timestamp', String(params.timestamp));
    formData.append('folder', params.folder);
    formData.append('signature', params.signature);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
      );
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResult);
        } else {
          reject(new Error(`Cloudinary upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Cloudinary upload network error'));
      xhr.send(formData);
    });
  },
};

// Build a Cloudinary thumbnail URL from a public id — used everywhere instead
// of storing the thumb URL twice. 400px wide, auto format/quality.
export function thumbUrl(publicId: string, cloudName: string, size = 400): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/${publicId}`;
}

// Etiqueta legible de una categoría. Con categorías como string libre, la
// etiqueta es el valor mismo; mapeamos los valores legacy (enum viejo) a un
// nombre lindo por compatibilidad.
const LEGACY_LABELS: Record<string, string> = {
  INTRAORAL: 'Intraoral',
  EXTRAORAL: 'Extraoral',
  RADIOGRAFIA: 'Radiografía',
};
export function photoTypeLabel(t: string): string {
  return LEGACY_LABELS[t] ?? t;
}
