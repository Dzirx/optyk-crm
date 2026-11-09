import { NextResponse } from 'next/server';
import { ValidationError } from './validation';
import { OutOfStockError } from '@/lib/work-orders/inventory';
import { DuplicateOrderNumberError } from '@/lib/work-orders/order-number';

/** Odpowiedź dla znanych błędów biznesowych (400/409). Dla innych błędów zwraca null. */
export function knownErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof OutOfStockError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof DuplicateOrderNumberError) return NextResponse.json({ error: error.message }, { status: 409 });
  return null;
}
