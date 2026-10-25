const friendlyErrors: Record<string, string> = {
  'Insufficient stock': 'Not enough stock. Reduce the quantity or restock.',
  'Sale must contain': 'Add at least one item to the bill.',
  'Discount cannot be': 'Discount can’t be negative.',
  'Discount exceeds': 'Discount is larger than the subtotal.',
  'Amount paid (': 'Amount paid can’t exceed the total.',
  'Payment exceeds': 'That payment is more than the remaining balance.',
  'Refund (': 'Refund is more than the refundable balance.',
  'Refund outstanding': 'Refund the customer before voiding this sale.',
  'Cannot record payment on a voided': 'This sale is voided — payments are blocked.',
  'Not an active user': 'Your account is inactive. Contact the shop owner.',
  'Owner only': 'Only the shop owner can do that.',
  'duplicate key value': 'A product with that SKU already exists.',
};

function extractMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (
    e &&
    typeof e === 'object' &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return String(e);
}

export function friendlyMessage(e: unknown): string {
  const msg = extractMessage(e);
  for (const [prefix, copy] of Object.entries(friendlyErrors)) {
    if (msg.startsWith(prefix) || msg.includes(prefix)) return copy;
  }
  return msg;
}
