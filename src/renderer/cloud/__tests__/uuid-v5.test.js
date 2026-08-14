import { describe, expect, it } from 'vitest';
import { uuidv5 } from '../uuid-v5.js';

describe('renderer uuid v5 helper', () => {
  it('generates the same UUID v5 values as the existing uuid package', () => {
    const namespace = '9b7e7b87-33d0-4e08-8c9b-6d6f0d0f3a26';
    const vectors = [
      ['', 'ed6e5110-d781-5c4c-bf0d-852382ae7af3'],
      ['simple', 'bd6867b4-fc2c-5d9f-887d-f705fd77776c'],
      ['Detalle QA 🏉', '78cc7b58-d248-5347-bf40-4c5f4a03d4ed'],
      ['x'.repeat(100), 'f10ca860-94a6-5f30-ad8f-f6acda12e487'],
      [
        '11111111-1111-4111-8111-111111111111:evt-legacy-1',
        'a3cd7e94-9507-5e54-b1cd-1aef86f94884',
      ],
    ];

    for (const [value, expected] of vectors) {
      expect(uuidv5(value, namespace)).toBe(expected);
    }
  });
});
