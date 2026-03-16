import PDFDocument from 'pdfkit';

function money(value) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return '—';
  if (startDate && endDate) return `${formatDate(startDate)} — ${formatDate(endDate)}`;
  return formatDate(startDate || endDate);
}

function sanitizeFilename(value) {
  const cleaned = String(value || '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'estimate';
}

function drawTableHeader(doc, columns) {
  doc.font('Helvetica-Bold').fontSize(9);
  const y = doc.y;
  columns.forEach((column) => {
    doc.text(column.label, column.x + 2, y, {
      width: column.width - 4,
      align: column.align || 'left'
    });
  });
  doc.y = y + 20;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#8a8a8a').stroke();
  doc.moveDown(0.25);
}

function ensurePageSpace(doc, requiredHeight, drawHeader) {
  const bottomBoundary = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight <= bottomBoundary) return;
  doc.addPage();
  drawHeader();
}

function drawTableRow(doc, columns, values) {
  const paddingTop = 2;
  const paddingBottom = 4;
  const heights = columns.map((column) => (
    doc.heightOfString(String(values[column.key] ?? ''), {
      width: column.width - 4,
      align: column.align || 'left'
    })
  ));
  const rowHeight = Math.max(...heights, 12) + paddingTop + paddingBottom;
  const rowY = doc.y;

  columns.forEach((column) => {
    doc.text(String(values[column.key] ?? ''), column.x + 2, rowY + paddingTop, {
      width: column.width - 4,
      align: column.align || 'left'
    });
  });

  doc.y = rowY + rowHeight;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#efefef').stroke();
  doc.moveDown(0.1);
}

export function renderEstimatePdf(res, { project, estimate, items, download = false }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const estimateIdentity = estimate.estimate_number || estimate.id;
  const filename = sanitizeFilename(`estimate-${estimateIdentity}`) + '.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);

  doc.font('Helvetica-BoldOblique').fontSize(20).text('APITCHENKOV');
  doc.font('Helvetica').fontSize(11).text('+7 902 157 95 27');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(13).text(`Проект: ${project.name}`);
  if (project.operator) doc.font('Helvetica').fontSize(11).text(`Оператор: ${project.operator}`);
  if (project.client) doc.text(`Клиент: ${project.client}`);
  doc.text(`Смета: ${estimate.estimate_number || estimate.id}`);
  if (estimate.title) doc.text(`Название: ${estimate.title}`);
  doc.text(`Период: ${formatDateRange(estimate.start_date, estimate.end_date)}`);
  doc.moveDown();

  const columns = [
    { key: 'item_name', label: 'Наименование', x: 40, width: 205, align: 'left' },
    { key: 'quantity', label: 'Кол-во', x: 245, width: 45, align: 'right' },
    { key: 'price_per_unit', label: 'Тариф/ед.', x: 290, width: 80, align: 'right' },
    { key: 'kit_total', label: 'Итого/компл.', x: 370, width: 85, align: 'right' },
    { key: 'days', label: 'Смен', x: 455, width: 45, align: 'right' },
    { key: 'line_total', label: 'Итого, руб.', x: 500, width: 55, align: 'right' }
  ];

  const drawContinuationHeader = () => {
    doc.font('Helvetica-Bold').fontSize(10).text(`Смета ${estimate.estimate_number || estimate.id} — продолжение`, 40, doc.y);
    doc.moveDown(0.5);
    drawTableHeader(doc, columns);
    doc.font('Helvetica').fontSize(9);
  };

  drawTableHeader(doc, columns);
  doc.font('Helvetica').fontSize(9);

  let currentCategory = null;
  if (!Array.isArray(items) || items.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#555').text('В смете пока нет позиций.');
    doc.moveDown(0.6);
    doc.fillColor('black');
  } else {
    for (const item of items) {
      if (item.category !== currentCategory) {
        currentCategory = item.category || 'Без категории';
        ensurePageSpace(doc, 26, drawContinuationHeader);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#2b2b2b').text(currentCategory, 40, doc.y + 2);
        doc.moveDown(0.25);
        doc.fillColor('black').font('Helvetica').fontSize(9);
      }

      const rowValues = {
        item_name: item.item_name || '—',
        quantity: String(Number(item.quantity || 0)),
        price_per_unit: money(item.price_per_unit),
        kit_total: money(item.kit_total),
        days: String(Number(item.days || 0)),
        line_total: money(item.line_total)
      };

      const estimatedHeight = Math.max(
        ...columns.map((column) => (
          doc.heightOfString(String(rowValues[column.key] ?? ''), {
            width: column.width - 4,
            align: column.align || 'left'
          })
        ))
      ) + 8;

      ensurePageSpace(doc, estimatedHeight + 6, drawContinuationHeader);
      drawTableRow(doc, columns, rowValues);
    }
  }

  doc.moveDown(0.8);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#777').stroke();
  doc.moveDown(0.5);

  const drawTotalsContinuation = () => {
    doc.font('Helvetica-Bold').fontSize(10).text(`Смета ${estimate.estimate_number || estimate.id} — итоги`, 40, doc.y);
    doc.moveDown(0.5);
  };

  const totals = [
    ['Итого сумма техники (без налога)', money(estimate.subtotal)],
    [`Скидка (${estimate.discount_percent || 0}%)`, money(estimate.discount_amount)],
    ['Итого после скидки', money(estimate.total_after_discount)]
  ];

  if (estimate.tax_enabled) {
    totals.push([`Налог (${estimate.tax_percent || 0}%)`, money(estimate.tax_amount)]);
  }

  totals.forEach(([label, value]) => {
    ensurePageSpace(doc, 28, drawTotalsContinuation);
    doc.font('Helvetica').fontSize(11).text(label, 310, doc.y, { width: 200 });
    doc.text(value, 500, doc.y, { width: 80, align: 'right' });
    doc.moveDown(0.2);
  });

  ensurePageSpace(doc, 60, drawTotalsContinuation);
  doc.moveDown(0.1);
  doc.moveTo(310, doc.y).lineTo(555, doc.y).strokeColor('#333').stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(13).text('ИТОГО К ОПЛАТЕ', 310, doc.y, { width: 170 });
  doc.text(`${money(estimate.grand_total)} ₽`, 470, doc.y, { width: 85, align: 'right' });

  ensurePageSpace(doc, 70, drawTotalsContinuation);
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(
    'Стандартная смена: 10 часов (включая 1 час обеда). Овертайм: 11–18 ч = 3500 ₽/ч; 18–24 ч = x2; 24+ = x4. Погрузка/разгрузка: 14000 ₽.',
    40,
    doc.y,
    { width: 515 }
  );

  doc.end();
}
