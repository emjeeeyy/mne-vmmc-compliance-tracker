import { ALLOWED_MIME_TYPES, detectFileType } from './file-type';

function bufferFrom(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

describe('detectFileType', () => {
  it('detects a PDF from its %PDF magic bytes', () => {
    const buffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20)]);
    expect(detectFileType(buffer)).toBe('pdf');
  });

  it('detects a PNG from its 8-byte signature', () => {
    const buffer = bufferFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    expect(detectFileType(buffer)).toBe('png');
  });

  it('detects a JPEG from its SOI marker', () => {
    const buffer = bufferFrom([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0]);
    expect(detectFileType(buffer)).toBe('jpeg');
  });

  it('rejects an executable disguised with a .pdf-like extension (magic bytes are the source of truth)', () => {
    // MZ header — a Windows PE executable — regardless of what extension/mimetype the client claims.
    const buffer = bufferFrom([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(detectFileType(buffer)).toBeNull();
  });

  it('rejects plain text content', () => {
    const buffer = Buffer.from('just some plain text, not a real document');
    expect(detectFileType(buffer)).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a buffer too short to contain any known signature', () => {
    expect(detectFileType(bufferFrom([0x89, 0x50]))).toBeNull();
  });

  it('does not misidentify a PNG-length buffer with the wrong bytes', () => {
    const buffer = bufferFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00]); // last byte wrong
    expect(detectFileType(buffer)).toBeNull();
  });

  it('exposes the exact allow-listed mimetypes for every detected type', () => {
    expect(ALLOWED_MIME_TYPES).toEqual({
      pdf: 'application/pdf',
      png: 'image/png',
      jpeg: 'image/jpeg',
    });
  });
});
