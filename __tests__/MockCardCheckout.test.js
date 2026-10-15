import { cardBrand, passesLuhn, TEST_CARDS, validateCard } from '../MockCardCheckout';

const NOW = new Date(2026, 8, 29);
const validCard = { name: 'Movie Fan', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', postcode: '1000' };

it('recognises card brands', () => {
  expect(cardBrand('4242')).toBe('Visa');
  expect(cardBrand('5555')).toBe('Mastercard');
  expect(cardBrand('3782')).toBe('Amex');
  expect(cardBrand('6011')).toBe('Discover');
  expect(cardBrand('9999')).toBeNull();
});

it('uses the Luhn checksum to catch mistyped numbers', () => {
  Object.values(TEST_CARDS).forEach((number) => expect(passesLuhn(number)).toBe(true));
  expect(passesLuhn('4242424242424241')).toBe(false);
});

it('accepts a complete card', () => {
  expect(validateCard(validCard, NOW)).toEqual({});
});

it('treats a card as valid until the end of its expiry month', () => {
  expect(validateCard({ ...validCard, expiry: '09/26' }, NOW)).toEqual({});
  expect(validateCard({ ...validCard, expiry: '08/26' }, NOW).expiry).toBe('This card has expired.');
  expect(validateCard({ ...validCard, expiry: '13/30' }, NOW).expiry).toBe('Use MM/YY.');
});

it('needs a 4-digit security code for Amex and 3 digits otherwise', () => {
  const amex = { ...validCard, number: '3782 822463 10005' };
  expect(validateCard({ ...amex, cvc: '123' }, NOW).cvc).toBe('Enter the 4-digit security code.');
  expect(validateCard({ ...amex, cvc: '1234' }, NOW)).toEqual({});
  expect(validateCard({ ...validCard, cvc: '12' }, NOW).cvc).toBe('Enter the 3-digit security code.');
});
