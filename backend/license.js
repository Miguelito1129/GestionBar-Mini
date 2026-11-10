const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { dataDir } = require('./db');

const OWNER_EMAIL = 'mdmm1100@gmail.com';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkD0NfVLJlmtJ/GdM/MQYOTI7ZYlkpgzF8ccbFYQ/YvQ=
-----END PUBLIC KEY-----`;
const licenseDir = process.pkg
  ? path.join(
    process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(),
    'GestionBar',
    'licensing',
  )
  : dataDir;
const LICENSE_PATH = path.join(licenseDir, 'license.json');
let machineId;

function getMachineId() {
  if (machineId) return machineId;
  if (process.platform !== 'win32') {
    throw new Error('La activación por equipo solo está habilitada para Windows.');
  }
  const output = execFileSync('reg.exe', [
    'query',
    'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
    '/v',
    'MachineGuid',
  ], { encoding: 'utf8', windowsHide: true });
  const match = output.match(/MachineGuid\s+REG_SZ\s+([^\s]+)/i);
  if (!match) throw new Error('Windows no devolvió el identificador único del equipo.');
  machineId = crypto.createHash('sha256').update(match[1].trim().toLowerCase()).digest('hex');
  return machineId;
}

function activationRequest() {
  return {
    version: 1,
    machineId: getMachineId(),
    deviceName: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
  };
}

function verifyLicense(license) {
  if (!license || license.version !== 1 || typeof license.signature !== 'string') return false;
  let currentMachineId;
  try {
    currentMachineId = getMachineId();
  } catch (error) {
    console.error('No fue posible identificar el equipo para validar la licencia:', error.message);
    return false;
  }
  if (license.machineId !== currentMachineId || !Number.isFinite(Date.parse(license.issuedAt))) return false;
  const payload = JSON.stringify({
    version: license.version,
    machineId: license.machineId,
    issuedAt: license.issuedAt,
  });
  try {
    return crypto.verify(
      null,
      Buffer.from(payload),
      PUBLIC_KEY,
      Buffer.from(license.signature, 'base64'),
    );
  } catch (error) {
    console.error('No fue posible verificar la firma de la licencia:', error.message);
    return false;
  }
}

function isLicensed() {
  if (!process.pkg) return true;
  try {
    return verifyLicense(JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.error('No fue posible leer la licencia local:', error.message);
    }
    return false;
  }
}

function saveLicense(license) {
  if (!verifyLicense(license)) throw new Error('La licencia no es válida para este equipo.');
  fs.mkdirSync(licenseDir, { recursive: true });
  const temporaryPath = `${LICENSE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(license, null, 2)}\n`, { flag: 'w' });
  fs.renameSync(temporaryPath, LICENSE_PATH);
}

module.exports = { OWNER_EMAIL, activationRequest, getMachineId, isLicensed, saveLicense };
