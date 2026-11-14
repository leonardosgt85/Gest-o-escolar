import test from 'node:test';
import assert from 'node:assert/strict';
import { codigoValor, normalizarPermissoes } from '../src/permissions/catalog.js';
import { calcularPermissoes } from '../src/services/accessService.js';

test('codigoValor aceita código e rótulo antigo, rejeita o inválido', () => {
  assert.equal(codigoValor('academico.alunos', 2), 2);
  assert.equal(codigoValor('academico.alunos', '1'), 1);
  assert.equal(codigoValor('academico.alunos', 'Manutenção'), 2);
  assert.equal(codigoValor('academico.alunos', 3), null);
  assert.equal(codigoValor('academico.alunos.excluir', 'Sim'), 1);
  assert.equal(codigoValor('nao.existe', 1), null);
});

test('normalizarPermissoes descarta o que não existe', () => {
  assert.deepEqual(normalizarPermissoes({ 'academico.alunos': 'Apenas Consulta', 'x.y': 1, 'academico.alunos.excluir': 9 }), { 'academico.alunos': 1 });
});

test('calcularPermissoes soma grupo e extras (códigos ou rótulos)', () => {
  const r = calcularPermissoes({
    usuario: { nivel: 'Usuário' },
    grupoPerms: { 'academico.alunos': '1' },
    extras: { 'academico.alunos': 2 },
    modulosAtivos: new Set(['gerencial', 'academico']),
  });
  assert.equal(r['academico.alunos'], 2);
});
