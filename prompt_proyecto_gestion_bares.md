# Prompt: Sistema de Gestión Integral para Bares y Discotecas

Eres un desarrollador full-stack senior. Vas a construir desde cero una aplicación web para la gestión operativa y administrativa de bares y discotecas, reemplazando el control manual que hoy se hace en planillas de Excel. Lee todo este documento antes de escribir código: contiene el flujo de negocio completo, los roles, las reglas de cálculo y la estructura técnica esperada.

## 1. Objetivo del sistema

La app debe digitalizar el ciclo completo de un turno de trabajo (apertura → atención de mesas → despacho en barra → cierre de planilla) y el cierre administrativo semanal, con comunicación interna en tiempo real entre los roles (el mesero envía la comanda y debe aparecer al instante en la barra, sin recargar la página).

## 2. Roles y permisos (control de acceso basado en roles)

1. **Mesero** (usa la app desde el celular)
   - Registra una comanda por mesa: productos, cantidades.
   - Puede marcar ítems con descuento autorizado o como cortesía autorizada, indicando quién autorizó.
   - Puede registrar el ingreso de un "descorche" (bebida traída por el cliente) con el valor cobrado.
   - Ve el estado de sus propias comandas (enviada / confirmada / despachada / pagada).

2. **Barra** (usa la app desde una tablet)
   - Ve una cola en tiempo real de comandas "enviadas" pendientes de confirmar.
   - Al confirmar una comanda: registra el pago (efectivo o transferencia), descuenta automáticamente el inventario, y agrega automáticamente el producto de cortesía según la regla por categoría (ver sección 4).
   - Registra compras menores del turno (vasos desechables, sal, limón, etc.) indicando si hay factura.
   - Registra desembolsos de dinero autorizados por el administrador o los dueños.
   - Registra novedades del turno (fallos de dispositivo, problemas con dinero, etc.).

3. **Administrador** (usa la app desde un computador)
   - Abre el turno: define la base de caja entregada y confirma/ajusta el conteo físico de inventario inicial.
   - Ve un dashboard en vivo del turno activo: total vendido, total en efectivo, total en transferencias, gastos, comandas por mesero.
   - Cierra el turno: el sistema calcula automáticamente la comisión del 5% de ventas por mesero (se registra como gasto del turno), compara el dinero que el sistema espera contra el conteo físico ingresado por el administrador, y exige registrar una novedad si hay una diferencia.
   - Administra el inventario (alta de productos, categorías, ajustes de stock).
   - Hace el cierre semanal: selecciona los turnos cerrados de la semana, registra los gastos fijos (arriendo, pago de servicios públicos, pagos a proveedores, anticipos a socios, sueldo de administración, entre otros) y el sistema calcula la utilidad neta de la semana.

4. **Dueño** (solo lectura)
   - Dashboard de solo consulta: turnos cerrados, cierres semanales, inventario actual, novedades, indicadores (ventas, gastos, utilidad).

## 3. Flujo operativo de un turno (reglas de negocio detalladas)

1. El administrador abre la planilla (turno): entrega la base de caja y hace/valida el conteo físico de inventario con el encargado de barra.
2. El administrador verifica la presentación de los meseros y registra novedades de esa verificación si las hay.
3. Inicia el servicio: el mesero atiende una mesa y registra el pedido (comanda).
4. El mesero envía la comanda a la barra junto con el dinero recibido (en el modo "discoteca" el pago es inmediato por comanda; en el modo "cantina" una misma mesa puede acumular varias comandas y se cobra el total al momento de irse el cliente). El sistema debe soportar ambos modos, configurables por turno.
5. La barra recibe y confirma la comanda, verifica el dinero (efectivo o transferencia), descuenta el inventario y entrega los productos al mesero.
6. **Regla de cortesías automáticas por categoría de producto despachado:**
   - Categoría "Aguardiente" → cortesía automática: 1 botella de agua.
   - Categoría "Whisky" → cortesía automática: 1 Gatorade.
   - Categoría "Ron" → cortesía automática: 1 gaseosa personal.
   - Estas reglas deben ser configurables (tabla categoría → producto de cortesía), no hardcodeadas.
