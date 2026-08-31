/** the title slide renders 384px wide and exports at scale 4 */
export const SLIDE_IMAGE_WIDTH = 1536;

/** the magazine preview sits in a 480px column, doubled for hidpi screens */
export const PREVIEW_IMAGE_WIDTH = 960;

/** the email thumbnail renders 150px wide, doubled for hidpi screens */
export const EMAIL_IMAGE_WIDTH = 300;

/**
 * asks jetpack's photon cdn for an image at the width we actually display,
 * rather than the full-size original
 *
 * quality is not optional: photon serves webp to browsers that advertise it,
 * and without a quality it hands back a lossless conversion that comes out
 * larger than the png it replaced
 */
export function toSizedImage(src: string, width: number): string {
  if (!src) return src;

  // data uris come from the custom post uploader and aren't photon's to resize
  if (src.startsWith("data:")) return src;

  return `${src.split("?")[0]}?w=${width}&quality=80`;
}
