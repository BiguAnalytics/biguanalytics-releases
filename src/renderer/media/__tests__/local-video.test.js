import { describe, expect, it, vi } from 'vitest';

import { isLocalVideoAvailable } from '../local-video.js';

describe('local video availability', () => {
  it('returns false when the secure IPC rejects an unauthorized path', async () => {
    const mediaApi = {
      localVideoExists: vi.fn().mockRejectedValue(new Error('Ruta de video no autorizada.')),
    };

    await expect(isLocalVideoAvailable(mediaApi, 'C:\\outside\\video.mp4')).resolves.toBe(false);
  });

  it('returns the IPC result for an authorized path', async () => {
    const mediaApi = { localVideoExists: vi.fn().mockResolvedValue(true) };

    await expect(isLocalVideoAvailable(mediaApi, 'C:\\allowed\\video.mp4')).resolves.toBe(true);
  });
});