7. Los descuentos y cortesías **no automáticas** (autorizadas puntualmente por los dueños, ej. una botella de $300.000 dejada en $280.000, o un producto entregado gratis) se registran en la comanda por el mesero, indicando quién autorizó.
8. El descorche: si se autoriza el ingreso de una bebida externa del cliente, se registra en la barra con el valor cobrado (esto es un ingreso adicional del turno, no una venta de inventario).
9. La barra puede realizar compras menores necesarias (vasos, sal, limón, etc.), siempre registrando si hay factura (esto es un gasto del turno).
10. La barra puede entregar dinero para algún pago o imprevisto, previa autorización del administrador o los dueños (desembolso, es un gasto del turno).
11. Al cierre del turno:
    - Se calcula el 5% de comisión sobre el total vendido por cada mesero (se registra como gasto del turno).
    - Se genera un listado de inventario para que el administrador haga el cruce físico contra el inventario inicial y determine el total realmente vendido.
    - Se verifican los gastos con factura, los desembolsos autorizados, las cortesías y los descuentos, para que todo quede en la planilla.
    - Se verifica el total en efectivo y en transferencias contra lo esperado por el sistema.
    - Se cierra la planilla; cualquier novedad (falla de dispositivo, problema de dinero o de una transferencia) queda registrada en el cierre.

## 4. Cierre semanal (proceso del administrador)

- Al final de la semana hábil, el administrador consolida los turnos cerrados de esa semana.
- Registra los gastos fijos: arriendo, pago de servicios públicos, sueldos (aseo, mantenimiento), pagos a proveedores, anticipos a socios, sueldo del administrador, contrataciones para arreglos, entre otros.
- El sistema calcula: ventas totales de la semana (suma de turnos) + ingresos por descorches − gastos de los turnos (comisiones, compras, desembolsos) − gastos semanales fijos = utilidad neta de la semana.
- El administrador entrega el dinero/transferencias a los dueños al final de la semana y reporta las novedades de la semana.
- El administrador ingresa al inventario los productos comprados durante la semana y verifica el stock correcto.

## 5. Entidades de datos principales (modelo de datos sugerido)

- **usuarios**: id, nombre, rol (mesero | barra | administrador | dueño), credenciales, negocio_id (para soportar múltiples negocios administrados por la misma persona).
- **negocios**: id, nombre, modo_operacion (discoteca | cantina), configuración de comisión (%).
- **categorias_producto**: id, nombre, cortesia_asociada_id (nullable).
- **productos** (inventario): id, negocio_id, nombre, categoria_id, unidad, stock_actual, precio_venta, precio_costo.
- **turnos**: id, negocio_id, fecha_apertura, fecha_cierre (nullable), base_caja, estado (abierto | cerrado), inventario_apertura (snapshot), inventario_cierre (snapshot), totales calculados, novedades_apertura, novedades_cierre.
- **comandas**: id, turno_id, mesa, mesero_id, estado (enviada | confirmada | despachada | pagada), modo_pago (efectivo | transferencia | mixto), creado_en.
- **comanda_items**: id, comanda_id, producto_id, cantidad, precio_unitario, descuento_unitario, es_cortesia (bool), autorizado_por (nullable).
- **pagos**: id, comanda_id, tipo (efectivo | transferencia), monto.
- **gastos_turno**: id, turno_id, tipo (compra | desembolso | comision), concepto, monto, tiene_factura (bool), autorizado_por (nullable).
- **descorches**: id, turno_id, producto_descripcion, valor_cobrado.
- **novedades**: id, turno_id (o cierre_semanal_id), texto, creado_en.
- **gastos_semanales**: id, negocio_id, semana_inicio, semana_fin, concepto, categoria, monto.
- **cierres_semanales**: id, negocio_id, semana_inicio, semana_fin, turnos_incluidos (ids), total_ventas, total_gastos_turnos, total_gastos_semanales, utilidad_neta.

