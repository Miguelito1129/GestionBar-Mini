# Memoria del proyecto GestionBar

## 1. Evolución del proyecto

El proyecto comenzó con la intención de usar Telegram para compartir información operativa de bares y discotecas. La visión evolucionó hacia una aplicación web propia, accesible desde computadores, tabletas y teléfonos dentro de una red local.

La plataforma debe permitir interfaces específicas para:

- Administrador.
- Dueño.
- Personal de barra.
- Meseros.

El objetivo actual es trabajar primero con una base de datos local, sin costos de servicios externos. La conexión a Supabase y Telegram fue retirada del flujo principal.

## 2. Arquitectura actual

- Frontend: React + Vite.
- Backend: Node.js + Express.
- Base de datos: SQLite local.
- Respaldo automático SQLite: `backend/backup.js` crea una copia al iniciar el servidor y cada 15 minutos, conserva las 96 más recientes y replica a `%OneDrive%\GestionBar\Backups\<id-instancia>` cuando Windows tiene OneDrive configurado. La copia local adicional queda junto a los datos (`backend/data/backups` en desarrollo o `%LOCALAPPDATA%\GestionBar\instances\<id-instancia>\data\backups` en el ejecutable). Solo se guardan copias que pasan `PRAGMA integrity_check`.
- Cliente de API: `src/lib/localApi.js`.
- Servidor integrado: `server.js`.
- Esquema y creación de base: `backend/db.js`.
- API REST: `backend/api.js`.
- Base de datos real: `backend/data/gestionbar.sqlite`.
- Acceso de otros dispositivos: mediante la IP local del computador servidor.

El navegador nunca accede directamente al archivo SQLite. Todas las operaciones pasan por la API local.

SQLite es la fuente de verdad para negocios, personal, productos, planillas y usuarios. El navegador conserva únicamente la sesión activa y algunos borradores heredados pendientes de migración.

## 3. Comandos principales

### Uso diario e impresión en Windows

En el computador que tiene enlazada por Bluetooth la impresora `Printer001`,
abre una terminal en la carpeta del proyecto y ejecuta:

```powershell
npm start
```

`npm start` compila el frontend actualizado y luego arranca Express, la API local
y la ruta de impresión desde el puerto `3000`, probando hasta el `3010` si el
puerto solicitado está ocupado y no se definió `PORT`. Para imprimir, el backend debe correr
en el mismo computador Windows que está enlazado a la impresora. El puerto serial
detectado para `Printer001` es `COM3`, con velocidad predeterminada de `9600`
baudios. Si Windows asigna otro puerto, configúralo antes del inicio:

```powershell
$env:PRINTER_PORT = "COM3"
$env:PRINTER_BAUD_RATE = "9600"
npm start
```

No se debe mantener otro proceso del backend usando el COM de la impresora. Si se agregó o modificó una ruta de Express y el servidor ya estaba
corriendo, detenerlo con `Ctrl+C` en su terminal y volver a ejecutar el comando.

### Desarrollo

Para desarrollo, abrir dos terminales en la carpeta del mismo proyecto. Ejecutar
en la primera:

```powershell
npm run dev:server
```

Y en la segunda:

```powershell
npm run dev
```

El navegador de este computador usa `http://localhost:5173`; los dispositivos en
la misma red usan la IP del computador servidor con el puerto `5173`. En desarrollo
Vite envía las peticiones `/api` al backend del puerto `3000`. Para uso diario o
para probar la impresión desde teléfonos, se recomienda `npm start` y acceder al
puerto `3000` del computador conectado a `Printer001`.

Otros comandos:

```powershell
# Compilar frontend
npm run build

# Compilar y ejecutar la aplicación integrada
npm start
```

Después de cambiar el backend se debe reiniciar Express. Después de cambiar el
frontend en desarrollo, se recomienda recargar con `Ctrl + F5`.
El frontend de desarrollo usa el puerto fijo `5173` (`strictPort`): si ya está ocupado, Vite falla en vez de iniciar silenciosamente en otro puerto. El backend usa el puerto `3000`.

## 4. Cambios realizados

### Migración y eliminación de servicios externos

- Se eliminó la carpeta `telegram-bot`.
- Se retiraron las referencias principales a Telegram.
- Se eliminaron los archivos principales de Supabase.
- Se reemplazaron las operaciones de datos por llamadas a la API local.
- Se actualizó la documentación de despliegue.
- Se conservaron los datos históricos mediante migraciones no destructivas.

### Base de datos

Se añadieron o adaptaron tablas para:

