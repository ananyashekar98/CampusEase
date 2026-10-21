const PDFDocument = require('pdfkit');

const TIME_COL_WIDTH = 70;
const MARGIN = 40;
const MIN_ROW_HEIGHT = 58;
const CELL_PADDING = 4;
const NAVY = '#251973';

// Streams a landscape PDF of a weekly timetable to the response.
// Each cell shows: subject, "Sem X · Sec Y" (so a faculty member teaching
// several sections can see which class each slot belongs to), room, faculty.
function renderTimetablePdf(res, { title, subtitle, entries, days }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="timetable.pdf"');
  doc.pipe(res);

  // Hide days that have no classes at all (e.g. Saturday).
  const activeDays = days.filter((d) => entries.some((e) => e.day === d));
  const shownDays = activeDays.length ? activeDays : days.slice(0, 5);

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1B1F2E').text(title, MARGIN, MARGIN);
  if (subtitle) {
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text(subtitle, MARGIN, MARGIN + 24);
  }

  // Unique slots keyed by start time, with their end time for the label.
  const slotMap = new Map();
  entries.forEach((e) => { if (!slotMap.has(e.startTime)) slotMap.set(e.startTime, e.endTime); });
  const uniqueTimes = [...slotMap.keys()].sort();
  const startY = MARGIN + 60;

  const usableWidth = doc.page.width - MARGIN * 2 - TIME_COL_WIDTH;
  const dayColWidth = Math.floor(usableWidth / shownDays.length);
  const textWidth = dayColWidth - CELL_PADDING * 2;

  function measure(text, fontName, size) {
    doc.font(fontName).fontSize(size);
    return doc.heightOfString(text, { width: textWidth });
  }

  const cellLines = (e) => {
    const lines = [{ t: e.subject || '', f: 'Helvetica-Bold', s: 8, c: '#1B1F2E' }];
    if (e.semester || e.section) {
      lines.push({ t: `Sem ${e.semester || '-'} · Sec ${e.section || '-'}`, f: 'Helvetica-Bold', s: 7, c: NAVY });
    }
    if (e.classroom?.name) lines.push({ t: `Room: ${e.classroom.name}`, f: 'Helvetica', s: 7, c: '#6B7280' });
    if (e.faculty?.name) lines.push({ t: e.faculty.name, f: 'Helvetica', s: 7, c: '#6B7280' });
    return lines;
  };

  const cellEntries = (day, time) => entries.filter((e) => e.day === day && e.startTime === time);

  const rowHeights = uniqueTimes.map((time) => {
    let tallest = MIN_ROW_HEIGHT;
    shownDays.forEach((day) => {
      let h = CELL_PADDING;
      cellEntries(day, time).forEach((e) => {
        cellLines(e).forEach((l) => { h += measure(l.t, l.f, l.s) + 2; });
        h += 4;
      });
      h += CELL_PADDING;
      if (h > tallest) tallest = h;
    });
    return tallest;
  });

  // Header row (navy)
  doc.rect(MARGIN, startY, TIME_COL_WIDTH, 24).fill(NAVY);
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
    .text('Time', MARGIN, startY + 7, { width: TIME_COL_WIDTH, align: 'center' });
  let x = MARGIN + TIME_COL_WIDTH;
  shownDays.forEach((day) => {
    doc.rect(x, startY, dayColWidth, 24).fill(NAVY);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
      .text(day, x, startY + 7, { width: dayColWidth, align: 'center' });
    x += dayColWidth;
  });

  let y = startY + 24;
  uniqueTimes.forEach((time, rowIdx) => {
    let rowHeight = rowHeights[rowIdx];
    if (y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    doc.rect(MARGIN, y, TIME_COL_WIDTH, rowHeight).stroke('#E4E8F1');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6B7280')
      .text(`${time}\n–\n${slotMap.get(time) || ''}`, MARGIN, y + rowHeight / 2 - 16, { width: TIME_COL_WIDTH, align: 'center' });

    let cx = MARGIN + TIME_COL_WIDTH;
    shownDays.forEach((day) => {
      doc.rect(cx, y, dayColWidth, rowHeight).stroke('#E4E8F1');
      let textY = y + CELL_PADDING;
      cellEntries(day, time).forEach((e) => {
        cellLines(e).forEach((l) => {
          doc.fontSize(l.s).font(l.f).fillColor(l.c)
            .text(l.t, cx + CELL_PADDING, textY, { width: textWidth });
          textY += measure(l.t, l.f, l.s) + 2;
        });
        textY += 4;
      });
      cx += dayColWidth;
    });
    y += rowHeight;
  });

  if (uniqueTimes.length === 0) {
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text('No classes scheduled.', MARGIN, startY + 40);
  }

  doc.end();
}

module.exports = { renderTimetablePdf };