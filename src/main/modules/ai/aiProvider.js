// @ts-check
const { createAIBackendClient } = require('./aiBackendClient');

/**
 * @param {{provider?: string, [key: string]: unknown}} [options]
 * @returns {{model: string, generateMatchAnalysis: function(object): Promise<object>, chatMatch: function(object, string): Promise<object>}}
 */
function createAIProvider(options = {}) {
  const provider = options.provider || 'backend';
  if (provider !== 'backend') {
    throw new Error(`Proveedor IA no soportado: ${provider}`);
  }
  return createAIBackendClient(options);
}

module.exports = {
  createAIProvider,
};