- `negocios`
- `staff`
- `productos`
- `planillas`
- `turnos`
- `comandas`
- `comanda_items`
- `pagos`
- `movimientos_inventario`
- `gastos_turno`
- `descorches`
- `novedades`
- `gastos_semanales`
- `cierres_semanales`
- `usuarios`

Los históricos de planillas y gastos se conservan. Las migraciones usan identificadores heredados para evitar duplicados.

### Roles y autenticación

- El correo reservado `mdmm1100@gmail.com` es la única cuenta `administrador`; las cuentas antiguas con rol administrador pasan a `gerente`.
- El inicio de sesión y la validación de contraseñas se realizan en el backend. La API exige un token de sesión aleatorio y con vencimiento de ocho horas; SQLite conserva solo el hash del token en `sesiones`.
- `localStorage` conserva el token de sesión para restaurar el acceso en el navegador. El cierre de sesión invalida el token en el servidor.
- Las respuestas de `usuarios` no incluyen hashes ni sales de contraseña. Solo la cuenta maestra puede modificar usuarios, administrar negocios o consultar los enlaces de red.
- La licencia offline identifica el `MachineGuid` de Windows y valida firmas Ed25519. No evita modificaciones deliberadas del ejecutable ni la clonación completa de una máquina virtual o de la instalación de Windows.

### Apertura de turnos

La apertura operativa se realiza desde `src/components/Planilla/Planilla.jsx`, que permite:

- Elegir modo discoteca o cantina.
- Registrar la base de caja.
- Seleccionar responsable de barra.
- Seleccionar uno o más meseros.
- Registrar conteo inicial de inventario.
- Guardar novedades de apertura.
- Crear el turno en estado abierto.
- Registrar los responsables en `staff`.

Los perfiles de barra y mesero creados localmente se combinan con los registros de `staff` para que puedan seleccionarse.

### Comandas e inventario

- El mesero puede crear comandas.
- Barra puede consultar comandas.
- Los pedidos de una mesa se agrupan en una cuenta abierta durante el turno. Se pueden agregar varias comandas a esa cuenta y se registra un solo pago acumulado al cerrarla.
- La pestaña de cuentas abiertas agrupa por mesa; al seleccionar una cuenta consulta y muestra todas las comandas activas de esa mesa, incluidas las creadas por otros meseros autorizados.
- La cuenta solo se puede cerrar cuando todos sus pedidos activos están despachados; el medio de pago se guarda una vez para el total de la mesa.
- El turno no se puede cerrar mientras haya cuentas abiertas; una cuenta que quedó sin pedidos activos tras cancelar sus comandas puede cerrarse sin generar un pago.
- Se valida el stock antes del despacho.
- El despacho descuenta inventario.
- Se registra el movimiento de inventario.
- Las cuentas abiertas y comandas se actualizan entre dispositivos mediante polling local cada tres segundos, porque SQLite no ofrece Realtime nativo.

### Último error corregido

Al abrir turno aparecía:

> No fue posible guardar los responsables del turno.

La causa era que el frontend enviaba `activo: true`, pero SQLite no acepta booleanos JavaScript como parámetros. `backend/db.js` ahora convierte automáticamente:

- `true` a `1`.
- `false` a `0`.

También se mejoraron los mensajes de error de `src/lib/localApi.js` para mostrar la respuesta real del backend.

La compilación fue validada con `npm run build`.

### Conexión general a SQLite

- `useAuth.jsx` consulta, crea, actualiza y elimina usuarios mediante `/api/usuarios`.
- `MainApp.jsx` inicializa los datos de demostración en SQLite cuando la base está vacía.
- Negocios, personal, productos, gastos fijos, cuentas por cobrar y planillas se cargan desde SQLite.

### Agenda de tienda y listas paginadas

