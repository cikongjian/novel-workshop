import { afterEach, describe, expect, it } from 'vitest';
import { getBillingPaymentConfig } from './payment-config.js';

const originalQrCodeProvider = process.env.BILLING_PAYMENT_QR_CODE_PROVIDER;

afterEach(() => {
  if (originalQrCodeProvider === undefined) {
    delete process.env.BILLING_PAYMENT_QR_CODE_PROVIDER;
  } else {
    process.env.BILLING_PAYMENT_QR_CODE_PROVIDER = originalQrCodeProvider;
  }
});

describe('getBillingPaymentConfig', () => {
  it('does not send payment QR contents to a third party by default', () => {
    delete process.env.BILLING_PAYMENT_QR_CODE_PROVIDER;

    expect(getBillingPaymentConfig().qrCodeProvider).toBe('');
  });

  it('accepts an explicitly configured QR code provider', () => {
    process.env.BILLING_PAYMENT_QR_CODE_PROVIDER = 'https://payments.example.test/qr/';

    expect(getBillingPaymentConfig().qrCodeProvider).toBe('https://payments.example.test/qr/');
  });
});
