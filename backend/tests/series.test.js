import test from 'node:test';
import assert from 'node:assert/strict';
import { etapaChave, etapaDe, etapaGeral, serieCanonica, normTxt, chaveTxt } from '../src/services/series.js';

test('etapa por série', () => {
  const casos = {
    'Berçário': 'infantil', 'Mini Maternal': 'infantil', 'Maternal': 'infantil', 'Maternal II': 'infantil', 'Nível I': 'infantil', 'Nível II': 'infantil', 'Pré I': 'infantil',
    '1º ano': 'fund1', '5º Ano': 'fund1', '6º ano': 'fund2', '9º ano': 'fund2',
    '1ª série': 'medio', '3ª SÉRIE': 'medio', '2ª série EM': 'medio',
  };
  for (const [s, e] of Object.entries(casos)) assert.equal(etapaChave(s), e, s);
  assert.equal(etapaChave(''), null);
  assert.equal(etapaChave('Outra coisa'), null);
});
test('rótulos', () => {
  assert.equal(etapaDe('1ª série'), 'ENSINO MÉDIO');
  assert.equal(etapaDe('3º ano'), 'ENSINO FUNDAMENTAL I');
  assert.equal(etapaGeral('7º ano'), 'Ensino Fundamental');
  assert.equal(etapaGeral('Berçário'), 'Educação Infantil');
});
test('normalização', () => {
  assert.equal(normTxt('  1ª   SÉRIE '), '1ª SÉRIE');
  assert.equal(chaveTxt(' 1ª SÉRIE '), chaveTxt('1ª série'));
  assert.equal(serieCanonica(' 1ª  SÉRIE ', ['1ª série', '2ª série']), '1ª série');
  assert.equal(serieCanonica('4º ano', ['1ª série']), '4º ano');
});