- La agenda de tienda es opcional y se habilita únicamente para los negocios que usan citas.
- Gerencia conserva la vista de calendario mensual y puede consultar las citas del día seleccionado. Barra ve una lista compacta agrupada por fecha y puede desplegar los detalles de cada cita.
- La lista de Barra muestra solo las citas con estado agendada de la semana actual, ordenadas cronológicamente desde la más cercana; incluye la cédula junto al servicio.
- Las citas se separan en pestañas de saldo pendiente y pago completo. Una cita con saldo pendiente permite iniciar otra reserva reutilizando los datos del cliente y el servicio.
- Las citas de seguimiento conservan la misma línea de cuenta y el precio acordado. El total abonado y el saldo son acumulados entre sus citas; un nuevo abono se registra como pago de la cita de seguimiento y reduce únicamente el saldo pendiente. La base relaciona las citas con `linea_id`, migrando las citas existentes sin alterar sus pagos.
- Las citas guardan teléfono y cédula del cliente; la migración agrega la cédula sin perder registros anteriores.
- Los abonos de citas aparecen como movimientos individuales en el historial de ventas del día de la tienda y se incluyen en el total diario de ingresos.
- El módulo de Reportes de tienda permite elegir fechas y consultar gráficas de ventas y gastos por día/semana/mes, gastos por categoría y productos más vendidos. También compara unidades vendidas con el catálogo para mostrar productos de poco movimiento o sin ventas en el período.
- Las comandas de Mesero y Barra se organizan en pestañas por estado y se muestran en cuadrículas de dos columnas, seis elementos (tres filas) por página, con una sola columna en pantallas estrechas. Las tarjetas son compactas y la lista de comandas de Mesero no incluye una acción de impresión de factura; la impresión operativa del pedido hacia Barra no se modifica.
- La configuración de mesas define directamente la cantidad total numerada desde Mesa 1. Reducir requiere una confirmación explícita del usuario y del backend, y elimina las de mayor número; el backend bloquea el ajuste si las mesas que se retirarían aún tienen comandas abiertas. Las comandas históricas conservan el número de mesa registrado. No se permite borrar mesas individuales.
- Las listas operativas extensas se muestran en páginas de 10 elementos mediante el control común de `src/components/common/Pagination.jsx`. La paginación se aplica a registros de gastos, usuarios, promociones, mesas, ventas y cierres, comandas, pedidos, reportes, finanzas, citas y algunos resúmenes del dashboard.
- Los listados del módulo Inventario se mantienen sin paginación, según el alcance solicitado. La paginación de productos de la tienda corresponde únicamente al catálogo de venta, no al módulo Inventario.
- Se eliminó el botón superior de `Abrir turno` del menú de escritorio. La vista sigue disponible en la navegación móvil.
- Se validó la persistencia de usuarios y la compilación del proyecto.
- Se crearon cuentas iniciales de prueba en SQLite para administrador, dueño, barra y mesero. Las contraseñas fueron almacenadas únicamente como hashes PBKDF2.
- Se corrigió el login por red local HTTP: la verificación ahora acepta el hash PBKDF2 y el hash fallback compatible con navegadores sin `crypto.subtle`; las cuentas iniciales se actualizaron al modo compatible.
- Se eliminaron los datos operativos ficticios de SQLite: negocios, personal, productos, inventario, planillas, turnos, comandas, pagos, gastos, transferencias, cuentas por cobrar y cierres. Se conserva únicamente la cuenta administrativa de acceso.
- Se retiró la carga automática de datos de demostración del frontend. La aplicación muestra una pantalla vacía hasta que el administrador cree el negocio real.
- La barra ahora puede autorizar pedidos pendientes. La autorización valida existencias, registra el pago, descuenta exactamente las cantidades de la comanda y crea movimientos de inventario.
- Barra puede crear comandas desde su propio espacio durante un turno de equipo; los pedidos entran a la cola normal para validación de stock y despacho. La API verifica que Barra sea la cuenta asignada al turno.
- El acceso **Nueva comanda** de Barra está en la navegación principal, tanto en escritorio como en la barra inferior móvil; abre directamente el compositor sin pasar por las pestañas internas de la cola.
- El mesero inicia en **Tomar pedido**, con una cuadrícula de mesas. Al elegir una mesa, el compositor identifica claramente para cuál se crea la comanda; al enviarla vuelve a la selección de mesas. **Mis comandas** queda separado en la navegación. La gestión de mesas conserva el ajuste por cantidad en un solo paso, confirma las reducciones y bloquea retirar mesas con comandas abiertas.
- En **Nueva comanda**, Barra también inicia en la cuadrícula de mesas; al elegir una se abre el compositor vinculado a esa mesa y, al enviar, vuelve a la cuadrícula.
- En modalidad individual, la navegación de Barra respeta el módulo seleccionado: **Cola** muestra las ventas del turno, **Nueva comanda** permite seleccionar mesa y registrar la venta cobrada en un solo paso, y **Mesas** abre la administración de cantidades.
- Barra ya no registra entradas urgentes de inventario. La API solo permite que esa cuenta registre movimientos de inventario tipo venta, para mantener el descuento de existencias al despachar comandas.
- La planilla sincroniza cada 3 segundos los movimientos del turno: los despachos de comandas actualizan automáticamente las salidas y existencias desde el inventario de apertura. El conteo físico sigue siendo corregible y se ajusta al ritmo de nuevos movimientos. La columna de cortesías se retiró de la planilla, perspectivas e impresiones; los datos históricos se conservan para compatibilidad.
- Se creó una interfaz móvil específica para meseros: búsqueda de productos, catálogo táctil, cantidades incrementales, carrito, total actualizado en vivo, envío de pedidos y listado de pedidos de la noche.
- Los pedidos del mesero muestran estados legibles: falta confirmación de barra, pagado o pedido cancelado. El mesero puede cancelar un pedido mientras todavía está pendiente de autorización.
- La vista «Mis comandas» del mesero separa los pedidos por pestañas de estado con contador; inicia en «Confirmar pago» y mantiene categorías para pedidos en espera de Barra, pagados, cancelados y otros.
- La barra ya no abre turnos desde su navegación. El administrador abre y cierra el turno únicamente desde Planillas; esa apertura crea el turno compartido en SQLite para barra y meseros.
- Se separaron las interfaces operativas en `MeseroWorkspace.jsx` y `BarraWorkspace.jsx`. `RoleWorkspace.jsx` quedó como enrutador y `useTurnoData.js` centraliza la carga y polling del turno, productos y comandas. El módulo de administrador no fue alterado.
- La interfaz del mesero ahora organiza el catálogo por categorías, muestra stock y cantidades seleccionadas, y permite editar o cancelar comandas pendientes. Toda modificación solicita confirmación antes de actualizar la comanda y avisar a barra.
- El inventario operativo es compartido: `productos` en SQLite es la fuente única que administra el módulo Inventario del administrador y que consultan/actualizan barra y mesero durante el turno.
- Las comandas ya no usan mesa en la interfaz. Cada turno asigna un consecutivo a cada comanda, guarda el ID de la cuenta del mesero en `mesero_id` y su nombre de usuario en `mesero_nombre`; el rol no se usa para identificar pedidos. Cada cuenta consulta solo sus comandas. Barra puede desplegar los productos antes de autorizar.
- La cola de Barra normaliza la lista de meseros con `Map.values()` antes de ordenar; esto evita una excepción de renderizado que dejaba la pantalla en negro al tener comandas.
- La cola de Barra separa pedidos en pestañas por estado, en orden de pendientes de autorización, entregados con pago pendiente, pagados, cancelados y otros; cada pestaña muestra su contador, conserva el filtro por mesero y los cancelados no se suman en ventas.
- Los pedidos pendientes de autorización se despliegan automáticamente al llegar a Barra, mostrando sus productos; cada uno puede ocultarse manualmente.
- Las filas de la cola de Barra usan las mismas columnas y espacios de acción fijos en todos los estados; el detalle de productos se expande debajo sin desplazar el resumen ni las filas vecinas. Las pestañas por estado y la comparación alineada de productos, cantidad solicitada, stock y subtotal se conservan en el layout actual.
- La navegación de escritorio usa una barra lateral contraíble; el área principal tiene un ancho máximo ampliado para aprovechar mejor pantallas grandes. La navegación móvil y sus pestañas inferiores se mantienen independientes.
- La preferencia de contraer la barra lateral se conserva entre recargas. La interfaz usa una identidad oscura de carbón con acentos ámbar/violeta, cabecera de contexto en escritorio, superficies diferenciadas y estados de foco/hover; las transiciones respetan la preferencia del sistema para reducir movimiento.
- La sección de Promociones presenta resumen de ofertas, guía de tipos, formulario destacado y tarjetas que distinguen 2×1, cortesía, combo y precio especial, conservando creación, activación/pausa y eliminación.
- En el compositor del mesero, las ofertas tienen tarjetas compactas codificadas por tipo, descripción legible y botón claro para agregarlas al pedido; en móviles se recorren horizontalmente.
- El catálogo de productos del mesero usa búsqueda accesible, filtros de categoría con cantidades, tarjetas táctiles con precio/stock/promoción/cantidad seleccionada y estado vacío con acción para limpiar filtros; las tarjetas continúan usando `addItem` y respetan el stock.
- Las comandas del mesero se imprimen automáticamente en `Printer001` cuando se envían a Barra; al reenviar una comanda editada también se imprime su actualización. Una falla de impresora se informa al mesero sin deshacer el pedido guardado. Las comandas pagadas conservan además el botón para reimprimir el comprobante. El servidor valida que el estado y la cuenta coincidan y envía los trabajos en cola por Bluetooth Serial Port COM3 (9600 baudios por defecto; `PRINTER_PORT` y `PRINTER_BAUD_RATE` permiten ajustar el enlace).
- El ticket de 80 mm se titula «COMANDA», no imprime forma de pago, subtotal ni agradecimiento, y usa fuente térmica estándar de 42 caracteres conservando CR/LF. La tabla ahora usa esa misma fuente estándar, más grande que la compacta anterior, y se ajusta a 42 caracteres con margen de dos espacios; mantiene las columnas de producto, cantidad y total, calcula ancho dinámico para cantidades e importes en pesos (`$`) y envuelve nombres largos. Muestra el total general. Solo el nombre del negocio se imprime en negrita; la copia de Barra se identifica en el pie y se alimentan tres líneas antes del corte.
- Los errores de impresión distinguen el endpoint no disponible (404, backend que requiere reinicio/actualización) de la impresora desconectada o el puerto Bluetooth ocupado (503), con instrucciones comprensibles para el mesero.
- La vista de Inventario destaca productos totales, bajo mínimo, agotados y con existencias suficientes; las métricas permiten filtrar por estado y la tabla muestra stock relativo, mínimo, precio y alertas con diseño adaptable. Se conserva la edición inline y Excel; tipografía, controles y espaciado se ampliaron ligeramente para mejorar la lectura.
- En el inventario del administrador se puede cambiar el orden manteniendo presionada el asa de arrastre y soltando cada producto en su nueva posición; el orden se guarda en `productos.sort_order`, se conserva al cargar y es el que ve el mesero en su catálogo. El catálogo vuelve a consultar productos durante su actualización periódica para reflejar los cambios sin recargar.
- El registro de Gastos guarda descripciones en la columna SQLite `desc`, adjunta comprobantes de imagen JPEG comprimidos y persistidos como datos, permite revisar las imágenes guardadas y filtrar el historial por texto, categoría, fechas y estado de cierre. Los gastos incluidos en cierres se conservan visibles y no se pueden borrar desde esta pantalla.
- El administrador puede eliminar un negocio desde la barra lateral; exige escribir el nombre y confirmar una segunda vez. La API borra en una transacción el negocio y sus datos operativos e históricos asociados, y quita el negocio de las asignaciones explícitas de usuarios.
- Al desplegar una comanda en barra, cada producto se compara con el stock actual de `productos`, mostrando cantidad solicitada, existencia disponible y alerta de faltante. La autorización se bloquea visualmente si algún producto no alcanza, además de conservar la validación al guardar.
- Los renglones de comanda guardan las promociones aplicadas y Barra identifica su tipo (2×1, precio especial, combo, cortesía o producto + cortesía). Los pedidos existentes sin ese dato conservan una etiqueta genérica «Promoción».
- La entrada urgente de inventario de barra quedó dentro de un panel desplegable. La autorización de una comanda descuenta inventario y la deja como `entregada_falta_pago`; el mesero confirma `pago recibido` o mantiene `falta pago`, y solo la confirmación positiva cambia el estado a `pagada`.
- Administración tiene una vista de Comandas con filtro por estado, productos y marcas de tiempo de creación, autorización, entrega y pago.
- Al confirmar el pago, el mesero debe seleccionar efectivo, tarjeta o transferencia. El medio se guarda en `comandas.modo_pago` y `pagos.tipo`; transferencia queda registrada localmente como preparación para la futura integración API.
- Se retiró la asociación automática heredada de productos a agua, Gatorade o gaseosa desde el cierre de Planillas. Las relaciones comerciales ahora se administran en el módulo **Promociones** del administrador y se guardan en SQLite (`promociones`).
- La pantalla inicial de Planillas del administrador presenta por separado la apertura del turno y el historial de cierres. El historial se ordena del más reciente al más antiguo, permite buscar por fecha/horario y filtrar por rango de fechas; muestra hasta 10 planillas por página sin borrar ni ocultar permanentemente el resto, y ofrece acceso al detalle y a la descarga del PDF. El detalle carga comandas asociadas al turno de cierre o a la fecha del turno, permite filtrarlas por mesero y por pestañas de estado (todos, pendientes por autorizar, entregados sin pago, pagados, cancelados y otros), con tarjetas y productos basados en la presentación del listado de Barra. Muestra errores de carga en pantalla; su selector tolera meseros o comandas con datos incompletos para evitar bloquear el renderizado. Las fechas y horas se guardan y visualizan con referencia a `America/Bogota`, interpretando correctamente las marcas SQLite que están en UTC.
- La apertura de planilla conserva el flujo normal de selección de personal. La autorización de cuentas de mesero se gestiona desde un módulo de Barra durante el turno: se inicia sin meseros habilitados, Barra puede activar o desactivar cuentas asociadas al negocio y la selección se persiste en `turnos.meseros_ids`. «Ventas Meseros» refleja los habilitados; el espacio de mesero solo carga catálogo/comandas y permite operar si su cuenta está habilitada. Sin turno abierto o sin autorización se muestra un mensaje de acceso bloqueado.
- Al abrir planilla, el gerente debe elegir una cuenta con rol Barra asignada al negocio. Su ID se guarda en `turnos.barra_id`; la API limita la lectura y modificación del turno a esa cuenta, y las demás cuentas de Barra quedan bloqueadas para ese turno.
- El comando `npm run build:portable` genera `release/GestionBar.exe`, un ejecutable Windows x64 que incluye Node.js, Express y el frontend; al abrirlo inicia el servidor y el navegador sin requerir Node/npm/Visual Studio en el equipo de destino. El ejecutable mantiene la consola abierta para el servidor y usa `%LOCALAPPDATA%\GestionBar\instances\<id-instancia>\data\gestionbar.sqlite`; el ID es un hash de la ruta completa del ejecutable para separar copias ubicadas en carpetas distintas. El puerto predeterminado es `3000` y, si está ocupado, se prueban puertos siguientes hasta `3010`. El empaquetado no incluye la base de datos de desarrollo ni migra los datos del negocio; la base anterior en `%LOCALAPPDATA%\GestionBar\data\gestionbar.sqlite` se conserva sin cambios. Para crearlo se requiere Node.js 24 x64 y conexión a Internet durante la descarga inicial del runtime.
- Los perfiles de administrador y gerente incluyen **Compartir acceso** en el menú móvil y en la barra lateral de escritorio. El backend permite a ambos consultar las direcciones IPv4 del equipo servidor y compartir enlaces con meseros y barra; ambos roles entran por el mismo enlace y su cuenta determina el espacio disponible. Los dispositivos deben estar en la misma red local que el servidor.
- Las comandas se consultan entre dispositivos con sondeo secuencial cada segundo. Al editar una comanda, el mesero guarda primero los productos y luego marca `comandas.actualizada_en`; Barra detecta esa revisión y vuelve a cargar los productos de la comanda para reflejar los cambios sin reiniciar. La columna `actualizada_en` se migra al iniciar el backend.
- Bancos en Planillas registra cada transferencia con mesero activo, banco, monto, referencia opcional y foto comprimida del comprobante. El detalle se guarda en `transferencias` con `turno_id` y, al cerrar, se vincula mediante `planilla_id`; la vista histórica muestra el mesero, banco, fecha, valor y foto. El total por banco se conserva en `banco_detalle` para no romper reportes. Los comprobantes consultados se cargan desde SQLite y no se duplican en `localStorage`.
- Promociones permite crear, activar, pausar y eliminar reglas 2×1 y producto + cortesía. Un 2×1 cobra una unidad por cada dos solicitadas, pero descuenta las dos del inventario; una promoción de cortesía descuenta el producto vinculado al autorizar la comanda en Barra.
- Las promociones de cortesía solo permiten asociar Agua, Gatorade o Gaseosa. El módulo también admite precio especial y combos de varios productos/cantidades con precio único; las promociones activas se muestran al mesero y los combos se agregan directamente a su carrito.

