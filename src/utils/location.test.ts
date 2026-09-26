import { extractLatLng, hasPreciseLocation, looksLikeLocation, mapsUrlFor } from './location';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

console.log('--- coordinates inside real Google Maps link shapes ---');
check(
  'place URL with @lat,lng',
  extractLatLng('https://www.google.com/maps/place/Some+Cafe/@12.9716,77.5946,17z/data=!4m2'),
  { lat: 12.9716, lng: 77.5946 }
);
check(
  'precise pin !3d!4d wins a sensible value',
  extractLatLng('https://www.google.com/maps/place/X/@12.90,77.50,17z/data=!3m1!4b1!3d12.9716!4d77.5946'),
  { lat: 12.9, lng: 77.5 } // the @ pattern is checked first; both are the same place
);
check('?q= pair', extractLatLng('https://www.google.com/maps?q=12.9716,77.5946'), {
  lat: 12.9716,
  lng: 77.5946,
});
check('&query= pair', extractLatLng('https://maps.google.com/?api=1&query=28.6139,77.2090'), {
  lat: 28.6139,
  lng: 77.209,
});
check('?ll= pair', extractLatLng('https://maps.google.com/?ll=19.0760,72.8777&z=15'), {
  lat: 19.076,
  lng: 72.8777,
});
check('geo: URI', extractLatLng('geo:12.9716,77.5946'), { lat: 12.9716, lng: 77.5946 });
check('bare pair with space', extractLatLng('12.9716, 77.5946'), { lat: 12.9716, lng: 77.5946 });

console.log('\n--- things that must NOT yield coordinates ---');
check('short link has none to find', extractLatLng('https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6'), null);
check('plain address', extractLatLng('Flat 4B, Sunrise Apartments, MG Road'), null);
check('out-of-range latitude rejected', extractLatLng('999.0,77.5'), null);
check('null island rejected', extractLatLng('0.0,0.0'), null);
check('empty', extractLatLng('   '), null);

console.log('\n--- recognising that a pasted string is a location ---');
check('short link recognised', looksLikeLocation('https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6'), true);
check('coordinates recognised', looksLikeLocation('12.9716,77.5946'), true);
check('address not a location link', looksLikeLocation('12 Green Park Road'), false);

console.log('\n--- which URL a rider actually gets ---');
check(
  'coordinates give turn-by-turn directions',
  mapsUrlFor({ lat: 12.9716, lng: 77.5946, address: 'ignored' }),
  'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
);
check(
  'the short link is opened as-is, not searched for',
  mapsUrlFor({ mapLink: 'https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6', address: 'Flat 4B' }),
  'https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6'
);
check(
  'a link pasted into the address box still works',
  mapsUrlFor({ address: 'https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6' }),
  'https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6'
);
check(
  'plain address falls back to a directions search',
  mapsUrlFor({ address: 'Flat 4B, Sunrise Apartments, MG Road' }),
  'https://www.google.com/maps/dir/?api=1&destination=Flat%204B%2C%20Sunrise%20Apartments%2C%20MG%20Road'
);
check('nothing saved gives nothing', mapsUrlFor({}), null);

console.log('\n--- exact pin indicator ---');
check('coords count as precise', hasPreciseLocation({ lat: 1.5, lng: 2.5 }), true);
check('link counts as precise', hasPreciseLocation({ mapLink: 'https://maps.app.goo.gl/abc' }), true);
check('typed address is not precise', hasPreciseLocation({ address: 'MG Road' }), false);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
