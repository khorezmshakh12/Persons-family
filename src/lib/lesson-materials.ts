// Any file type is accepted (images, videos, PDFs, docs, ...) — the bucket's
// own file_size_limit (set via migration) is the authoritative enforcement
// for size, since uploads bypass this server entirely. This constant is
// only a fast client-side pre-check to avoid an unnecessary round trip.
export const LESSON_MATERIAL_MAX_FILE_BYTES = 50 * 1024 * 1024;

export type LessonAttachment = {
  path: string;
  name: string;
  type: string;
  size: number;
};
