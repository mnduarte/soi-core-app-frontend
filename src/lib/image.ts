// Convierte una imagen a WebP en el navegador (y la reescala si es enorme) antes
// de subirla a la nube: buena calidad, renderiza mejor y ocupa bastante menos.
// Si el navegador no puede decodificar el archivo (p.ej. HEIC de iPhone) o algo
// falla, devuelve el original sin romper la subida (Cloudinary lo procesa igual).
export async function toWebP(
  file: File,
  { maxEdge = 2400, quality = 0.9 }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const objectUrl = url;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = objectUrl;
    });

    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', quality));
    // Si no se pudo codificar a webp o quedó más grande que el original, original.
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
