export const populations = ['Adult', 'Pediatric', 'Neonatal'];

export const demos = [
  { name: 'Demo Alder', maximum: '2', minimum: '30', diluent: 'Demo fluid A' },
  { name: 'Demo Birch', maximum: '1', minimum: '40', diluent: 'Demo fluid B' },
  { name: 'Demo Cedar', maximum: '0.5', minimum: '60', diluent: 'Demo fluid A', access: 'Central' },
].map((demo, i) => {
  const population = populations[i];
  return {
    ...demo, population, id: population + '-fixture-v1',
    source: `Synthetic evaluation manual v1 · ${population} · ${demo.name}, preparation and administration`,
  };
});

export const references = [
  ['Adult', 'Vancomycin', '', 29, 'b12373a02b492fb9a64049f19718b545dc74c536dbe2368ace9626c4549ab9b1'],
  ['Pediatric', 'Vancomycin', '', 22, '054fdba3b0b69a08f1a58df0ccbd2032f1b3a5d12cfdfe0b27cd9b3c40ea6fce'],
  ['Neonatal', 'Acyclovir', '', 1, '2d956bbe3cb2791a4b4df57c7ba5f282d9a103a7f976fd2b41d97420ebc6b053'],
  ['Neonatal', 'Acetazolamide', 'Diamox', 1, '2d956bbe3cb2791a4b4df57c7ba5f282d9a103a7f976fd2b41d97420ebc6b053'],
].map(([population, name, alias, page, hash]) => ({ population, name, alias, page, hash, id: population + name }));

export const fields = demo => [
  ['Reconstitution', 'Not stated in source'],
  ['Compatible diluent', demo.diluent],
  ['Concentration', `Maximum ${demo.maximum} mg/mL`],
  ['Infusion', `Minimum ${demo.minimum} min`],
  ['Stability', 'Not stated in source'],
  ['BUD', 'Not stated in source'],
  ['Precautions', demo.access ? demo.access + ' access required' : 'Not stated in source'],
];

const scale = 1000000000n;
const conversions = { mg: 1000n, mcg: 1n, g: 1000000n };
function parse(input) {
  const raw = input.trim();
  if (!/^[0-9]{1,9}(\.[0-9]{1,6})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole + fraction.padEnd(6,'0')) || null;
}

function decimal(top, bottom) {
  const whole = top / bottom;
  let remainder = top % bottom;
  let fraction = '';
  for (let i = 0; i < 30 && remainder; i++) {
    remainder *= 10n;
    fraction += remainder / bottom;
    remainder %= bottom;
  }
  return String(whole) + (fraction ? '.' + fraction : '') + (remainder ? '…' : '');
}

export const review = 'REVIEW REQUIRED';
const status = value => value === null ? review : value ? 'PASS' : 'FAIL';
export const overall = checks => checks.some(check => check.outcome === 'FAIL') ? 'FAIL'
  : !checks.length || checks.some(check => check.outcome === review) ? review : 'PASS';

export function evaluate(order, rule) {
  const amount = parse(order.dose);
  const dose = amount && Object.hasOwn(conversions, order.unit) ? amount * conversions[order.unit] : null;
  const volume = parse(order.volume);
  const delivery = parse(order.infusion);
  const validPreparation = dose !== null && volume !== null;
  const concentration = validPreparation ? decimal(dose, volume * 1000n) + ' mg/mL' : 'Unavailable';
  const detail = validPreparation ? `${decimal(dose, scale)} mg ÷ ${decimal(volume, scale / 1000n)} mL` : 'Enter a positive dose in a supported mass unit and a positive final volume.';
  if (!rule) return [{ name: 'Final concentration', outcome: review, actual: concentration, reference: 'No approved applicable rule set', detail }];
  const maximum = parse(rule.maximum);
  const minimum = parse(rule.minimum);
  const knownDuration = delivery !== null && (!order.byRate || volume !== null);
  const duration = knownDuration ? (order.byRate ? decimal(volume * 60n, delivery) : decimal(delivery, scale / 1000n)) + ' min' : 'Unavailable';
  const durationPass = knownDuration ? (order.byRate ? volume * 60n * (scale / 1000n) >= minimum * delivery : delivery >= minimum) : null;
  const diluent = order.diluent.trim();
  const normalized = diluent.toLowerCase();
  const checks = [
    { name: 'Final concentration', outcome: status(validPreparation ? dose * 1000n <= maximum * volume : null), actual: concentration, reference: `At most ${rule.maximum} mg/mL`, detail },
    { name: 'Infusion duration', outcome: status(durationPass), actual: duration, reference: `At least ${rule.minimum} min`, detail: order.byRate ? 'Final volume × 60 ÷ pump rate' : 'Entered minutes' },
    { name: 'Diluent', outcome: status(['demo fluid a','demo fluid b'].includes(normalized) ? normalized === rule.diluent.toLowerCase() : null), actual: diluent || 'Unavailable', reference: rule.diluent, detail: 'Compared with the active synthetic criterion.' },
  ];
  if (rule.access) checks.push({ name: 'Access', outcome: status(['Central','Peripheral'].includes(order.access) ? order.access === rule.access : null), actual: order.access || 'Unavailable', reference: rule.access, detail: 'Compared with the required access type.' });
  return checks;
}
