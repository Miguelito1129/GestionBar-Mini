// PBKDF2-SHA256 — hashing de contraseñas en el cliente
// En producción migrar a auth server-side (Supabase Auth / JWT)

const APP_PEPPER = import.meta.env.VITE_APP_PEPPER || 'GESBAR_PROD_2024_X9mK';

export const genSalt = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

export const localHash = (value, rounds = 12000) => {
  let hash = 2166136261;
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i) + round;
      hash = Math.imul(hash, 16777619);
      hash >>>= 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
};

export const hashPwd = async (pwd, salt) => {
  if (!globalThis.crypto?.subtle) return localHash(`${salt}${APP_PEPPER}${pwd}`);
  const enc  = new TextEncoder();
  const key  = await globalThis.crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name:'PBKDF2', salt:enc.encode(salt + APP_PEPPER), iterations:100000, hash:'SHA-256' },
    key, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const verifyPwd = async (pwd, salt, hash, localHashValue = '') => {
  if (localHashValue && localHash(`${salt}${APP_PEPPER}${pwd}`) === localHashValue) return true;
  if ((await hashPwd(pwd, salt)) === hash) return true;
  return localHash(`${salt}${APP_PEPPER}${pwd}`) === hash;
};
