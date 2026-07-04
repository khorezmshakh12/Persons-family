export const LESSON_PLAN_ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// The bucket's own file_size_limit (set via migration) is the authoritative
// enforcement, since uploads bypass this server entirely. This is only a
// fast client-side pre-check to avoid an unnecessary round trip.
export const LESSON_PLAN_MAX_FILE_BYTES = 45 * 1024 * 1024;
