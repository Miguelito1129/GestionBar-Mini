# GestiónBar - guía de montaje y uso

## Requisitos

- Node.js 22.5 o superior (se recomienda la versión LTS).
- npm incluido con Node.js.
- Para acceso desde celular: computador y celular conectados a la misma red Wi-Fi.

## Ejecutable portable para Windows

Para generar el ejecutable se necesita el computador de desarrollo con Node.js 24
de 64 bits e internet para descargar el runtime de Windows la primera vez. Desde
la carpeta del proyecto ejecuta:

```powershell
npm install
npm run build:portable
```

El archivo resultante es `release/GestionBar.exe`. Copia ese único archivo al
computador Windows de destino y ábrelo; allí no se requiere instalar Node.js,
npm, Visual Studio ni Visual Studio Code. El programa inicia su servidor y abre
el navegador en `http://localhost:3000` (si ese puerto está ocupado, intenta los
puertos siguientes hasta el 3010). Mantén abierta la ventana del ejecutable
mientras se use la aplicación.

Cada ejecutable mantiene su propia base de datos en
`%LOCALAPPDATA%\GestionBar\instances\<id>\data\gestionbar.sqlite`; el identificador
se calcula a partir de la ruta completa del archivo. Así, dos copias en carpetas
distintas no mezclan datos. Mover un ejecutable a otra carpeta crea otra instancia
de datos. Los datos existentes en `%LOCALAPPDATA%\GestionBar\data\gestionbar.sqlite`
no se borran ni se importan automáticamente. Para acceso desde otros dispositivos,
el computador que ejecuta el archivo debe permanecer encendido y conectado a la
misma red local.

Los respaldos de OneDrive también se separan por instancia dentro de
`GestionBar\Backups\<id>`.

### Autorizar cada computador

La primera vez que se abre el ejecutable, muestra una solicitud de equipo en vez
de la aplicación. Descarga `solicitud-gestionbar.json` y pásala al administrador
maestro. En el computador del administrador, desde la carpeta del proyecto,
ejecuta:

```powershell
npm run license:authorize -- "C:\ruta\solicitud-gestionbar.json" "C:\ruta\licencia.json"
```

Devuelve `licencia.json` al computador nuevo e instálala desde la pantalla de
autorización. La licencia firmada solo sirve para el identificador de Windows
que contiene la solicitud; copiar el `.exe` o el archivo de licencia a otro
computador no lo autoriza.

La licencia instalada en el equipo se guarda en
`%LOCALAPPDATA%\GestionBar\licensing\license.json`. La clave privada de firma se
guarda fuera del proyecto en `%LOCALAPPDATA%\GestionBar\licensing\private-key.pem`. No la compartas ni la
incluyas en el `.exe`; conserva un respaldo seguro. Sin esa clave no se podrán
autorizar equipos nuevos. La clave pública sí está dentro del programa para
verificar las licencias.

Después de activar el computador administrador, la primera apertura de la app
solicita crear la cuenta maestra `mdmm1100@gmail.com` con una contraseña de al
menos 12 caracteres. Configúrala desde `http://localhost:3000` en el computador
servidor. Desde **Gestión de Usuarios**, el administrador maestro crea cuentas
de **Gerente**, barra y mesero. El gerente mantiene las funciones de operación
diaria; solo el administrador maestro puede gestionar usuarios y crear o eliminar
negocios. Tanto el administrador maestro como los gerentes pueden compartir los
enlaces de red. La migración convierte las antiguas
cuentas con rol Administrador a Gerente, salvo la cuenta maestra reservada.

El inicio de sesión se valida en el servidor. Las rutas de datos requieren una
sesión autenticada, con vencimiento a las ocho horas; cerrar sesión invalida el
token en el servidor y las respuestas de usuarios no exponen hashes de
contraseña. La API limita las lecturas y escrituras al negocio asignado a cada
cuenta; los datos ligados a turnos y comandas también se validan contra ese
negocio. Barra y Mesero pueden ver los negocios que tienen asignados, incluso
antes de abrir un turno; solo acceden a datos operativos de turnos abiertos donde
están autorizados. El administrador maestro y los gerentes pueden compartir los
enlaces de acceso de la red local con Mesero y Barra.
La licencia dificulta el uso casual de copias, pero no impide una
modificación deliberada del ejecutable ni la clonación completa de Windows o
de una máquina virtual.

## Instalación inicial

Abre PowerShell o una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

La base SQLite se crea automáticamente en `backend/data/gestionbar.sqlite`.
No es necesario instalar SQLite por separado.

## Arquitectura

- Frontend: React + Vite.
- Backend: Node.js + Express.
- Base de datos: SQLite local en `backend/data/gestionbar.sqlite`.
- Red: los celulares, tablets y computadores acceden al servidor por la IP local del equipo servidor.
- El navegador nunca accede directamente al archivo SQLite.

