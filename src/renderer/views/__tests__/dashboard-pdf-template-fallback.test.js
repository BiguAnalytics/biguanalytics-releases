import { describe, expect, it } from 'vitest';

import {
  getDefaultExportTemplateId,
  loadPdfTemplatesForExport,
} from '../dashboard.js';

describe('dashboard PDF template fallback', () => {
  it('uses system-default when the pdfTemplates IPC handler is unavailable', async () => {
    const templates = await loadPdfTemplatesForExport({
      pdfTemplates: {
        list: async () => {
          throw new Error("No handler registered for 'pdfTemplates:list'");
        },
      },
    });

    expect(templates).toEqual([{
      id: 'system-default',
      name: 'Default BiguAnalytics',
      isSystem: true,
      isDefault: true,
    }]);
    expect(getDefaultExportTemplateId(templates)).toBe('system-default');
  });

  it('ignores corrupt or invalid defaults when selecting the export template', () => {
    expect(getDefaultExportTemplateId([
      { id: 'custom-invalid', isDefault: true, invalid: true },
      { id: 'custom-corrupt', isDefault: true, corrupt: true },
    ])).toBe('system-default');
  });
});
