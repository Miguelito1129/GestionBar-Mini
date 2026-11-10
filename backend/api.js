const express = require('express');
const { execFile } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const { db, encode, decode } = require('./db');
const { OWNER_EMAIL, activationRequest, isLicensed, saveLicense } = require('./license');

const router = express.Router();
const PRINTER_NAME = 'Printer001';
const PRINTER_PORT = process.env.PRINTER_PORT || 'COM3';
const PRINTER_BAUD_RATE = Number(process.env.PRINTER_BAUD_RATE || 9600);
let printQueue = Promise.resolve();
const allowedTables = new Set([
  'negocios', 'usuarios', 'staff', 'productos', 'promociones', 'planillas', 'transferencias', 'gastos', 'gastos_fijos', 'cxc', 'turnos',
  'comandas', 'comanda_items', 'pagos', 'movimientos_inventario', 'gastos_turno',
  'descorches', 'novedades', 'gastos_semanales', 'cierres_semanales',
]);
const operators = new Set(['eq', 'gte', 'lte', 'gt', 'lt']);
const ident = value => /^[a-z_][a-z0-9_]*$/i.test(value);
const APP_PEPPER = 'GESBAR_PROD_2024_X9mK';
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const failedLogins = new Map();

function localHash(value, rounds = 12000) {
  let hash = 2166136261;
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index) + round;
      hash = Math.imul(hash, 16777619);
      hash >>>= 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function secureEqual(value, expected) {
  const actualBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)')
    .run(crypto.createHash('sha256').update(token).digest('hex'), userId, expiresAt);
  return { token, expiresAt };
}

function publicUser(account) {
  return encode({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    negocios: account.negocios,
  });
}

function isMasterUser(user) {
  return String(user?.role || '').toLowerCase() === 'administrador'
    && String(user?.email || '').toLowerCase() === OWNER_EMAIL;
}

function validateUserFields({ name, email, role, negocios, password }, { requirePassword = false } = {}) {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = String(role || '').trim().toLowerCase();
  const validRoles = new Set(['gerente', 'barra', 'mesero', 'dueño', 'auxiliar', 'jefe', 'barra_fija', 'mesero_fijo']);

  if (!normalizedName || normalizedName.length > 120) {
    return { error: 'El nombre es obligatorio y debe tener máximo 120 caracteres.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return { error: 'Escribe un correo electrónico válido.' };
  }
  if (!validRoles.has(normalizedRole)) {
    return { error: 'Selecciona un rol válido para el usuario.' };
  }
  if (requirePassword && (typeof password !== 'string' || password.length < 8 || password.length > 256)) {
    return { error: 'La contraseña debe tener entre 8 y 256 caracteres.' };
  }
  if (!requirePassword && password !== undefined && password !== ''
    && (typeof password !== 'string' || password.length < 8 || password.length > 256)) {
    return { error: 'La contraseña debe tener entre 8 y 256 caracteres.' };
  }

  let normalizedBusinesses = negocios;
  if (normalizedRole === 'dueño' || normalizedRole === 'jefe' || normalizedBusinesses === 'all') {
    normalizedBusinesses = 'all';
  } else if (Array.isArray(normalizedBusinesses)) {
    if (normalizedBusinesses.some(id => typeof id !== 'string' || !id.trim())) {
      return { error: 'La lista de negocios asignados no es válida.' };
    }
    normalizedBusinesses = [...new Set(normalizedBusinesses)];
  } else {
    return { error: 'Selecciona los negocios asignados o elige todos los negocios.' };
  }

  if (Array.isArray(normalizedBusinesses) && normalizedBusinesses.length) {
    const placeholders = normalizedBusinesses.map(() => '?').join(', ');
    const found = db.prepare(`SELECT id FROM negocios WHERE id IN (${placeholders})`)
      .all(...normalizedBusinesses).map(row => row.id);
    if (found.length !== normalizedBusinesses.length) {
      return { error: 'Uno o más negocios asignados ya no existen.' };
    }
  }

  return {
    value: {
      name: normalizedName,
      email: normalizedEmail,
      role: normalizedRole,
      negocios: normalizedBusinesses,
      password,
    },
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt + APP_PEPPER, 100000, 32, 'sha256').toString('hex');
  return { salt, passwordHash };
}

function isLocalRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

router.get('/license/status', (req, res) => {
  res.json({ authorized: isLicensed() });
});

router.get('/license/request', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: 'La solicitud de licencia solo se puede descargar desde el computador servidor.' });
  try {
    res.json(activationRequest());
  } catch (error) {
    console.error('No fue posible crear la solicitud de licencia:', error);
    res.status(500).json({ error: error.message || 'No fue posible identificar este computador.' });
  }
});

router.post('/license/install', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: 'La licencia solo se puede instalar desde el computador servidor.' });
  try {
    saveLicense(req.body);
    res.json({ ok: true });
  } catch (error) {
    console.error('No fue posible instalar la licencia del equipo:', error);
    res.status(400).json({ error: error.message || 'La licencia no es válida para este equipo.' });
  }
});

router.use((req, res, next) => {
  if (!isLicensed()) return res.status(423).json({ error: 'Este computador aún no está autorizado para usar GestiónBar.' });
  next();
});

router.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'El correo o la contraseña exceden el tamaño permitido.' });
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const attemptKey = `${ip}:${email}`;
  const attempt = failedLogins.get(attemptKey) || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.' });
  }
  const account = db.prepare(`
    SELECT id, name, email, role, negocios, password_hash, password_hash_local, salt
    FROM usuarios WHERE lower(email) = ?
  `).get(email);
  const expected = account?.password_hash_local;
  const supplied = account?.salt ? localHash(`${account.salt}${APP_PEPPER}${password}`) : '';
  const localMatches = Boolean(expected && secureEqual(supplied, expected));
  const hashMatches = Boolean(account?.salt && account?.password_hash && (
    secureEqual(crypto.pbkdf2Sync(password, account.salt + APP_PEPPER, 100000, 32, 'sha256').toString('hex'), account.password_hash)
    || secureEqual(supplied, account.password_hash)
  ));
  if (!account || !password || !(localMatches || hashMatches)) {
    const count = attempt.count + 1;
    failedLogins.set(attemptKey, {
      count,
      lockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
    });
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  failedLogins.delete(attemptKey);
  const session = createSession(account.id);
  res.json({
    ...session,
    user: publicUser(account),
  });
});

router.get('/setup/status', (req, res) => {
  const master = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(OWNER_EMAIL);
  res.json({ required: !master });
});

router.post('/setup/master', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: 'La cuenta maestra se debe configurar desde el computador servidor.' });
  const existingMaster = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(OWNER_EMAIL);
  if (existingMaster) return res.status(409).json({ error: 'La cuenta maestra ya está configurada.' });
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  if (!name || password.length < 12) {
    return res.status(400).json({ error: 'Escribe un nombre y una contraseña de al menos 12 caracteres.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt + APP_PEPPER, 100000, 32, 'sha256').toString('hex');
  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO usuarios (id, name, email, role, negocios, password_hash, salt)
      VALUES (?, ?, ?, 'administrador', 'all', ?, ?)
    `).run(id, name, OWNER_EMAIL, passwordHash, salt);
    const session = createSession(id);
    res.status(201).json({
      ...session,
      user: { id, name, email: OWNER_EMAIL, role: 'administrador', negocios: 'all' },
    });
  } catch (error) {
    console.error('No fue posible configurar la cuenta maestra:', error);
    res.status(500).json({ error: 'No fue posible crear la cuenta administradora maestra.' });
  }
});

router.use((req, res, next) => {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.negocios, s.expira_en
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ?
  `).get(tokenHash);
  if (!session || new Date(session.expira_en).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash);
    return res.status(401).json({ error: 'La sesión venció. Inicia sesión nuevamente.' });
  }
  req.authUser = session;
  next();
});

router.get('/auth/session', (req, res) => {
  res.json({
    user: publicUser(req.authUser),
    expiresAt: req.authUser.expira_en,
  });
});

router.post('/auth/logout', (req, res) => {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash);
  res.json({ ok: true });
});

router.post('/users', (req, res) => {
  if (!isMasterUser(req.authUser)) {
    return res.status(403).json({ error: 'Solo el administrador maestro puede administrar usuarios.' });
  }
  const validated = validateUserFields(req.body || {}, { requirePassword: true });
  if (validated.error) return res.status(400).json({ error: validated.error });
  if (validated.value.email === OWNER_EMAIL) {
    return res.status(409).json({ error: 'El correo reservado al administrador maestro no se puede usar para otro usuario.' });
  }
  const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(validated.value.email);
  if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });

  const { salt, passwordHash } = hashPassword(validated.value.password);
  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO usuarios (id, name, email, role, negocios, password_hash, salt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      validated.value.name,
      validated.value.email,
      validated.value.role,
      JSON.stringify(validated.value.negocios),
      passwordHash,
      salt,
    );
    res.status(201).json(publicUser({ id, ...validated.value }));
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }
    console.error('No fue posible crear el usuario:', error);
    res.status(500).json({ error: 'No fue posible guardar el usuario en SQLite.' });
  }
});

router.patch('/users/:id', (req, res) => {
  if (!isMasterUser(req.authUser)) {
    return res.status(403).json({ error: 'Solo el administrador maestro puede administrar usuarios.' });
  }
  const account = db.prepare('SELECT id, name, email, role, negocios FROM usuarios WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'No se encontró el usuario.' });

  const isMaster = String(account.email).toLowerCase() === OWNER_EMAIL;
  const changes = req.body || {};
  const fields = isMaster
    ? { name: changes.name ?? account.name, email: account.email, role: account.role, negocios: account.negocios }
    : {
      name: changes.name ?? account.name,
      email: changes.email ?? account.email,
      role: changes.role ?? account.role,
      negocios: changes.negocios ?? decode({ negocios: account.negocios }).negocios,
    };
  if (isMaster && (changes.email !== undefined || changes.role !== undefined || changes.negocios !== undefined)) {
    return res.status(403).json({ error: 'El correo, el rol y los permisos del administrador maestro están protegidos.' });
  }
  const validated = validateUserFields({
    ...fields,
    role: isMaster ? 'gerente' : fields.role,
    password: changes.password,
  });
  if (validated.error) return res.status(400).json({ error: validated.error });
  if (!isMaster && validated.value.email === OWNER_EMAIL) {
    return res.status(409).json({ error: 'El correo reservado al administrador maestro no se puede asignar a otro usuario.' });
  }
  const duplicate = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ? AND id != ?')
    .get(validated.value.email, account.id);
  if (duplicate) return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });

  try {
    const updates = isMaster
      ? { name: validated.value.name }
      : {
        name: validated.value.name,
        email: validated.value.email,
        role: validated.value.role,
        negocios: JSON.stringify(validated.value.negocios),
      };
    if (validated.value.password) {
      const credentials = hashPassword(validated.value.password);
      updates.password_hash = credentials.passwordHash;
      updates.salt = credentials.salt;
    }
    const columns = Object.keys(updates);
    db.prepare(`UPDATE usuarios SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`)
      .run(...columns.map(column => updates[column]), account.id);
    const updated = db.prepare('SELECT id, name, email, role, negocios FROM usuarios WHERE id = ?').get(account.id);
    res.json(publicUser(updated));
  } catch (error) {
    console.error('No fue posible actualizar el usuario:', error);
    res.status(500).json({ error: 'No fue posible guardar los cambios del usuario en SQLite.' });
  }
});

function parseFilter(query) {
  return Object.entries(query).filter(([key]) => !['select', 'order', 'limit'].includes(key)).flatMap(([key, value]) => {
    const [operator, ...parts] = String(value).split('.');
    if (!ident(key) || !operators.has(operator) || !parts.length) return [];
    const parsed = parts.join('.');
    return { sql: `${key} ${operator === 'eq' ? '=' : operator === 'gte' ? '>=' : operator === 'lte' ? '<=' : operator === 'gt' ? '>' : '<'} ?`, value: parsed === 'true' ? 1 : parsed === 'false' ? 0 : parsed };
  });
}

function tableOrFail(req, res, next) {
  if (!allowedTables.has(req.params.table)) return res.status(404).json({ error: 'Tabla no disponible' });
  const role = String(req.authUser?.role || '').toLowerCase();
  const isMaster = role === 'administrador' && req.authUser?.email.toLowerCase() === OWNER_EMAIL;
  const isManager = isMaster || role === 'gerente';
  const method = req.method;
  const table = req.params.table;
  if (table === 'usuarios' && method !== 'GET' && !isMaster) {
    return res.status(403).json({ error: 'Solo el administrador maestro puede administrar usuarios.' });
  }
  if (table === 'negocios' && method !== 'GET' && !isMaster) {
    return res.status(403).json({ error: 'Solo el administrador maestro puede administrar negocios.' });
  }
  if (!isManager) {
    if (table === 'negocios' && method === 'GET') return next();
    const allowed = ['mesero', 'mesero_fijo'].includes(role)
      ? { GET: ['usuarios', 'productos', 'promociones', 'turnos', 'comandas', 'comanda_items', 'pagos'], POST: ['comandas', 'comanda_items'], PATCH: ['comandas', 'comanda_items', 'pagos'], DELETE: ['comanda_items'] }
      : ['barra', 'barra_fija'].includes(role)
        ? { GET: ['usuarios', 'productos', 'promociones', 'turnos', 'comandas', 'comanda_items', 'pagos'], POST: ['movimientos_inventario', 'gastos_turno', 'descorches', 'novedades'], PATCH: ['productos', 'turnos', 'comandas'], DELETE: [] }
        : ['dueño', 'jefe'].includes(role)
          ? { GET: ['productos', 'gastos'], POST: ['gastos'], PATCH: [], DELETE: ['gastos'] }
        : {};
    if (!allowed[method]?.includes(table)) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para realizar esta operación.' });
    }
  }
  if (['barra', 'barra_fija'].includes(role) && method === 'PATCH') {
    const columns = Object.keys(req.body || {});
    const allowedColumns = table === 'productos' ? ['stock']
      : table === 'turnos' ? ['meseros_ids']
        : table === 'comandas' ? ['estado', 'confirmado_en', 'despachado_en', 'actualizada_en']
          : [];
    if (columns.some(column => !allowedColumns.includes(column))) {
      return res.status(403).json({ error: 'La operación contiene campos fuera de los permisos de Barra.' });
    }
  }
  if (['mesero', 'mesero_fijo'].includes(role) && method === 'PATCH') {
    const columns = Object.keys(req.body || {});
    const allowedColumns = table === 'comandas'
      ? ['estado', 'actualizada_en', 'subtotal', 'descuento', 'total', 'mesa']
      : table === 'comanda_items' ? ['cantidad', 'descuento', 'precio_unitario']
        : table === 'pagos' ? ['verificado', 'referencia'] : [];
    if (columns.some(column => !allowedColumns.includes(column))) {
      return res.status(403).json({ error: 'La operación contiene campos fuera de los permisos de Mesero.' });
    }
  }
  next();
}

