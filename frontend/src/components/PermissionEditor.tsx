import { useEffect, useState } from 'react';
import { api } from '../api';
import { Tabs } from './ui';

export interface Catalogo {
  tipos: Record<string, string[]>;
  modulos: { chave: string; nome: string; permissoes: { chave: string; nome: string; tipo: string }[] }[];
}

let cache: Catalogo | null = null;
export function useCatalogo() {
  const [c, setC] = useState<Catalogo | null>(cache);
  useEffect(() => {
    if (!cache) api.get<Catalogo>('/auth/catalogo').then((r) => { cache = r; setC(r); });
  }, []);
  return c;
}

// Editor de permissões: uma aba por módulo, cada permissão é um select.
// Valores que negam aparecem em vermelho; os que liberam, em azul (como no SAE).
export default function PermissionEditor({ valores, onChange, readOnly, vazioLabel }: {
  valores: Record<string, number>; // chave → código do valor (posição na lista do tipo; 0 = nega)
  onChange: (v: Record<string, number>) => void;
  readOnly?: boolean;
  vazioLabel?: string; // se informado, adiciona opção "em branco" (usada nas permissões extras do usuário)
}) {
  const cat = useCatalogo();
  const [aba, setAba] = useState(0);
  if (!cat) return <div className="empty">Carregando permissões…</div>;
  const mod = cat.modulos[aba];
  return (
    <>
      <Tabs tabs={cat.modulos.map((m) => m.nome)} active={aba} onChange={setAba} />
      {mod.permissoes.map((p) => {
        const lista = cat.tipos[p.tipo];
        const atual = valores[p.chave] !== undefined ? String(valores[p.chave]) : (vazioLabel ? '' : '0');
        const positivo = atual !== '' && Number(atual) > 0;
        return (
          <div className="perm-row" key={p.chave}>
            <div>{p.nome}</div>
            <select
              className={`input ${positivo ? 'perm-pos' : 'perm-neg'}`}
              disabled={readOnly}
              value={atual}
              onChange={(e) => {
                const novo = { ...valores };
                if (e.target.value === '') delete novo[p.chave];
                else novo[p.chave] = Number(e.target.value);
                onChange(novo);
              }}
            >
              {vazioLabel && <option value="">{vazioLabel}</option>}
              {lista.map((v, i) => <option key={v} value={String(i)}>{v}</option>)}
            </select>
          </div>
        );
      })}
    </>
  );
}
