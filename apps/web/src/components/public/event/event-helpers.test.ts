import { describe, expect, it } from 'vitest';
import { directionsHref } from './event-helpers';

const venue = {
  venueName: 'The Emerald Ballroom',
  address: '12 Palm Grove Avenue, Victoria Island',
  latitude: 6.4281,
  longitude: 3.4219,
  mapUrl: 'https://www.openstreetmap.org/?mlat=6.4281&mlon=3.4219#map=16/6.4281/3.4219',
};

describe('directionsHref', () => {
  it('gives Google Maps directions to the coordinates, in a new tab, off iPhone', () => {
    expect(directionsHref(venue, false)).toEqual({
      href: 'https://www.google.com/maps/dir/?api=1&destination=6.4281%2C3.4219',
      newTab: true,
    });
  });

  it('gives Apple Maps driving directions in the same tab on iPhone', () => {
    expect(directionsHref(venue, true)).toEqual({ href: 'https://maps.apple.com/?daddr=6.4281%2C3.4219&dirflg=d', newTab: false });
  });

  it('uses the venue name and address when there are no coordinates, not the view-only map link', () => {
    const { href } = directionsHref({ ...venue, latitude: null, longitude: null }, false);
    expect(href).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('The Emerald Ballroom, 12 Palm Grove Avenue, Victoria Island')}`);
  });

  it('falls back to the saved map link only when there is nothing else', () => {
    expect(directionsHref({ venueName: '', address: '', latitude: null, longitude: null, mapUrl: 'https://maps.example/x' }, false)).toEqual({
      href: 'https://maps.example/x',
      newTab: true,
    });
  });
});