function rowsBelongToWaiter(table, rows, userId) {
  return rows.every(row => {
    if (table === 'comandas') return row.mesero_id === userId;
    if (table === 'comanda_items' || table === 'pagos') {
      if (!row.comanda_id) return false;
      const order = db.prepare('SELECT mesero_id FROM comandas WHERE id = ?').get(row.comanda_id);
      return order?.mesero_id === userId;
    }
    return false;
  });
}

function matchingRows(table, filters) {
  if (!filters.length) return [];
  return db.prepare(`SELECT * FROM ${table} WHERE ${filters.map(item => item.sql).join(' AND ')}`)
    .all(...filters.flatMap(item => item.values || [item.value]));
}

function accountBusinessIds(user) {
  const assigned = encode({ negocios: user?.negocios }).negocios;
  if (assigned === 'all') {
    return db.prepare('SELECT id FROM negocios').all().map(row => row.id);
  }
  if (!Array.isArray(assigned)) return [];
  return [...new Set(assigned.filter(id => typeof id === 'string'))]
    .filter(id => db.prepare('SELECT 1 FROM negocios WHERE id = ?').get(id));
}

function accessibleBusinessIds(user) {
  if (isMasterUser(user)) return null;
  const assignedIds = accountBusinessIds(user);
  const role = String(user?.role || '').toLowerCase();
  if (!['barra', 'barra_fija', 'mesero', 'mesero_fijo'].includes(role) || !assignedIds.length) {
    return assignedIds;
  }

  const assignedStoreIds = ['barra', 'barra_fija'].includes(role)
    ? assignedIds.filter(id => db.prepare("SELECT 1 FROM negocios WHERE id = ? AND tipo = 'tienda'").get(id))
    : [];
  const activeTurns = db.prepare(`
    SELECT negocio_id, barra_id, meseros_ids FROM turnos
    WHERE estado = 'abierto' AND negocio_id IN (${assignedIds.map(() => '?').join(', ')})
  `).all(...assignedIds);
  const authorized = activeTurns.filter(turno => {
    if (['barra', 'barra_fija'].includes(role)) return turno.barra_id === user.id;
    try {
      const waiters = JSON.parse(turno.meseros_ids || '[]');
      return Array.isArray(waiters) && waiters.some(id => String(id) === String(user.id));
    } catch (error) {
      console.error(`No fue posible leer los meseros autorizados del turno ${turno.negocio_id}:`, error);
      return false;
    }
  });
  return [...new Set([...assignedStoreIds, ...authorized.map(turno => turno.negocio_id)])];
}

function businessScope(table, user) {
  if (table === 'negocios' && !isMasterUser(user)) {
    const assignedBusinessIds = accountBusinessIds(user);
    if (!assignedBusinessIds.length) return { sql: '0 = 1', values: [] };
    return {
      sql: `id IN (${assignedBusinessIds.map(() => '?').join(', ')})`,
      values: assignedBusinessIds,
    };
  }

  const businessIds = accessibleBusinessIds(user);
  if (businessIds === null) return null;
  if (!businessIds.length) return { sql: '0 = 1', values: [] };

  const placeholders = businessIds.map(() => '?').join(', ');
  const scopeByTurn = `negocio_id IN (${placeholders})`;
  const role = String(user?.role || '').toLowerCase();
  const isWaiter = ['mesero', 'mesero_fijo'].includes(role);
  const isBar = ['barra', 'barra_fija'].includes(role);

  if (table === 'negocios') {
    return { sql: `id IN (${placeholders})`, values: businessIds };
  }
  if (['staff', 'productos', 'promociones', 'planillas', 'transferencias', 'gastos',
    'gastos_fijos', 'cxc', 'movimientos_inventario', 'gastos_semanales',
    'cierres_semanales'].includes(table)) {
    return { sql: `negocio_id IN (${placeholders})`, values: businessIds };
  }
  if (table === 'turnos') {
    return {
      sql: `negocio_id IN (${placeholders})${isBar ? ' AND barra_id = ?' : ''}`,
      values: isBar ? [...businessIds, user.id] : businessIds,
    };
  }
  if (table === 'comandas') {
    const turnConditions = [`negocio_id IN (${placeholders})`];
    const values = [...businessIds];
    if (isBar) {
      turnConditions.push('barra_id = ?');
      values.push(user.id);
    }
    const orderConditions = [`turno_id IN (SELECT id FROM turnos WHERE ${turnConditions.join(' AND ')})`];
    if (isWaiter) {
      orderConditions.push('mesero_id = ?');
      values.push(user.id);
    }
    return { sql: orderConditions.join(' AND '), values };
  }
  if (['comanda_items', 'pagos'].includes(table)) {
    const nestedConditions = [`t.${scopeByTurn}`];
    const values = [...businessIds];
    if (isWaiter) {
      nestedConditions.push('c.mesero_id = ?');
      values.push(user.id);
    } else if (isBar) {
      nestedConditions.push('t.barra_id = ?');
      values.push(user.id);
    }
    return {
      sql: `comanda_id IN (
        SELECT c.id FROM comandas c
        JOIN turnos t ON t.id = c.turno_id
        WHERE ${nestedConditions.join(' AND ')}
      )`,
      values,
    };
  }
  if (['gastos_turno', 'descorches'].includes(table)) {
    return { sql: `turno_id IN (SELECT id FROM turnos WHERE ${scopeByTurn})`, values: businessIds };
  }
  if (table === 'novedades') {
    return {
      sql: `(turno_id IN (SELECT id FROM turnos WHERE ${scopeByTurn})
        OR cierre_semanal_id IN (SELECT id FROM cierres_semanales WHERE negocio_id IN (${placeholders})))`,
      values: [...businessIds, ...businessIds],
    };
  }
  return { sql: '0 = 1', values: [] };
}

function canAccessStore(user, businessId) {
  const role = String(user?.role || '').toLowerCase();
  if (!['administrador', 'gerente', 'dueño', 'jefe', 'barra', 'barra_fija'].includes(role)) return false;
  const business = db.prepare("SELECT id FROM negocios WHERE id = ? AND tipo = 'tienda'").get(businessId);
  if (!business) return false;
  if (isMasterUser(user)) return true;
  return accessibleBusinessIds(user)?.some(id => String(id) === String(businessId)) || false;
}

function canManageStore(user, businessId) {
  const role = String(user?.role || '').toLowerCase();
  if (!['administrador', 'gerente', 'dueño', 'jefe'].includes(role)) return false;
  return canAccessStore(user, businessId);
}

function canManageBusiness(user, businessId) {
  const role = String(user?.role || '').toLowerCase();
  if (!['administrador', 'gerente', 'dueño', 'jefe'].includes(role)) return false;
  if (isMasterUser(user)) {
    return Boolean(db.prepare('SELECT 1 FROM negocios WHERE id = ?').get(businessId));
  }
  return accessibleBusinessIds(user)?.some(id => String(id) === String(businessId)) || false;
}

function canManageTables(user, businessId) {
  if (canManageBusiness(user, businessId)) return true;
  const role = String(user?.role || '').toLowerCase();
  return ['barra', 'barra_fija'].includes(role)
    && accountBusinessIds(user).some(id => String(id) === String(businessId));
}

router.get('/businesses/:businessId/tables', (req, res) => {
  const businessId = String(req.params.businessId || '');
  const accessibleIds = accessibleBusinessIds(req.authUser);
  if (!accessibleIds?.some(id => String(id) === businessId) && !canManageTables(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso a las mesas de este negocio.' });
  }
  try {
    return res.json(db.prepare(`
      SELECT id, negocio_id, nombre FROM mesas
      WHERE negocio_id = ?
      ORDER BY CAST(REPLACE(LOWER(nombre), 'mesa ', '') AS INTEGER), nombre COLLATE NOCASE
    `).all(businessId));
  } catch (error) {
    console.error(`No fue posible cargar las mesas del negocio ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar las mesas.' });
  }
});

router.post('/businesses/:businessId/tables', (req, res) => {
  const businessId = String(req.params.businessId || '');
  const quantity = Number(req.body?.cantidad);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
    return res.status(400).json({ error: 'Indica la cantidad total de mesas, entre 1 y 50.' });
  }
  if (!canManageTables(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes permiso para administrar las mesas de este negocio.' });
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    if (!canManageTables(req.authUser, businessId)) {
      throw new Error('El permiso para administrar las mesas ya no está disponible.');
    }
    const tableRows = db.prepare(
      'SELECT id, nombre FROM mesas WHERE negocio_id = ?'
    ).all(businessId);
    const numberedTables = tableRows.map(table => {
      const match = String(table.nombre).match(/^Mesa\s+(\d+)$/i);
      return match ? { ...table, number: Number(match[1]) } : null;
    }).filter(Boolean);
    if (numberedTables.length !== tableRows.length) {
      const conflict = new Error('Hay mesas con nombres no numerados. No se cambió la cantidad para evitar eliminar o desordenar mesas.');
      conflict.status = 409;
      throw conflict;
    }
    if (new Set(numberedTables.map(table => table.number)).size !== numberedTables.length) {
      const conflict = new Error('Hay números de mesa repetidos. Corrige la numeración antes de cambiar la cantidad.');
      conflict.status = 409;
      throw conflict;
    }
    const removedTables = numberedTables.filter(table => table.number > quantity);
    if (removedTables.length) {
      if (req.body?.confirmar_reduccion !== true) {
        const conflict = new Error('Confirma explícitamente la reducción de mesas antes de continuar.');
        conflict.status = 409;
        throw conflict;
      }
      const removedNames = removedTables.map(table => table.nombre);
      const openOrders = db.prepare(`
        SELECT DISTINCT c.mesa FROM comandas c
        JOIN turnos t ON t.id = c.turno_id
        WHERE t.negocio_id = ? AND t.estado = 'abierto'
          AND c.estado IN ('enviada', 'entregada_falta_pago')
          AND c.mesa IN (${removedNames.map(() => '?').join(', ')})
      `).all(businessId, ...removedNames);
      if (openOrders.length) {
        const conflict = new Error(
          `No se puede reducir la cantidad: ${openOrders.map(order => order.mesa).join(', ')} tiene comandas abiertas. Ciérralas antes de continuar.`,
        );
        conflict.status = 409;
        throw conflict;
      }
      db.prepare(`DELETE FROM mesas WHERE negocio_id = ? AND id IN (${removedTables.map(() => '?').join(', ')})`)
        .run(businessId, ...removedTables.map(table => table.id));
    }
    const existingNumbers = new Set(numberedTables
      .filter(table => table.number <= quantity)
      .map(table => table.number));
    const insert = db.prepare('INSERT INTO mesas (id, negocio_id, nombre) VALUES (?, ?, ?)');
    const createdTables = [];
    for (let number = 1; number <= quantity; number += 1) {
      if (existingNumbers.has(number)) continue;
      const name = `Mesa ${number}`;
      const table = { id: crypto.randomUUID(), negocio_id: businessId, nombre: name };
      insert.run(table.id, table.negocio_id, table.nombre);
      createdTables.push(table);
    }
    db.exec('COMMIT');
    const currentTables = db.prepare(`
      SELECT id, negocio_id, nombre FROM mesas
      WHERE negocio_id = ?
      ORDER BY CAST(REPLACE(LOWER(nombre), 'mesa ', '') AS INTEGER), nombre COLLATE NOCASE
    `).all(businessId);
    return res.json({
      mesas: currentTables,
      cantidad: quantity,
      total: currentTables.length,
      agregadas: createdTables.length,
      retiradas: removedTables.length,
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la creación de mesas:', rollbackError);
    }
    if (error.status === 409) return res.status(409).json({ error: error.message });
    console.error(`No fue posible crear una mesa para el negocio ${businessId}:`, error);
    return res.status(400).json({ error: error.message || 'No fue posible crear las mesas.' });
  }
});

function bogotaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function appointmentsEnabled(businessId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM negocios WHERE id = ? AND tipo = 'tienda' AND citas_habilitadas = 1
  `).get(businessId));
}

function canManageStorePersonnel(user, businessId) {
  const role = String(user?.role || '').toLowerCase();
  return canManageStore(user, businessId)
    || (['barra', 'barra_fija'].includes(role) && canAccessStore(user, businessId));
}

function formatAppointmentTime(value) {
  const time = String(value || '').slice(11, 16);
  return time ? time.replace(/^0/, '') : 'hora desconocida';
}

function localDateTimeKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function appointmentDurationMinutes(startsAt, endsAt) {
  const getWallClockMinutes = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute] = match.map(Number);
    return Date.UTC(year, month - 1, day, hour, minute) / 60000;
  };
  const start = getWallClockMinutes(startsAt);
  const end = getWallClockMinutes(endsAt);
  return start === null || end === null ? null : end - start;
}

function findPersonnelConflict(personId, startsAt, endsAt, exceptId = '') {
  const conflict = db.prepare(`
    SELECT id, tatuador, servicio, fecha_hora, fecha_fin
    FROM citas_tienda
    WHERE personal_id = ? AND estado = 'agendada'
      AND fecha_hora < ? AND fecha_fin > ?
      AND (? = '' OR id <> ?)
    ORDER BY fecha_hora
    LIMIT 1
  `).get(personId, endsAt, startsAt, exceptId, exceptId);
  if (!conflict) return null;
  return `${conflict.tatuador} está ocupada de ${formatAppointmentTime(conflict.fecha_hora)} hasta ${formatAppointmentTime(conflict.fecha_fin)} por la cita de ${conflict.servicio}.`;
}