### Adaptación responsive

- Se añadió una hoja de estilos global en `src/index.css`.
- Se estableció `box-sizing`, prevención de desbordamiento horizontal y tamaños táctiles mínimos.
- En teléfonos, los campos se muestran con tamaño legible y las tablas permiten desplazamiento horizontal.
- El formulario de nuevas comandas se apila en una sola columna en pantallas pequeñas.
- El contenido móvil usa padding adaptable y respeta el área segura inferior de dispositivos con navegación por gestos.

## 5. Estado actual

Ya está disponible:

- Aplicación web local.
- API Express.
- SQLite local.
- Roles básicos.
- Gestión inicial de negocios, personal y productos.
- Apertura de turnos.
- Comandas.
- Pagos y despacho.
- Descuento de inventario.
- Conservación de históricos.

Todavía está pendiente:

1. Cierre de turno local.
2. Gastos, descorches y novedades completas.
3. Persistencia de imágenes de comprobantes en los módulos distintos a Gastos y Bancos.
4. Probar restauración/importación de SQLite desde una copia automática válida.
5. Migración completa de módulos antiguos.
6. Pruebas integrales con varios dispositivos y roles.
7. Verificación completa de productos y stock antes del conteo de apertura.

## 6. Reglas para usar los tokens al mínimo

