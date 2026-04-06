/**
 * Detect image MIME type from magic bytes only (do not trust file extension).
 * Returns IANA media type or null if not a supported image signature.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 3) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: GIF87a / GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // BMP: BM
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return "image/bmp";
  }

  // TIFF: II*\0 or MM\0*
  if (
    (buffer[0] === 0x49 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x2a &&
      buffer[3] === 0x00) ||
    (buffer[0] === 0x4d &&
      buffer[1] === 0x4d &&
      buffer[2] === 0x00 &&
      buffer[3] === 0x2a)
  ) {
    return "image/tiff";
  }

  // AVIF / HEIC: ....ftyp.... (avif|avis|heic|heix|mif1|msf1)
  if (buffer.length >= 12) {
    const t = buffer.toString("ascii", 4, 8);
    if (t === "ftyp") {
      const brand = buffer.toString("ascii", 8, 12).replace(/\0/g, "");
      if (
        brand.startsWith("avif") ||
        brand.startsWith("avis") ||
        brand.startsWith("heic") ||
        brand.startsWith("heix") ||
        brand.startsWith("mif1") ||
        brand.startsWith("msf1")
      ) {
        return brand.startsWith("hei") || brand.startsWith("mif") || brand.startsWith("msf")
          ? "image/heic"
          : "image/avif";
      }
    }
  }

  return null;
}
