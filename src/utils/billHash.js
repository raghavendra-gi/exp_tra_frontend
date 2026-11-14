import { compressImage } from './fileUtils';

/*
 * Fingerprints (SHA-256) of bills, used to stop the same bill being submitted twice.
 * The backend computes its own fingerprint from the saved file and has the final say;
 * these are only for an instant warning while the form is being filled in.
 *
 * A freshly picked file is compressed exactly like it will be when the expense is saved
 * (ExpenseFormPage -> toStoredFile) before it is hashed, so both sides see the same bytes.
 */

const cache = new WeakMap();   // File / saved item -> hash (so a file is only read once)

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (buf) => toHex(await crypto.subtle.digest('SHA-256', buf));

/** crypto.subtle only exists on https:// and localhost. Without it the early check is skipped. */
export const canHash = () => typeof crypto !== 'undefined' && !!crypto.subtle;

/** Hash of a file the person just picked or photographed. */
export async function hashPicked(file) {
  if (cache.has(file)) return cache.get(file);
  const processed = await compressImage(file);
  const hash = await sha256(await processed.arrayBuffer());
  cache.set(file, hash);
  return hash;
}

/** Hash of an already saved attachment ({ dataUrl }), e.g. when editing a request. */
export async function hashStored(item) {
  if (cache.has(item)) return cache.get(item);
  const bin = atob(String(item.dataUrl).split(',')[1] || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hash = await sha256(bytes);
  cache.set(item, hash);
  return hash;
}

export const hashOf = (item) => (item?.dataUrl ? hashStored(item) : hashPicked(item));
