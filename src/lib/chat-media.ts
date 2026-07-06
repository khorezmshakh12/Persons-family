// The bucket's own file_size_limit (set via migration) is the authoritative
// enforcement, since uploads bypass this server entirely. This constant is
// only a fast client-side pre-check to avoid an unnecessary round trip.
export const CHAT_MEDIA_MAX_FILE_BYTES = 50 * 1024 * 1024;

export type ChatMediaType = 'image' | 'video' | 'voice' | 'none';

export function mediaTypeForMime(mime: string): ChatMediaType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'voice';
  return 'none';
}
