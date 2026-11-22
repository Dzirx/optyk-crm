import type { TranslationKey } from '@/lib/i18n/translations';
import type { OrderedKey, PrescriptionField, Source } from './types';
import { ADD_RANGE, CYL_RANGE, SPH_RANGE, type PowerRange } from '@/lib/work-orders/power';

export const ORDERED_KEYS: OrderedKey[] = ['opOrdered', 'olOrdered', 'frameOrdered'];

export const ITEM_TYPES: { value: string; labelKey: TranslationKey }[] = [
  { value: 'do_dali', labelKey: 'lensTypeDali' },
  { value: 'do_blizy', labelKey: 'lensTypeBlizy' },
  { value: 'progresywne', labelKey: 'lensTypeProgresywne' },
  { value: 'soczewki_kontaktowe', labelKey: 'lensTypeSoczewki' },
];

export const STATUSES: { value: string; labelKey: TranslationKey }[] = [
  { value: 'pending', labelKey: 'orderPending' },
  { value: 'ready', labelKey: 'orderReady' },
  { value: 'completed', labelKey: 'orderCompleted' },
];

function genOpts(from: number, to: number, step: number, decimals: number) {
  const opts: { value: string; label: string }[] = [];
  for (let v = from; v <= to + step / 2; v += step) {
    const r = Math.round(v * 1000) / 1000;
    const fixed = r.toFixed(decimals);
    opts.push({ value: fixed, label: r > 0 ? `+${fixed}` : fixed });
  }
  return opts;
}

export const PD_OPTIONS  = genOpts(25, 40, 0.5, 1);

/** Pola mocy (SPH, CYL, ADD) — wpisywane z klawiatury albo wybierane z listy od 0,00 (PowerInput). */
export const POWER_RANGES: Partial<Record<PrescriptionField, PowerRange>> = {
  opSph: SPH_RANGE, opCyl: CYL_RANGE, opAdd: ADD_RANGE,
  olSph: SPH_RANGE, olCyl: CYL_RANGE, olAdd: ADD_RANGE,
};

/** Pola z listą wartości (rozstaw źrenic). */
export const FIELD_OPTIONS: Partial<Record<PrescriptionField, { value: string; label: string }[]>> = {
  opPd: PD_OPTIONS, olPd: PD_OPTIONS,
};

export const SOURCE_OPTIONS: { value: Source; labelKey: TranslationKey }[] = [
  { value: 'stock', labelKey: 'sourceStock' },
  { value: 'order', labelKey: 'sourceOrder' },
  { value: 'manual', labelKey: 'sourceManual' },
  { value: 'own', labelKey: 'sourceOwn' },
  { value: 'none', labelKey: 'sourceNone' },
];
