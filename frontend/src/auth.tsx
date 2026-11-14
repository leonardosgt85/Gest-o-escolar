import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';

export interface Me {
  id: number;
  nome: string;
  email: string;
  professor?: boolean;
  nivel: string;
  cargo?: string | null;
  foto?: string | null;
  grupo: { id: number; nome: string } | null;
  modulos: string[];
  permissoes: Record<string, number>;
  sessaoMinutos: number;
}

// Índices de acesso (ver backend/src/permissions/catalog.js)
export const ACESSO = { consulta: 1, manutencao: 2 } as const;

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (chave: string, min?: number) => boolean;
  moduloAtivo: (chave: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    api.get<Me>('/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, senha: string) => {
    setMe(await api.post<Me>('/auth/login', { email, senha }));
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setMe(null);
  }, []);

  const can = useCallback((chave: string, min = 1) => (me?.permissoes[chave] ?? 0) >= min, [me]);
  const moduloAtivo = useCallback((chave: string) => !!me?.modulos.includes(chave), [me]);

  return <Ctx.Provider value={{ me, loading, login, logout, can, moduloAtivo }}>{children}</Ctx.Provider>;
}
