import 'dotenv/config';
import fs from 'node:fs';

// No Windows o LibreOffice não entra no PATH: procura nos locais padrão de instalação.
function achaSoffice() {
  if (process.platform !== 'win32') return 'soffice';
  const pastas = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(Boolean);
  for (const base of pastas) {
    const caminho = `${base}\\LibreOffice\\program\\soffice.exe`;
    if (fs.existsSync(caminho)) return caminho;
  }
  return 'soffice';
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionMinutes: Number(process.env.SESSION_MINUTES || 40),
  cookieName: 'csm_session',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'csm',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'csm_gestao',
    schema: process.env.DB_SCHEMA || 'public',
  },
  // Autentique (assinatura eletrônica). Sem token, o sistema usa o modo "simulado" (somente desenvolvimento).
  autentique: {
    token: process.env.AUTENTIQUE_KEY || process.env.AUTENTIQUE_TOKEN || '', // aceita os dois nomes
    url: process.env.AUTENTIQUE_URL || 'https://api.autentique.com.br/v2/graphql',
    // Documentos "sandbox" não consomem créditos e são apagados depois de alguns dias.
    assinatura: process.env.AUTENTIQUE_ASSINATURA || 'DRAW',
    verificacao: (process.env.AUTENTIQUE_VERIFICACAO ?? '').trim().toUpperCase(),
    sandbox: (process.env.AUTENTIQUE_SANDBOX ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true',
    webhookSecret: process.env.AUTENTIQUE_WEBHOOK_SECRET || '',
  },
  sofficePath: process.env.SOFFICE_PATH || achaSoffice(), // LibreOffice, para converter .docx em PDF antes do envio
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@csm.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
};
