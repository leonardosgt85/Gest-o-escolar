import { useEffect, useState } from 'react';
import { api } from '../api';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const soDigitos = (s: string) => (s || '').replace(/\D/g, '');

export function maskCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}
export const maskCep = (v: string) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
export function maskFone(v: string) {
  const d = soDigitos(v).slice(0, 9);
  return d.length > 4 ? `${d.slice(0, d.length - 4)}-${d.slice(-4)}` : d;
}

export function idade(dataNasc?: string | null): string {
  if (!dataNasc || !/^\d{4}-\d{2}-\d{2}/.test(dataNasc)) return '';
  const [a, m, d] = dataNasc.slice(0, 10).split('-').map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  let meses = hoje.getMonth() + 1 - m;
  if (hoje.getDate() < d) meses -= 1;
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  if (anos < 0) return '';
  return anos > 0 ? `${anos} ano${anos > 1 ? 's' : ''}${meses ? ` e ${meses} m` : ''}` : `${meses} mes${meses === 1 ? '' : 'es'}`;
}

export function fmtData(v?: string | null) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
export function fmtDataHora(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR');
}

export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj: any, path: string, value: any): any {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...obj, [head]: value };
  return { ...obj, [head]: setPath(obj?.[head] ?? {}, rest.join('.'), value) };
}

// Opções dos selects (vêm da API, que é a fonte única: mesmas listas do SAE).
let cache: Record<string, string[]> | null = null;
export function useOpcoes() {
  const [opcoes, setOpcoes] = useState<Record<string, string[]>>(cache || {});
  useEffect(() => {
    if (cache) return;
    api.get<Record<string, string[]>>('/opcoes').then((o) => {
      cache = o;
      setOpcoes(o);
    });
  }, []);
  return opcoes;
}

/** Consulta o ViaCEP. null = CEP incompleto ou serviço fora do ar; 'nao_encontrado' = o CEP não existe. */
export async function buscarCep(cep: string) {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    return j.erro ? ('nao_encontrado' as const) : { rua: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '' };
  } catch {
    return null;
  }
}

export function lerArquivoComoDataUrl(file: File, maxPx = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida.'));
      img.onload = () => {
        const esc = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * esc);
        c.height = Math.round(img.height * esc);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
