import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatCurrency = (amount) => `$${Number(amount).toFixed(2)}`;

const buildReceiptHtml = (order) => {
  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong><br />
            <span class="muted">${escapeHtml(item.category)}</span>
          </td>
          <td class="number">${item.quantity}</td>
          <td class="number">${formatCurrency(item.price)}</td>
          <td class="number">${formatCurrency(item.price * item.quantity)}</td>
        </tr>`
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 36px; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #171717; margin: 0; font-size: 13px; }
          .header { background: #111827; color: white; padding: 24px; border-radius: 12px; }
          .brand { font-size: 26px; font-weight: 700; margin: 0 0 5px; }
          .receipt-label { color: #c7d2fe; letter-spacing: 2px; font-size: 11px; }
          .status { display: inline-block; margin-top: 15px; padding: 6px 12px; background: #dcfce7; color: #166534; border-radius: 999px; font-weight: 700; }
          .details { display: flex; justify-content: space-between; margin: 24px 0; }
          .details div { width: 48%; }
          .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
          .value { font-weight: 600; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { text-align: left; background: #f3f4f6; padding: 10px; border-bottom: 2px solid #d1d5db; }
          td { padding: 12px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
          .number { text-align: right; }
          .muted { color: #6b7280; font-size: 11px; }
          .totals { margin-left: auto; width: 250px; margin-top: 18px; }
          .total-row { display: flex; justify-content: space-between; padding: 7px 0; }
          .grand-total { border-top: 2px solid #111827; margin-top: 5px; padding-top: 12px; font-size: 18px; font-weight: 700; }
          .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #d1d5db; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="receipt-label">TRANSACTION RECEIPT</div>
          <h1 class="brand">The Movie Network</h1>
          <div>Movie merchandise store</div>
          <div class="status">PAYMENT SUCCESSFUL</div>
        </div>

        <div class="details">
          <div>
            <div class="label">Receipt number</div>
            <div class="value">${escapeHtml(order.id)}</div>
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(order.customerEmail || 'Movie fan')}</div>
          </div>
          <div>
            <div class="label">Transaction date</div>
            <div class="value">${escapeHtml(order.createdAt)}</div>
            <div class="label">Payment method</div>
            <div class="value">${escapeHtml(order.paymentMethod)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Item</th><th class="number">Qty</th><th class="number">Price</th><th class="number">Amount</th></tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <div class="totals">
          <div class="total-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
          <div class="total-row"><span>Tax</span><span>${formatCurrency(order.tax)}</span></div>
          <div class="total-row grand-total"><span>Total USD</span><span>${formatCurrency(order.total)}</span></div>
        </div>

        <div class="footer">
          Thank you for supporting The Movie Network.<br />
          Keep this receipt for your transaction records.
        </div>
      </body>
    </html>`;
};

// Generates the receipt PDF and keeps a copy in the app cache.
export const createReceiptPdf = async (order) => {
  const result = await Print.printToFileAsync({
    html: buildReceiptHtml(order),
    width: 612,
    height: 792,
    base64: true,
  });

  // expo-print writes outside the app's scoped storage, which Expo Go does not let
  // expo-sharing or expo-file-system read, so save the PDF bytes to the app cache.
  const fileName = `receipt-${String(order.id).replace(/[^\w-]/g, '_')}.pdf`;
  const receiptFile = new File(Paths.cache, fileName);
  receiptFile.write(result.base64, { encoding: 'base64' });

  return { uri: receiptFile.uri, base64: result.base64, fileName, orderId: order.id };
};

export const shareReceiptPdf = async (receiptPdf) => {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error(`Receipt created at ${receiptPdf.uri}, but sharing is unavailable on this device.`);
  }

  await Sharing.shareAsync(receiptPdf.uri, {
    dialogTitle: `Receipt ${receiptPdf.orderId}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
};

export const isPickerCancelled = (error) => /cancel/i.test(error?.message || '');

// Android: the user picks a folder (e.g. Downloads) and the PDF is written there.
// iOS has no folder picker for this, so the share sheet's "Save to Files" is used.
export const saveReceiptToDevice = async (receiptPdf) => {
  if (Platform.OS !== 'android') {
    await shareReceiptPdf(receiptPdf);
    return null;
  }

  const directory = await Directory.pickDirectoryAsync();
  const savedFile = directory.createFile(receiptPdf.fileName, 'application/pdf');
  savedFile.write(receiptPdf.base64, { encoding: 'base64' });
  return savedFile.uri;
};
