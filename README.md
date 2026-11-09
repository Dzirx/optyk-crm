# Optyk CRM

CRM dla salonów optycznych. Aplikacja zawiera:

- klientów (dane kontaktowe, zgoda na SMS),
- wizyty z automatycznymi SMS: przypomnienie i prośba o opinię,
- zlecenia z receptą (OD/OS), oprawami i soczewkami oraz wydruk zlecenia,
- magazyn,
- wiadomości SMS do wybranych klientów,
- wysyłkę SMS przez SMSAPI lub SMSPlanet (dostawcę wybiera się w ustawieniach salonu).

Interfejs jest w języku polskim (i angielskim).

## Stos technologiczny

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- PostgreSQL i Prisma 6 (schemat synchronizowany przez `prisma db push`, bez migracji)
- NextAuth v5 (logowanie e-mail i hasło), zod 4
- Wersja Windows: Electron i lokalny PostgreSQL (katalog `desktop/`)

## Uruchomienie lokalne

Wymagania: Node.js 20 (taka wersja jest w `Dockerfile`), Docker.

```bash
npm install
docker run -d --name optyk-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=optyk_crm \
  -p 5432:5432 postgres:16-alpine
```

Utwórz plik `.env.local` z co najmniej:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/optyk_crm
AUTH_SECRET=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -base64 32>
ROOT_USER_EMAIL=admin@example.pl
ROOT_USER_PASSWORD=<hasło>
ROOT_USER_NAME=Administrator
```

Następnie:

```bash
npx prisma db push      # utworzenie tabel
npm run db:seed         # konto administratora z ROOT_USER_*
npm run dev             # http://localhost:3000
```

`npm run dev` i `npm run start` uruchamiają przy starcie także `db:seed:auto`.

## Zmienne środowiskowe

| Zmienna | Wymagana | Opis |
|---|---|---|
| `DATABASE_URL` | tak | Adres połączenia z PostgreSQL. |
| `AUTH_SECRET` | tak | Sekret NextAuth do podpisywania sesji. Czytany przez NextAuth, nie przez kod aplikacji. |
| `AUTH_TRUST_HOST` | za proxy | Ustaw `true`, gdy aplikacja działa za reverse proxy. Czytana przez NextAuth. |
| `CRON_SECRET` | tak, dla SMS | Token endpointu `GET /api/cron/send-scheduled-sms`. Bez niego endpoint zwraca błąd 500. |
| `ROOT_USER_EMAIL` | tak | E-mail konta administratora tworzonego przez seed. |
| `ROOT_USER_PASSWORD` | tak | Hasło tego konta. |
| `ROOT_USER_NAME` | tak | Nazwa tego konta. Brak którejkolwiek zmiennej `ROOT_USER_*` kończy seed błędem (a w kontenerze zatrzymuje start). |
| `CONTACT_EMAIL` | nie | E-mail pokazywany po końcu okresu próbnego. Domyślnie pusty. |
| `CONTACT_PHONE` | nie | Telefon pokazywany po końcu okresu próbnego. Domyślnie pusty. |
| `TRIAL_DAYS` | nie | Długość okresu próbnego w dniach. Domyślnie `5`. |
| `APP_TIME_ZONE` | nie | Strefa czasowa dat i godzin. Domyślnie `Europe/Warsaw`. |
| `LICENSE_PRIVATE_KEY_B64` | dla wersji Windows | Klucz prywatny (Ed25519, PEM w base64) do podpisywania licencji. Bez niego aktywacja Windows nie działa. |
| `OPTYK_EDITION` | nie | `desktop` włącza tryb wersji Windows (bez rejestracji i okresu próbnego). Ustawia ją instalator, nie ustawiaj jej w chmurze. |
| `NODE_ENV` | nie | Standardowa zmienna Node.js. Obraz Dockera ustawia `production`. |

Zmienne tylko dla wersji Windows (ustawia je program, nie ręcznie): `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD`, `LOCAL_USER_NAME`.
Zmienne tylko dla programistów (`desktop/src/main.js`): `OPTYK_LICENSE_SERVER`, `OPTYK_MACHINE_ID`, `OPTYK_PG_BIN_DIR`, `OPTYK_RESOURCES_DIR`, `OPTYK_DEBUG`.

Pliki `.env*` nie należą do repozytorium. Nie umieszczaj w nich danych klientów.

## Wdrożenie (Docker)

Obraz budowany jest z `Dockerfile` (Node 20, tryb `standalone`). Kontener startuje przez `entrypoint.sh`:

1. `npx prisma db push --skip-generate` — synchronizacja schematu bazy przy każdym starcie,
2. `npx tsx lib/db/seed.ts --silent` — utworzenie administratora, jeśli go nie ma,
3. `node server.js` — aplikacja na porcie 3000.

Skrypt działa z `set -e`. Błąd w kroku 1 lub 2 zatrzymuje start kontenera.

Uwaga: `db push` bez `--accept-data-loss` zatrzyma start, gdy zmiana schematu usuwa dane. Przed wdrożeniem takiej zmiany sprawdź dane w bazie.

Baza PostgreSQL musi być dostępna pod `DATABASE_URL`. Przykładowy plik `docker-optyk.yaml` pokazuje układ z bazą i aplikacją.

### Zaplanowane SMS (cron)

SMS z przypomnieniem i prośbą o opinię wysyła endpoint wywoływany z zewnątrz. Wywołuj go co 5 minut:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://TWOJA-DOMENA/api/cron/send-scheduled-sms
```

