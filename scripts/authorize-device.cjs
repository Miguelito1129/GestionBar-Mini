const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [requestPath, outputPath = 'license.json'] = process.argv.slice(2);
if (!requestPath) {
  console.error('Uso: npm run license:authorize -- solicitud.json [licencia.json]');
  process.exit(1);
}

const defaultKeyPath = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(),
  'GestionBar',
  'licensing',
  'private-key.pem',
);
const privateKeyPath = process.env.GESTIONBAR_LICENSE_PRIVATE_KEY || defaultKeyPath;

try {
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  if (request.version !== 1 || typeof request.machineId !== 'string' || !/^[a-f0-9]{64}$/.test(request.machineId)) {
    throw new Error('El archivo no contiene una solicitud válida de GestiónBar.');
  }
  const payload = {
    version: 1,
    machineId: request.machineId,
    issuedAt: new Date().toISOString(),
  };
  const signature = crypto.sign(
    null,
    Buffer.from(JSON.stringify(payload)),
    fs.readFileSync(privateKeyPath),
  ).toString('base64');
  fs.writeFileSync(outputPath, `${JSON.stringify({ ...payload, signature }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Licencia autorizada para el equipo ${request.deviceName || request.machineId}.`);
  console.log(`Archivo generado: ${path.resolve(outputPath)}`);
} catch (error) {
  console.error(`No se pudo generar la licencia: ${error.message}`);
  process.exit(1);
}