Estas reglas deben aplicarse en futuras sesiones:

1. Leer primero este archivo antes de explorar el proyecto.
2. No volver a investigar decisiones ya documentadas.
3. Usar búsquedas específicas con `rg` o `glob`, no listar todo el proyecto.
4. Leer únicamente los rangos necesarios de los archivos.
5. Agrupar lecturas independientes en una sola llamada paralela.
6. No delegar tareas pequeñas que puedan resolverse con una o dos búsquedas.
7. No repetir pruebas ya ejecutadas si el código relacionado no cambió.
8. Ejecutar primero validaciones pequeñas y dirigidas.
9. Usar `npm run build` después de cambios relevantes del frontend.
10. Probar la API directamente solo cuando el error esté relacionado con backend o SQLite.
11. No pegar archivos completos en la conversación si basta con indicar rutas y líneas relevantes.
12. Mantener las respuestas breves y orientadas a acciones.
13. No crear planes o archivos adicionales si el usuario no los solicita.
14. No modificar archivos no relacionados con la tarea.
15. Antes de editar, buscar si ya existe una función reutilizable.
16. Después de cada cambio, comprobar solo el comportamiento afectado.
17. No instalar dependencias salvo que una validación lo requiera.
18. No volver a explicar toda la arquitectura; resumir solo lo nuevo.
19. Mantener este archivo actualizado únicamente cuando cambien decisiones, arquitectura o estado importante.
20. Si falta información crítica, hacer una sola pregunta concreta antes de explorar ampliamente.

