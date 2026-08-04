import { describe, expect, it } from 'vitest';

import { DEFAULT_EVENT_LABELS, getEventLabel, getEventLabels } from '../event-labels.js';

describe('configurable event labels', () => {
  it('merges configured built-in and custom labels over stable type identifiers', () => {
    const labels = getEventLabels({
      hotkeyLabels: { ruck: 'Pepe' },
      customHotkeys: [{ id: 'line-speed', label: 'Salida rapida' }],
    });

    expect(labels.ruck).toBe('Pepe');
    expect(labels.scrum).toBe(DEFAULT_EVENT_LABELS.scrum);
    expect(getEventLabel('ruck', labels)).toBe('Pepe');
    expect(getEventLabel('custom:line-speed', labels)).toBe('Salida rapida');
  });

  it('humanizes unknown event types without changing stored values', () => {
    expect(getEventLabel('new-event', {})).toBe('New Event');
  });
});