router.get('/store/personnel', (req, res) => {
  const businessId = String(req.query.negocio_id || '');
  if (!businessId || !canManageStorePersonnel(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso al personal de esta tienda.' });
  }
  try {
    return res.json(db.prepare(`
      SELECT id, negocio_id, nombre, telefono, activo, creado_en
      FROM personal_tienda
      WHERE negocio_id = ? AND origen = 'manual'
      ORDER BY activo DESC, nombre COLLATE NOCASE
    `).all(businessId));
  } catch (error) {
    console.error(`No fue posible cargar el personal de la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar el personal.' });
  }
});

router.post('/store/personnel', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const name = String(req.body?.nombre || '').trim();
  const phone = String(req.body?.telefono || '').trim();
  if (!businessId || !name || name.length > 120 || phone.length > 40) {
    return res.status(400).json({ error: 'Escribe un nombre de hasta 120 caracteres y un teléfono de hasta 40 caracteres.' });
  }
  if (!canManageStorePersonnel(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes permiso para agregar personal a esta tienda.' });
  }
  if (db.prepare(`
    SELECT 1 FROM personal_tienda
    WHERE negocio_id = ? AND lower(nombre) = lower(?)
  `).get(businessId, name)) {
    return res.status(409).json({ error: 'Ya existe una persona con ese nombre en esta tienda.' });
  }
  const person = {
    id: crypto.randomUUID(),
    negocio_id: businessId,
    nombre: name,
    telefono: phone || null,
    origen: 'manual',
    activo: 1,
    creado_en: new Date().toISOString(),
  };
  try {
    db.prepare(`
      INSERT INTO personal_tienda (id, negocio_id, nombre, telefono, origen, activo, creado_en)
      VALUES (?, ?, ?, ?, 'manual', 1, ?)
    `).run(person.id, person.negocio_id, person.nombre, person.telefono, person.creado_en);
    return res.status(201).json(person);
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una persona con ese nombre en esta tienda.' });
    }
    console.error(`No fue posible agregar personal a la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible agregar a la persona.' });
  }
});

router.patch('/store/personnel/:personId', (req, res) => {
  const personId = String(req.params.personId || '');
  const active = req.body?.activo;
  if (!personId || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Indica si la persona estará activa.' });
  }
  try {
    const person = db.prepare("SELECT * FROM personal_tienda WHERE id = ? AND origen = 'manual'").get(personId);
    if (!person) return res.status(404).json({ error: 'No se encontró a la persona.' });
    if (!canManageStorePersonnel(req.authUser, person.negocio_id)) {
      return res.status(403).json({ error: 'No tienes permiso para modificar el personal de esta tienda.' });
    }
    if (!active) {
      const scheduledAppointment = db.prepare(`
        SELECT fecha_hora, fecha_fin FROM citas_tienda
        WHERE personal_id = ? AND estado = 'agendada'
          AND fecha_hora >= ?
        ORDER BY fecha_hora LIMIT 1
      `).get(personId, localDateTimeKey());
      if (scheduledAppointment) {
        return res.status(409).json({
          error: `${person.nombre} tiene una cita agendada de ${formatAppointmentTime(scheduledAppointment.fecha_hora)} hasta ${formatAppointmentTime(scheduledAppointment.fecha_fin)}. No se puede desactivar su perfil mientras tenga citas futuras.`,
        });
      }
    }
    db.prepare('UPDATE personal_tienda SET activo = ? WHERE id = ?').run(active ? 1 : 0, personId);
    return res.json({ ...person, activo: active ? 1 : 0 });
  } catch (error) {
    console.error(`No fue posible actualizar el personal ${personId}:`, error);
    return res.status(500).json({ error: 'No fue posible actualizar a la persona.' });
  }
});

router.post('/store/appointments/settings', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const enabled = req.body?.habilitadas;
  if (!businessId || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Indica el negocio y el estado del módulo de citas.' });
  }
  if (!canManageStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'Solo la gerencia puede configurar el módulo de citas.' });
  }
  try {
    const result = db.prepare(`
      UPDATE negocios SET citas_habilitadas = ? WHERE id = ? AND tipo = 'tienda'
    `).run(enabled ? 1 : 0, businessId);
    if (result.changes !== 1) return res.status(404).json({ error: 'No se encontró esta tienda.' });
    return res.json({ negocio_id: businessId, citas_habilitadas: enabled });
  } catch (error) {
    console.error(`No fue posible configurar las citas de la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible guardar la configuración de citas.' });
  }
});

router.get('/store/appointments', (req, res) => {
  const businessId = String(req.query.negocio_id || '');
  const from = String(req.query.desde || '');
  const to = String(req.query.hasta || '');
  if (!businessId || (from && !validDateKey(from)) || (to && !validDateKey(to)) || (from && to && from > to)) {
    return res.status(400).json({ error: 'Indica una tienda y un rango de fechas válido.' });
  }
  if (!canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso a las citas de esta tienda.' });
  }
  if (!appointmentsEnabled(businessId)) {
    return res.status(409).json({ error: 'El módulo de citas no está habilitado para esta tienda.' });
  }
  try {
    const filters = ['negocio_id = ?'];
    const values = [businessId];
    if (from) {
      filters.push("substr(fecha_hora, 1, 10) >= ?");
      values.push(from);
    }
    if (to) {
      filters.push("substr(fecha_hora, 1, 10) <= ?");
      values.push(to);
    }
    const appointments = db.prepare(`
      SELECT *
      FROM citas_tienda WHERE ${filters.join(' AND ')}
      ORDER BY fecha_hora DESC
    `).all(...values);
    const getPayments = db.prepare(`
      SELECT p.id, p.fecha, p.monto, p.medio_pago, p.registrado_por_nombre, p.creado_en
      FROM abonos_citas_tienda p
      JOIN citas_tienda payment_appointment ON payment_appointment.id = p.cita_id
      WHERE COALESCE(payment_appointment.linea_id, payment_appointment.id) = ?
      ORDER BY p.creado_en DESC
    `);
    const getPaidAmount = db.prepare(`
      SELECT COALESCE(SUM(p.monto), 0) AS monto_pagado
      FROM abonos_citas_tienda p
      JOIN citas_tienda payment_appointment ON payment_appointment.id = p.cita_id
      WHERE COALESCE(payment_appointment.linea_id, payment_appointment.id) = ?
    `);
    return res.json(appointments.map(appointment => {
      const lineId = appointment.linea_id || appointment.id;
      const paidAmount = Number(getPaidAmount.get(lineId).monto_pagado);
      const price = Number(appointment.precio_acordado);
      return {
        ...appointment,
        linea_id: lineId,
        precio_acordado: price,
        monto_pagado: paidAmount,
        saldo: Math.max(0, price - paidAmount),
        pagos: getPayments.all(lineId),
      };
    }));
  } catch (error) {
    console.error(`No fue posible consultar citas de la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar las citas.' });
  }
});

router.get('/store/appointment-payments/range', (req, res) => {
  const businessId = String(req.query.negocio_id || '');
  const from = String(req.query.desde || '');
  const to = String(req.query.hasta || '');
  if (!businessId || !validDateKey(from) || !validDateKey(to) || from > to) {
    return res.status(400).json({ error: 'Indica un negocio y un rango de fechas válido.' });
  }
  if (!canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso a los abonos de esta tienda.' });
  }
  if (!appointmentsEnabled(businessId)) return res.json([]);
  try {
    return res.json(db.prepare(`
      SELECT p.*, a.cliente_nombre, a.servicio, a.tatuador, a.precio_acordado
      FROM abonos_citas_tienda p
      JOIN citas_tienda a ON a.id = p.cita_id
      WHERE p.negocio_id = ? AND p.fecha BETWEEN ? AND ?
      ORDER BY p.fecha DESC, p.creado_en DESC
    `).all(businessId, from, to));
  } catch (error) {
    console.error(`No fue posible consultar abonos de la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar los abonos de las citas.' });
  }
});

router.post('/store/appointments', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const clientName = String(req.body?.cliente_nombre || '').trim();
  const clientId = String(req.body?.cliente_cedula || '').trim();
  const clientPhone = String(req.body?.cliente_telefono || '').trim();
  const personId = String(req.body?.personal_id || '');
  const service = String(req.body?.servicio || '').trim();
  const scheduledAt = String(req.body?.fecha_hora || '');
  const endsAt = String(req.body?.fecha_fin || '');
  const price = Number(req.body?.precio_acordado);
  const sourceAppointmentId = String(req.body?.cita_origen_id || '');
  const notes = String(req.body?.notas || '').trim();
  const initialPayment = Number(req.body?.abono_inicial || 0);
  const paymentMethod = String(req.body?.medio_pago || '');
  const validDateTime = value => {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
    return Boolean(match && validDateKey(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60);
  };
  if (!businessId || !clientName || clientName.length > 120 || clientId.length < 5 || clientId.length > 20 || clientPhone.length > 40
    || !personId || !service || service.length > 500
    || !validDateTime(scheduledAt) || !validDateTime(endsAt) || endsAt <= scheduledAt || !Number.isSafeInteger(price) || price < 1
    || !Number.isSafeInteger(initialPayment) || initialPayment < 0 || initialPayment > price
    || notes.length > 1000
    || (initialPayment > 0 && !['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod))) {
    return res.status(400).json({ error: 'Revisa cliente, cédula, profesional, inicio y fin, servicio, precio y abono inicial.' });
  }
  if (appointmentDurationMinutes(scheduledAt, endsAt) > 4 * 60) {
    return res.status(400).json({ error: 'Una cita no puede durar más de 4 horas.' });
  }
  if (!canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso para crear citas en esta tienda.' });
  }
  if (!appointmentsEnabled(businessId)) {
    return res.status(409).json({ error: 'El módulo de citas no está habilitado para esta tienda.' });
  }

  const appointmentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const paymentDate = bogotaDateKey();
  try {
    db.exec('BEGIN IMMEDIATE');
    const person = db.prepare(`
      SELECT id, nombre FROM personal_tienda
      WHERE id = ? AND negocio_id = ? AND activo = 1 AND origen = 'manual'
    `).get(personId, businessId);
    if (!person) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'Selecciona una persona activa de la sección Personal.' });
    }
    const conflictMessage = findPersonnelConflict(person.id, scheduledAt, endsAt);
    if (conflictMessage) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: `No se puede asignar la cita: ${conflictMessage}` });
    }
    const sourceAppointment = sourceAppointmentId ? db.prepare(`
      SELECT * FROM citas_tienda WHERE id = ?
    `).get(sourceAppointmentId) : null;
    if (sourceAppointmentId && (!sourceAppointment || sourceAppointment.negocio_id !== businessId)) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'No se encontró la cita de origen en esta tienda.' });
    }
    let lineId = appointmentId;
    let effectivePrice = price;
    if (sourceAppointment) {
      if (sourceAppointment.cliente_cedula && sourceAppointment.cliente_cedula !== clientId) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'La cédula debe coincidir con el cliente de la cita de origen.' });
      }
      lineId = sourceAppointment.linea_id || sourceAppointment.id;
      effectivePrice = Number(sourceAppointment.precio_acordado);
      if (Number(sourceAppointment.precio_acordado) !== price) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'El precio de una cita de seguimiento debe conservar el precio acordado de la línea.' });
      }
      const paidBefore = Number(db.prepare(`
        SELECT COALESCE(SUM(p.monto), 0) AS monto_pagado
        FROM abonos_citas_tienda p
        JOIN citas_tienda paid_appointment ON paid_appointment.id = p.cita_id
        WHERE COALESCE(paid_appointment.linea_id, paid_appointment.id) = ?
      `).get(lineId).monto_pagado);
      const balanceBefore = Math.max(0, effectivePrice - paidBefore);
      if (balanceBefore === 0 || initialPayment > balanceBefore) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: `El abono no puede superar el saldo pendiente de $${balanceBefore}.` });
      }
    }
    const appointment = db.prepare(`
      INSERT INTO citas_tienda (
        id, negocio_id, cliente_nombre, cliente_telefono, tatuador, personal_id,
        servicio, cliente_cedula, fecha_hora, fecha_fin, precio_acordado,
        linea_id, estado, notas, creado_por, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendada', ?, ?, ?)
    `);
    appointment.run(
      appointmentId, businessId, clientName, clientPhone || null, person.nombre, person.id,
      service, clientId, scheduledAt, endsAt, effectivePrice, lineId,
      notes || null, req.authUser.id, createdAt,
    );
    let payment = null;
    if (initialPayment > 0) {
      payment = {
        id: crypto.randomUUID(),
        negocio_id: businessId,
        cita_id: appointmentId,
        fecha: paymentDate,
        monto: initialPayment,
        medio_pago: paymentMethod,
        registrado_por: req.authUser.id,
        registrado_por_nombre: req.authUser.name || 'Usuario',
        creado_en: createdAt,
      };
      db.prepare(`
        INSERT INTO abonos_citas_tienda (
          id, negocio_id, cita_id, fecha, monto, medio_pago,
          registrado_por, registrado_por_nombre, creado_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payment.id, payment.negocio_id, payment.cita_id, payment.fecha, payment.monto,
        payment.medio_pago, payment.registrado_por, payment.registrado_por_nombre, payment.creado_en,
      );
    }
    const paidAmount = Number(db.prepare(`
      SELECT COALESCE(SUM(p.monto), 0) AS monto_pagado
      FROM abonos_citas_tienda p
      JOIN citas_tienda paid_appointment ON paid_appointment.id = p.cita_id
      WHERE COALESCE(paid_appointment.linea_id, paid_appointment.id) = ?
    `).get(lineId).monto_pagado);
    db.exec('COMMIT');
    return res.status(201).json({
      id: appointmentId,
      negocio_id: businessId,
      cliente_nombre: clientName,
      cliente_cedula: clientId,
      cliente_telefono: clientPhone || null,
      tatuador: person.nombre,
      personal_id: person.id,
      servicio: service,
      fecha_hora: scheduledAt,
      fecha_fin: endsAt,
      precio_acordado: effectivePrice,
      linea_id: lineId,
      estado: 'agendada',
      notas: notes || null,
      creado_por: req.authUser.id,
      creado_en: createdAt,
      monto_pagado: paidAmount,
      saldo: Math.max(0, effectivePrice - paidAmount),
      pagos: payment ? [payment] : [],
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la creación de la cita:', rollbackError);
    }
    console.error(`No fue posible crear una cita para la tienda ${businessId}:`, error);
    return res.status(500).json({ error: 'No fue posible guardar la cita.' });
  }
});

router.post('/store/appointments/:appointmentId/payments', (req, res) => {
  const appointmentId = String(req.params.appointmentId || '');
  const amount = Number(req.body?.monto);
  const paymentMethod = String(req.body?.medio_pago || '');
  if (!appointmentId || !Number.isSafeInteger(amount) || amount < 1
    || !['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Indica un abono entero mayor que cero y un medio de pago válido.' });
  }

  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const date = bogotaDateKey();
  try {
    db.exec('BEGIN IMMEDIATE');
    const appointment = db.prepare(`
      SELECT a.*,
        COALESCE((
          SELECT SUM(p.monto)
          FROM abonos_citas_tienda p
          JOIN citas_tienda paid_appointment ON paid_appointment.id = p.cita_id
          WHERE COALESCE(paid_appointment.linea_id, paid_appointment.id) = COALESCE(a.linea_id, a.id)
        ), 0) AS monto_pagado
      FROM citas_tienda a WHERE a.id = ?
    `).get(appointmentId);
    if (!appointment) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'No se encontró la cita.' });
    }
    if (!canAccessStore(req.authUser, appointment.negocio_id)) {
      db.exec('ROLLBACK');
      return res.status(403).json({ error: 'No tienes acceso para registrar abonos en esta tienda.' });
    }
    if (!appointmentsEnabled(appointment.negocio_id)) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'El módulo de citas no está habilitado para esta tienda.' });
    }
    if (appointment.estado === 'cancelada') {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'No se pueden registrar abonos para una cita cancelada.' });
    }
    const balance = Number(appointment.precio_acordado) - Number(appointment.monto_pagado);
    if (amount > balance) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: `El abono supera el saldo pendiente de $${balance}.` });
    }
    const payment = {
      id: paymentId,
      negocio_id: appointment.negocio_id,
      cita_id: appointmentId,
      fecha: date,
      monto: amount,
      medio_pago: paymentMethod,
      registrado_por: req.authUser.id,
      registrado_por_nombre: req.authUser.name || 'Usuario',
      creado_en: now,
    };
    db.prepare(`
      INSERT INTO abonos_citas_tienda (
        id, negocio_id, cita_id, fecha, monto, medio_pago,
        registrado_por, registrado_por_nombre, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.id, payment.negocio_id, payment.cita_id, payment.fecha, payment.monto,
      payment.medio_pago, payment.registrado_por, payment.registrado_por_nombre, payment.creado_en,
    );
    db.exec('COMMIT');
    return res.status(201).json({
      ...payment,
      monto_pagado: Number(appointment.monto_pagado) + amount,
      saldo: balance - amount,
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir el abono de cita:', rollbackError);
    }
    console.error(`No fue posible registrar un abono de cita ${appointmentId}:`, error);
    return res.status(500).json({ error: 'No fue posible registrar el abono.' });
  }
});

router.patch('/store/appointments/:appointmentId', (req, res) => {
  const appointmentId = String(req.params.appointmentId || '');
  const status = String(req.body?.estado || '');
  if (!appointmentId || !['agendada', 'completada', 'cancelada'].includes(status)) {
    return res.status(400).json({ error: 'Indica un estado válido para la cita.' });
  }
  try {
    const appointment = db.prepare('SELECT * FROM citas_tienda WHERE id = ?').get(appointmentId);
    if (!appointment) return res.status(404).json({ error: 'No se encontró la cita.' });
    if (!canAccessStore(req.authUser, appointment.negocio_id)) {
      return res.status(403).json({ error: 'No tienes acceso para actualizar esta cita.' });
    }
    if (!appointmentsEnabled(appointment.negocio_id)) {
      return res.status(409).json({ error: 'El módulo de citas no está habilitado para esta tienda.' });
    }
    if (status === 'agendada' && appointmentDurationMinutes(appointment.fecha_hora, appointment.fecha_fin) > 4 * 60) {
      return res.status(409).json({ error: 'No se puede reabrir la cita: su duración supera el máximo permitido de 4 horas.' });
    }
    if (status === 'agendada' && appointment.personal_id) {
      const conflictMessage = findPersonnelConflict(
        appointment.personal_id,
        appointment.fecha_hora,
        appointment.fecha_fin,
        appointment.id,
      );
      if (conflictMessage) {
        return res.status(409).json({ error: `No se puede reabrir la cita: ${conflictMessage}` });
      }
    }
    db.prepare('UPDATE citas_tienda SET estado = ?, actualizado_en = ? WHERE id = ?')
      .run(status, new Date().toISOString(), appointmentId);
    return res.json({ id: appointmentId, estado: status });
  } catch (error) {
    console.error(`No fue posible actualizar la cita ${appointmentId}:`, error);
    return res.status(500).json({ error: 'No fue posible actualizar la cita.' });
  }
});

router.get('/store/sales', (req, res) => {
  const businessId = String(req.query.negocio_id || '');
  const date = String(req.query.fecha || '');
  if (!businessId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Indica un negocio y una fecha válida (AAAA-MM-DD).' });
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'La fecha indicada no existe.' });
  }
  if (!canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso a las ventas de esta tienda.' });
  }

  try {
    const sales = db.prepare(`
      SELECT * FROM ventas_tienda
      WHERE negocio_id = ? AND fecha = ?
      ORDER BY consecutivo DESC
    `).all(businessId, date);
    const getItems = db.prepare(`
      SELECT producto_id, producto_nombre, cantidad, precio_unitario, total
      FROM venta_tienda_items
      WHERE venta_id = ?
      ORDER BY rowid
    `);
    return res.json(sales.map(sale => ({ ...sale, items: getItems.all(sale.id) })));
  } catch (error) {
    console.error(`No fue posible cargar las ventas de tienda ${businessId} del ${date}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar las ventas de esta fecha.' });
  }
});

