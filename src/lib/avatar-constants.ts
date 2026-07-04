export const AVATAR_ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

// The bucket's own file_size_limit (set via migration) is the authoritative
// enforcement, since uploads bypass this server entirely. This is only a
// fast client-side pre-check to avoid an unnecessary round trip.
export const AVATAR_MAX_FILE_BYTES = 5 * 1024 * 1024;