Endpoint odpowiada `401` przy złym tokenie i `500` przy braku `CRON_SECRET`.

### Okres próbny i panel administratora

Nowe konto (rejestracja) ma 5 dni okresu próbnego (`TRIAL_DAYS`). Po tym czasie dostęp blokuje się, a użytkownik widzi dane z `CONTACT_EMAIL` i `CONTACT_PHONE`. Administrator zarządza kontami w panelu `/admin/businesses`: przedłuża dostęp, blokuje konta i zwalnia komputery wersji Windows. Konto administratora nie ma limitu dostępu.

## Wersja Windows

Katalog `desktop/` zawiera instalator Windows: Electron, lokalny PostgreSQL i ta sama aplikacja w trybie `OPTYK_EDITION=desktop`. Wersja nie ma rejestracji ani okresu próbnego. Program aktywuje się licencją podpisaną przez serwer w chmurze. Adres serwera jest w `desktop/package.json` (`optyk.licenseServer`).

Klucze licencji (jednorazowo):

```bash
node scripts/generate-license-keys.mjs
```

Skrypt zapisuje klucz publiczny w `desktop/src/license-public-key.js` i wypisuje klucz prywatny. Wpisz go do `LICENSE_PRIVATE_KEY_B64` na serwerze. Nie zapisuj go w repozytorium. Nowe klucze unieważniają wydane licencje.

Budowa instalatora (w Dockerze):

```bash
DOCKER_CONTEXT=desktop-linux desktop/build-windows.sh        # wynik: desktop/dist/
DOCKER_CONTEXT=desktop-linux desktop/build-windows.sh test   # test orkiestracji na Linuksie
```

Skrypt przerywa pracę, jeśli brakuje `desktop/src/license-public-key.js` lub `optyk.licenseServer`.

## Skrypty npm

```bash
npm run dev            # serwer deweloperski (najpierw seed)
npm run build          # prisma generate + next build
npm run start          # serwer produkcyjny (najpierw seed)
npm run lint           # ESLint
npm run db:push        # synchronizacja schematu z bazą (bez migracji)
npm run db:generate    # generowanie klienta Prisma
npm run db:seed        # konto administratora
npm run db:studio      # Prisma Studio
```

## Testy

```bash
npm run test:unit      # testy jednostkowe (node:test + tsx), bez Dockera
npm run test:e2e       # testy e2e: baza w Dockerze + serwer next dev + wszystkie suity
npm test               # oba powyższe
npm run test:edition   # opcjonalnie: edycje Windows/chmura na kompilacji produkcyjnej (wymaga `next build`)
```

Wymagania dla testów e2e:

- uruchomiony Docker Desktop (skrypty używają kontekstu `desktop-linux`),
- wolne porty: 3131 (aplikacja) i 55441 (Postgres),
- zainstalowane zależności (`npm install`).

Skrypt `tests/e2e/run.sh` sam tworzy jednorazową bazę (`postgres:16-alpine`, kontener `optyk-e2e-db`),
zakłada schemat, dodaje konto admina, tworzy klucze licencji w pamięci i uruchamia serwer.
Po testach zawsze usuwa serwer i kontener. Pliki `.env` nie są używane ani zmieniane.
Pojedyncza suita: `npm run test:e2e -- idor` (dostępne: `idor`, `fixes`, `trial`, `license`, `api`, `pagination`).

Nie uruchamiaj drugiego `next dev` w tym samym katalogu podczas `npm run test:e2e`.

## Licencja

Licencja: patrz plik LICENSE.
