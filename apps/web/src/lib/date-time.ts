function parts(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    ...options
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatDateTime(value: string | Date, timeZone: string): string {
  const values = parts(value, timeZone, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${values.day}.${values.month}.${values.year} ${values.hour}:${values.minute}`;
}

export function formatMessageDate(value: string | Date, timeZone: string): string {
  const values = parts(value, timeZone, { day: '2-digit', month: 'long', year: 'numeric' });
  return `${values.day} ${values.month} ${values.year}`;
}

export function formatMessageTime(value: string | Date, timeZone: string): string {
  const values = parts(value, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${values.hour}:${values.minute}`;
}
