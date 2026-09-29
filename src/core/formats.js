// The output formats, in the order the popup lists them.
//
// Kept apart from export.js so the popup can render the format picker without
// pulling in the Markdown parser.

export const FORMATS = [
  { id: 'markdown', label: 'Markdown', ext: 'md', dir: 'markdown' },
  { id: 'text', label: 'Plain text', ext: 'txt', dir: 'text' },
  { id: 'html', label: 'HTML', ext: 'html', dir: 'html' },
  { id: 'json', label: 'Raw JSON', ext: 'json', dir: 'json' },
];
