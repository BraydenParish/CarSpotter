import { describe, expect, it } from 'vitest';
import { createContext, VEHICLES } from '../data/dataset';
import { MAKE_ALIASES } from '../data/lexicon';
import { fixturePhotos } from '../dev/fixtures';
import { checkTyped } from './check';
import {
  compact,
  editDistance,
  matchGeneration,
  matchMake,
  matchModel,
  matchYear,
  normalize,
  parseYear,
  splitCombined,
} from './matching';

const ctx = createContext(VEHICLES, fixturePhotos(VEHICLES));
const v = (id: string) => ctx.ds.vehicleById.get(id)!;
const photo = (vehicleId: string) => ctx.ds.photos.find((p) => p.vehicleId === vehicleId)!;
const make = (input: string, id: string) => matchMake(input, v(id), ctx.index, MAKE_ALIASES);
const model = (input: string, id: string) => matchModel(input, v(id), ctx.index, MAKE_ALIASES);

describe('normalisation', () => {
  it('ignores case, spacing, punctuation and accents', () => {
    expect(compact('MX-5')).toBe('mx5');
    expect(compact(' mx 5 ')).toBe('mx5');
    expect(compact('Citroën')).toBe('citroen');
    expect(normalize('Mercedes–Benz')).toBe('mercedes benz');
    expect(compact("'69")).toBe('69');
  });

  it('computes transposition-aware edit distance', () => {
    expect(editDistance('mustnag', 'mustang')).toBe(1);
    expect(editDistance('porshe', 'porsche')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
  });
});

describe('make matching', () => {
  it('accepts exact makes regardless of formatting', () => {
    expect(make('mazda', 'mazda-mx5-na').kind).toBe('exact');
    expect(make('MERCEDES-BENZ', 'mercedes-300sl').correct).toBe(true);
    expect(make('mercedes benz', 'mercedes-300sl').correct).toBe(true);
    expect(make('Citroen', 'citroen-2cv').correct).toBe(true);
  });

  it('accepts explicit aliases', () => {
    expect(make('VW', 'vw-golf-mk7')).toMatchObject({ correct: true, kind: 'alias' });
    expect(make('Volkswagen', 'vw-golf-mk7').correct).toBe(true);
    expect(make('Chevy', 'chevrolet-camaro-1g').correct).toBe(true);
    expect(make('Merc', 'mercedes-300sl').correct).toBe(true);
    expect(make('Lambo', 'lamborghini-countach').correct).toBe(true);
    expect(make('Acura', 'honda-nsx-na').correct).toBe(true);
    expect(make('Nissan', 'datsun-240z').correct).toBe(true);
    expect(make('Morris', 'mini-classic').correct).toBe(true);
  });

  it('tolerates a small typo on longer names', () => {
    expect(make('Porshe', 'porsche-911-993')).toMatchObject({ correct: true, kind: 'typo' });
    expect(make('Lamborgini', 'lamborghini-countach').correct).toBe(true);
    expect(make('Chevrolay', 'chevrolet-camaro-1g').correct).toBe(true);
  });

  it('never accepts a different real make', () => {
    expect(make('Toyota', 'mazda-mx5-na').correct).toBe(false);
    expect(make('Nissan', 'toyota-supra-a80').correct).toBe(false);
    expect(make('Dodge', 'chevrolet-camaro-1g').correct).toBe(false);
    // "Ford" is a real make and 4 letters: no typo tolerance at all.
    expect(make('Fort', 'ford-mustang-1g').correct).toBe(false);
  });

  it('is not fooled by aliases of other makes', () => {
    expect(make('VW', 'porsche-911-993').correct).toBe(false);
    expect(make('Chevy', 'dodge-charger-2g').correct).toBe(false);
  });
});

describe('model matching', () => {
  it('accepts normalised exact names', () => {
    expect(model('mx5', 'mazda-mx5-na').correct).toBe(true);
    expect(model('MX 5', 'mazda-mx5-na').correct).toBe(true);
    expect(model('f150', 'ford-f150-13g').correct).toBe(true);
    expect(model('model3', 'tesla-model-3').correct).toBe(true);
    expect(model('E type', 'jaguar-etype').correct).toBe(true);
  });

  it('accepts explicit model aliases', () => {
    expect(model('Miata', 'mazda-mx5-na')).toMatchObject({ correct: true, kind: 'alias' });
    expect(model('Kafer', 'vw-beetle').correct).toBe(true);
    expect(model('Type 1', 'vw-beetle').correct).toBe(true);
    expect(model('Deux Chevaux', 'citroen-2cv').correct).toBe(true);
    expect(model('Gullwing', 'mercedes-300sl').correct).toBe(true);
    expect(model('XKE', 'jaguar-etype').correct).toBe(true);
  });

  it('allows the make, trims, generation and years around the model', () => {
    expect(model('Mazda MX-5', 'mazda-mx5-na').correct).toBe(true);
    expect(model('Skyline GT-R', 'nissan-skyline-r34').correct).toBe(true);
    expect(model('Skyline R34 GT-R', 'nissan-skyline-r34').correct).toBe(true);
    expect(model('Golf GTI', 'vw-golf-mk7').correct).toBe(true);
    expect(model('Golf Mk7', 'vw-golf-mk7').correct).toBe(true);
    expect(model('1969 Charger R/T', 'dodge-charger-2g').correct).toBe(true);
    expect(model('Mustang Fastback', 'ford-mustang-1g').correct).toBe(true);
    expect(model('Aventador SVJ', 'lamborghini-aventador').correct).toBe(true);
  });

  it('tolerates conservative typos', () => {
    expect(model('Mustnag', 'ford-mustang-1g')).toMatchObject({ correct: true, kind: 'typo' });
    expect(model('Camero', 'chevrolet-camaro-1g').correct).toBe(true);
    expect(model('Countash', 'lamborghini-countach').correct).toBe(true);
    expect(model('Aventadore', 'lamborghini-aventador').correct).toBe(true);
  });

  it('never reads a different real model as a typo', () => {
    expect(model('MX-6', 'mazda-mx5-na').correct).toBe(false);
    expect(model('912', 'porsche-911-993').correct).toBe(false);
    expect(model('Celica', 'toyota-supra-a80').correct).toBe(false);
    expect(model('Challenger', 'dodge-charger-2g').correct).toBe(false);
    expect(model('Charger', 'dodge-challenger-1g').correct).toBe(false);
    expect(model('Diablo', 'lamborghini-countach').correct).toBe(false);
    expect(model('Model S', 'tesla-model-3').correct).toBe(false);
    expect(model('Model Y', 'tesla-model-3').correct).toBe(false);
    expect(model('F-250', 'ford-f150-13g').correct).toBe(false);
    expect(model('Polo', 'vw-golf-mk7').correct).toBe(false);
    expect(model('Gold', 'vw-golf-mk7').correct).toBe(false);
    expect(model('Corolla', 'toyota-prius-xw30').correct).toBe(false);
    expect(model('Skyline GT-R', 'datsun-240z').correct).toBe(false);
  });

  it('rejects a different model even with the right make attached', () => {
    expect(model('Mazda RX-7', 'mazda-mx5-na').correct).toBe(false);
    expect(model('Ford Mustang Mach-E', 'ford-mustang-1g').correct).toBe(false);
  });

  it('handles empty input', () => {
    expect(model('', 'mazda-mx5-na').kind).toBe('empty');
    expect(make('   ', 'mazda-mx5-na').kind).toBe('empty');
  });
});

describe('combined entry', () => {
  it('splits "VW Golf" typed into a single box', () => {
    expect(splitCombined('VW Golf', '', ctx.index)).toEqual({ make: 'vw', model: 'golf' });
    expect(splitCombined('', 'Land Rover Defender', ctx.index)).toEqual({ make: 'land rover', model: 'defender' });
    const res = checkTyped(ctx, photo('vw-golf-mk7'), v('vw-golf-mk7'), 'hard', { make: 'VW Golf', model: '' }, null);
    expect(res.fullyCorrect).toBe(true);
  });
});

describe('Expert fields', () => {
  it('parses two- and four-digit years', () => {
    expect(parseYear('1969')).toBe(1969);
    expect(parseYear("'69", [1968, 1970])).toBe(1969);
    expect(parseYear('15', [2012, 2020])).toBe(2015);
    expect(parseYear('nineteen')).toBeNull();
  });

  it('accepts any year in a documented range', () => {
    const p = photo('mazda-mx5-na');
    expect(matchYear('1992', p).correct).toBe(true);
    expect(matchYear('1989', p).correct).toBe(true);
    expect(matchYear('1998', p)).toMatchObject({ correct: false, kind: 'close' });
    expect(matchYear('2005', p)).toMatchObject({ correct: false, kind: 'wrong' });
  });

  it('requires the exact year when the photo pins it down', () => {
    const p = photo('dodge-charger-2g');
    expect(p.modelYear).toMatchObject({ from: 1969, to: 1969 });
    expect(matchYear('1969', p).correct).toBe(true);
    expect(matchYear('1968', p)).toMatchObject({ correct: false, kind: 'close', note: '1 year off' });
  });

  it('matches generation names and aliases with noise words', () => {
    const g = (input: string, id: string) => matchGeneration(input, v(id), MAKE_ALIASES).correct;
    expect(g('NA', 'mazda-mx5-na')).toBe(true);
    expect(g('mk1', 'mazda-mx5-na')).toBe(true);
    expect(g('first generation', 'mazda-mx5-na')).toBe(true);
    expect(g('Golf Mk 7', 'vw-golf-mk7')).toBe(true);
    expect(g('the A80', 'toyota-supra-a80')).toBe(true);
    expect(g('mk4', 'toyota-supra-a80')).toBe(true);
    expect(g('NB', 'mazda-mx5-na')).toBe(false);
    expect(g('A90', 'toyota-supra-a80')).toBe(false);
    expect(g('R33', 'nissan-skyline-r34')).toBe(false);
  });

  it('reports each Expert field separately even when the answer is wrong', () => {
    const p = photo('dodge-charger-2g');
    const res = checkTyped(ctx, p, v('dodge-charger-2g'), 'expert', { make: 'Dodge', model: 'Challenger', extra: '1969' }, 'year');
    expect(res.fullyCorrect).toBe(false);
    expect(res.fields.make.correct).toBe(true);
    expect(res.fields.model.correct).toBe(false);
    expect(res.fields.year.correct).toBe(true);
    expect(res.scoreFields).toEqual({ make: true, model: false, detail: true });
  });
});

describe('answers found while playtesting with real photos', () => {
  it('accepts names players actually type for these cars', () => {
    expect(model('Golf 7', 'vw-golf-mk7').correct).toBe(true);
    expect(model('Golf VII', 'vw-golf-mk7').correct).toBe(true);
    expect(model('993', 'porsche-911-993').correct).toBe(true);
    expect(model('NSX-R', 'honda-nsx-na').correct).toBe(true);
    expect(model('FJ40', 'toyota-land-cruiser-j40').correct).toBe(true);
    expect(model('Landcruiser', 'toyota-land-cruiser-j40').correct).toBe(true);
    expect(model('Jimny', 'suzuki-jimny-jb64').correct).toBe(true);
  });

  it('never accepts a different real model as a typo or alias', () => {
    expect(model('260Z', 'datsun-240z').correct).toBe(false);
    expect(model('280Z', 'datsun-240z').correct).toBe(false);
    expect(model('Prius c', 'toyota-prius-xw30').correct).toBe(false);
    expect(model('Prius v', 'toyota-prius-xw30').correct).toBe(false);
    expect(model('300 SLR', 'mercedes-300sl').correct).toBe(false);
    expect(model('FJ Cruiser', 'toyota-land-cruiser-j40').correct).toBe(false);
    expect(model('Samurai', 'suzuki-jimny-jb64').correct).toBe(false);
  });
});

describe('answers for the second photo batch', () => {
  it('accepts common names and rejects sibling models', () => {
    expect(model('G-Wagon', 'mercedes-g-class-w463').correct).toBe(true);
    expect(model('G63', 'mercedes-g-class-w463').correct).toBe(true);
    expect(model('GL-Class', 'mercedes-g-class-w463').correct).toBe(false);
    expect(model('Rabbit', 'vw-golf-mk1').correct).toBe(true);
    expect(model('Scirocco', 'vw-golf-mk1').correct).toBe(false);
    expect(model('RX-8', 'mazda-rx7-fd').correct).toBe(false);
    expect(model('512 TR', 'ferrari-testarossa').correct).toBe(false);
    expect(model('Testarosa', 'ferrari-testarossa').correct).toBe(true);
    expect(model('912', 'porsche-356').correct).toBe(false);
    expect(model('Sting Ray', 'chevrolet-corvette-c2').correct).toBe(true);
    expect(model('Corvair', 'chevrolet-corvette-c2').correct).toBe(false);
  });
});

describe('answers for the third photo batch', () => {
  it('handles the Renault 4, W123 and Barracuda', () => {
    expect(model('R4', 'renault-4').correct).toBe(true);
    expect(model('4L', 'renault-4').correct).toBe(true);
    expect(model('5', 'renault-4').correct).toBe(false);
    expect(model('240D', 'mercedes-w123').correct).toBe(true);
    expect(model('W124', 'mercedes-w123').correct).toBe(false);
    expect(model("'Cuda", 'plymouth-barracuda-3g').correct).toBe(true);
    expect(model('Challenger', 'plymouth-barracuda-3g').correct).toBe(false);
    expect(model('Barracuda', 'dodge-challenger-1g').correct).toBe(false);
  });
});

describe('generation names that contain the model name', () => {
  const gen = (input: string, id: string) => matchGeneration(input, v(id), MAKE_ALIASES).correct;
  it('accepts every documented generation name and alias for every car', () => {
    for (const vehicle of VEHICLES) {
      if (!vehicle.generation) continue;
      for (const name of [vehicle.generation.name, ...vehicle.generation.aliases]) {
        expect(gen(name, vehicle.id), `${vehicle.id}: "${name}"`).toBe(true);
      }
    }
  });

  it('still rejects the bare model name and neighbouring generations', () => {
    expect(gen('Nuova 500', 'fiat-500-nuova')).toBe(true);
    expect(gen('500', 'fiat-500-nuova')).toBe(false);
    expect(gen('Golf I', 'vw-golf-mk1')).toBe(true);
    expect(gen('Golf', 'vw-golf-mk1')).toBe(false);
    expect(gen('Mk7', 'vw-golf-mk1')).toBe(false);
    expect(gen('Sting Ray', 'chevrolet-corvette-c2')).toBe(true);
    expect(gen('C3', 'chevrolet-corvette-c2')).toBe(false);
    expect(gen('964', 'porsche-911-993')).toBe(false);
  });
});

describe('names of other cars that extend this one', () => {
  const model = (input: string, id: string) => matchModel(input, v(id), ctx.index, MAKE_ALIASES).correct;
  it('rejects a different real car whose name adds a trim-like word', () => {
    expect(model('Range Rover', 'range-rover-classic')).toBe(true);
    expect(model('Range Rover Classic', 'range-rover-classic')).toBe(true);
    expect(model('Range Rover Sport', 'range-rover-classic')).toBe(false);
    expect(model('Carrera GT', 'porsche-911-993')).toBe(false);
    expect(model('3 Series', 'land-rover-series-3')).toBe(false);
    expect(model('Series I', 'land-rover-series-3')).toBe(false);
    expect(model('Grand Cherokee', 'jeep-cherokee-xj')).toBe(false);
    expect(model('Land Cruiser Prado', 'toyota-land-cruiser-j70')).toBe(false);
  });

  it('still accepts trims and other generations of the same model', () => {
    expect(model('Mustang GT', 'ford-mustang-s550')).toBe(true);
    expect(model('Camaro SS', 'chevrolet-camaro-6g')).toBe(true);
    expect(model('Cooper S', 'mini-classic')).toBe(true);
    expect(model('Golf 7', 'vw-golf-mk7')).toBe(true);
    expect(model('Cherokee Sport', 'jeep-cherokee-xj')).toBe(true);
    expect(model('Land Cruiser 79', 'toyota-land-cruiser-j70')).toBe(true);
  });
});