router.get('/store/sales/range', (req, res) => {
  const businessId = String(req.query.negocio_id || '');
  const from = String(req.query.desde || '');
  const to = String(req.query.hasta || '');
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!businessId || !validDate(from) || !validDate(to) || from > to) {
    return res.status(400).json({ error: 'Indica un negocio y un rango de fechas válido.' });
  }
  const rangeDays = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
  if (rangeDays > 366) {
    return res.status(400).json({ error: 'El rango de consulta no puede superar 367 días.' });
  }
  if (!canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso a las ventas de esta tienda.' });
  }

  try {
    const sales = db.prepare(`
      SELECT * FROM ventas_tienda
      WHERE negocio_id = ? AND fecha BETWEEN ? AND ?
      ORDER BY fecha DESC, consecutivo DESC
    `).all(businessId, from, to);
    const getItems = db.prepare(`
      SELECT producto_id, producto_nombre, cantidad, precio_unitario, total
      FROM venta_tienda_items
      WHERE venta_id = ?
      ORDER BY rowid
    `);
    return res.json(sales.map(sale => ({ ...sale, items: getItems.all(sale.id) })));
  } catch (error) {
    console.error(`No fue posible cargar las ventas de tienda ${businessId} entre ${from} y ${to}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar las ventas de este período.' });
  }
});

router.post('/inventory/products', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const id = String(req.body?.id || '');
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.cat || '').trim();
  const price = Number(req.body?.price);
  const minimum = Number(req.body?.min ?? 0);
  if (!businessId || !id || !name || name.length > 120 || !category || category.length > 60
    || !Number.isSafeInteger(price) || price < 0
    || !Number.isSafeInteger(minimum) || minimum < 0) {
    return res.status(400).json({ error: 'Completa nombre y categoría; el precio y el mínimo deben ser números enteros válidos.' });
  }
  if (!canManageBusiness(req.authUser, businessId)) {
    return res.status(403).json({ error: 'Solo el gerente asignado puede crear productos para este negocio.' });
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    if (!canManageBusiness(req.authUser, businessId)) {
      throw new Error('El permiso para administrar este negocio ya no está disponible.');
    }
    const duplicate = db.prepare(`
      SELECT id FROM productos WHERE negocio_id = ? AND lower(name) = lower(?) LIMIT 1
    `).get(businessId, name);
    if (duplicate) {
      const conflict = new Error('Ya existe un producto con ese nombre en este negocio.');
      conflict.status = 409;
      throw conflict;
    }
    const sortOrder = Number(db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM productos WHERE negocio_id = ?
    `).get(businessId).next);
    db.prepare(`
      INSERT INTO productos (id, negocio_id, name, cat, price, stock, min, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, businessId, name, category, price, minimum, sortOrder);
    db.exec('COMMIT');
    return res.status(201).json({
      id, negocio_id: businessId, name, cat: category, price, stock: 0, min: minimum, sort_order: sortOrder,
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la creación del producto:', rollbackError);
    }
    console.error(`No fue posible crear un producto para el negocio ${businessId}:`, error);
    if (error.status === 409) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error.message || 'No fue posible crear el producto.' });
  }
});

router.post('/inventory/purchases', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const date = String(req.body?.fecha || '');
  const description = String(req.body?.descripcion || '').trim();
  const items = req.body?.items;
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!businessId || !validDate(date) || !Array.isArray(items) || !items.length
    || description.length > 160) {
    return res.status(400).json({ error: 'Indica una fecha y al menos un producto válido para el ingreso.' });
  }
  if (!canManageBusiness(req.authUser, businessId)) {
    return res.status(403).json({ error: 'Solo el gerente asignado puede registrar compras de inventario.' });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = String(item?.producto_id || '');
    const quantity = Number(item?.cantidad);
    const unitCost = Number(item?.precio_unitario);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1
      || !Number.isSafeInteger(unitCost) || unitCost < 1) {
      return res.status(400).json({ error: 'Cada producto requiere una cantidad y un costo unitario entero mayor que cero.' });
    }
    const current = quantities.get(productId) || { quantity: 0, unitCost };
    if (current.unitCost !== unitCost
      || !Number.isSafeInteger(current.quantity + quantity)) {
      return res.status(400).json({ error: 'Un producto no puede repetirse con costos distintos y las cantidades deben ser válidas.' });
    }
    quantities.set(productId, { quantity: current.quantity + quantity, unitCost });
  }

  const expenseId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE');
    if (!canManageBusiness(req.authUser, businessId)) {
      throw new Error('El permiso para administrar este negocio ya no está disponible.');
    }

    const products = [...quantities].map(([productId, purchase]) => {
      const product = db.prepare(`
        SELECT id, name, stock FROM productos WHERE id = ? AND negocio_id = ?
      `).get(productId, businessId);
      if (!product) throw new Error('Un producto seleccionado ya no pertenece a este negocio.');
      const nextStock = Number(product.stock) + purchase.quantity;
      const lineTotal = purchase.quantity * purchase.unitCost;
      if (!Number.isSafeInteger(nextStock) || !Number.isSafeInteger(lineTotal)) {
        throw new Error(`La cantidad o el costo de ${product.name} supera el límite permitido.`);
      }
      return { ...product, ...purchase, nextStock, lineTotal };
    });
    const total = products.reduce((sum, product) => sum + product.lineTotal, 0);
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new Error('El total de la compra supera el límite permitido.');
    }

    const purchaseDescription = [
      description || 'Compra de inventario',
      ...products.map(product => `${product.name}: ${product.quantity} × $${product.unitCost}`),
    ].join(' — ').slice(0, 500);
    db.prepare(`
      INSERT INTO gastos (id, negocio_id, fecha, "desc", monto, cat, procesado, tipo)
      VALUES (?, ?, ?, ?, ?, 'Insumos', 0, 'compra_inventario')
    `).run(expenseId, businessId, date, purchaseDescription, total);

    const updateStock = db.prepare(`
      UPDATE productos SET stock = ?, updated_at = ?
      WHERE id = ? AND negocio_id = ?
    `);
    const insertMovement = db.prepare(`
      INSERT INTO movimientos_inventario (
        id, negocio_id, turno_id, producto_id, tipo, cantidad, motivo,
        creado_por, created_at, gasto_id, precio_unitario, total
      ) VALUES (?, ?, NULL, ?, 'compra', ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const product of products) {
      if (updateStock.run(product.nextStock, now, product.id, businessId).changes !== 1) {
        throw new Error(`No fue posible actualizar las existencias de ${product.name}.`);
      }
      insertMovement.run(
        crypto.randomUUID(), businessId, product.id, product.quantity,
        `Compra: ${description || 'Ingreso de inventario'}`,
        req.authUser.id, now, expenseId, product.unitCost, product.lineTotal,
      );
    }
    db.exec('COMMIT');
    return res.status(201).json({
      gasto: {
        id: expenseId,
        negocio_id: businessId,
        fecha: date,
        desc: purchaseDescription,
        monto: total,
        cat: 'Insumos',
      },
      productos: products.map(product => ({
        id: product.id,
        stock: product.nextStock,
      })),
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir el ingreso de inventario:', rollbackError);
    }
    console.error(`No fue posible registrar la compra de inventario del negocio ${businessId}:`, error);
    return res.status(400).json({ error: error.message || 'No fue posible registrar la compra de inventario.' });
  }
});

router.put('/store/:businessId/inventory', (req, res) => {
  const businessId = String(req.params.businessId || '');
  const products = req.body?.products;
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'El inventario debe ser una lista de productos.' });
  }
  if (!canManageStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'Solo el gerente asignado puede administrar el inventario de esta tienda.' });
  }

  const normalizedProducts = [];
  const seenIds = new Set();
  for (const product of products) {
    const id = String(product?.id || '');
    const name = String(product?.name || '').trim();
    const category = String(product?.cat || '').trim();
    const price = Number(product?.price);
    const stock = Number(product?.stock);
    const minimum = Number(product?.min);
    const sortOrder = Number(product?.sort_order);
    if (!id || seenIds.has(id) || !name || !category
      || !Number.isSafeInteger(price) || price < 0
      || !Number.isSafeInteger(stock) || stock < 0
      || !Number.isSafeInteger(minimum) || minimum < 0
      || !Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      return res.status(400).json({ error: 'Hay productos con datos incompletos o cantidades inválidas.' });
    }
    seenIds.add(id);
    normalizedProducts.push({
      id, name, cat: category, price, stock, min: minimum,
      courtesy: product.courtesy === undefined ? null : product.courtesy,
      sort_order: sortOrder,
    });
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    if (!canManageStore(req.authUser, businessId)) {
      throw new Error('El permiso para administrar esta tienda ya no está disponible.');
    }
    const existingIds = db.prepare('SELECT id FROM productos WHERE negocio_id = ?').all(businessId).map(row => row.id);
    const findProductOwner = db.prepare('SELECT negocio_id FROM productos WHERE id = ?');
    for (const product of normalizedProducts) {
      const existing = findProductOwner.get(product.id);
      if (existing && String(existing.negocio_id) !== businessId) {
        const conflict = new Error('Un producto indicado pertenece a otro negocio.');
        conflict.status = 409;
        throw conflict;
      }
    }
    const upsert = db.prepare(`
      INSERT INTO productos (id, negocio_id, name, cat, price, stock, min, courtesy, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        cat = excluded.cat,
        price = excluded.price,
        stock = excluded.stock,
        min = excluded.min,
        courtesy = excluded.courtesy,
        sort_order = excluded.sort_order
    `);
    normalizedProducts.forEach(product => upsert.run(
      product.id, businessId, product.name, product.cat, product.price,
      product.stock, product.min, product.courtesy, product.sort_order,
    ));
    const removedIds = existingIds.filter(id => !seenIds.has(id));
    const removeProduct = db.prepare('DELETE FROM productos WHERE negocio_id = ? AND id = ?');
    removedIds.forEach(id => removeProduct.run(businessId, id));
    db.exec('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la actualización de inventario de tienda:', rollbackError);
    }
    console.error(`No fue posible guardar inventario de tienda ${businessId}:`, error);
    if (error.status === 409) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: 'No fue posible guardar los cambios de inventario.' });
  }
});

