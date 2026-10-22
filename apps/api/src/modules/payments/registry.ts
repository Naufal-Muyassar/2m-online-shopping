import { env } from "../../config/env";
import { PaymentProviderError, type PaymentProvider } from "./provider";
import { XenditAdapter } from "./xendit.adapter";

let current: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!current) {
    if (!env.XENDIT_SECRET_KEY || !env.XENDIT_CALLBACK_TOKEN) {
      throw new PaymentProviderError("Xendit is not configured", false);
    }
    current = new XenditAdapter({
      secretKey: env.XENDIT_SECRET_KEY,
      callbackToken: env.XENDIT_CALLBACK_TOKEN,
      baseUrl: env.XENDIT_BASE_URL,
    });
  }
  return current;
}

// Tests inject a fake provider; pass null to fall back to the env-configured Xendit adapter.
export function setPaymentProvider(provider: PaymentProvider | null): void {
  current = provider;
}
