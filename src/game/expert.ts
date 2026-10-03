/**
 * Expert eligibility and question requirements.
 *
 * Expert asks for make + model + one precision field chosen per photo:
 *  - "year" when the photo's verified evidence supports a model-year range.
 *    If the range is a single year, that exact year is required; otherwise any
 *    year in the documented visually-equivalent range is accepted.
 *  - "generation" when the year cannot be narrowed fairly but the generation can.
 * Photos supporting neither are excluded from Expert.
 */
import type { Photo, Vehicle } from '../data/types';

export type ExpertField = 'year' | 'generation';

/** Year ranges wider than this are not a fair "model year" question. */
export const MAX_YEAR_SPAN = 12;

export function expertField(photo: Photo, vehicle: Vehicle): ExpertField | null {
  if (photo.kind !== 'full') return null;
  if (!photo.supports.make || !photo.supports.model) return null;
  const span = photo.modelYear.to - photo.modelYear.from;
  if (photo.supports.year && span >= 0 && span <= MAX_YEAR_SPAN) return 'year';
  if (photo.supports.generation && vehicle.generation) return 'generation';
  return null;
}

export function isExpertEligible(photo: Photo, vehicle: Vehicle): boolean {
  return expertField(photo, vehicle) !== null;
}

/** Plain-language requirement shown before submission (never reveals the answer). */
export function expertRequirement(photo: Photo, field: ExpertField): string {
  if (field === 'generation') {
    return 'Name the generation: a chassis code, “Mk” number or ordinal (e.g. “Mk2”, “E30”, “second generation”). The model year isn’t asked because this photo can’t pin it down.';
  }
  if (photo.modelYear.from === photo.modelYear.to) {
    return 'Enter the exact model year. Details visible in this photo distinguish it from neighbouring years.';
  }
  return 'Enter a model year. Any year within this car’s visually identical span is accepted, because the photo can’t tell those years apart.';
}