router.post('/store/sales', (req, res) => {
  const businessId = String(req.body?.negocio_id || '');
  const paymentMethod = String(req.body?.medio_pago || '');
  const items = req.body?.items;
  if (!businessId || !Array.isArray(items) || !items.length
    || !['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'El pedido debe incluir productos y un medio de pago válido.' });
  }
  if (!['barra', 'barra_fija'].includes(String(req.authUser?.role || '').toLowerCase())
    || !canAccessStore(req.authUser, businessId)) {
    return res.status(403).json({ error: 'No tienes acceso para vender en esta tienda.' });
  }

  const quantityByProduct = new Map();
  for (const item of items) {
    const productId = String(item?.producto_id || '');
    const quantity = Number(item?.cantidad);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'El pedido contiene un producto o una cantidad no válida.' });
    }
    quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
  }

  const date = bogotaDateKey();
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();
  try {
    db.exec('BEGIN IMMEDIATE');
    if (!['barra', 'barra_fija'].includes(String(req.authUser?.role || '').toLowerCase())
      || !canAccessStore(req.authUser, businessId)) {
      throw new Error('El negocio ya no está disponible para esta cuenta.');
    }
    const products = [...quantityByProduct].map(([productId, quantity]) => {
      const product = db.prepare(`
        SELECT id, name, price, stock
        FROM productos WHERE id = ? AND negocio_id = ?
      `).get(productId, businessId);
      if (!product) throw new Error('Un producto ya no pertenece a esta tienda.');
      if (Number(product.stock) < quantity) throw new Error(`Existencias insuficientes de ${product.name}.`);
      return { ...product, quantity, lineTotal: Number(product.price) * quantity };
    });
    const total = products.reduce((sum, product) => sum + product.lineTotal, 0);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('El total de la venta no es válido.');
    const consecutive = Number(db.prepare(`
      SELECT COALESCE(MAX(consecutivo), 0) + 1 AS next
      FROM ventas_tienda WHERE negocio_id = ? AND fecha = ?
    `).get(businessId, date).next);

    db.prepare(`
      INSERT INTO ventas_tienda (
        id, negocio_id, fecha, consecutivo, medio_pago, total, vendedor_id, vendedor_nombre, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleId, businessId, date, consecutive, paymentMethod, total,
      req.authUser.id, req.authUser.name || 'Vendedor', now,
    );
    const insertItem = db.prepare(`
      INSERT INTO venta_tienda_items (
        id, venta_id, producto_id, producto_nombre, cantidad, precio_unitario, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?');
    const insertMovement = db.prepare(`
      INSERT INTO movimientos_inventario (
        id, negocio_id, turno_id, producto_id, tipo, cantidad, motivo, creado_por, created_at
      ) VALUES (?, ?, NULL, ?, 'venta_tienda', ?, ?, ?, ?)
    `);
    for (const product of products) {
      insertItem.run(
        crypto.randomUUID(), saleId, product.id, product.name,
        product.quantity, Number(product.price), product.lineTotal,
      );
      if (updateStock.run(product.quantity, product.id, product.quantity).changes !== 1) {
        throw new Error(`Existencias insuficientes de ${product.name}.`);
      }
      insertMovement.run(
        crypto.randomUUID(), businessId, product.id, -product.quantity,
        `Venta de tienda #${consecutive}`, req.authUser.id, now,
      );
    }
    db.exec('COMMIT');
    return res.status(201).json({
      id: saleId,
      negocio_id: businessId,
      fecha: date,
      consecutivo: consecutive,
      medio_pago: paymentMethod,
      total,
      vendedor_id: req.authUser.id,
      vendedor_nombre: req.authUser.name || 'Vendedor',
      creado_en: now,
      items: products.map(product => ({
        producto_id: product.id,
        producto_nombre: product.name,
        cantidad: product.quantity,
        precio_unitario: Number(product.price),
        total: product.lineTotal,
      })),
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la venta de tienda:', rollbackError);
    }
    console.error(`No fue posible registrar una venta de tienda para ${businessId}:`, error);
    return res.status(409).json({ error: error.message || 'No fue posible registrar la venta.' });
  }
});

function referencedBusinessIds(table, row) {
  const businessIds = [];
  if (row.negocio_id !== undefined && row.negocio_id !== null) {
    businessIds.push(String(row.negocio_id));
  }
  if (table === 'negocios') businessIds.push(String(row.id || ''));

  if (row.turno_id) {
    const turn = db.prepare('SELECT negocio_id FROM turnos WHERE id = ?').get(row.turno_id);
    if (!turn) return null;
    businessIds.push(turn.negocio_id);
  }
  if (row.comanda_id) {
    const order = db.prepare(`
      SELECT t.negocio_id FROM comandas c
      JOIN turnos t ON t.id = c.turno_id
      WHERE c.id = ?
    `).get(row.comanda_id);
    if (!order) return null;
    businessIds.push(order.negocio_id);
  }
  if (row.cierre_semanal_id) {
    const closing = db.prepare('SELECT negocio_id FROM cierres_semanales WHERE id = ?').get(row.cierre_semanal_id);
    if (!closing) return null;
    businessIds.push(closing.negocio_id);
  }
  if (row.planilla_id) {
    const planilla = db.prepare('SELECT negocio_id FROM planillas WHERE id = ?').get(row.planilla_id);
    if (!planilla) return null;
    businessIds.push(planilla.negocio_id);
  }
  if (table === 'comandas' && row.turno_id && row.negocio_id) {
    const turn = db.prepare('SELECT negocio_id FROM turnos WHERE id = ?').get(row.turno_id);
    if (turn?.negocio_id !== row.negocio_id) return null;
  }
  return businessIds.length ? businessIds : null;
}

function rowIsInBusinessScope(table, row, user, accessibleIds = accessibleBusinessIds(user)) {
  if (isMasterUser(user)) return true;
  const permittedIds = new Set(accessibleIds);
  const referencedIds = referencedBusinessIds(table, row);
  return Boolean(referencedIds?.length
    && referencedIds.every(id => permittedIds.has(String(id)))
    && new Set(referencedIds.map(String)).size === 1);
}

function cleanReceiptText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function wrapReceiptText(value, width) {
  const words = cleanReceiptText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      line = '';
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function formatReceiptMoney(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString('es-CO')}`;
}

function buildComandaReceipt({ business, order, items, footer = 'COMPROBANTE INTERNO' }) {
  const width = 42;
  const lineBreak = '\r\n';
  const chunks = [];
  const command = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = value => {
    const lines = String(value ?? '').split(/\r\n|\r|\n/).map(cleanReceiptText);
    chunks.push(Buffer.from(lines.join(lineBreak), 'ascii'));
  };
  const line = value => {
    for (const part of wrapReceiptText(value, width)) text(`${part}${lineBreak}`);
  };
  const indentedLines = (value, indentation = '  ') => {
    const contentWidth = width - indentation.length;
    for (const part of wrapReceiptText(value, contentWidth)) {
      text(`${indentation}${part}${lineBreak}`);
    }
  };
  const centered = value => {
    for (const part of wrapReceiptText(value, width)) {
      text(`${part.padStart(Math.floor((width + part.length) / 2)).padEnd(width)}${lineBreak}`);
    }
  };
  const separator = character => text(`${character.repeat(width)}${lineBreak}`);
  const labeledLine = (label, value) => line(`${label}: ${value}`);
  chunks.push(Buffer.from([0x1b, 0x40]));
  command(0x1b, 0x4d, 0x00);
  command(0x1b, 0x21, 0x00);
  command(0x1b, 0x32);
  command(0x1b, 0x61, 1);
  command(0x1b, 0x45, 1);
  centered(business.name || 'NEGOCIO');
  command(0x1b, 0x45, 0);
  command(0x1b, 0x21, 0x00);
  if (business.tipo) centered(String(business.tipo).toUpperCase());
  centered('COMANDA');
  command(0x1b, 0x61, 0);
  separator('=');
  labeledLine('Comanda', `#${order.consecutivo || order.id.slice(0, 8)}`);
  labeledLine('Fecha', formatReceiptDate(order.pagado_en || order.pago_registrado_en || order.creado_en));
  labeledLine('Atendio', order.mesero_nombre || 'Mesero');
  separator('-');

  let discounts = 0;
  const tableWidth = width;
  const printableRows = items.map(item => {
    const quantity = Math.max(0, Number(item.cantidad) || 0);
    const unitPrice = Math.max(0, Number(item.precio_unitario) || 0);
    const discount = Math.max(0, Number(item.descuento) || 0);
    return {
      name: item.product_name || 'Producto',
      quantity,
      discount,
      total: Math.max(0, unitPrice * quantity - discount),
    };
  });
  const quantityColumnWidth = Math.max(6, ...printableRows.map(item => String(item.quantity).length));
  const totalColumnWidth = Math.max(12, ...printableRows.map(item => formatReceiptMoney(item.total).length));
  const productColumnWidth = tableWidth - 2 - quantityColumnWidth - totalColumnWidth;
  if (productColumnWidth < 12) {
    throw new Error('Los importes de la comanda exceden el ancho imprimible de la factura.');
  }
  command(0x1b, 0x4d, 0x00);
  text(`  ${'Producto'.padEnd(productColumnWidth)}${'Cant.'.padStart(quantityColumnWidth)}${'Total'.padStart(totalColumnWidth)}${lineBreak}`);
  text(`  ${'-'.repeat(productColumnWidth)}${'-'.repeat(quantityColumnWidth)}${'-'.repeat(totalColumnWidth)}${lineBreak}`);
  for (const item of printableRows) {
    discounts += item.discount;
    const nameLines = wrapReceiptText(item.name, productColumnWidth);
    nameLines.forEach((name, index) => {
      const quantityCell = index === 0 ? String(item.quantity).padStart(quantityColumnWidth) : ' '.repeat(quantityColumnWidth);
      const totalCell = index === 0 ? formatReceiptMoney(item.total).padStart(totalColumnWidth) : ' '.repeat(totalColumnWidth);
      text(`  ${name.padEnd(productColumnWidth)}${quantityCell}${totalCell}${lineBreak}`);
    });
    if (item.discount > 0) {
      indentedLines(`Descuento: -${formatReceiptMoney(item.discount)}`);
    }
  }

  separator('-');
  if (discounts > 0) labeledLine('Descuentos', `-${formatReceiptMoney(discounts)}`);
  labeledLine('Total', formatReceiptMoney(order.total));
  separator('=');
  command(0x1b, 0x61, 1);
  centered(footer);
  command(0x1b, 0x61, 0);
  command(0x1b, 0x64, 0x03);
  command(0x1d, 0x56, 0x00);
  return Buffer.concat(chunks);
}

function formatReceiptDate(value) {
  if (!value) return 'Sin fecha';
  const dateValue = String(value);
  const date = new Date(dateValue.includes('T') ? dateValue : `${dateValue.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return cleanReceiptText(dateValue);
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function sendToBluetoothPrinter(receipt) {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('La impresora Bluetooth configurada requiere que el backend se ejecute en Windows.'));
  }
  if (!/^COM\d+$/i.test(PRINTER_PORT) || !Number.isInteger(PRINTER_BAUD_RATE) || PRINTER_BAUD_RATE < 1200) {
    return Promise.reject(new Error('La configuración del puerto Bluetooth de la impresora no es válida.'));
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    '$port = New-Object System.IO.Ports.SerialPort',
    '$port.PortName = $env:GESTIONBAR_PRINTER_PORT',
    '$port.BaudRate = [int]$env:GESTIONBAR_PRINTER_BAUD_RATE',
    '$port.DataBits = 8',
    '$port.Parity = [System.IO.Ports.Parity]::None',
    '$port.StopBits = [System.IO.Ports.StopBits]::One',
    '$port.WriteTimeout = 10000',
    'try {',
    '  $port.Open()',
    '  $bytes = [Convert]::FromBase64String($env:GESTIONBAR_PRINTER_DATA)',
    '  $port.Write($bytes, 0, $bytes.Length)',
    '} finally {',
    '  if ($port.IsOpen) { $port.Close() }',
    '}',
  ].join('; ');

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      timeout: 20000,
      windowsHide: true,
      env: {
        ...process.env,
        GESTIONBAR_PRINTER_PORT: PRINTER_PORT,
        GESTIONBAR_PRINTER_BAUD_RATE: String(PRINTER_BAUD_RATE),
        GESTIONBAR_PRINTER_DATA: receipt.toString('base64'),
      },
    }, (error, stdout, stderr) => {
      if (error) {
        const details = String(stderr || stdout || error.message).trim();
        reject(new Error(details || 'No fue posible conectar con Printer001.'));
        return;
      }
      resolve();
    });
  });
}

function enqueueInvoice(receipt) {
  const job = printQueue.then(() => sendToBluetoothPrinter(receipt));
  printQueue = job.catch(error => {
    console.error(`Error de impresión en ${PRINTER_NAME}:`, error);
  });
  return job;
}

function orderTurnAuthorized(turno, user) {
  const role = String(user?.role || '').toLowerCase();
  if (['barra', 'barra_fija'].includes(role)) return turno?.barra_id === user.id;
  if (!['mesero', 'mesero_fijo'].includes(role) || !turno) return false;
  try {
    const waiterIds = JSON.parse(turno.meseros_ids || '[]');
    return Array.isArray(waiterIds)
      && waiterIds.some(id => String(id) === String(user.id));
  } catch (error) {
    console.error(`No fue posible validar meseros del turno ${turno.id}:`, error);
    throw new Error('No fue posible validar el acceso al turno.');
  }
}

function getOrCreateTableAccount(turnoId, tableName, openedAt) {
  let account = db.prepare(`
    SELECT id FROM cuentas_mesa
    WHERE turno_id = ? AND mesa = ? AND estado = 'abierta'
  `).get(turnoId, tableName);
  if (!account) {
    account = { id: crypto.randomUUID() };
    db.prepare(`
      INSERT INTO cuentas_mesa (id, turno_id, mesa, estado, abierta_en)
      VALUES (?, ?, ?, 'abierta', ?)
    `).run(account.id, turnoId, tableName, openedAt);
  }
  return account.id;
}

router.get('/table-accounts', (req, res) => {
  const turnoId = String(req.query.turno_id || '');
  const role = String(req.authUser?.role || '').toLowerCase();
  if (!turnoId || !['barra', 'barra_fija', 'mesero', 'mesero_fijo'].includes(role)) {
    return res.status(400).json({ error: 'Indica un turno válido para consultar las cuentas.' });
  }
  try {
    const turno = db.prepare(`
      SELECT id, meseros_ids, barra_id FROM turnos
      WHERE id = ? AND estado = 'abierto'
    `).get(turnoId);
    if (!turno || !orderTurnAuthorized(turno, req.authUser)) {
      return res.status(403).json({ error: 'No tienes autorización para consultar las cuentas de este turno.' });
    }
    return res.json(db.prepare(`
      SELECT a.id, a.turno_id, a.mesa, a.abierta_en,
        COUNT(c.id) AS pedidos,
        COALESCE(SUM(c.total), 0) AS total,
        COALESCE(SUM(CASE WHEN c.estado = 'enviada' THEN 1 ELSE 0 END), 0) AS pedidos_pendientes
      FROM cuentas_mesa a
      LEFT JOIN comandas c ON c.cuenta_mesa_id = a.id AND c.estado <> 'cancelada'
      WHERE a.turno_id = ? AND a.estado = 'abierta'
      GROUP BY a.id
      ORDER BY a.abierta_en
    `).all(turnoId));
  } catch (error) {
    console.error(`No fue posible consultar las cuentas del turno ${turnoId}:`, error);
    return res.status(500).json({ error: error.message || 'No fue posible consultar las cuentas abiertas.' });
  }
});

router.get('/table-accounts/:accountId/orders', (req, res) => {
  const accountId = String(req.params.accountId || '');
  const role = String(req.authUser?.role || '').toLowerCase();
  if (!accountId || !['barra', 'barra_fija', 'mesero', 'mesero_fijo'].includes(role)) {
    return res.status(400).json({ error: 'Indica una cuenta de mesa válida.' });
  }
  try {
    const account = db.prepare(`
      SELECT a.id, a.turno_id, a.mesa, a.estado,
        t.meseros_ids, t.barra_id
      FROM cuentas_mesa a JOIN turnos t ON t.id = a.turno_id
      WHERE a.id = ?
    `).get(accountId);
    if (!account || account.estado !== 'abierta') {
      return res.status(404).json({ error: 'La cuenta ya no está abierta o no existe.' });
    }
    const turno = db.prepare(`
      SELECT id, meseros_ids, barra_id FROM turnos
      WHERE id = ? AND estado = 'abierto'
    `).get(account.turno_id);
    if (!turno || !orderTurnAuthorized(turno, req.authUser)) {
      return res.status(403).json({ error: 'No tienes autorización para consultar esta cuenta.' });
    }
    const orders = db.prepare(`
      SELECT * FROM comandas
      WHERE cuenta_mesa_id = ? AND estado <> 'cancelada'
      ORDER BY creado_en, consecutivo
    `).all(accountId);
    return res.json({ id: account.id, mesa: account.mesa, pedidos: orders });
  } catch (error) {
    console.error(`No fue posible cargar los pedidos de la cuenta ${accountId}:`, error);
    return res.status(500).json({ error: 'No fue posible cargar los pedidos de esta cuenta.' });
  }
});

router.post('/table-accounts/:accountId/close', (req, res) => {
  const accountId = String(req.params.accountId || '');
  const paymentMethod = String(req.body?.medio_pago || '');
  if (!accountId || !['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Selecciona un medio de pago válido para cerrar la cuenta.' });
  }
  const role = String(req.authUser?.role || '').toLowerCase();
  if (!['barra', 'barra_fija', 'mesero', 'mesero_fijo'].includes(role)) {
    return res.status(403).json({ error: 'Solo Mesero o Barra pueden cerrar cuentas de mesa.' });
  }

  const now = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE');
    const account = db.prepare(`
      SELECT a.id, a.turno_id, a.mesa, a.estado, t.meseros_ids, t.barra_id
      FROM cuentas_mesa a JOIN turnos t ON t.id = a.turno_id
      WHERE a.id = ?
    `).get(accountId);
    if (!account || account.estado !== 'abierta') {
      throw new Error('La cuenta ya fue cerrada o no existe.');
    }
    const currentTurn = db.prepare(`
      SELECT id, meseros_ids, barra_id FROM turnos
      WHERE id = ? AND estado = 'abierto'
    `).get(account.turno_id);
    if (!currentTurn || !orderTurnAuthorized(currentTurn, req.authUser)) {
      throw new Error('El turno se cerró o ya no tienes autorización para cerrar esta cuenta.');
    }
    const orders = db.prepare(`
      SELECT id, estado, total FROM comandas
      WHERE cuenta_mesa_id = ? AND estado <> 'cancelada'
    `).all(accountId);
    if (orders.some(order => order.estado !== 'entregada_falta_pago')) {
      throw new Error('Despacha o cancela todos los pedidos pendientes antes de cerrar la cuenta.');
    }

    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error('El total acumulado de la cuenta no es válido.');
    }
    const closed = db.prepare(`
      UPDATE cuentas_mesa
      SET estado = 'cerrada', cerrada_en = ?, cerrada_por = ?, medio_pago = ?
      WHERE id = ? AND estado = 'abierta'
    `).run(now, req.authUser.id, paymentMethod, accountId);
    if (closed.changes !== 1) throw new Error('La cuenta ya fue cerrada por otro usuario.');

    db.prepare(`
      UPDATE comandas
      SET estado = 'pagada', modo_pago = ?, pago_confirmado = 1,
        pago_registrado_por = ?, pago_registrado_en = ?, pagado_en = ?
      WHERE cuenta_mesa_id = ? AND estado = 'entregada_falta_pago'
    `).run(paymentMethod, req.authUser.id, now, now, accountId);
    if (total > 0) {
      db.prepare(`
        INSERT INTO pagos (id, comanda_id, tipo, monto, verificado, cuenta_mesa_id, registrado_en)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(crypto.randomUUID(), orders[0].id, paymentMethod, total, accountId, now);
    }

    db.exec('COMMIT');
    return res.json({
      id: accountId,
      mesa: account.mesa,
      estado: 'cerrada',
      total,
      medio_pago: paymentMethod,
      pedidos: orders.map(order => order.id),
      cerrada_en: now,
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir el cierre de la cuenta:', rollbackError);
    }
    console.error(`No fue posible cerrar la cuenta ${accountId}:`, error);
    return res.status(409).json({ error: error.message || 'No fue posible cerrar la cuenta.' });
  }
});

