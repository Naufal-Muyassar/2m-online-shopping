export type Rupiah = number;

export function rupiah(value: number): Rupiah {
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid rupiah amount: ${value}`);
  return value;
}

export function addIDR(...amounts: Rupiah[]): Rupiah {
  return rupiah(amounts.reduce((sum, a) => sum + rupiah(a), 0));
}

export function mulIDR(amount: Rupiah, qty: number): Rupiah {
  if (!Number.isInteger(qty)) throw new Error(`Invalid quantity: ${qty}`);
  return rupiah(rupiah(amount) * qty);
}

export function formatIDR(amount: Rupiah): string {
  return `Rp${rupiah(amount).toLocaleString("id-ID")}`;
}
