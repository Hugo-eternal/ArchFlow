// Export failures; `code` maps to the i18n message `export.error.<code>`.
export class ExportError extends Error {
  constructor(readonly code: 'empty' | 'too-large' | 'image') {
    super(code);
    this.name = 'ExportError';
  }
}