router.post('/orders', (req, res) => {
  const userRole = String(req.authUser?.role || '').toLowerCase();
  const isWaiter = ['mesero', 'mesero_fijo'].includes(userRole);
  const isBar = ['barra', 'barra_fija'].includes(userRole);
  if (!isWaiter && !isBar) {
    return res.status(403).json({ error: 'Solo una cuenta autorizada de Mesero o la cuenta de Barra asignada a este turno puede crear comandas.' });
  }

  const turnoId = String(req.body?.turno_id || '');
  const tableName = String(req.body?.mesa || '').trim();
  const items = req.body?.items;
  if (!turnoId || !tableName || tableName.length > 60 || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'El pedido debe incluir un turno, una mesa y al menos un producto.' });
  }

  const turno = db.prepare(`
    SELECT id, negocio_id, meseros_ids, barra_id
    FROM turnos
    WHERE id = ? AND estado = 'abierto'
  `).get(turnoId);
  let authorized = false;
  if (isBar) {
    authorized = turno?.barra_id === req.authUser.id;
  } else if (turno) {
    try {
      const authorizedWaiters = JSON.parse(turno.meseros_ids || '[]');
      authorized = Array.isArray(authorizedWaiters)
        && authorizedWaiters.some(id => String(id) === String(req.authUser.id));
    } catch (error) {
      console.error(`No fue posible validar meseros del turno ${turnoId}:`, error);
      return res.status(500).json({ error: 'No fue posible validar el acceso al turno.' });
    }
  }
  if (!turno || !authorized) {
    return res.status(403).json({ error: 'No tienes autorización para enviar pedidos en este turno.' });
  }
  if (!db.prepare('SELECT 1 FROM mesas WHERE negocio_id = ? AND nombre = ?').get(turno.negocio_id, tableName)) {
    return res.status(400).json({ error: 'La mesa seleccionada ya no está disponible. Actualiza la lista de mesas.' });
  }

  const normalizedItems = [];
  let total = 0;
  for (const item of items) {
    const productId = String(item?.producto_id || '');
    const quantity = Number(item?.cantidad);
    const unitPrice = Number(item?.precio_unitario);
    const discount = Number(item?.descuento || 0);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1
      || !Number.isSafeInteger(unitPrice) || unitPrice < 0
      || !Number.isSafeInteger(discount) || discount < 0) {
      return res.status(400).json({ error: 'El pedido contiene un producto, cantidad o precio no válido.' });
    }
    const product = db.prepare(`
      SELECT id, price
      FROM productos
      WHERE id = ? AND negocio_id = ?
    `).get(productId, turno.negocio_id);
    if (!product || Number(product.price) !== unitPrice) {
      return res.status(409).json({ error: 'Un producto cambió o ya no está disponible. Actualiza el catálogo e intenta nuevamente.' });
    }
    const lineTotal = unitPrice * quantity - discount;
    if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
      return res.status(400).json({ error: 'El descuento del pedido no es válido.' });
    }
    total += lineTotal;
    normalizedItems.push({
      productId,
      quantity,
      unitPrice,
      discount,
      promotions: Array.isArray(item.promociones_aplicadas) ? item.promociones_aplicadas : [],
    });
  }
  if (!Number.isSafeInteger(total)) {
    return res.status(400).json({ error: 'El total del pedido no es válido.' });
  }

  const now = new Date().toISOString();
  const orderId = crypto.randomUUID();
  try {
    db.exec('BEGIN IMMEDIATE');
    const currentTurn = db.prepare(`
      SELECT id, meseros_ids, barra_id FROM turnos
      WHERE id = ? AND estado = 'abierto'
    `).get(turnoId);
    const stillAuthorized = currentTurn && orderTurnAuthorized(currentTurn, req.authUser);
    if (!currentTurn || !stillAuthorized) {
      throw new Error('El turno se cerró o ya no tienes autorización para enviar pedidos.');
    }
    if (!db.prepare('SELECT 1 FROM mesas WHERE negocio_id = ? AND nombre = ?').get(turno.negocio_id, tableName)) {
      throw new Error('La mesa seleccionada ya no está disponible.');
    }

    const consecutive = Number(db.prepare(
      'SELECT COALESCE(MAX(consecutivo), 0) + 1 AS next FROM comandas WHERE turno_id = ?'
    ).get(turnoId).next);
    const accountId = getOrCreateTableAccount(turnoId, tableName, now);
    db.prepare(`
      INSERT INTO comandas (
        id, turno_id, mesa, cuenta_mesa_id, mesero_id, consecutivo, mesero_nombre, estado,
        subtotal, total, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'enviada', ?, ?, ?)
    `).run(
      orderId, turnoId, tableName, accountId, req.authUser.id, consecutive,
      req.authUser.name || (isBar ? 'Barra' : 'Mesero'),
      total, total, now,
    );

    const insertItem = db.prepare(`
      INSERT INTO comanda_items (
        id, comanda_id, producto_id, cantidad, precio_unitario, descuento, promociones_aplicadas
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    normalizedItems.forEach(item => insertItem.run(
      crypto.randomUUID(),
      orderId,
      item.productId,
      item.quantity,
      item.unitPrice,
      item.discount,
      JSON.stringify(item.promotions),
    ));
    db.exec('COMMIT');
    return res.status(201).json({
      id: orderId,
      turno_id: turnoId,
      mesa: tableName,
      cuenta_mesa_id: accountId,
      mesero_id: req.authUser.id,
      mesero_nombre: req.authUser.name || (isBar ? 'Barra' : 'Mesero'),
      consecutivo: consecutive,
      estado: 'enviada',
      subtotal: total,
      total,
      creado_en: now,
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la creación del pedido:', rollbackError);
    }
    console.error('No fue posible guardar el pedido completo:', error);
    return res.status(409).json({ error: error.message || 'No fue posible guardar el pedido.' });
  }
});

router.post('/orders/quick-sale', (req, res) => {
  const userRole = String(req.authUser?.role || '').toLowerCase();
  if (!['barra', 'barra_fija'].includes(userRole)) {
    return res.status(403).json({ error: 'Solo una cuenta de Barra puede registrar una venta rápida.' });
  }

  const turnoId = String(req.body?.turno_id || '');
  const tableName = String(req.body?.mesa || '').trim();
  const items = req.body?.items;
  if (!turnoId || !tableName || tableName.length > 60 || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'El pedido o el turno no es válido.' });
  }

  const turno = db.prepare(`
    SELECT id, negocio_id, modalidad_personal, barra_id
    FROM turnos
    WHERE id = ? AND estado = 'abierto'
  `).get(turnoId);
  if (!turno || turno.modalidad_personal !== 'individual' || turno.barra_id !== req.authUser.id) {
    return res.status(403).json({ error: 'La venta rápida solo está disponible para la cuenta de Barra del turno individual abierto.' });
  }
  if (!db.prepare('SELECT 1 FROM mesas WHERE negocio_id = ? AND nombre = ?').get(turno.negocio_id, tableName)) {
    return res.status(400).json({ error: 'La mesa seleccionada ya no está disponible. Actualiza la lista de mesas.' });
  }

  const normalizedItems = [];
  const stockNeeded = new Map();
  let subtotal = 0;
  let discountTotal = 0;
  for (const item of items) {
    const productId = String(item?.producto_id || '');
    const quantity = Number(item?.cantidad);
    const unitPrice = Number(item?.precio_unitario);
    const discount = Number(item?.descuento || 0);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1
      || !Number.isSafeInteger(unitPrice) || unitPrice < 0
      || !Number.isSafeInteger(discount) || discount < 0) {
      return res.status(400).json({ error: 'El pedido contiene un producto, cantidad o precio no válido.' });
    }

    const product = db.prepare(`
      SELECT id, name, price, stock
      FROM productos
      WHERE id = ? AND negocio_id = ?
    `).get(productId, turno.negocio_id);
    if (!product || Number(product.price) !== unitPrice) {
      return res.status(409).json({ error: 'Un producto cambió o ya no pertenece a este negocio. Actualiza el catálogo e intenta nuevamente.' });
    }
    const lineSubtotal = unitPrice * quantity;
    if (!Number.isSafeInteger(lineSubtotal) || discount > lineSubtotal) {
      return res.status(400).json({ error: 'El descuento del pedido no es válido.' });
    }

    normalizedItems.push({
      product,
      quantity,
      unitPrice,
      discount,
      promotions: Array.isArray(item.promociones_aplicadas) ? item.promociones_aplicadas : [],
    });
    stockNeeded.set(productId, (stockNeeded.get(productId) || 0) + quantity);
    subtotal += lineSubtotal;
    discountTotal += discount;
  }

  const quantityByProduct = new Map();
  const productById = new Map();
  normalizedItems.forEach(item => {
    quantityByProduct.set(item.product.id, (quantityByProduct.get(item.product.id) || 0) + item.quantity);
    productById.set(item.product.id, item.product);
  });
  const activePromotions = db.prepare(`
    SELECT tipo, producto_principal_id, producto_cortesia_id, productos_combo,
      precio_promocional, cantidad_compra, cantidad_cortesia
    FROM promociones
    WHERE negocio_id = ? AND activo = 1
  `).all(turno.negocio_id);
  let maximumAllowedDiscount = 0;
  for (const [productId, quantity] of quantityByProduct) {
    const productPromotion = activePromotions.find(promotion =>
      ['2x1', 'precio_especial'].includes(promotion.tipo)
      && promotion.producto_principal_id === productId
    );
    const product = productById.get(productId);
    if (productPromotion?.tipo === 'precio_especial') {
      maximumAllowedDiscount += Math.max(0, Number(product.price) - Number(productPromotion.precio_promocional || 0)) * quantity;
    } else if (productPromotion?.tipo === '2x1') {
      const groupSize = Math.max(2, Number(productPromotion.cantidad_compra) || 2);
      maximumAllowedDiscount += Math.floor(quantity / groupSize) * (groupSize - 1) * Number(product.price);
    }
  }

  for (const promotion of activePromotions) {
    if (promotion.tipo === 'combo') {
      let components;
      try { components = JSON.parse(promotion.productos_combo || '[]'); } catch { components = []; }
      if (!Array.isArray(components) || components.length < 2) continue;
      let comboCount = Infinity;
      let regularTotal = 0;
      for (const component of components) {
        const componentProduct = productById.get(String(component.producto_id || ''));
        const required = Number(component.cantidad);
        if (!componentProduct || !Number.isSafeInteger(required) || required < 1) {
          comboCount = 0;
          break;
        }
        comboCount = Math.min(comboCount, Math.floor((quantityByProduct.get(componentProduct.id) || 0) / required));
        regularTotal += Number(componentProduct.price) * required;
      }
      if (comboCount > 0 && Number.isFinite(comboCount)) {
        maximumAllowedDiscount += Math.max(0, regularTotal - Number(promotion.precio_promocional || 0)) * comboCount;
      }
    } else if (promotion.tipo === 'cortesia' && promotion.producto_cortesia_id) {
      const mainQuantity = quantityByProduct.get(promotion.producto_principal_id) || 0;
      const gift = productById.get(promotion.producto_cortesia_id);
      const purchaseQuantity = Math.max(1, Number(promotion.cantidad_compra) || 1);
      const giftQuantity = Math.max(1, Number(promotion.cantidad_cortesia) || 1);
      if (gift && mainQuantity >= purchaseQuantity) {
        maximumAllowedDiscount += Math.floor(mainQuantity / purchaseQuantity)
          * giftQuantity * Number(gift.price);
      }
    }
  }

  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(discountTotal)
    || discountTotal > subtotal || discountTotal > maximumAllowedDiscount) {
    return res.status(400).json({ error: 'El total del pedido no es válido.' });
  }

  const now = new Date().toISOString();
  const orderId = crypto.randomUUID();
  const itemInsert = db.prepare(`
    INSERT INTO comanda_items (
      id, comanda_id, producto_id, cantidad, precio_unitario, descuento,
      promociones_aplicadas, autorizado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stockUpdate = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?');
  const movementInsert = db.prepare(`
    INSERT INTO movimientos_inventario (
      id, negocio_id, turno_id, producto_id, tipo, cantidad, motivo, creado_por
    ) VALUES (?, ?, ?, ?, 'venta', ?, ?, ?)
  `);

  try {
    db.exec('BEGIN IMMEDIATE');
    const currentTurn = db.prepare(`
      SELECT id FROM turnos
      WHERE id = ? AND estado = 'abierto' AND modalidad_personal = 'individual' AND barra_id = ?
    `).get(turnoId, req.authUser.id);
    if (!currentTurn) throw new Error('El turno individual ya no está abierto o cambió de responsable.');
    if (!db.prepare('SELECT 1 FROM mesas WHERE negocio_id = ? AND nombre = ?').get(turno.negocio_id, tableName)) {
      throw new Error('La mesa seleccionada ya no está disponible.');
    }

    const consecutive = Number(db.prepare(
      'SELECT COALESCE(MAX(consecutivo), 0) + 1 AS next FROM comandas WHERE turno_id = ?'
    ).get(turnoId).next);
    const orderTotal = subtotal - discountTotal;
    const accountId = getOrCreateTableAccount(turnoId, tableName, now);

    db.prepare(`
      INSERT INTO comandas (
        id, turno_id, mesa, cuenta_mesa_id, mesero_id, consecutivo, mesero_nombre,
        estado, subtotal, descuento, total, creado_en, confirmado_en, despachado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'entregada_falta_pago', ?, ?, ?, ?, ?, ?)
    `).run(
      orderId, turnoId, tableName, accountId, req.authUser.id, consecutive,
      req.authUser.name || 'Barra', subtotal, discountTotal, orderTotal, now, now, now,
    );

    for (const item of normalizedItems) {
      itemInsert.run(
        crypto.randomUUID(),
        orderId,
        item.product.id,
        item.quantity,
        item.unitPrice,
        item.discount,
        JSON.stringify(item.promotions),
        req.authUser.id,
      );
    }

    for (const [productId, quantity] of stockNeeded) {
      if (stockUpdate.run(quantity, productId, quantity).changes !== 1) {
        throw new Error(`No hay existencias suficientes de ${normalizedItems.find(item => item.product.id === productId)?.product.name || 'un producto'}.`);
      }
      movementInsert.run(
        crypto.randomUUID(),
        turno.negocio_id,
        turnoId,
        productId,
        -quantity,
        `Venta rápida #${consecutive}`,
        req.authUser.id,
      );
    }

    db.exec('COMMIT');
    return res.status(201).json({
      comanda: {
        id: orderId,
        turno_id: turnoId,
        negocio_id: turno.negocio_id,
        mesa: tableName,
        cuenta_mesa_id: accountId,
        mesero_id: req.authUser.id,
        mesero_nombre: req.authUser.name || 'Barra',
        consecutivo: consecutive,
        estado: 'entregada_falta_pago',
        subtotal,
        descuento: discountTotal,
        total: orderTotal,
        creado_en: now,
        despachado_en: now,
        pago_confirmado: 0,
      },
      existencias: [...stockNeeded].map(([producto_id, cantidad]) => ({
        producto_id,
        stock: Number(normalizedItems.find(item => item.product.id === producto_id).product.stock) - cantidad,
      })),
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la venta rápida:', rollbackError);
    }
    console.error('No fue posible registrar la venta rápida:', error);
    return res.status(409).json({ error: error.message || 'No fue posible registrar la venta.' });
  }
});

router.post('/print/invoice', async (req, res) => {
  const { comanda_id: comandaId, user_id: userId } = req.body || {};
  if (typeof comandaId !== 'string' || !comandaId || typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'Falta identificar la comanda y la cuenta del mesero.' });
  }

  let order;
  let items;
  try {
    order = db.prepare(`
      SELECT c.*, t.negocio_id, n.name AS negocio_name, n.tipo AS negocio_tipo
      FROM comandas c
      JOIN turnos t ON t.id = c.turno_id
      JOIN negocios n ON n.id = t.negocio_id
      WHERE c.id = ?
    `).get(comandaId);
    if (order) {
      items = db.prepare(`
      SELECT ci.cantidad, ci.precio_unitario, ci.descuento, COALESCE(p.name, 'Producto') AS product_name
      FROM comanda_items ci
      LEFT JOIN productos p ON p.id = ci.producto_id
      WHERE ci.comanda_id = ?
      ORDER BY ci.rowid
    `).all(comandaId);
    }
  } catch (error) {
    console.error(`No fue posible consultar la comanda ${comandaId} para imprimir:`, error);
    return res.status(500).json({ error: 'No fue posible cargar los datos de la comanda para imprimir.' });
  }

  if (!order) return res.status(404).json({ error: 'No se encontró la comanda.' });
  if (order.estado !== 'pagada') return res.status(409).json({ error: 'Solo se pueden imprimir comandas pagadas.' });
  if (req.authUser.id !== userId || order.mesero_id !== userId) return res.status(403).json({ error: 'Esta comanda no pertenece a la cuenta del mesero autenticado.' });
  if (!items.length) return res.status(409).json({ error: 'La comanda no tiene productos para imprimir.' });

  let receipt;
  try {
    receipt = buildComandaReceipt({
      business: { name: order.negocio_name, tipo: order.negocio_tipo },
      order,
      items,
    });
  } catch (error) {
    console.error(`No fue posible preparar el comprobante para la comanda ${comandaId}:`, error);
    return res.status(500).json({ error: 'No fue posible preparar el comprobante de venta.' });
  }

  try {
    await enqueueInvoice(receipt);
    res.json({ ok: true, printer: PRINTER_NAME, message: `Comprobante enviado a ${PRINTER_NAME}.` });
  } catch (error) {
    console.error(`No fue posible imprimir la comanda ${comandaId} en ${PRINTER_NAME}:`, error);
    res.status(503).json({
      error: `Impresora sin conexión o puerto Bluetooth no disponible. Revisa que ${PRINTER_NAME} esté encendida y conectada a ${PRINTER_PORT}, y que el puerto no esté ocupado.`,
    });
  }
});

