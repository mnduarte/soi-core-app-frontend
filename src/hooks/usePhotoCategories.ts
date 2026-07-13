import { useQuery } from '@tanstack/react-query';
import { clinicsApi } from '../api/clinics';
import { DEFAULT_PHOTO_CATEGORIES } from '../api/gallery';

// Categorías de fotos configuradas por el consultorio (settings.photoCategories),
// con fallback a los defaults (Intraoral / Extraoral / Radiografía).
export function usePhotoCategories(): string[] {
  const { data } = useQuery({ queryKey: ['clinic-settings'], queryFn: clinicsApi.getSettings });
  const cats = data?.photoCategories;
  return cats && cats.length ? cats : DEFAULT_PHOTO_CATEGORIES;
}
