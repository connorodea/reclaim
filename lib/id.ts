/** Random asset identity in both HTTPS production and HTTP development previews. */
export function createAssetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `asset-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
