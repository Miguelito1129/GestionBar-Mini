# GestiónBar

Aplicación web para administrar turnos, inventario, comandas, pagos y promociones
de un bar. Usa React/Vite en el frontend, Express en la API y SQLite como base de
datos local.

## Puesta en marcha rápida

Para desarrollo se requiere Node.js 22.5 o superior.

```bash
npm install
npm start
```

Después abre `http://localhost:3000`. Para usar la aplicación desde un celular,
abre `http://IP_DEL_SERVIDOR:3000` desde la misma red Wi-Fi.

La guía completa está en [GUIA_DESPLIEGUE.md](./GUIA_DESPLIEGUE.md).

## Ejecutable portable para Windows

En el computador de desarrollo, instala las dependencias y genera el ejecutable:

```powershell
npm install
npm run build:portable
```

Comparte únicamente `release/GestionBar.exe`. El otro computador no necesita
Node.js, npm, Visual Studio ni Visual Studio Code. Al abrir el archivo, inicia
el servidor local y abre la aplicación en el navegador. Mantén abierta la ventana
del ejecutable mientras se usa el programa.

Cada ejecutable guarda sus datos separados en
`%LOCALAPPDATA%\GestionBar\instances\<id>\data\gestionbar.sqlite`; el identificador
se calcula a partir de la ruta completa del `.exe`. Copias en carpetas distintas
no comparten base de datos. Si el puerto 3000 está ocupado, se intenta el siguiente
puerto disponible hasta el 3010. El ejecutable no incluye ni transfiere datos.

El primer inicio requiere autorizar el equipo; consulta la sección
**Autorizar cada computador** de [la guía de despliegue](./GUIA_DESPLIEGUE.md).
La cuenta maestra `mdmm1100@gmail.com` se configura en el primer inicio
autorizado y administra las cuentas de gerente y del personal.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
