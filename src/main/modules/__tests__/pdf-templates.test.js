import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  BLOCK_TYPES,
  GRID_COLUMNS,
  SYSTEM_TEMPLATE_ID,
  createPdfTemplateRepository,
  sanitizeTemplateForStorage,
  validateTemplateLayout,
} = require('../pdf-templates.js');

function createSettingsRepository(defaultTemplateId = SYSTEM_TEMPLATE_ID) {
  const state = {
    pdfTemplates: { defaultTemplateId },
  };
  return {
    state,
    async get() {
      return state;
    },
    async update(partial) {
      Object.assign(state, {
        ...state,
        ...partial,
        pdfTemplates: {
          ...state.pdfTemplates,
          ...(partial.pdfTemplates || {}),
        },
      });
      return state;
    },
  };
}

async function createRepository() {
  const templatesPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bigu-pdf-templates-'));
  const settingsRepository = createSettingsRepository();
  let id = 0;
  return {
    templatesPath,
    settingsRepository,
    repo: createPdfTemplateRepository({
      templatesPath,
      settingsRepository,
      now: () => '2026-06-16T00:00:00.000Z',
      idFactory: () => `template-${++id}`,
    }),
  };
}

describe('pdf templates repository', () => {
  it('exposes the system default template without writing it to disk', async () => {
    const { repo, templatesPath } = await createRepository();
    const templates = await repo.list();

    expect(GRID_COLUMNS).toBe(12);
    expect(BLOCK_TYPES).toContain('score');
    expect(BLOCK_TYPES).toContain('text-block');
    expect(templates[0]).toMatchObject({
      id: SYSTEM_TEMPLATE_ID,
      name: 'Default BiguAnalytics',
      isSystem: true,
      isDefault: true,
    });
    expect(await fs.readdir(templatesPath)).toEqual([]);
  });

  it('creates, saves and loads a local template JSON file', async () => {
    const { repo, templatesPath } = await createRepository();

    const created = await repo.create({ name: 'Post partido' });
    const loaded = await repo.get(created.id);
    const files = await fs.readdir(templatesPath);

    expect(created).toMatchObject({
      id: 'template-1',
      name: 'Post partido',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
    });
    expect(loaded.id).toBe(created.id);
    expect(files).toEqual(['template-1.json']);
  });

  it('duplicates, deletes and resets the default template when needed', async () => {
    const { repo, settingsRepository } = await createRepository();
    const copy = await repo.duplicate(SYSTEM_TEMPLATE_ID, { name: 'Copia editable' });

    await repo.setDefault(copy.id);
    await repo.delete(copy.id);

    expect(copy.name).toBe('Copia editable');
    expect(settingsRepository.state.pdfTemplates.defaultTemplateId).toBe(SYSTEM_TEMPLATE_ID);
    await expect(repo.delete(SYSTEM_TEMPLATE_ID)).rejects.toThrow(/default/i);
  });

  it('falls back to the system default when a requested template is corrupt or missing', async () => {
    const { repo, templatesPath, settingsRepository } = await createRepository();
    await fs.mkdir(templatesPath, { recursive: true });
    await fs.writeFile(path.join(templatesPath, 'broken.json'), '{invalid-json', 'utf8');

    settingsRepository.state.pdfTemplates.defaultTemplateId = 'broken';
    const template = await repo.resolveForExport('broken');

    expect(template.id).toBe(SYSTEM_TEMPLATE_ID);
    expect(template.fallbackReason).toMatch(/fallback/i);
  });

  it('sanitizes secrets before saving template settings', () => {
    const sanitized = sanitizeTemplateForStorage({
      id: 'unsafe',
      name: 'Unsafe',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Page',
        blocks: [{
          id: 'block-1',
          type: 'text-block',
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          settings: {
            text: 'ok',
            apiKey: 'leak',
            nested: { refreshToken: 'leak', label: 'safe' },
          },
        }],
      }],
    });

    expect(JSON.stringify(sanitized)).not.toMatch(/leak|apiKey|refreshToken/i);
    expect(sanitized.pages[0].blocks[0].settings).toEqual({
      text: 'ok',
      nested: { label: 'safe' },
    });
  });

  it('marks out-of-page and overlapping blocks invalid', () => {
    const report = validateTemplateLayout({
      id: 'invalid',
      name: 'Invalid',
      version: 1,
      pageSize: 'A4',
      orientation: 'landscape',
      pages: [{
        id: 'page-1',
        title: 'Page',
        blocks: [
          { id: 'a', type: 'score', x: 0, y: 0, w: 6, h: 4 },
          { id: 'b', type: 'match-header', x: 5, y: 2, w: 6, h: 4 },
          { id: 'c', type: 'unknown', x: 0, y: 24, w: 3, h: 3 },
        ],
      }],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockId: 'b', code: 'overlap' }),
      expect.objectContaining({ blockId: 'c', code: 'unknown-block' }),
      expect.objectContaining({ blockId: 'c', code: 'out-of-page' }),
    ]));
  });

  it('imports and exports templates as JSON through main-side file operations', async () => {
    const { repo, templatesPath } = await createRepository();
    const created = await repo.create({ name: 'Portable' });
    const outputPath = path.join(templatesPath, 'portable-export.json');

    await repo.exportTemplate(created.id, { outputPath });
    await repo.delete(created.id);
    const imported = await repo.importTemplate({ inputPath: outputPath });

    expect(imported.id).not.toBe(created.id);
    expect(imported.name).toContain('Portable');
    expect((await repo.list()).some(template => template.id === imported.id)).toBe(true);
  });
});
