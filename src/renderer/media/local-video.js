/**
 * @param {{localVideoExists?: (filePath: string) => Promise<unknown>}|null|undefined} mediaApi
 * @param {string|null|undefined} filePath
 * @returns {Promise<boolean>}
 */
export async function isLocalVideoAvailable(mediaApi, filePath) {
  if (typeof mediaApi?.localVideoExists !== 'function' || !String(filePath || '').trim()) return false;
  try {
    return Boolean(await mediaApi.localVideoExists(filePath));
  } catch {
    return false;
  }
}
