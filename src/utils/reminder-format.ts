export function formatReminderWhen(triggerAt: number, now = Date.now()): string {
  const date = new Date(triggerAt);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const startOfDay = (value: number) => {
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  };
  const days = Math.round((startOfDay(triggerAt) - startOfDay(now)) / 86_400_000);
  if (days <= 0) {
    return time;
  }
  if (days === 1) {
    return `Tomorrow ${time}`;
  }
  const dateLabel = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${dateLabel} ${time}`;
}

export function formatPhotoAge(capturedAt: string, now = Date.now()): string {
  const time = new Date(capturedAt).getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}