## Inicio recomendado

En el computador Windows que tiene enlazada por Bluetooth la impresora `Printer001`,
abre una terminal en la carpeta de este proyecto y ejecuta:

```bash
npm start
```

Este comando compila la versión actual del frontend y arranca Express con la API
SQLite y el servicio de impresión. El servidor de impresión usa `COM3` a `9600`
baudios por defecto; si Windows asignó otro puerto, configúralo antes de iniciar
Express en PowerShell:

```powershell
$env:PRINTER_PORT = "COM3"
$env:PRINTER_BAUD_RATE = "9600"
npm start
```

Sustituye `COM3` por el puerto serial Bluetooth asignado a `Printer001` en Windows.
No abras ese puerto en otra aplicación mientras GestiónBar está imprimiendo.

Luego abre:

```text
http://localhost:3000
```

Para entrar desde un celular u otro equipo de la red, consulta la IP del computador
servidor y abre:

```text
http://IP_DEL_SERVIDOR:3000
```

Ejemplo:

```text
http://192.168.1.20:3000
```

No uses `localhost` desde el celular: allí `localhost` apunta al propio celular.
Para imprimir desde celulares, Express debe seguir ejecutándose en el computador
que tiene emparejada la impresora; los dispositivos envían la solicitud a ese
servidor y no necesitan enlazarse directamente con Bluetooth.

## Inicio en desarrollo

Usa este modo cuando trabajes en el código. Abre dos terminales en la carpeta
del mismo proyecto/worktree. En la primera, inicia el backend actualizado:

```bash
npm run dev:server
```

En la segunda, inicia Vite:

```bash
npm run dev
```

Si el backend ya estaba iniciado antes de un cambio en `backend/api.js`, detén
ese proceso con `Ctrl+C` en su terminal y vuelve a ejecutar `npm run dev:server`.
Esto es necesario para que Express registre las rutas nuevas, como la impresión
de facturas. Recarga el navegador después de cambiar el frontend.

Para probar desde otro dispositivo en la misma red, abre la dirección que muestre
Vite usando la IP del equipo servidor, por ejemplo `http://192.168.1.20:5173`.

## Inicio integrado

Para servir la aplicación compilada desde Express (el modo recomendado para el
uso diario):

```bash
npm start
```

`npm start` ejecuta primero `npm run build` y después inicia Express. El servidor
escucha en todas las interfaces de red (`0.0.0.0`) y sirve la aplicación y la API
bajo el puerto `3000`. La impresora debe permanecer enlazada al mismo computador
donde corre este backend.

## Persistencia y respaldo

La base de datos activa se guarda en:

`backend/data/gestionbar.sqlite` en modo desarrollo, o `%LOCALAPPDATA%\GestionBar\data\gestionbar.sqlite` al usar el ejecutable portable.

GestiónBar crea automáticamente una copia al iniciar el servidor y luego cada 15
minutos. Usa el respaldo en línea de SQLite y verifica la integridad de la base y
de cada copia. Conserva las 96 copias más recientes por destino.

- Copia local: `backend/data/backups` en desarrollo o
  `%LOCALAPPDATA%\GestionBar\data\backups` en el ejecutable portable.
- Copia para la nube: si Windows tiene OneDrive configurado, también se guarda
  en `%OneDrive%\GestionBar\Backups`. El cliente de OneDrive la sincroniza con la
  nube cuando haya conexión; si está sin conexión, la copia queda en esa carpeta
  pendiente de sincronización y la copia local adicional permanece disponible.
- Si OneDrive no está instalado o configurado, el programa guarda el respaldo
  local e informa ese estado en la consola del servidor.

Los respaldos contienen todos los datos del negocio, incluidos los usuarios y
sus hashes de contraseña. Protege el acceso a la cuenta y a la carpeta de
OneDrive; no compartas esos archivos públicamente.

El intervalo se puede cambiar con la variable de entorno
`GESTIONBAR_BACKUP_INTERVAL_MINUTES` (entero de 1 a 1440). Por ejemplo, en
PowerShell, antes de iniciar el servidor:

```powershell
$env:GESTIONBAR_BACKUP_INTERVAL_MINUTES = "5"
npm start
```

Para restaurar una copia, cierra GestiónBar y conserva primero una copia aparte
del archivo dañado. Reemplaza el archivo activo por un `.sqlite` reciente de la
carpeta de respaldos. Inicia GestiónBar y comprueba los datos antes de eliminar
la copia del archivo dañado. No reemplaces la base mientras el servidor esté
abierto.

## Modelo de operación

La API conserva las tablas históricas (`planillas`, `productos`, `gastos` y
`staff`) y las tablas nuevas (`turnos`, `comandas`, `pagos`, inventario,
descorches, gastos y cierres). El esquema se inicializa en [backend/db.js](./backend/db.js).