router.post('/print/order', async (req, res) => {
  const { comanda_id: comandaId, user_id: userId } = req.body || {};
  if (typeof comandaId !== 'string' || !comandaId || typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'Falta identificar la comanda y la cuenta del mesero.' });
  }

  let order;
  let items;
  try {
    order = db.prepare(`
      SELECT c.*, t.negocio_id, n.name AS negocio_name, n.tipo AS negocio_tipo
      FROM comandas c
      JOIN turnos t ON t.id = c.turno_id
      JOIN negocios n ON n.id = t.negocio_id
      WHERE c.id = ?
    `).get(comandaId);
    if (order) {
      items = db.prepare(`
        SELECT ci.cantidad, ci.precio_unitario, ci.descuento, COALESCE(p.name, 'Producto') AS product_name
        FROM comanda_items ci
        LEFT JOIN productos p ON p.id = ci.producto_id
        WHERE ci.comanda_id = ?
        ORDER BY ci.rowid
      `).all(comandaId);
    }
  } catch (error) {
    console.error(`No fue posible consultar la comanda ${comandaId} para imprimirla en barra:`, error);
    return res.status(500).json({ error: 'No fue posible cargar los datos del pedido para imprimir.' });
  }

  if (!order) return res.status(404).json({ error: 'No se encontró la comanda.' });
  if (order.estado !== 'enviada') return res.status(409).json({ error: 'Solo se pueden imprimir pedidos enviados a barra.' });
  if (req.authUser.id !== userId || order.mesero_id !== userId) return res.status(403).json({ error: 'Esta comanda no pertenece a la cuenta del mesero autenticado.' });
  if (!items.length) return res.status(409).json({ error: 'La comanda no tiene productos para imprimir.' });

  let receipt;
  try {
    receipt = buildComandaReceipt({
      business: { name: order.negocio_name, tipo: order.negocio_tipo },
      order,
      items,
      footer: 'COPIA PARA BARRA',
    });
  } catch (error) {
    console.error(`No fue posible preparar el pedido ${comandaId} para imprimir:`, error);
    return res.status(500).json({ error: 'No fue posible preparar el pedido para impresión.' });
  }

  try {
    await enqueueInvoice(receipt);
    res.json({ ok: true, printer: PRINTER_NAME, message: `Pedido enviado a imprimir en ${PRINTER_NAME}.` });
  } catch (error) {
    console.error(`No fue posible imprimir el pedido ${comandaId} en ${PRINTER_NAME}:`, error);
    res.status(503).json({
      error: `Impresora sin conexión o puerto Bluetooth no disponible. Revisa que ${PRINTER_NAME} esté encendida y conectada a ${PRINTER_PORT}, y que el puerto no esté ocupado.`,
    });
  }
});

router.delete('/negocios/:id', (req, res) => {
  if (req.authUser.role !== 'administrador' || req.authUser.email.toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador maestro puede eliminar negocios.' });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Identificador de negocio inválido' });

  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const business = db.prepare('SELECT id FROM negocios WHERE id = ?').get(id);
      if (!business) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'No se encontró el negocio' });
      }

      const turnIds = db.prepare('SELECT id FROM turnos WHERE negocio_id = ?').all(id).map(row => row.id);
      const closingIds = db.prepare('SELECT id FROM cierres_semanales WHERE negocio_id = ?').all(id).map(row => row.id);
      const orderIds = turnIds.length
        ? db.prepare(`SELECT id FROM comandas WHERE turno_id IN (${turnIds.map(() => '?').join(',')})`).all(...turnIds).map(row => row.id)
        : [];
      const storeSaleIds = db.prepare('SELECT id FROM ventas_tienda WHERE negocio_id = ?').all(id).map(row => row.id);

      const deleteMatching = (table, column, values) => {
        if (!values.length) return;
        db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${values.map(() => '?').join(',')})`).run(...values);
      };

      deleteMatching('comanda_items', 'comanda_id', orderIds);
      deleteMatching('pagos', 'comanda_id', orderIds);
      deleteMatching('cuentas_mesa', 'turno_id', turnIds);
      deleteMatching('comandas', 'id', orderIds);
      deleteMatching('venta_tienda_items', 'venta_id', storeSaleIds);
      deleteMatching('ventas_tienda', 'id', storeSaleIds);
      db.prepare('DELETE FROM abonos_citas_tienda WHERE negocio_id = ?').run(id);
      db.prepare('DELETE FROM citas_tienda WHERE negocio_id = ?').run(id);
      db.prepare('DELETE FROM personal_tienda WHERE negocio_id = ?').run(id);
      deleteMatching('gastos_turno', 'turno_id', turnIds);
      deleteMatching('descorches', 'turno_id', turnIds);
      deleteMatching('novedades', 'turno_id', turnIds);
      deleteMatching('novedades', 'cierre_semanal_id', closingIds);

      for (const table of [
        'cierres_semanales',
        'gastos_semanales',
        'movimientos_inventario',
        'transferencias',
        'gastos',
        'gastos_fijos',
        'cxc',
        'promociones',
        'productos',
        'staff',
        'planillas',
        'turnos',
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE negocio_id = ?`).run(id);
      }
      db.prepare('DELETE FROM negocios WHERE id = ?').run(id);

      const users = db.prepare('SELECT id, negocios FROM usuarios').all();
      const updateUserAccess = db.prepare('UPDATE usuarios SET negocios = ? WHERE id = ?');
      for (const user of users) {
        if (typeof user.negocios !== 'string') continue;
        let assignedBusinesses;
        try { assignedBusinesses = JSON.parse(user.negocios); } catch { continue; }
        if (Array.isArray(assignedBusinesses) && assignedBusinesses.includes(id)) {
          updateUserAccess.run(JSON.stringify(assignedBusinesses.filter(businessId => businessId !== id)), user.id);
        }
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('No fue posible eliminar el negocio:', error);
    res.status(500).json({ error: 'No fue posible eliminar el negocio y sus datos asociados' });
  }
});

