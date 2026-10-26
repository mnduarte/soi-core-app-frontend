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

/**
 * Lee un archivo de imagen y lo devuelve en base64 listo para mandarle a la
 * API de visión, reescalado si hace falta.
 *
 * El tope de 1500px no es por peso sino porque es más o menos lo que el modelo
 * usa: mandar una foto de 4000px no mejora la lectura, solo la encarece. Para
 * un odontograma, donde cada diente mide unos pocos píxeles, conviene que la
 * FOTO sea de cerca — agrandarla acá no agrega información que no esté.
 */
export async function fileToScaledBase64(file: File, maxEdge = 1500): Promise<{ data: string; mediaType: string }> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: dataUrl.split(',')[1] ?? '', mediaType: file.type || 'image/jpeg' };
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { data: out.split(',')[1] ?? '', mediaType: 'image/jpeg' };
}
