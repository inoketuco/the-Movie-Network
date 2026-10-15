const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateOrder } = require('./catalog');

test('calculates server-controlled prices and tax', () => {
  const order = calculateOrder([
    { id: 'classic-logo-tee', quantity: 2 },
    { id: 'popcorn-pin', quantity: 1 },
  ]);

  assert.equal(order.subtotal, 5897);
  assert.equal(order.tax, 295);
  assert.equal(order.total, 6192);
});

test('rejects unknown products and invalid quantities', () => {
  assert.throws(() => calculateOrder([{ id: 'not-real', quantity: 1 }]), /Unknown product/);
  assert.throws(() => calculateOrder([{ id: 'classic-logo-tee', quantity: 0 }]), /Invalid quantity/);
});
