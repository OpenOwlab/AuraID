import { describe, it, expect } from "vitest";
import { sniffImageMime } from "./image-sniff";

describe("sniffImageMime", () => {
  it("detects PNG", () => {
    const header = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(sniffImageMime(header)).toBe("image/png");
  });

  it("detects JPEG", () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffImageMime(b)).toBe("image/jpeg");
  });

  it("detects GIF89a", () => {
    const b = Buffer.from(
      "GIF89a" + "\0".repeat(6),
      "ascii"
    );
    expect(sniffImageMime(b)).toBe("image/gif");
  });

  it("detects WebP", () => {
    const b = Buffer.alloc(12);
    b.write("RIFF", 0);
    b.write("WEBP", 8);
    expect(sniffImageMime(b)).toBe("image/webp");
  });

  it("returns null for random bytes", () => {
    const b = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(sniffImageMime(b)).toBeNull();
  });

  it("returns null for buffer shorter than 3 bytes", () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});
