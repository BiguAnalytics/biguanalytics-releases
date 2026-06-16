import { describe, expect, it } from 'vitest';

import { validatePasswordForm } from '../create-password-screen.js';

describe('create password screen validation', () => {
  it('accepts a password that satisfies every requirement', () => {
    expect(validatePasswordForm('Bigua2026', 'Bigua2026')).toEqual({
      isValid: true,
      errors: [],
      requirements: {
        minLength: true,
        uppercase: true,
        lowercase: true,
        number: true,
        noEdgeSpaces: true,
        matches: true,
      },
    });
  });

  it('rejects passwords shorter than eight characters', () => {
    expect(validatePasswordForm('Bigu1', 'Bigu1')).toMatchObject({
      isValid: false,
      requirements: { minLength: false },
    });
  });

  it('rejects passwords without uppercase letters', () => {
    expect(validatePasswordForm('bigua2026', 'bigua2026')).toMatchObject({
      isValid: false,
      requirements: { uppercase: false },
    });
  });

  it('rejects passwords without lowercase letters', () => {
    expect(validatePasswordForm('BIGUA2026', 'BIGUA2026')).toMatchObject({
      isValid: false,
      requirements: { lowercase: false },
    });
  });

  it('rejects passwords without numbers', () => {
    expect(validatePasswordForm('BiguAnalyst', 'BiguAnalyst')).toMatchObject({
      isValid: false,
      requirements: { number: false },
    });
  });

  it('rejects passwords with leading or trailing spaces', () => {
    const result = validatePasswordForm(' Bigua2026', ' Bigua2026');

    expect(result).toMatchObject({
      isValid: false,
      requirements: { noEdgeSpaces: false },
    });
    expect(result.errors).toContain('No uses espacios al inicio o al final.');
  });

  it('rejects mismatched confirmation', () => {
    const result = validatePasswordForm('Bigua2026', 'Bigua2027');

    expect(result).toMatchObject({
      isValid: false,
      requirements: { matches: false },
    });
    expect(result.errors).toContain('Las contraseñas no coinciden.');
  });
});
