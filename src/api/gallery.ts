import { apiClient } from './client';

export type PhotoType = 'INTRAORAL' | 'EXTRAORAL' | 'RADIOGRAFIA';

export interface GalleryPhoto {
  _id: string;
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  type: PhotoType;
  caption?: string;
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
    dto: { type?: PhotoType; caption?: string },
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
      type: PhotoType;
      caption?: string;
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
    const formData = new FormData();
    formData.append('file', file);
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

export const PHOTO_TYPE_LABEL: Record<PhotoType, string> = {
  INTRAORAL: 'Intraoral',
  EXTRAORAL: 'Extraoral',
  RADIOGRAFIA: 'Radiografía',
};
