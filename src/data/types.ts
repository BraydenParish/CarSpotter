/**
 * Dataset schema. Vehicle records describe a car (make/model/generation);
 * photo records describe one reviewed photograph of a vehicle plus its
 * licensing and the answer fields it can fairly support.
 */

export const BODY_STYLES = [
  'sedan',
  'hatchback',
  'coupe',
  'convertible',
  'roadster',
  'wagon',
  'suv',
  'pickup',
  'van',
] as const;
export type BodyStyle = (typeof BODY_STYLES)[number];

/** Broad categories used for filters and themed challenges. */
export const CATEGORIES = [
  'everyday',
  'classic',
  'jdm',
  'muscle',
  'supercar',
  'sports',
  'european',
  'american',
  'electric',
  'offroad',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Generation {
  /** Display name, e.g. "Mk7" or "NA". */
  name: string;
  /** Accepted alternative spellings, e.g. ["Mk 7", "Golf 7", "seventh generation"]. */
  aliases: string[];
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  /** Accepted alternative model names (regional names, common shorthand). */
  modelAliases: string[];
  /** Vehicle-specific accepted makes (e.g. "Datsun" for a Nissan sold as Datsun). */
  makeAliases?: string[];
  /** Vehicle-specific trim words that may follow the model without changing the car (e.g. "500 L"). */
  extraWords?: string[];
  generation: Generation | null;
  bodyStyle: BodyStyle;
  country: string;
  /** Production years of this generation (calendar years, inclusive). */
  years: [number, number];
  categories: Category[];
  /** Other real names for the same visual car (badge-engineered twins). Never used as distractors. */
  twins?: string[];
  /** Verified identification tip shown on reveal. */
  tip?: string;
  /** Source that documents the vehicle facts and tip. */
  referenceUrl: string;
}

export const SETTINGS = ['street', 'studio', 'other'] as const;
export type Setting = (typeof SETTINGS)[number];
export const ANGLES = ['front', 'front-quarter', 'side', 'rear-quarter', 'rear', 'detail'] as const;
export type Angle = (typeof ANGLES)[number];
export const DETAIL_PARTS = ['headlight', 'taillight', 'interior', 'wheel', 'grille', 'bodywork'] as const;
export type DetailPart = (typeof DETAIL_PARTS)[number];
export type ReviewStatus = 'approved' | 'pending' | 'rejected';

export interface YearEvidence {
  from: number;
  to: number;
  /** Why this range: e.g. "Pre-facelift NA styling, 1989–1997; photo shows no detail that narrows it". */
  basis: string;
}

export interface PhotoSupports {
  make: boolean;
  model: boolean;
  /** Expert may ask for a model year (range accepted, exact only when from === to). */
  year: boolean;
  /** Expert may ask for the generation instead of the year. */
  generation: boolean;
  /** A trim may be asked only if verified; currently never required. */
  trim: boolean;
}

export interface PhotoSource {
  /** Commons file title, e.g. "File:1990 Mazda MX-5 1.6i.jpg". */
  title: string;
  pageUrl: string;
  originalUrl: string;
  photographer: string;
  license: string;
  licenseUrl: string | null;
  /** Required credit / attribution line as given by the source (plain text). */
  credit: string;
  attributionRequired: boolean;
  /** Notice of changes we made (resize, re-encode, crop). */
  modifications: string;
}

export interface PhotoReview {
  status: ReviewStatus;
  reviewedBy: string;
  date: string;
  notes: string;
}

export interface Photo {
  id: string;
  vehicleId: string;
  kind: 'full' | 'detail';
  detailPart?: DetailPart;
  /** For detail crops: the full photo this was cut from. */
  derivedFrom?: string;
  /** Crop rectangle in source pixels (detail crops only). */
  crop?: { left: number; top: number; width: number; height: number };
  image: string;
  imageSmall: string;
  width: number;
  height: number;
  setting: Setting;
  angle: Angle;
  modelYear: YearEvidence;
  trim?: string;
  supports: PhotoSupports;
  /** URLs documenting the identity (Commons category, reference article). */
  identityEvidence: string[];
  source: PhotoSource;
  review: PhotoReview;
}
