import { TODAS, TIPOS, codigoValor } from '../permissions/catalog.js';

// Acesso efetivo = Habilitação do módulo ∩ (Grupo de Permissão + extras do usuário).
// "Administrador" tem o máximo em tudo, mas continua limitado pelas habilitações.
export function calcularPermissoes({ usuario, grupoPerms, extras, modulosAtivos }) {
  const resultado = {};
  for (const p of TODAS) {
    const valores = TIPOS[p.tipo];
    if (!modulosAtivos.has(p.modulo)) {
      resultado[p.chave] = 0;
      continue;
    }
    if (usuario.nivel === 'Administrador') {
      resultado[p.chave] = valores.length - 1;
      continue;
    }
    // grupo e extras guardam o código (0, 1, 2); dados antigos com rótulo também são entendidos
    const doGrupo = codigoValor(p.chave, grupoPerms[p.chave]) ?? 0;
    const extra = codigoValor(p.chave, extras?.[p.chave]) ?? 0;
    resultado[p.chave] = Math.max(doGrupo, extra);
  }
  return resultado;
}

const DIAS = ['domingo', 'seg_sex', 'seg_sex', 'seg_sex', 'seg_sex', 'seg_sex', 'sabado'];

function agoraBrasilia() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => partes.find((p) => p.type === t)?.value;
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hora = Number(get('hour')) % 24;
  return { dia: dias[get('weekday')], minutos: hora * 60 + Number(get('minute')) };
}

const paraMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Horários de acesso do grupo: campo em branco = liberado. Feriado não é verificado (sem calendário ainda).
export function dentroDoHorario(horarios) {
  if (!horarios) return true;
  const { dia, minutos } = agoraBrasilia();
  const janela = horarios[DIAS[dia]];
  if (!janela) return true;
  const de = paraMin(janela.de);
  const ate = paraMin(janela.ate);
  // cadastros antigos com fim antes do início: vale como "atravessa a meia-noite" (as telas novas não deixam gravar assim)
  if (de !== null && ate !== null && ate < de) return minutos >= de || minutos <= ate;
  if (de !== null && minutos < de) return false;
  if (ate !== null && minutos > ate) return false;
  return true;
}

export function dataLimiteVencida(dataLimite) {
  if (!dataLimite) return false;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return hoje > String(dataLimite).slice(0, 10);
}
