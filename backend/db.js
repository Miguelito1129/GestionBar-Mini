const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getInstanceId } = require('./appIdentity');

const dataDir = process.pkg
  ? path.join(
    process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(),
    'GestionBar',
    'instances',
    getInstanceId(),
    'data',
  )
  : path.join(__dirname, 'data');
const instanceId = getInstanceId();
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'gestionbar.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS negocios (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT DEFAULT '🏢',
  color TEXT DEFAULT '#f59e0b', tipo TEXT DEFAULT 'bar',
  citas_habilitadas INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mesas (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, nombre TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (negocio_id, nombre)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_negocio_nombre_normalized
  ON mesas (negocio_id, lower(nombre));
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, negocios TEXT DEFAULT 'all', password_hash TEXT NOT NULL,
  salt TEXT NOT NULL, password_hash_local TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL,
  expira_en TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, name TEXT NOT NULL,
  rol TEXT NOT NULL, pay TEXT NOT NULL, activo INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, name TEXT NOT NULL,
  cat TEXT NOT NULL, price INTEGER DEFAULT 0, stock INTEGER DEFAULT 0,
  min INTEGER DEFAULT 0, courtesy TEXT, sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS promociones (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  producto_principal_id TEXT NOT NULL,
  producto_cortesia_id TEXT,
  productos_combo TEXT DEFAULT '[]',
  precio_promocional INTEGER,
  cantidad_compra INTEGER NOT NULL DEFAULT 2,
  cantidad_cortesia INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS planillas (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, fecha TEXT NOT NULL,
  apertura TEXT, cierre TEXT, base_caja INTEGER DEFAULT 0, ventas INTEGER DEFAULT 0,
  bancos INTEGER DEFAULT 0, gastos INTEGER DEFAULT 0, personal INTEGER DEFAULT 0,
  extras INTEGER DEFAULT 0, pendientes INTEGER DEFAULT 0, neto INTEGER DEFAULT 0,
  diferencia INTEGER DEFAULT 0, novedades TEXT, estado TEXT DEFAULT 'abierta',
  checklist TEXT DEFAULT '{}', personal_detalle TEXT DEFAULT '[]',
  banco_detalle TEXT DEFAULT '{}', movimientos TEXT DEFAULT '[]',
  gastos_detalle TEXT DEFAULT '[]', created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS gastos_fijos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, desc TEXT NOT NULL,
  monto INTEGER NOT NULL, dia INTEGER DEFAULT 0, activo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS transferencias (
  id TEXT PRIMARY KEY, planilla_id TEXT, negocio_id TEXT NOT NULL, plataforma TEXT NOT NULL,
  monto INTEGER NOT NULL, foto_url TEXT, descripcion TEXT, verificada INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, planilla_id TEXT, fecha TEXT NOT NULL,
  desc TEXT NOT NULL, monto INTEGER NOT NULL, cat TEXT DEFAULT 'Otros', foto_url TEXT,
  procesado INTEGER DEFAULT 0, tipo TEXT NOT NULL DEFAULT 'gasto',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cxc (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, deudor TEXT NOT NULL,
  monto INTEGER NOT NULL, fecha TEXT, concepto TEXT, pagado INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS turnos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, fecha_apertura TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TEXT, modo_operacion TEXT DEFAULT 'discoteca', base_caja INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'abierto', inventario_apertura TEXT DEFAULT '[]',
  inventario_cierre TEXT DEFAULT '[]', efectivo_contado INTEGER, transferencias_contadas INTEGER,
  diferencia_caja INTEGER, novedades_apertura TEXT, novedades_cierre TEXT,
  abierto_por TEXT, cerrado_por TEXT, barra_id TEXT, meseros_ids TEXT DEFAULT '[]',
  legacy_planilla_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS comandas (
  id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, mesa TEXT NOT NULL, mesero_id TEXT NOT NULL,
  consecutivo INTEGER, mesero_nombre TEXT,
  cuenta_mesa_id TEXT,
  estado TEXT DEFAULT 'enviada', modo_pago TEXT, subtotal INTEGER DEFAULT 0,
  descuento INTEGER DEFAULT 0, total INTEGER DEFAULT 0, creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizada_en TEXT,
  confirmado_en TEXT, despachado_en TEXT, pagado_en TEXT,
  pago_confirmado INTEGER DEFAULT 0, pago_registrado_por TEXT, pago_registrado_en TEXT
);
CREATE TABLE IF NOT EXISTS cuentas_mesa (
  id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, mesa TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierta', abierta_en TEXT NOT NULL,
  cerrada_en TEXT, cerrada_por TEXT, medio_pago TEXT
);
CREATE TABLE IF NOT EXISTS comanda_items (
  id TEXT PRIMARY KEY, comanda_id TEXT NOT NULL, producto_id TEXT NOT NULL,
  cantidad INTEGER NOT NULL, precio_unitario INTEGER NOT NULL, descuento INTEGER DEFAULT 0,
  es_cortesia INTEGER DEFAULT 0, autorizado_por TEXT, promociones_aplicadas TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY, comanda_id TEXT NOT NULL, tipo TEXT NOT NULL,
  monto INTEGER NOT NULL, referencia TEXT, verificado INTEGER DEFAULT 0,
  cuenta_mesa_id TEXT,
  registrado_en TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, turno_id TEXT, producto_id TEXT NOT NULL,
  tipo TEXT NOT NULL, cantidad INTEGER NOT NULL, motivo TEXT, comprobante_url TEXT, creado_por TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ventas_tienda (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, fecha TEXT NOT NULL,
  consecutivo INTEGER NOT NULL, medio_pago TEXT NOT NULL, total INTEGER NOT NULL,
  vendedor_id TEXT NOT NULL, vendedor_nombre TEXT, creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (negocio_id, fecha, consecutivo)
);
CREATE TABLE IF NOT EXISTS personal_tienda (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, nombre TEXT NOT NULL, telefono TEXT,
  origen TEXT NOT NULL DEFAULT 'manual',
  activo INTEGER NOT NULL DEFAULT 1, creado_en TEXT NOT NULL,
  UNIQUE (negocio_id, nombre)
);
CREATE TABLE IF NOT EXISTS citas_tienda (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, cliente_nombre TEXT NOT NULL,
  cliente_cedula TEXT, cliente_telefono TEXT, tatuador TEXT NOT NULL, personal_id TEXT,
  servicio TEXT NOT NULL, fecha_hora TEXT NOT NULL, fecha_fin TEXT,
  precio_acordado INTEGER NOT NULL, linea_id TEXT,
  estado TEXT NOT NULL DEFAULT 'agendada', notas TEXT,
  creado_por TEXT NOT NULL, creado_en TEXT NOT NULL, actualizado_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_citas_tienda_negocio_fecha
  ON citas_tienda (negocio_id, fecha_hora);
CREATE TABLE IF NOT EXISTS abonos_citas_tienda (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, cita_id TEXT NOT NULL,
  fecha TEXT NOT NULL, monto INTEGER NOT NULL, medio_pago TEXT NOT NULL,
  registrado_por TEXT NOT NULL, registrado_por_nombre TEXT, creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_abonos_citas_tienda_negocio_fecha
  ON abonos_citas_tienda (negocio_id, fecha);
CREATE TABLE IF NOT EXISTS venta_tienda_items (
  id TEXT PRIMARY KEY, venta_id TEXT NOT NULL, producto_id TEXT NOT NULL,
  producto_nombre TEXT NOT NULL, cantidad INTEGER NOT NULL,
  precio_unitario INTEGER NOT NULL, total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gastos_turno (
  id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, tipo TEXT NOT NULL, concepto TEXT NOT NULL,
  monto INTEGER NOT NULL, tiene_factura INTEGER DEFAULT 0, autorizado_por TEXT,
  registrado_por TEXT, legacy_gasto_id TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS descorches (
  id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, producto_descripcion TEXT NOT NULL,
  valor_cobrado INTEGER NOT NULL, registrado_por TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS novedades (
  id TEXT PRIMARY KEY, turno_id TEXT, cierre_semanal_id TEXT, texto TEXT NOT NULL,
  creado_por TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gastos_semanales (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, semana_inicio TEXT NOT NULL,
  semana_fin TEXT NOT NULL, concepto TEXT NOT NULL, categoria TEXT NOT NULL,
  monto INTEGER NOT NULL, registrado_por TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cierres_semanales (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, semana_inicio TEXT NOT NULL,
  semana_fin TEXT NOT NULL, turnos_incluidos TEXT DEFAULT '[]', total_ventas INTEGER DEFAULT 0,
  total_descorches INTEGER DEFAULT 0, total_gastos_turnos INTEGER DEFAULT 0,
  total_gastos_semanales INTEGER DEFAULT 0, utilidad_neta INTEGER DEFAULT 0,
  novedades TEXT, cerrado_por TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const businessColumns = db.prepare('PRAGMA table_info(negocios)').all().map(column => column.name);
if (!businessColumns.includes('citas_habilitadas')) {
  db.exec('ALTER TABLE negocios ADD COLUMN citas_habilitadas INTEGER NOT NULL DEFAULT 0');
}

const appointmentColumns = db.prepare('PRAGMA table_info(citas_tienda)').all().map(column => column.name);
const storePersonnelColumns = db.prepare('PRAGMA table_info(personal_tienda)').all().map(column => column.name);
const needsPersonnelOriginMigration = !storePersonnelColumns.includes('origen');
if (!storePersonnelColumns.includes('telefono')) {
  db.exec('ALTER TABLE personal_tienda ADD COLUMN telefono TEXT');
}
if (needsPersonnelOriginMigration) {
  db.exec("ALTER TABLE personal_tienda ADD COLUMN origen TEXT NOT NULL DEFAULT 'manual'");
}
if (!appointmentColumns.includes('cliente_cedula')) {
  db.exec('ALTER TABLE citas_tienda ADD COLUMN cliente_cedula TEXT');
}
if (!appointmentColumns.includes('linea_id')) {
  db.exec('ALTER TABLE citas_tienda ADD COLUMN linea_id TEXT');
}
if (!appointmentColumns.includes('personal_id')) {
  db.exec('ALTER TABLE citas_tienda ADD COLUMN personal_id TEXT');
}
if (!appointmentColumns.includes('fecha_fin')) {
  db.exec('ALTER TABLE citas_tienda ADD COLUMN fecha_fin TEXT');
}
if (needsPersonnelOriginMigration) {
  db.exec(`
    UPDATE personal_tienda
    SET origen = 'historico'
    WHERE EXISTS (
      SELECT 1 FROM citas_tienda appointment
      WHERE appointment.personal_id = personal_tienda.id
        AND appointment.creado_en <= personal_tienda.creado_en
    )
  `);
}
db.exec("UPDATE citas_tienda SET linea_id = id WHERE linea_id IS NULL OR linea_id = ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_citas_tienda_linea ON citas_tienda (linea_id)');

const appointmentsWithoutEnd = db.prepare(`
  SELECT id, fecha_hora FROM citas_tienda WHERE fecha_fin IS NULL OR fecha_fin = ''
`).all();
const updateAppointmentEnd = db.prepare('UPDATE citas_tienda SET fecha_fin = ? WHERE id = ?');
for (const appointment of appointmentsWithoutEnd) {
  const start = new Date(`${String(appointment.fecha_hora).replace(' ', 'T')}:00Z`);
  if (Number.isNaN(start.getTime())) continue;
  start.setUTCHours(start.getUTCHours() + 2);
  updateAppointmentEnd.run(start.toISOString().slice(0, 16), appointment.id);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_citas_tienda_personal_interval ON citas_tienda (personal_id, fecha_hora, fecha_fin, estado)');

const userColumns = db.prepare('PRAGMA table_info(usuarios)').all().map(column => column.name);
if (!userColumns.includes('password_hash_local')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN password_hash_local TEXT');
}

const ownerEmail = 'mdmm1100@gmail.com';
db.prepare(`
  UPDATE usuarios SET role = 'gerente'
  WHERE lower(role) IN ('admin', 'administrador') AND lower(email) <> ?
`).run(ownerEmail);
db.prepare("UPDATE usuarios SET role = 'administrador', negocios = 'all' WHERE lower(email) = ?").run(ownerEmail);
db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(new Date().toISOString());

const promotionColumns = db.prepare('PRAGMA table_info(promociones)').all().map(column => column.name);
if (!promotionColumns.includes('productos_combo')) {
  db.exec("ALTER TABLE promociones ADD COLUMN productos_combo TEXT DEFAULT '[]'");
}
if (!promotionColumns.includes('precio_promocional')) {
  db.exec('ALTER TABLE promociones ADD COLUMN precio_promocional INTEGER');
}

const comandaColumns = db.prepare('PRAGMA table_info(comandas)').all().map(column => column.name);
if (!comandaColumns.includes('consecutivo')) {
  db.exec('ALTER TABLE comandas ADD COLUMN consecutivo INTEGER');
}
if (!comandaColumns.includes('mesero_nombre')) {
  db.exec('ALTER TABLE comandas ADD COLUMN mesero_nombre TEXT');
}
if (!comandaColumns.includes('pago_confirmado')) {
  db.exec('ALTER TABLE comandas ADD COLUMN pago_confirmado INTEGER DEFAULT 0');
}
if (!comandaColumns.includes('pago_registrado_por')) {
  db.exec('ALTER TABLE comandas ADD COLUMN pago_registrado_por TEXT');
}
if (!comandaColumns.includes('pago_registrado_en')) {
  db.exec('ALTER TABLE comandas ADD COLUMN pago_registrado_en TEXT');
}
if (!comandaColumns.includes('actualizada_en')) {
  db.exec('ALTER TABLE comandas ADD COLUMN actualizada_en TEXT');
}
if (!comandaColumns.includes('cuenta_mesa_id')) {
  db.exec('ALTER TABLE comandas ADD COLUMN cuenta_mesa_id TEXT');
}

const paymentColumns = db.prepare('PRAGMA table_info(pagos)').all().map(column => column.name);
if (!paymentColumns.includes('cuenta_mesa_id')) {
  db.exec('ALTER TABLE pagos ADD COLUMN cuenta_mesa_id TEXT');
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cuentas_mesa_turno_abierta
    ON cuentas_mesa (turno_id, mesa) WHERE estado = 'abierta';
  CREATE INDEX IF NOT EXISTS idx_comandas_cuenta_mesa
    ON comandas (cuenta_mesa_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_cuenta_mesa
    ON pagos (cuenta_mesa_id) WHERE cuenta_mesa_id IS NOT NULL;
`);

const unlinkedOpenOrders = db.prepare(`
  SELECT turno_id, mesa, MIN(creado_en) AS abierta_en
  FROM comandas
  WHERE cuenta_mesa_id IS NULL AND estado IN ('enviada', 'entregada_falta_pago')
  GROUP BY turno_id, mesa
`).all();
if (unlinkedOpenOrders.length) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const insertAccount = db.prepare(`
      INSERT INTO cuentas_mesa (id, turno_id, mesa, estado, abierta_en)
      VALUES (?, ?, ?, 'abierta', ?)
    `);
    const linkOrders = db.prepare(`
      UPDATE comandas SET cuenta_mesa_id = ?
      WHERE turno_id = ? AND mesa = ? AND cuenta_mesa_id IS NULL
        AND estado IN ('enviada', 'entregada_falta_pago')
    `);
    for (const account of unlinkedOpenOrders) {
      const accountId = crypto.randomUUID();
      insertAccount.run(accountId, account.turno_id, account.mesa, account.abierta_en);
      linkOrders.run(accountId, account.turno_id, account.mesa);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error('No fue posible revertir la asociación de cuentas de mesa:', rollbackError);
    }
    throw error;
  }
}

const turnColumns = db.prepare('PRAGMA table_info(turnos)').all().map(column => column.name);
if (!turnColumns.includes('modalidad_personal')) {
  db.exec("ALTER TABLE turnos ADD COLUMN modalidad_personal TEXT NOT NULL DEFAULT 'equipo'");
}

const comandaItemColumns = db.prepare('PRAGMA table_info(comanda_items)').all().map(column => column.name);
if (!comandaItemColumns.includes('promociones_aplicadas')) {
  db.exec("ALTER TABLE comanda_items ADD COLUMN promociones_aplicadas TEXT DEFAULT '[]'");
}

const movementColumns = db.prepare('PRAGMA table_info(movimientos_inventario)').all().map(column => column.name);
if (!movementColumns.includes('comprobante_url')) {
  db.exec('ALTER TABLE movimientos_inventario ADD COLUMN comprobante_url TEXT');
}
if (!movementColumns.includes('gasto_id')) {
  db.exec('ALTER TABLE movimientos_inventario ADD COLUMN gasto_id TEXT');
}
if (!movementColumns.includes('precio_unitario')) {
  db.exec('ALTER TABLE movimientos_inventario ADD COLUMN precio_unitario INTEGER');
}
if (!movementColumns.includes('total')) {
  db.exec('ALTER TABLE movimientos_inventario ADD COLUMN total INTEGER');
}

const expenseColumns = db.prepare('PRAGMA table_info(gastos)').all().map(column => column.name);
if (!expenseColumns.includes('tipo')) {
  db.exec("ALTER TABLE gastos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto'");
}

const transferColumns = db.prepare('PRAGMA table_info(transferencias)').all().map(column => column.name);
if (!transferColumns.includes('turno_id')) {
  db.exec('ALTER TABLE transferencias ADD COLUMN turno_id TEXT');
}
if (!transferColumns.includes('mesero_id')) {
  db.exec('ALTER TABLE transferencias ADD COLUMN mesero_id TEXT');
}

function encode(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value !== 'string') return [key, value];
    if (['checklist', 'personal_detalle', 'banco_detalle', 'movimientos', 'gastos_detalle',
      'inventario_apertura', 'inventario_cierre', 'meseros_ids', 'turnos_incluidos', 'negocios', 'productos_combo',
      'promociones_aplicadas'].includes(key)) {
      try { return [key, JSON.parse(value)]; } catch { return [key, value]; }
    }
    return [key, value];
  }));
}

function decode(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (typeof value === 'boolean') return [key, value ? 1 : 0];
    if (value && typeof value === 'object' && ['checklist', 'personal_detalle', 'banco_detalle', 'movimientos',
      'gastos_detalle', 'inventario_apertura', 'inventario_cierre', 'meseros_ids', 'turnos_incluidos', 'negocios', 'productos_combo',
      'promociones_aplicadas'].includes(key)) {
      return [key, JSON.stringify(value)];
    }
    return [key, value];
  }));
}

module.exports = { db, encode, decode, dataDir, instanceId };
