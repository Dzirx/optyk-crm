import type { TranslationKey } from '@/lib/i18n/translations';
import type { OrderedKey, PrescriptionField } from './types';

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

export const SPH_OPTIONS = genOpts(-20, 20, 0.25, 2);
export const CYL_OPTIONS = genOpts(-8, 8, 0.25, 2);
export const ADD_OPTIONS = genOpts(0.25, 4, 0.25, 2);
export const PD_OPTIONS  = genOpts(25, 40, 0.5, 1);

export const FIELD_OPTIONS: Record<PrescriptionField, { value: string; label: string }[] | null> = {
  opSph: SPH_OPTIONS, opCyl: CYL_OPTIONS, opAxis: null, opAdd: ADD_OPTIONS, opPd: PD_OPTIONS,
  olSph: SPH_OPTIONS, olCyl: CYL_OPTIONS, olAxis: null, olAdd: ADD_OPTIONS, olPd: PD_OPTIONS,
};
