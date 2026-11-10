// uid criptográfico — reemplaza Math.random().toString(36)
export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2,'0')).join('');
