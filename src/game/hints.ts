/**
 * Optional hints, revealed in order: country → decade → make.
 * Each one lowers the points still available (see scoring.HINT_MULTIPLIERS).
 */
import type { Photo, Vehicle } from '../data/types';

export interface Hint {
  label: string;
  value: string;
}

export function decadeLabel(from: number, to: number): string {
  const a = Math.floor(from / 10) * 10;
  const b = Math.floor(to / 10) * 10;
  return a === b ? `${a}s` : `${a}s–${b}s`;
}

export function hintsFor(photo: Photo, vehicle: Vehicle): Hint[] {
  return [
    { label: 'Country', value: vehicle.country },
    { label: 'Era', value: decadeLabel(photo.modelYear.from, photo.modelYear.to) },
    { label: 'Make', value: vehicle.make },
  ];
}
