// Wspólne opakowanie dla endpointów API. Jedno miejsce na:
//   sesję (401), salon (404), parametry z URL, odczyt i walidację body (zod, 400)
//   oraz obsługę błędów (znane błędy 400/409, reszta: log + 500 bez szczegółów).
//
//   export const POST = withBusiness(async ({ business, body }) => { ... },
//     { body: createSchema, error: 'Nie udało się utworzyć klienta' });
//
// Opcja `notFound` oznacza trasę z `[id]`: handler dostaje `params.id`,
// a id, które nie jest UUID-em, kończy się 404 z podanym komunikatem.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getUserBusiness, userHasAccess } from './get-user-business';
import { knownErrorResponse } from './errors';
import { isUuid } from './ownership';

// Komunikaty zod po polsku. Pola z własnym komunikatem w schemacie go zachowują.
z.config(z.locales.pl());
z.config({
  customError: (issue) => {
    if (issue.code !== 'invalid_type') return undefined;
    const field = (issue.path ?? []).join('.');
    if (!field) return 'Nieprawidłowe dane żądania';
    return issue.input === undefined ? `Pole „${field}” jest wymagane` : `Pole „${field}” ma nieprawidłowy format`;
  },
});

export type Business = NonNullable<Awaited<ReturnType<typeof getUserBusiness>>>;

export interface HandlerOptions {
  /** Komunikat dla 500 (bez szczegółów błędu). */
  error: string;
  /** Schemat body (POST/PATCH). Zły JSON albo zła treść → 400. */
  body?: z.ZodType;
  /** Trasa z `[id]`: id musi być UUID-em, inaczej 404 z tym komunikatem. */
  notFound?: string;
}

type ParamsOf<O> = O extends { notFound: string } ? { id: string } : Record<string, never>;
type BodyOf<O> = O extends { body: infer S extends z.ZodType } ? z.output<S> : undefined;
type Args<O> = { req: NextRequest; params: ParamsOf<O>; body: BodyOf<O> };

export type RouteHandler<O> = (req: NextRequest, ctx: { params: Promise<ParamsOf<O>> }) => Promise<Response>;

const json = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Pierwszy komunikat błędu zod (schematy mają polskie komunikaty). */
export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Nieprawidłowe dane żądania';
}

/**
 * Wspólny rdzeń. `guard` sprawdza uprawnienia i zwraca dodatkowe argumenty
 * dla handlera albo gotową odpowiedź (401/403/404).
 */
function createRoute<O extends HandlerOptions, X extends object>(
  guard: () => Promise<X | Response>,
  handler: (args: Args<O> & X) => Promise<Response>,
  opts: O,
): RouteHandler<O> {
  return async (req, ctx) => {
    try {
      const guarded = await guard();
      if (guarded instanceof Response) return guarded;

      const params = await ctx.params;
      if (opts.notFound && !isUuid((params as { id?: unknown }).id)) return json(opts.notFound, 404);

      let body: unknown = undefined;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return json('Nieprawidłowy format danych (oczekiwano JSON)', 400);
        }
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return json(zodMessage(parsed.error), 400);
        body = parsed.data;
      }

      return await handler({ req, params, body, ...guarded } as Args<O> & X);
    } catch (error) {
      const known = knownErrorResponse(error);
      if (known) return known;
      console.error(`[API] ${req.method} ${new URL(req.url).pathname}:`, error);
      return json(opts.error, 500);
    }
  };
}

/** Endpoint salonu: sesja → salon (po końcu okresu próbnego brak salonu = 404) → handler z `business`. */
export function withBusiness<const O extends HandlerOptions>(
  handler: (args: Args<O> & { business: Business }) => Promise<Response>,
  opts: O,
): RouteHandler<O> {
  return createRoute<O, { business: Business }>(
    async () => {
      const session = await auth();
      if (!session?.user?.id) return json('Nieautoryzowany', 401);
      const business = await getUserBusiness(session.user.id);
      if (!business) return json('Nie znaleziono firmy', 404);
      return { business };
    },
    handler,
    opts,
  );
}

const ACCESS_EXPIRED = 'Okres próbny zakończył się. Skontaktuj się z nami, aby przedłużyć dostęp.';

/** Endpoint konta z aktywnym dostępem, ale niekoniecznie z salonem (np. /api/business). Po okresie próbnym: 403. */
export function withAccess<const O extends HandlerOptions>(
  handler: (args: Args<O> & { userId: string }) => Promise<Response>,
  opts: O,
): RouteHandler<O> {
  return createRoute<O, { userId: string }>(
    async () => {
      const session = await auth();
      if (!session?.user?.id) return json('Nieautoryzowany', 401);
      if (!(await userHasAccess(session.user.id))) return json(ACCESS_EXPIRED, 403);
      return { userId: session.user.id };
    },
    handler,
    opts,
  );
}

/** Endpoint administratora: sesja (401) → rola admin (403) → handler. */
export function withAdmin<const O extends HandlerOptions>(
  handler: (args: Args<O>) => Promise<Response>,
  opts: O,
): RouteHandler<O> {
  return createRoute<O, object>(
    async () => {
      const session = await auth();
      if (!session?.user?.id) return json('Nieautoryzowany', 401);
      if (session.user.role !== 'admin') {
        return json('Brak dostępu — wymagane uprawnienia administratora', 403);
      }
      return {};
    },
    handler,
    opts,
  );
}
