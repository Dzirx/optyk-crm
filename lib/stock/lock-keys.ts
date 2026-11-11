// Klucze blokad doradczych Postgresa (pg_advisory_xact_lock(classid, hashtext(salon))).
// Dwuargumentowa forma: stała „klasa” oddziela rodzaje blokad, więc kolizja skrótu między
// różnymi blokadami (magazyn, numeracja zleceń) jest niemożliwa.
export const STOCK_LOCK_CLASS = 7101;
export const ORDER_NUMBER_LOCK_CLASS = 7102;
