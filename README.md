# CSM Gestão Escolar — Fase 1

Plataforma modular de gestão escolar. Nesta fase:

- **Shell** com sidebar lateral e menu por módulo (módulos futuros — Kanban, Administrativo, Financeiro — entram como novos blocos do menu).
- **Gerencial**: usuários, grupos de permissão (perfis), habilitações (módulos da escola).
- **Gestão Acadêmica**: cadastro de alunos (7 abas, foto, auditoria) e cadastro de pessoas (responsáveis reutilizáveis).
- **Importador** de alunos a partir de JSON exportado do SAE.

Stack: React + Vite + TypeScript · Node + Express + Knex · PostgreSQL.

## Rodar na sua máquina

Requisitos: Node 18+ (testado em 22) e um Postgres (ou Docker).

```bash
# 1. Banco (opção Docker; pule se já tem Postgres)
docker compose up -d

# 2. Dependências (raiz + backend + frontend)
npm run setup

# 3. Configuração do backend
#    (já existe backend/.env.example; copie e ajuste se seu Postgres for outro)
cp backend/.env.example backend/.env

# 4. Cria o schema, as tabelas e a carga inicial (habilitações, grupos, administrador)
#    = npx knex migrate:latest && npx knex seed:run  (na pasta backend)
npm run db:setup

# 5. Sobe API (3001) e frontend (5173)
npm run dev
```

Abra http://localhost:5173 e entre com **admin@csm.local / Admin@123** (troque a senha depois).

Comandos do Knex (na pasta `backend`): `npx knex migrate:latest`, `npx knex migrate:rollback`, `npx knex seed:run`, `npx knex migrate:make nome`.

Sem Docker: crie um banco e um usuário no seu Postgres, ajuste `DB_*` em `backend/.env` e rode `npm run db:setup`.
O sistema usa um **schema próprio** (`DB_SCHEMA=csm`), criado automaticamente — dá para dividir o mesmo Postgres/usuário com outro sistema sem interferir nele.

## Estrutura

```
backend/
  migrations/001_base.js        tabelas (usuários, grupos, habilitações, sessões, pessoas, alunos)
  src/permissions/catalog.js    catálogo de permissões e habilitações iniciais  <- ponto de extensão de módulos
  src/services/accessService.js acesso efetivo = habilitação ∩ (grupo + extras do usuário); horários; data limite
  src/routes/                   auth, usuarios, grupos, habilitacoes, pessoas, alunos
  src/fields.js                 campos de aluno/pessoa e opções dos selects (iguais às do SAE)
  knexfile.js                   configuração do Knex (CLI e app)
  seeds/001_inicial.js          carga inicial: habilitações, grupos, administrador
  scripts/import-sae.js         importador JSON
  import/mapa.exemplo.json      mapeamento SAE -> CSM
frontend/
  src/menu.ts                   menu da sidebar por módulo  <- ponto de extensão de módulos
  src/components/Layout.tsx     sidebar
  src/pages/gerencial/          usuários, grupos, habilitações
  src/pages/academico/          alunos (AlunoForm = 7 abas), pessoas
```

## Acesso e permissões

- Login por e-mail + senha; sessão em cookie `httpOnly` (token guardado como SHA-256), expira por inatividade (40 min, `SESSION_MINUTES`).
- **Acesso efetivo** = módulo habilitado ∩ (permissões do grupo + permissões extras do usuário, vale a mais permissiva). Nível **Administrador** tem tudo, mas continua limitado pelas habilitações.
- Tipos de valor iguais ao SAE: *Não Acessa / Apenas Consulta / Manutenção*, *Não / Sim*, *Não adiciona / Apenas Adiciona / Adiciona e Altera*.
- Grupo tem **horários de acesso** (Seg–Sex, Sáb, Dom; horário de Brasília; vazio = liberado) e usuário tem **data limite**. Usuários não são excluídos, só inativados.
- O backend valida tudo; o frontend só esconde o que o usuário não pode usar.

## Importar dados do SAE (JSON)

O formato do JSON do SAE ainda não foi visto, então o mapeamento é configurável:

```bash
cd backend
cp import/mapa.exemplo.json import/mapa.json     # ajuste os nomes das chaves (lado direito)
npm run import:sae -- caminho/alunos.json --dry-run   # simula, não grava
npm run import:sae -- caminho/alunos.json             # importa
```

- Usa o código do SAE (`legacy_id`) como chave: reimportar **atualiza** em vez de duplicar.
- Pai/Mãe/Resp. Pedagógico viram registros de **Pessoa** (achados por código do SAE ou CPF).
- Datas `dd/mm/aaaa` ou ISO são convertidas; valores de select são ajustados às opções oficiais (ignorando caixa/acento); o que não casa é descartado e listado no relatório (`backend/import/relatorio-*.txt`).
- CPF inválido é mantido como veio (com aviso); CPF repetido em outro aluno é descartado (com aviso).

## O que ainda depende de informação do SAE (premissas desta fase)

A wiki documenta a interface, não o banco. Por isso, nesta fase:

| Assunto | O que foi assumido |
|---|---|
| Tipos/tamanhos dos campos | Textos com tamanho folgado; campos marcados "(inferido)" na wiki tratados como texto/data. Ajuste após ver o JSON real. |
| Obrigatórios | Só **Nome** e **Data de Nascimento** (igual ao CSM atual). Regras reais do SAE são a NC-12 da wiki. |
| CPF | Validado (dígitos) e único entre alunos; único entre pessoas. |
| Excluir aluno | Exclusão **lógica** (sai das listas; dado preservado). Regra real é a NC-13. |
| Processo seletivo | Guardado como JSON por bloco (Ens. Fundamental/Médio/Técnico/Superior/Seleção); tipos não levantados. |
| Pessoa PF | Abas Endereço Comercial e Ref. Comerciais com campos básicos; detalhes não documentados. |
| Usuário > aba Outras Informações | Flags guardadas, mas só as relevantes (Excel, IPs válidos, chat); Cantinne/Protocolo/NFS-e ficam para os módulos correspondentes. Restrição por IP e exportação Excel ainda **não são aplicadas**. |
| Feriado | Janela de horário de feriado é gravada, mas não verificada (sem calendário de eventos). |
| Curso / Situação / Ano da última matrícula | Colunas e filtros dependem do módulo de matrículas (fase futura). Botões Cursos/Financeiro ficam desabilitados. |

## Como criar um módulo novo (ex.: Kanban)

1. `backend/src/permissions/catalog.js`: adicione o módulo em `MODULOS` (com suas permissões) e em `HABILITACOES_INICIAIS`.
2. `npm run db:setup` (registra a habilitação; ative em Gerencial › Habilitações).
3. `frontend/src/menu.ts`: adicione o bloco do módulo.
4. Crie as páginas em `frontend/src/pages/<modulo>/` e as rotas em `App.tsx`; rotas do backend em `backend/src/routes/` + `app.js`.

## Produção (resumo)

`npm run build` gera `frontend/dist`. Sirva-o com Nginx e faça proxy de `/api` para `node backend/src/server.js` (PM2). Em HTTPS, use `COOKIE_SECURE=true`. Atrás de proxy/Cloudflare, o backend já usa `trust proxy`.
