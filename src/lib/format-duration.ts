export function formatDuration(start: string, end: string | null, hourLabel = 'h', minuteLabel = 'm') {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}${hourLabel} ${minutes}${minuteLabel}`;
}
