const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const api = require('./backend/api');
const { isLicensed } = require('./backend/license');
const { startBackupScheduler } = require('./backend/backup');

const app = express();
const INITIAL_PORT = Number(process.env.PORT || 3000);
const MAX_FALLBACK_PORT = process.env.PORT ? INITIAL_PORT : 3010;

app.use(express.json({ limit: '2mb' }));
app.use('/api', api);

app.get('/', (req, res, next) => {
  if (isLicensed()) return next();
  res.type('html').send(`<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar GestiónBar</title>
<body style="margin:0;background:#0b0b14;color:#e2e8f0;font:15px system-ui;min-height:100vh;display:grid;place-items:center">
<main style="max-width:640px;padding:24px;background:#151523;border:1px solid #303052;border-radius:16px">
<h1 style="color:#fbbf24">Autorizar este equipo</h1>
<p>Este computador aún no tiene autorización. Descarga la solicitud y envíasela al administrador maestro para que genere una licencia firmada. La licencia se instala aquí mismo.</p>
<p id="status">Preparando solicitud del equipo…</p>
<textarea id="request" readonly style="box-sizing:border-box;width:100%;height:125px;background:#0b0b14;color:#cbd5e1;border:1px solid #303052;border-radius:8px;padding:10px"></textarea>
<p><button id="download" type="button">Descargar solicitud</button></p>
<label>Instalar licencia recibida <input id="license" type="file" accept="application/json,.json"></label>
<p id="message" role="status"></p>
<script>
let requestData = null;
const status = document.getElementById('status');
const message = document.getElementById('message');
fetch('/api/license/request').then(async response => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No fue posible identificar el equipo.');
  requestData = data;
  document.getElementById('request').value = JSON.stringify(data, null, 2);
  status.textContent = 'Solicitud lista para enviar al administrador.';
}).catch(error => { status.textContent = error.message; });
document.getElementById('download').addEventListener('click', () => {
  if (!requestData) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(requestData, null, 2)], { type: 'application/json' }));
  link.download = 'solicitud-gestionbar.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
document.getElementById('license').addEventListener('change', async event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const response = await fetch('/api/license/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await file.text()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible instalar la licencia.');
    message.textContent = 'Equipo autorizado. Abriendo GestiónBar…';
    location.reload();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    event.target.value = '';
  }
});
</script></main></body></html>`);
});

app.use((req, res, next) => {
  if (!isLicensed()) return res.status(423).send('Este equipo debe autorizarse para usar GestiónBar.');
  next();
});
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

function listen(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    const localUrl = `http://localhost:${port}`;
    console.log(`GestionBar local server running on ${localUrl}`);
    startBackupScheduler();
    if (process.pkg) {
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl], error => {
        if (error) console.error('No fue posible abrir el navegador automáticamente:', error.message);
      });
    }
  });

  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && port < MAX_FALLBACK_PORT) {
      console.warn(`El puerto ${port} ya está ocupado; se intentará el ${port + 1}.`);
      listen(port + 1);
      return;
    }
    console.error(`No fue posible iniciar el servidor en el puerto ${port}:`, error.message);
    process.exitCode = 1;
  });
}

listen(INITIAL_PORT);