## 7. Procedimiento recomendado para futuras tareas

1. Leer `memoria.md`.
2. Identificar el archivo o módulo directamente relacionado.
3. Buscar símbolos concretos.
4. Leer solo el contexto necesario.
5. Aplicar un cambio pequeño y completo.
6. Ejecutar la validación más corta que cubra el cambio.
7. Actualizar esta memoria solo si el estado del proyecto cambió.

## 8. Roles y autorización de equipos

- El correo reservado del administrador maestro es `mdmm1100@gmail.com`. Solo se crea en el primer inicio autorizado y desde el propio computador servidor; requiere contraseña de al menos 12 caracteres. El administrador maestro administra usuarios, negocios y enlaces de red.
- Las cuentas antiguas con rol `admin`/`administrador`, excepto el correo reservado, migran a `gerente`. El gerente conserva la operación diaria, mientras barra y meseros mantienen sus roles. La interfaz no permite crear otra cuenta maestra ni modificar su correo o rol.
- Al abrir cada turno se puede elegir modalidad de equipo (Barra y los meseros autorizados, conservando la selección múltiple) o individual. En ambas modalidades, cada mesa conserva una cuenta abierta a la que se agregan comandas sucesivas; al cerrar, se registra un único pago acumulado y se marcan pagadas todas sus comandas. En modo individual, Barra agrega pedidos ya despachados a la cuenta y descuenta el inventario por pedido. El cierre de cuenta actualiza los pagos y estados en una transacción. Los pedidos del flujo mesero también se crean junto con sus productos en una sola transacción. Los turnos existentes migran con modalidad de equipo para conservar el flujo anterior.
- Al migrar, las comandas no pagadas existentes se agrupan por turno y mesa en cuentas abiertas. Los pedidos históricos ya pagados no se reabren.
- Barra cuenta con el módulo **Mesas** en la navegación principal, separado de la cola y disponible con o sin turno; permite fijar la cantidad total de mesas, numeradas secuencialmente (Mesa 1...Mesa N), y eliminar mesas puntuales. El selector de mesa aparece justo encima del botón de registrar pedido y elegir mesa es obligatorio si hay turno abierto. Los pedidos guardan y muestran la mesa seleccionada; la cola muestra la mesa asignada. El catálogo es por negocio, los pedidos históricos conservan el nombre y no se elimina una mesa con pedidos activos del turno.
- La interfaz operativa y el detalle de planilla ocultan las comandas canceladas, que se conservan en SQLite para el histórico.
- Los negocios de tipo `tienda` usan un punto de venta independiente de comandas y turnos. La cuenta Barra asignada puede registrar una venta con medio de pago; la API descuenta el inventario y guarda venta, detalle y movimiento de stock en una transacción. Las ventas se numeran y consultan por fecha de Colombia en las tablas `ventas_tienda` y `venta_tienda_items`.
- En tiendas, las cuentas Gerente/Dueño/Administrador consultan el historial y administran el inventario; solo Barra asignada registra ventas. Los cambios del inventario usan un endpoint transaccional con guardado agrupado, evitando borrar y recrear productos durante cada edición; los errores se muestran en pantalla.
- Las tiendas pueden habilitar opcionalmente una agenda de citas para servicios con precio acordado, como tatuajes. Al estar deshabilitada no agrega navegación ni formularios; al habilitarse, Barra puede agendar y recibir abonos, mientras Gerencia configura el módulo. Cada abono se guarda como ingreso en su fecha de recepción, reduce el saldo pendiente sin marcar automáticamente el servicio como pagado y no se acepta en citas canceladas.
- En tiendas, la sección **Personal** mantiene su propia lista de personas, independiente de las cuentas de usuario. Barra o Gerencia puede agregar profesionales con teléfono de contacto opcional y activar/desactivar sus perfiles; solo las personas creadas en esta lista aparecen para asignar nuevas citas. Los nombres históricos de citas anteriores se conservan en esas citas, pero no se importan como personas disponibles. Las citas guardan inicio y fin, no pueden exceder cuatro horas, avisan si la persona ya tiene una cita agendada que se cruza y el servidor impide confirmar ese horario. Un perfil con citas futuras no se puede desactivar.
- La agenda opcional muestra las reservas en un calendario mensual navegable, con selección de día, indicadores de citas y formulario de nueva reserva. Cada nueva cita requiere cédula del cliente y puede guardar teléfono opcional; `cliente_cedula` se migra sin borrar los datos existentes.
- La agenda conserva el calendario mensual completo para gerencia. La cuenta de Barra ve las citas agrupadas por día en filas cronológicas simples, mostrando nombre, servicio y hora; los datos de contacto, pagos y demás acciones quedan plegados por cita. Si la cita tiene saldo pendiente, se ofrece agendar otra para el mismo cliente y se precargan sus datos de contacto, servicio y profesional, dejando fecha y precio para confirmar.
- Los reportes y cierres de tienda distinguen ventas de productos y abonos de servicios; ambos cuentan como ingresos en la fecha correspondiente y el saldo descuenta los gastos. Los cierres guardan el total combinado de ingresos, conservando la lectura de cierres anteriores que solo tenían ventas.
- La ruta de venta de tienda confirma la transacción antes de responder con el consecutivo diario; el nombre de la propiedad de respuesta debe mapearse al consecutivo local para que la interfaz no informe error después de guardar la venta.
- Al cambiar a una tienda, la interfaz muestra su espacio de ventas de inmediato y evita montar temporalmente pantallas de bar con datos de tienda. El Dashboard tolera colecciones ausentes y la aplicación muestra errores de renderizado en lugar de quedar en blanco.
- El gerente de tienda puede registrar y consultar gastos, ingresos de inventario, reportes y cierres por período. Los cierres descuentan los gastos de las ventas del rango y se conservan en el dispositivo que los guarda. Cada compra de inventario selecciona productos existentes, guarda costo unitario y total como gasto de Insumos, suma cantidades al stock y registra movimientos con precios en una sola transacción; no modifica el precio de venta. Los egresos de otro tipo continúan en registros separados.
- Desde el panel de ingreso de inventario, el gerente también puede crear un producto indicando nombre, categoría, precio de venta y stock mínimo; comienza con stock cero para que la compra registrada a continuación agregue existencias y costos. La API reporta explícitamente si el ejecutable abierto todavía no incluye las rutas de inventario actualizadas.
- En Gastos del gerente, el registro manual y el ingreso de inventario comparten un formulario: al elegir Insumos se seleccionan productos existentes o se crea uno nuevo, y se registra cantidad y costo para actualizar existencias; las demás categorías guardan un gasto manual con descripción y monto. En el historial de gastos no se muestra la columna de estado, y los ingresos de inventario aparecen bajo la categoría Insumos.
- Los ingresos de inventario marcan su gasto con `tipo=compra_inventario`; los movimientos guardan `gasto_id`, precio unitario y total. No se permite borrar desde Gastos una compra que ya modificó existencias.
- El módulo de IA y las llamadas de visión de comprobantes se retiraron; el registro de gastos con comprobante continúa como captura manual.
- Cada instalación portable requiere una licencia Ed25519 firmada para el `MachineGuid` del computador Windows. El destino descarga una solicitud JSON; el administrador la firma con `npm run license:authorize -- solicitud.json licencia.json` y devuelve la licencia por USB para instalarla en el destino.
- La clave privada se conserva fuera del repositorio y del ejecutable en `%LOCALAPPDATA%\GestionBar\licensing\private-key.pem`; debe respaldarse de forma segura y nunca compartirse. La clave pública está en `backend/license.js`.
- La licencia compartida por las instancias del ejecutable reside en `%LOCALAPPDATA%\GestionBar\licensing\license.json`; los datos del negocio están separados por instancia bajo `%LOCALAPPDATA%\GestionBar\instances`. La activación offline impide el uso normal de una copia sin autorización, pero no es una protección absoluta frente a modificación deliberada del ejecutable o clonación completa del entorno de Windows.