router.get('/network/addresses', (req, res) => {
  if (!['administrador', 'gerente'].includes(String(req.authUser.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Solo el administrador maestro o un gerente pueden consultar los enlaces de acceso.' });
  }
  const port = Number(process.env.PORT) || 3000;
  const addresses = [...new Set(Object.values(os.networkInterfaces()).flatMap(interfaces =>
    (interfaces || [])
      .filter(network => (network.family === 'IPv4' || network.family === 4) && !network.internal)
      .map(network => network.address)
  ))].sort();
  res.json(addresses.map(address => ({
    address,
    url: `http://${address}:${port}`,
  })));
});

router.get('/:table', tableOrFail, (req, res) => {
  if (req.params.table === 'usuarios') {
    const accounts = db.prepare('SELECT id, name, email, role, negocios, created_at FROM usuarios').all();
    if (isMasterUser(req.authUser)) return res.json(accounts.map(encode));
    const allowedBusinesses = new Set(accessibleBusinessIds(req.authUser));
    const visibleAccounts = accounts.filter(account => {
      if (account.id === req.authUser.id) return true;
      const accountBusinesses = accountBusinessIds(account);
      return accountBusinesses.some(id => allowedBusinesses.has(id));
    });
    return res.json(visibleAccounts.map(encode));
  }
  const filters = parseFilter(req.query);
  let sql = `SELECT * FROM ${req.params.table}`;
  const params = [];
  const clauses = filters.map(item => item.sql);
  params.push(...filters.map(item => item.value));
  const scope = businessScope(req.params.table, req.authUser);
  if (scope) {
    clauses.push(scope.sql);
    params.push(...scope.values);
  }
  if (['mesero', 'mesero_fijo'].includes(String(req.authUser.role).toLowerCase())) {
    if (req.params.table === 'comandas') {
      clauses.push('mesero_id = ?');
      params.push(req.authUser.id);
    } else if (['comanda_items', 'pagos'].includes(req.params.table)) {
      clauses.push('comanda_id IN (SELECT id FROM comandas WHERE mesero_id = ?)');
      params.push(req.authUser.id);
    }
  }
  if (['barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
    && req.params.table === 'turnos') {
    clauses.push('barra_id = ?');
    params.push(req.authUser.id);
  }
  if (clauses.length) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }
  if (req.query.order) {
    const [column, direction] = req.query.order.split('.');
    if (ident(column)) sql += ` ORDER BY ${column} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
  }
  const limit = Number(req.query.limit);
  if (Number.isInteger(limit) && limit > 0) { sql += ' LIMIT ?'; params.push(limit); }
  try {
    const results = db.prepare(sql).all(...params).map(encode);
    if (['mesero', 'mesero_fijo'].includes(String(req.authUser.role).toLowerCase()) && req.params.table === 'turnos') {
      return res.json(results.filter(turno => Array.isArray(turno.meseros_ids) && turno.meseros_ids.includes(req.authUser.id)));
    }
    res.json(results);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/:table', tableOrFail, (req, res) => {
  if (req.params.table === 'usuarios') {
    return res.status(405).json({ error: 'Usa la ruta segura de creación de usuarios.' });
  }
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  if (!rows.length) return res.status(400).json({ error: 'Datos vacíos' });
  try {
    const allowedBusinesses = isMasterUser(req.authUser) ? null : accessibleBusinessIds(req.authUser);
    if (allowedBusinesses
      && rows.some(row => !rowIsInBusinessScope(req.params.table, row, req.authUser, allowedBusinesses))) {
      return res.status(403).json({ error: 'No tienes acceso al negocio o turno asociado a estos datos.' });
    }
    if (['barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
      && req.params.table === 'movimientos_inventario'
      && rows.some(row => row.tipo !== 'venta')) {
      return res.status(403).json({ error: 'Barra solo puede registrar movimientos de inventario generados por ventas despachadas.' });
    }
    if (['barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
      && req.params.table === 'movimientos_inventario'
      && rows.some(row => db.prepare(
        "SELECT 1 FROM negocios WHERE id = ? AND tipo = 'tienda'"
      ).get(row.negocio_id))) {
      return res.status(403).json({ error: 'El inventario de una tienda solo se descuenta al registrar una venta.' });
    }
    if (req.params.table === 'turnos') {
      for (const row of rows) {
        const barraId = String(row.barra_id || '');
        const businessId = String(row.negocio_id || '');
        if (row.modalidad_personal !== undefined
          && !['equipo', 'individual'].includes(String(row.modalidad_personal))) {
          return res.status(400).json({ error: 'Selecciona una modalidad de personal válida para el turno.' });
        }
        if (!barraId || !businessId) {
          return res.status(400).json({ error: 'Debes asignar un usuario de Barra al turno.' });
        }
        const barraAccount = db.prepare('SELECT id, role, negocios FROM usuarios WHERE id = ?').get(barraId);
        if (!barraAccount || String(barraAccount.role).toLowerCase() !== 'barra') {
          return res.status(400).json({ error: 'La cuenta seleccionada no tiene el rol Barra.' });
        }
        const assignedBusinesses = encode({ negocios: barraAccount.negocios }).negocios;
        const hasBusinessAccess = assignedBusinesses === 'all'
          || (Array.isArray(assignedBusinesses) && assignedBusinesses.some(id => String(id) === businessId));
        if (!hasBusinessAccess) {
          return res.status(403).json({ error: 'La cuenta de Barra seleccionada no está asignada a este negocio.' });
        }
        if (row.estado === 'abierto'
          && db.prepare("SELECT id FROM turnos WHERE negocio_id = ? AND estado = 'abierto' LIMIT 1").get(businessId)) {
          return res.status(409).json({ error: 'Ya existe un turno abierto para este negocio.' });
        }
      }
    }
    if (['mesero', 'mesero_fijo'].includes(String(req.authUser.role).toLowerCase())
      && !rowsBelongToWaiter(req.params.table, rows, req.authUser.id)) {
      return res.status(403).json({ error: 'Solo puedes registrar operaciones de tus propias comandas.' });
    }
    if (req.params.table === 'usuarios') {
      const master = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(OWNER_EMAIL);
      const attemptsToCreateMaster = rows.some(row =>
        String(row.email || '').trim().toLowerCase() === OWNER_EMAIL
        || ['admin', 'administrador'].includes(String(row.role || '').toLowerCase())
      );
      if (attemptsToCreateMaster && (!master || rows.some(row =>
        String(row.email || '').trim().toLowerCase() === OWNER_EMAIL && row.id !== master.id
        || ['admin', 'administrador'].includes(String(row.role || '').toLowerCase())
          && (String(row.email || '').trim().toLowerCase() !== OWNER_EMAIL || row.id !== master.id)
      ))) {
        return res.status(403).json({ error: 'La cuenta administradora maestra no se puede crear ni reemplazar desde Gestión de Usuarios.' });
      }
    }
    const columns = Object.keys(rows[0]).filter(ident);
    const statement = db.prepare(`INSERT OR REPLACE INTO ${req.params.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    db.exec('BEGIN');
    rows.forEach(row => statement.run(...columns.map(column => decode(row)[column] ?? null)));
    db.exec('COMMIT');
    res.status(201).json({ ok: true });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:table', tableOrFail, (req, res) => {
  if (req.params.table === 'usuarios') {
    return res.status(405).json({ error: 'Usa la ruta segura de actualización de usuarios.' });
  }
  const filters = parseFilter(req.query);
  const columns = Object.keys(req.body).filter(ident);
  if (!columns.length || !filters.length) return res.status(400).json({ error: 'Actualización inválida' });
  if (req.params.table === 'comandas'
    && ['mesero', 'mesero_fijo', 'barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
    && req.body.estado === 'pagada') {
    return res.status(403).json({ error: 'Las comandas se marcan pagadas únicamente al cerrar la cuenta completa de la mesa.' });
  }
  if (!isMasterUser(req.authUser)
    && columns.some(column => ['negocio_id', 'turno_id', 'comanda_id', 'cierre_semanal_id', 'planilla_id'].includes(column))) {
    return res.status(403).json({ error: 'No se puede cambiar el negocio o turno asociado a un registro.' });
  }
  if (req.params.table === 'usuarios') {
    if (String(req.body.role || '').toLowerCase() === 'administrador') {
      return res.status(403).json({ error: 'Solo puede existir el administrador maestro reservado.' });
    }
    const target = db.prepare(`SELECT id FROM usuarios WHERE ${filters.map(item => item.sql).join(' AND ')}`).get(...filters.map(item => item.value));
    const master = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(OWNER_EMAIL);
    if (target && master && target.id === master.id && (req.body.email || req.body.role)) {
      return res.status(403).json({ error: 'El correo y el rol del administrador maestro están protegidos.' });
    }
  }
  try {
    const scope = businessScope(req.params.table, req.authUser);
    const scopedFilters = scope ? [...filters, scope] : filters;
    const targetRows = matchingRows(req.params.table, scopedFilters);
    if (scope && !targetRows.length) {
      return res.status(403).json({ error: 'No tienes acceso a los registros de este negocio o turno.' });
    }
    if (req.params.table === 'comandas' && req.body.mesa !== undefined) {
      const requestedTable = String(req.body.mesa || '').trim();
      if (!requestedTable || requestedTable.length > 60 || targetRows.some(row => {
        return requestedTable !== String(row.mesa || '');
      })) {
        return res.status(409).json({ error: 'Una comanda no se puede mover a otra mesa después de asociarse a su cuenta.' });
      }
    }
    if (req.params.table === 'turnos' && req.body.estado === 'cerrado') {
      const turnIds = targetRows.map(row => row.id);
      if (turnIds.length && db.prepare(`
        SELECT 1 FROM cuentas_mesa
        WHERE estado = 'abierta' AND turno_id IN (${turnIds.map(() => '?').join(',')})
        LIMIT 1
      `).get(...turnIds)) {
        return res.status(409).json({ error: 'Cierra las cuentas abiertas de las mesas antes de cerrar el turno.' });
      }
    }
    if (['barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
      && req.params.table === 'turnos') {
      const targetTurns = targetRows;
      if (!targetTurns.length || targetTurns.some(turno => String(turno.barra_id || '') !== String(req.authUser.id))) {
        return res.status(403).json({ error: 'Solo el usuario de Barra asignado al turno puede modificarlo.' });
      }
    }
    if (['barra', 'barra_fija'].includes(String(req.authUser.role).toLowerCase())
      && req.params.table === 'productos'
      && targetRows.some(product => db.prepare(
        "SELECT 1 FROM negocios WHERE id = ? AND tipo = 'tienda'"
      ).get(product.negocio_id))) {
      return res.status(403).json({ error: 'El inventario de una tienda solo se modifica mediante ventas o desde la cuenta gerente.' });
    }
    if (['mesero', 'mesero_fijo'].includes(String(req.authUser.role).toLowerCase())
      && !rowsBelongToWaiter(req.params.table, targetRows, req.authUser.id)) {
      return res.status(403).json({ error: 'Solo puedes modificar tus propias comandas.' });
    }
    const values = decode(req.body);
    if (!isMasterUser(req.authUser)
      && targetRows.some(row => !rowIsInBusinessScope(
        req.params.table,
        { ...row, ...values },
        req.authUser,
      ))) {
      return res.status(403).json({ error: 'La actualización no puede mover datos fuera del negocio autorizado.' });
    }
    const whereClauses = scopedFilters.map(item => item.sql);
    const sql = `UPDATE ${req.params.table} SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE ${whereClauses.join(' AND ')}`;
    db.prepare(sql).run(
      ...columns.map(column => values[column] ?? null),
      ...scopedFilters.flatMap(item => item.values || [item.value]),
    );
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/:table', tableOrFail, (req, res) => {
  const filters = parseFilter(req.query);
  if (!filters.length) return res.status(400).json({ error: 'Eliminación inválida' });
  const scope = businessScope(req.params.table, req.authUser);
  const scopedFilters = scope ? [...filters, scope] : filters;
  if (['mesero', 'mesero_fijo'].includes(String(req.authUser.role).toLowerCase())) {
    try {
      if (!rowsBelongToWaiter(req.params.table, matchingRows(req.params.table, scopedFilters), req.authUser.id)) {
        return res.status(403).json({ error: 'Solo puedes eliminar productos de tus propias comandas.' });
      }
    } catch (error) {
      console.error(`No fue posible verificar la propiedad de ${req.params.table}:`, error);
      return res.status(400).json({ error: 'No fue posible verificar la operación solicitada.' });
    }
  }
  if (req.params.table === 'usuarios') {
    const target = db.prepare(`SELECT id FROM usuarios WHERE ${filters.map(item => item.sql).join(' AND ')}`).get(...filters.map(item => item.value));
    const master = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(OWNER_EMAIL);
    if (target && master && target.id === master.id) {
      return res.status(403).json({ error: 'El administrador maestro no se puede eliminar.' });
    }
  }
  try {
    const targetRows = matchingRows(req.params.table, scopedFilters);
    if (scope && !targetRows.length) {
      return res.status(403).json({ error: 'No tienes acceso a los registros de este negocio o turno.' });
    }
    if (req.params.table === 'gastos' && targetRows.some(row => row.tipo === 'compra_inventario')) {
      return res.status(409).json({ error: 'Este registro actualizó el inventario y no se puede eliminar desde Gastos.' });
    }
    db.prepare(`DELETE FROM ${req.params.table} WHERE ${scopedFilters.map(item => item.sql).join(' AND ')}`)
      .run(...scopedFilters.flatMap(item => item.values || [item.value]));
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
