/**
 * Shared image and avatar helpers for onboarding and registration.
 */

export function createInitialsAvatarDataUri(
  nameOrInitials: string,
  bgStart = '#5865F2',
  bgEnd = '#4752C4'
): string {
  const safeText =
    nameOrInitials
      .trim()
      .replace(/^@/, '')
      .slice(0, 2)
      .toUpperCase() || 'BG';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bgStart}"/><stop offset="100%" stop-color="${bgEnd}"/></linearGradient></defs><rect width="256" height="256" rx="128" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="96" font-weight="800">${safeText}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function resizeImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Seleccioná un archivo de imagen válido.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('La imagen es muy pesada (máximo 5 MB).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo leer la imagen.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Formato de imagen no válido.'));
    image.src = rawDataUrl;
  });

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;

  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  const webp = canvas.toDataURL('image/webp', 0.85);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}
