import { parseScan } from './checkin.service';

const TOKEN = 'dmY-NudnJ2SYmhlJE0bcbOY9Z0IuzaosomywwI3KsFY';

describe('parseScan', () => {
  it('reads an invitation link from a QR code', () => {
    expect(parseScan(`https://celebration.example.com/invitation/${TOKEN}`)).toEqual({ token: TOKEN });
    expect(parseScan(`http://localhost:5173/invitation/${TOKEN}?utm=x`)).toEqual({ token: TOKEN });
  });
  it('reads a bare token or a typed invitation code', () => {
    expect(parseScan(TOKEN)).toEqual({ token: TOKEN });
    expect(parseScan(' bp70-rspbgw ')).toEqual({ code: 'BP70-RSPBGW' });
  });
  it('rejects anything else', () => {
    expect(parseScan('')).toBeNull();
    expect(parseScan('hello world')).toBeNull();
    expect(parseScan('BP70-ABC')).toBeNull();
    expect(parseScan("'; DROP TABLE invitations; --")).toBeNull();
    expect(parseScan('x'.repeat(600))).toBeNull();
  });
});
