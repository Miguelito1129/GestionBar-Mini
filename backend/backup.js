const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');
const { db, dataDir, instanceId } = require('./db');

const DEFAULT_INTERVAL_MINUTES = 15;
const MAX_BACKUPS = 96;
const BACKUP_FILENAME = /^gestionbar-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}\.sqlite$/;
let backupTimer;
let backupInProgress = false;

function getOneDriveRoot(environment = process.env) {
  const root = environment.OneDriveCommercial
    || environment.OneDrive
    || environment.OneDriveConsumer;
  return root && path.isAbsolute(root) ? root : null;
}

function assertDatabaseHealthy(database, description) {
  const result = database.prepare('PRAGMA integrity_check').get();
  if (result?.integrity_check !== 'ok') {
    throw new Error(`${description} no pasó la verificación de integridad de SQLite.`);
  }
}

function removeTemporaryFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    console.error(`No fue posible limpiar el archivo temporal ${filePath}:`, error);
  }
}

function pruneBackups(directory) {
  const backups = fs.readdirSync(directory)
    .filter(name => BACKUP_FILENAME.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(MAX_BACKUPS)) {
    fs.rmSync(path.join(directory, name));
  }
}

async function createBackupSnapshot({
  sourceDb = db,
  sourcePath = path.join(dataDir, 'gestionbar.sqlite'),
  localBackupDir = path.join(dataDir, 'backups'),
  oneDriveRoot = getOneDriveRoot(),
  now = new Date(),
} = {}) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No se encontró la base de datos en ${sourcePath}.`);
  }

  assertDatabaseHealthy(sourceDb, 'La base de datos activa');
  fs.mkdirSync(localBackupDir, { recursive: true });

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `gestionbar-${timestamp}-${crypto.randomBytes(4).toString('hex')}.sqlite`;
  const localPath = path.join(localBackupDir, filename);
  const temporaryLocalPath = `${localPath}.tmp`;

  try {
    await backup(sourceDb, temporaryLocalPath);
    const snapshot = new DatabaseSync(temporaryLocalPath, { readOnly: true });
    try {
      assertDatabaseHealthy(snapshot, 'El respaldo local');
    } finally {
      snapshot.close();
    }
    fs.renameSync(temporaryLocalPath, localPath);
  } catch (error) {
    removeTemporaryFile(temporaryLocalPath);
    throw new Error(`No fue posible crear el respaldo local de la base de datos: ${error.message}`);
  }

  let oneDrivePath = null;
  if (oneDriveRoot) {
    const oneDriveBackupDir = path.join(oneDriveRoot, 'GestionBar', 'Backups', instanceId);
    const oneDrivePathCandidate = path.join(oneDriveBackupDir, filename);
    const temporaryOneDrivePath = `${oneDrivePathCandidate}.tmp`;
    try {
      fs.mkdirSync(oneDriveBackupDir, { recursive: true });
      fs.copyFileSync(localPath, temporaryOneDrivePath, fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporaryOneDrivePath, oneDrivePathCandidate);
      oneDrivePath = oneDrivePathCandidate;
    } catch (error) {
      removeTemporaryFile(temporaryOneDrivePath);
      console.error('No fue posible copiar el respaldo a OneDrive; se conserva la copia local:', error);
    }
  }

  try {
    pruneBackups(localBackupDir);
  } catch (error) {
    console.error('No fue posible depurar los respaldos locales antiguos:', error);
  }
  if (oneDrivePath) {
    try {
      pruneBackups(path.dirname(oneDrivePath));
    } catch (error) {
      console.error('No fue posible depurar los respaldos antiguos de OneDrive:', error);
    }
  }

  return { localPath, oneDrivePath };
}

async function runBackup() {
  if (backupInProgress) {
    console.warn('Se omitió un respaldo programado porque el anterior aún está en curso.');
    return;
  }
  backupInProgress = true;
  try {
    const result = await createBackupSnapshot();
    console.info(`Respaldo de SQLite creado: ${result.localPath}`);
    if (result.oneDrivePath) {
      console.info(`Copia para sincronización de OneDrive creada: ${result.oneDrivePath}`);
    } else {
      console.info('OneDrive no está configurado en este PC; se guardó el respaldo local.');
    }
  } catch (error) {
    console.error('Falló el respaldo automático de SQLite:', error);
  } finally {
    backupInProgress = false;
  }
}

function getBackupIntervalMs(value = process.env.GESTIONBAR_BACKUP_INTERVAL_MINUTES) {
  if (value === undefined || value === '') return DEFAULT_INTERVAL_MINUTES * 60 * 1000;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('GESTIONBAR_BACKUP_INTERVAL_MINUTES debe ser un número entero entre 1 y 1440.');
  }
  return minutes * 60 * 1000;
}

function startBackupScheduler() {
  if (backupTimer) return;
  const intervalMs = getBackupIntervalMs();
  void runBackup();
  backupTimer = setInterval(() => void runBackup(), intervalMs);
  backupTimer.unref();
  console.info(`Respaldo automático activado cada ${intervalMs / 60000} minutos (máximo ${MAX_BACKUPS} copias por destino).`);
}

module.exports = { createBackupSnapshot, getBackupIntervalMs, getOneDriveRoot, startBackupScheduler };
