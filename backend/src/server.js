import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { modo as modoAutentique, sofficeDisponivel } from './services/autentique.js';
import { limparExpiradas } from './services/sessionService.js';

try {
  await db.raw('select 1');
} catch (e) {
  console.error(`\nNão foi possível conectar ao Postgres (${config.db.host}:${config.db.port}/${config.db.database}).`);
  console.error('Suba o banco (docker compose up -d) e rode: npm run db:setup\n');
  console.error(e.message);
  process.exit(1);
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`API CSM rodando em http://localhost:${config.port}`);
  if (modoAutentique() === 'autentique') {
    void sofficeDisponivel().then((ok) => {
      if (!ok) console.warn('[AVISO] LibreOffice não encontrado: os documentos irão como .docx e o Autentique mostrará todas as opções de assinatura. Instale com scripts/instalar-libreoffice.sh (Linux) ou defina SOFFICE_PATH.');
    });
  }
});
setInterval(() => limparExpiradas().catch(() => {}), 60 * 60 * 1000).unref();
