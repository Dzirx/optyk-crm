import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from './validation';
import { OutOfStockError } from '@/lib/work-orders/inventory';
import { StockCountError } from '@/lib/stock-count/service';
import { DuplicateOrderNumberError } from '@/lib/work-orders/order-number';

/** Odpowiedź dla znanych błędów biznesowych (400/409). Dla innych błędów zwraca null. */
export function knownErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof OutOfStockError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof DuplicateOrderNumberError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof StockCountError) return NextResponse.json({ error: error.message }, { status: error.status });
  return null;
}
