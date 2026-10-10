import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 4, color: { dark: '#000000', light: '#ffffff' } };

const NAVY = '#071A2B';
const EMERALD = '#0B3D35';
const GOLD = '#D6B36A';
const GOLD_RICH = '#B88A35';
const IVORY = '#FAF7F0';
const MUTED = '#6F6A61';

export interface PassDetails {
  celebrantName: string;
  eventName: string;
  guestName: string;
  dateText: string;
  timeText: string;
  venue: string;
  address: string;
  dressCode: string | null;
  partySize: number;
  companions: string[];
  code: string;
  qrValue: string;
  revoked: boolean;
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * QR codes are plain black on white with a four-module quiet zone and medium error
 * correction: styling them would cost scanning reliability in dim venues.
 */
@Injectable()
export class QrService {
  svg(value: string): Promise<string> {
    return QRCode.toString(value, { ...QR_OPTIONS, type: 'svg' });
  }

  png(value: string, width = 1024): Promise<Buffer> {
    return QRCode.toBuffer(value, { ...QR_OPTIONS, type: 'png', width });
  }

  /** A5 portrait digital pass, printable on one page. */
  async invitationPdf(pass: PassDetails): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: `Invitation ${pass.code}`, Author: pass.eventName } });
    const { width, height } = doc.page;

    doc.rect(0, 0, width, height).fill(IVORY);
    doc.rect(0, 0, width, 190).fill(NAVY);
    doc.rect(0, 150, width, 40).fill(EMERALD);
    doc.rect(0, 190, width, 3).fill(GOLD);

    doc.fillColor(GOLD).font('Times-Roman').fontSize(64).text('70', 0, 34, { width, align: 'center' });
    doc.fillColor('#F1E3C0').font('Helvetica').fontSize(8).text('A CELEBRATION OF LIFE, LOVE & LEGACY', 0, 112, { width, align: 'center', characterSpacing: 2.5 });
    doc.fillColor(IVORY).font('Times-Italic').fontSize(15).text(pass.celebrantName, 24, 160, { width: width - 48, align: 'center' });

    let y = 214;
    doc.fillColor(GOLD_RICH).font('Helvetica').fontSize(8).text('ADMIT', 0, y, { width, align: 'center', characterSpacing: 3 });
    y += 14;
    doc.fillColor(NAVY).font('Times-Roman').fontSize(22).text(pass.guestName, 24, y, { width: width - 48, align: 'center' });
    y = doc.y + 2;
    const party = pass.partySize === 1 ? 'Admits 1 guest' : `Admits ${pass.partySize} guests`;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(party, 0, y, { width, align: 'center' });
    if (pass.companions.length) {
      doc.text(`With ${pass.companions.join(', ')}`, 30, doc.y + 2, { width: width - 60, align: 'center' });
    }

    const qrSize = 150;
    const qrY = doc.y + 14;
    const qr = await this.png(pass.qrValue, 600);
    doc.image(qr, (width - qrSize) / 2, qrY, { width: qrSize, height: qrSize });
    doc.fillColor(NAVY).font('Courier-Bold').fontSize(11).text(pass.code, 0, qrY + qrSize + 6, { width, align: 'center' });

    y = qrY + qrSize + 30;
    const rows: [string, string | null][] = [
      ['DATE', pass.dateText],
      ['TIME', pass.timeText],
      ['VENUE', `${pass.venue}, ${pass.address}`],
      ['DRESS CODE', pass.dressCode],
    ];
    for (const [label, value] of rows) {
      if (!value) continue;
      doc.fillColor(GOLD_RICH).font('Helvetica').fontSize(7).text(label, 40, y, { width: 80, characterSpacing: 1.5 });
      doc.fillColor(NAVY).font('Times-Roman').fontSize(10).text(value, 120, y - 1, { width: width - 160 });
      y = Math.max(doc.y, y + 12) + 5;
    }

    if (pass.revoked) {
      doc.save().rotate(-30, { origin: [width / 2, height / 2] });
      doc.fillColor('#B94A48').opacity(0.35).font('Helvetica-Bold').fontSize(56).text('REVOKED', 0, height / 2 - 30, { width, align: 'center' });
      doc.restore();
    }

    doc.opacity(1).fillColor(MUTED).font('Helvetica').fontSize(7).text('Please present this QR code on arrival. It is personal to you.', 0, height - 26, { width, align: 'center' });
    return toBuffer(doc);
  }

  /** A4 poster for the guest photo upload QR code. */
  async uploadPosterPdf(options: { celebrantName: string; eventName: string; url: string }): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Share your photos', Author: options.eventName } });
    const { width, height } = doc.page;
    doc.rect(0, 0, width, height).fill(NAVY);
    doc.rect(28, 28, width - 56, height - 56).lineWidth(1).strokeColor(GOLD).stroke();

    doc.fillColor(GOLD).font('Times-Roman').fontSize(96).text('70', 0, 80, { width, align: 'center' });
    doc.fillColor(IVORY).font('Times-Italic').fontSize(20).text(options.celebrantName, 50, 200, { width: width - 100, align: 'center' });
    doc.fillColor(IVORY).font('Times-Roman').fontSize(34).text('Capture the Celebration', 50, 250, { width: width - 100, align: 'center' });
    doc.fillColor('#F1E3C0').font('Helvetica').fontSize(13).text('Scan to share your favourite moments from tonight.', 50, 300, { width: width - 100, align: 'center' });

    const qrSize = 260;
    const qrX = (width - qrSize) / 2;
    const qrY = 350;
    doc.roundedRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 14).fill('#ffffff');
    doc.image(await this.png(options.url, 1200), qrX, qrY, { width: qrSize, height: qrSize });

    doc.fillColor('#F1E3C0').font('Helvetica').fontSize(9).text(options.url, 60, qrY + qrSize + 36, { width: width - 120, align: 'center' });
    doc.fillColor(GOLD).font('Helvetica').fontSize(10).text('1. Open your camera   2. Point it at the code   3. Add your photos', 0, height - 120, { width, align: 'center' });
    doc.fillColor('#F1E3C0').fontSize(8).text(options.eventName, 0, height - 70, { width, align: 'center', characterSpacing: 2 });
    return toBuffer(doc);
  }
}
