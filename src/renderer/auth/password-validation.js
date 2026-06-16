// @ts-check

export const PASSWORD_REQUIREMENT_MESSAGES = {
  minLength: 'Usá al menos 8 caracteres.',
  uppercase: 'Incluí al menos una mayúscula.',
  lowercase: 'Incluí al menos una minúscula.',
  number: 'Incluí al menos un número.',
  noEdgeSpaces: 'No uses espacios al inicio o al final.',
  matches: 'Las contraseñas no coinciden.',
};

/**
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {{isValid: boolean, errors: Array<string>, requirements: {minLength: boolean, uppercase: boolean, lowercase: boolean, number: boolean, noEdgeSpaces: boolean, matches: boolean}}}
 */
export function validatePasswordForm(password, confirmPassword) {
  const value = String(password || '');
  const confirmation = String(confirmPassword || '');
  const requirements = {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    noEdgeSpaces: value === value.trim(),
    matches: value === confirmation,
  };
  const errors = Object.entries(requirements)
    .filter(([, passed]) => !passed)
    .map(([key]) => PASSWORD_REQUIREMENT_MESSAGES[key])
    .filter(Boolean);
  return {
    isValid: errors.length === 0,
    errors,
    requirements,
  };
}

/**
 * @param {string} password
 * @returns {{isValid: boolean, errors: Array<string>, requirements: ReturnType<typeof validatePasswordForm>['requirements']}}
 */
export function validatePasswordValue(password) {
  return validatePasswordForm(password, password);
}
