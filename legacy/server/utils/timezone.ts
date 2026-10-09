export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function toLocalString(dateOrMs: Date | number): string {
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  return d.toLocaleString('en-US', { timeZone: APP_TIMEZONE });
}

export function toLocalISOString(dateOrMs: Date | number): string {
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  const opts: Intl.DateTimeFormatOptions = { 
    timeZone: APP_TIMEZONE, 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit', 
    hour12: false 
  };
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(d);
  const m: any = {};
  parts.forEach(p => m[p.type] = p.value);
  // Re-format to match strict format
  // Note: timeZoneName isn't easily +07:00 cross platform, so hardcoded +07:00 is fine since Vietnam doesn't observe DST
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}+07:00`;
}
