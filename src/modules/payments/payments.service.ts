import * as crypto from 'crypto';
import { OrdersService } from '../orders/orders.service';
import { VendorsService } from '../vendors/vendors.service';
import { PaystackWebhookDto } from './payments.dto';
import { PAYSTACK_SIGNATURE_SECRET } from '../../config/env';

export class PaymentsService {
  private ordersService = new OrdersService();
  private vendorsService = new VendorsService();

  verifyWebhookSignature(
    payload: unknown,
    signature?: string,
    rawBody?: Buffer
  ): boolean {
    if (!signature) {
      return false;
    }

    const body = rawBody ?? Buffer.from(JSON.stringify(payload));
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SIGNATURE_SECRET)
      .update(body)
      .digest('hex');

    const expected = Buffer.from(hash, 'hex');
    const received = Buffer.from(signature, 'hex');

    return (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    );
  }

  async processWebhook(payload: PaystackWebhookDto): Promise<void> {
    if (payload.event !== 'charge.success') {
      return;
    }

    const metadata = payload.data.metadata || {};
    const reference = payload.data.reference;

    if (metadata.type === 'vendor_onboarding_fee') {
      await this.vendorsService.confirmFeePayment(
        reference,
        String(payload.data.id ?? '')
      );
      return;
    }

    await this.ordersService.handleWebhook(payload);
  }
}
