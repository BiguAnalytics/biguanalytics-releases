import { describe, expect, it, vi } from 'vitest';

import { createStartupTimer } from '../startup-timing.js';

describe('startup timing logger', () => {
  it('does not let a closed stdout pipe break startup logging', () => {
    const logger = {
      info: vi.fn(() => {
        const error = new Error('write EPIPE');
        error.code = 'EPIPE';
        throw error;
      }),
    };
    const timer = createStartupTimer({
      app: { isPackaged: false },
      logger,
    });

    expect(() => timer.mark('renderer:startup')).not.toThrow();
    expect(() => timer.mark('renderer:ready')).not.toThrow();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
