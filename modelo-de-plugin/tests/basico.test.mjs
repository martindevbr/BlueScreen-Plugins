// Testes do {{nome}}: node tests/basico.test.mjs (o CI roda todos os tests/*.test.mjs de cada plugin)
import assert from 'node:assert/strict';

assert.equal(1 + 1, 2);
console.log('testes do {{nome}} passaram');
