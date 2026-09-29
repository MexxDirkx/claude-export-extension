// Helpers common to every output format.

export const speakerLabel = (role) => (role === 'human' ? 'You' : 'Claude');

export const conversationUrl = (uuid) => `https://claude.ai/chat/${uuid}`;

export function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