## 6. Stack tecnológico a usar

- **Frontend**: React + Vite + Tailwind CSS.
- **Comunicación en tiempo real**: Socket.io (cliente y servidor) para que las comandas y el dashboard del turno se actualicen sin recargar.
- **Backend**: Node.js + Express.js (API REST) + Socket.io (servidor).
- **Base de datos**: SQLite local, alojada en el equipo servidor.
- **Acceso a datos**: API REST local mediante Node.js + Express; los dispositivos no acceden directamente al archivo SQL.
- **Autenticación**: JWT + bcrypt para el hash de contraseñas. Middleware de autorización por rol.
- **Control de versiones**: Git.

## 7. Estructura de carpetas esperada

```
/proyecto-gestion-bares
├── backend/
│   ├── src/
│   │   ├── config/          # conexión a BD, variables de entorno
│   │   ├── models/          # esquema Prisma
│   │   ├── routes/          # rutas Express por módulo (turnos, comandas, inventario, gastos, cierres)
│   │   ├── controllers/     # lógica de cada endpoint
│   │   ├── services/        # reglas de negocio (cálculo de comisión, cortesías automáticas, comparativo de caja)
│   │   ├── middlewares/     # auth JWT, control de rol
│   │   ├── sockets/         # eventos en tiempo real (nueva comanda, cambio de estado, cierre de turno)
│   │   └── app.js
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── mesero/      # nueva comanda, mis mesas
│   │   │   ├── barra/       # cola de despachos, compras, desembolsos, descorches
│   │   │   ├── admin/       # turno en vivo, apertura/cierre, inventario, cierre semanal
│   │   │   └── dueño/       # dashboard de solo lectura
│   │   ├── components/      # componentes reutilizables (ticket de comanda, tabla, modal)
│   │   ├── context/         # sesión de usuario, socket
│   │   ├── services/        # llamadas a la API
│   │   └── App.jsx
│   └── package.json
└── README.md
```

## 8. Alcance de la primera versión (MVP) — orden sugerido de construcción

1. Autenticación y roles (login, JWT, middleware de permisos).
2. Módulo de inventario (CRUD de productos y categorías, configuración de cortesías por categoría).
3. Apertura de turno (base de caja + conteo inicial de inventario).
4. Flujo de comanda: mesero crea comanda → aparece en tiempo real en la cola de barra → barra confirma pago y despacha (aplicando cortesía automática y descontando inventario).
5. Registro de compras, desembolsos, descorches y novedades desde barra.
6. Dashboard en vivo del turno para el administrador.
7. Cierre de turno: cálculo de comisión por mesero, comparativo de caja (esperado vs. contado), registro de novedades de cierre.
8. Cierre semanal: selección de turnos, registro de gastos fijos, cálculo de utilidad neta.
9. Dashboard de solo lectura para el dueño.

## 9. Fuera de alcance (no incluir en esta versión)

- Integración con pasarelas de pago.
- Facturación electrónica.
- Integración con sistemas contables externos.
- Aplicación móvil nativa (la web debe ser responsiva para celular y tablet, pero no se construye app nativa).
- Migración de datos históricos de planillas anteriores.
- Despliegue en infraestructura de producción (se construye como prototipo funcional).

## 10. Notas finales para quien programe

- El sistema debe soportar múltiples negocios (una misma persona administra varios bares/discotecas), por lo que casi todas las tablas deben llevar `negocio_id`.
- Los cálculos de comisión, cortesías automáticas y comparativo de caja deben vivir en la capa de servicios del backend, no en el frontend, para mantener la integridad de los datos.
- Prioriza que la comunicación mesero → barra → administrador sea en tiempo real; es el punto central que reemplaza la coordinación manual por chat que se hacía antes.
