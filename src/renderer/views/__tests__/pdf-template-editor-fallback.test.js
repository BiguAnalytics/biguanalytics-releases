import { describe, expect, it } from 'vitest';

import {
  getPdfTemplateManagerUnavailableMessage,
  loadPdfTemplateManagerState,
} from '../pdf-template-editor.js';

describe('PDF template editor IPC fallback', () => {
  it('shows system-default and marks the manager unavailable when pdfTemplates:list is not registered', async () => {
    const state = await loadPdfTemplateManagerState({
      pdfTemplates: {
        list: async () => {
          throw new Error("No handler registered for 'pdfTemplates:list'");
        },
      },
    });

    expect(state.available).toBe(false);
    expect(state.templates).toEqual([{
      id: 'system-default',
      name: 'Default BiguAnalytics',
      isSystem: true,
      isDefault: true,
      orientation: 'landscape',
      pages: [],
    }]);
    expect(state.message).toBe(getPdfTemplateManagerUnavailableMessage());
  });
});
