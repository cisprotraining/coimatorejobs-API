// utils/cityNormalization.js
// ---------------------------------------------------------------------------
// Unambiguous corrections for free-text job city values. Pure; used by
// seeds/jobCityNormalization.js.
//
// A value is corrected ONLY when it is
//   (a) a case / spacing / punctuation variant of exactly one master Location
//       ("coimbatore" -> "Coimbatore"), or
//   (b) a well-known alternative spelling of a master Location listed in
//       CITY_SPELLINGS ("trippur" -> "Tiruppur").
// Everything else — states, regions, districts, multi-place strings,
// neighbourhoods, real cities absent from the master list — returns null and
// is left exactly as the employer typed it.
// ---------------------------------------------------------------------------

const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Alternative spelling -> master Location name. Only single-city spellings.
export const CITY_SPELLINGS = {
  trippur: 'Tiruppur',
  tirupur: 'Tiruppur',
  thirupur: 'Tiruppur',
  trichy: 'Tiruchirappalli',
  tiruchy: 'Tiruchirappalli',
  tiruchirapalli: 'Tiruchirappalli',
  bangalore: 'Bengaluru',
  madras: 'Chennai',
  cochin: 'Kochi',
  trivandrum: 'Thiruvananthapuram',
  tuticorin: 'Thoothukudi',
  mysore: 'Mysuru',
  gurgaon: 'Gurugram',
  kovai: 'Coimbatore',
  covai: 'Coimbatore',
};

/**
 * @param {string} city         the stored value
 * @param {string[]} masterNames master Location names
 * @returns {string|null} the corrected master name, or null to leave as-is
 */
export const correctCityName = (city, masterNames = []) => {
  const raw = String(city ?? '');
  const k = key(raw);
  if (!k) return null;

  const byKey = masterNames.filter((name) => key(name) === k);
  if (byKey.length === 1) return byKey[0] === raw ? null : byKey[0];
  if (byKey.length > 1) return null;

  const spelled = CITY_SPELLINGS[k];
  if (spelled && masterNames.includes(spelled)) return spelled;
  return null;
};
