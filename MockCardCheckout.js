import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { space, type, useTheme } from './theme';
import { Banner, Button, TextField } from './ui';

// A demo checkout used when Stripe is not set up. It looks and validates like a
// real card form, but nothing is charged and the card details are never stored or
// sent anywhere: only the brand and last four digits reach the receipt.

const PROCESSING_DELAY_MS = 1500;

// Stripe's public test numbers, so the demo behaves like Stripe's test mode.
export const TEST_CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
};
const DECLINES = {
  [TEST_CARDS.declined]: 'Your card was declined.',
  [TEST_CARDS.insufficientFunds]: 'Your card has insufficient funds.',
};

const digitsOnly = (value) => value.replace(/\D/g, '');

export const cardBrand = (number) => {
  if (/^4/.test(number)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'Amex';
  if (/^6(011|5)/.test(number)) return 'Discover';
  return null;
};

// The Luhn checksum that every real card number satisfies; it catches most typos.
export const passesLuhn = (number) => {
  let sum = 0;
  for (let index = 0; index < number.length; index += 1) {
    let digit = Number(number[number.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return number.length > 0 && sum % 10 === 0;
};

const formatCardNumber = (value) =>
  digitsOnly(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

const formatExpiry = (value) => {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

export const validateCard = ({ name, number, expiry, cvc, postcode }, now = new Date()) => {
  const errors = {};
  const cardDigits = digitsOnly(number);
  const brand = cardBrand(cardDigits);

  if (name.trim().length < 2) errors.name = 'Enter the name on the card.';

  if (cardDigits.length < 13 || !passesLuhn(cardDigits)) errors.number = 'Enter a valid card number.';
  else if (!brand) errors.number = 'We accept Visa, Mastercard, Amex and Discover.';

  const [month, year] = expiry.split('/').map(Number);
  if (!month || month > 12 || !year || expiry.length !== 5) {
    errors.expiry = 'Use MM/YY.';
  } else {
    // A card is valid until the end of its expiry month.
    const expiresAt = new Date(2000 + year, month, 1);
    if (expiresAt <= now) errors.expiry = 'This card has expired.';
  }

  const cvcLength = brand === 'Amex' ? 4 : 3;
  if (digitsOnly(cvc).length !== cvcLength) errors.cvc = `Enter the ${cvcLength}-digit security code.`;

  if (postcode.trim().length < 3) errors.postcode = 'Enter your billing postcode.';

  return errors;
};

const MockCardCheckout = ({ total, onSuccess, onFailure }) => {
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '', postcode: '' });
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);

  const cardDigits = digitsOnly(card.number);
  const brand = cardBrand(cardDigits);

  const update = (field, value) => {
    setCard((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fillTestCard = () => {
    setCard((current) => ({
      name: current.name || 'Movie Fan',
      number: formatCardNumber(TEST_CARDS.success),
      expiry: '12/34',
      cvc: '123',
      postcode: current.postcode || '1000',
    }));
    setErrors({});
  };

  const pay = async () => {
    const found = validateCard(card);
    setErrors(found);
    if (Object.keys(found).length) return;

    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));
    const decline = DECLINES[cardDigits];
    if (decline) {
      setProcessing(false);
      onFailure(decline);
      return;
    }

    await onSuccess({
      reference: `DEMO-${Date.now()}`,
      paymentMethod: `${brand} •••• ${cardDigits.slice(-4)} (demo)`,
    });
    setProcessing(false);
  };

  const theme = useTheme();

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Banner
        tone="info"
        title="Demo mode · no real charge"
        message="Don't enter a real card. Use 4242 4242 4242 4242 with any future date and CVC, or 4000 0000 0000 0002 to see a decline."
        actionLabel="Use test card"
        onAction={processing ? undefined : fillTestCard}
        style={styles.banner}
      />

      <TextField
        label="Name on card"
        placeholder="Movie Fan"
        value={card.name}
        onChangeText={(value) => update('name', value)}
        autoCapitalize="words"
        autoComplete="cc-name"
        error={errors.name}
        editable={!processing}
      />
      <TextField
        label="Card number"
        right={brand ? <Text style={[type.caption, { color: theme.link }]}>{brand}</Text> : null}
        placeholder="1234 5678 9012 3456"
        keyboardType="number-pad"
        autoComplete="cc-number"
        value={card.number}
        onChangeText={(value) => update('number', formatCardNumber(value))}
        maxLength={23}
        error={errors.number}
        editable={!processing}
      />
      <View style={styles.row}>
        <TextField
          style={styles.half}
          label="Expiry"
          placeholder="MM/YY"
          keyboardType="number-pad"
          autoComplete="cc-exp"
          value={card.expiry}
          onChangeText={(value) => update('expiry', formatExpiry(value))}
          maxLength={5}
          error={errors.expiry}
          editable={!processing}
        />
        <TextField
          style={styles.half}
          label="Security code"
          placeholder={brand === 'Amex' ? '1234' : '123'}
          keyboardType="number-pad"
          autoComplete="cc-csc"
          value={card.cvc}
          onChangeText={(value) => update('cvc', digitsOnly(value).slice(0, 4))}
          secureTextEntry
          error={errors.cvc}
          editable={!processing}
        />
      </View>
      <TextField
        label="Billing postcode"
        placeholder="e.g. 1000"
        value={card.postcode}
        onChangeText={(value) => update('postcode', value)}
        autoCapitalize="characters"
        autoComplete="postal-code"
        error={errors.postcode}
        editable={!processing}
      />

      <Button title={`Pay $${total.toFixed(2)} USD`} fullWidth loading={processing} onPress={pay} />
      <Text style={[type.caption, styles.note, { color: theme.textSecondary }]}>
        {processing ? 'Processing payment…' : 'Card details are only used for this demo and are never saved.'}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  banner: { marginBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
  note: { textAlign: 'center', marginTop: space.md },
});

export default MockCardCheckout;
