import PDFDocument from 'pdfkit';

function money(value) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function renderEstimatePdf(res, { project, estimate, items }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=estimate-${estimate.id}.pdf`);
  doc.pipe(res);

  doc.font('Helvetica-BoldOblique').fontSize(20).text('APITCHENKOV');
  doc.font('Helvetica').fontSize(11).text('+7 902 157 95 27');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(13).text(`Проект: ${project.name}`);
  if (project.operator) doc.font('Helvetica').fontSize(11).text(`Оператор: ${project.operator}`);
  if (project.client) doc.text(`Клиент: ${project.client}`);
  doc.text(`Смета: ${estimate.estimate_number}`);
  doc.moveDown();

  const headers = ['Наименование', 'Кол-во', 'Тарифная оплата/ед.', 'Итого по комплекту', 'Кол-во смен', 'Итого, руб.'];
  const x = [40, 250, 300, 385, 470, 530];
  doc.font('Helvetica-Bold').fontSize(10);
  headers.forEach((h, i) => doc.text(h, x[i], doc.y, { width: i === 0 ? 200 : 55 }));
  doc.moveDown(0.7);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#888').stroke();
  doc.moveDown(0.4);

  let currentCategory = null;
  for (const item of items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      doc.font('Helvetica-Bold').fontSize(10).text(currentCategory, 40, doc.y + 3);
      doc.moveDown(0.3);
    }

    doc.font('Helvetica').fontSize(10);
    doc.text(item.item_name, x[0], doc.y, { width: 200 });
    doc.text(String(item.quantity), x[1], doc.y, { width: 45 });
    doc.text(money(item.price_per_unit), x[2], doc.y, { width: 80 });
    doc.text(money(item.kit_total), x[3], doc.y, { width: 80 });
    doc.text(String(item.days), x[4], doc.y, { width: 55 });
    doc.text(money(item.line_total), x[5], doc.y, { width: 70 });
    doc.moveDown(0.4);
  }

  doc.moveDown(0.8);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#777').stroke();
  doc.moveDown(0.5);

  const totals = [
    ['Итого сумма техники (без налога)', money(estimate.subtotal)],
    [`Скидка (${estimate.discount_percent || 0}%)`, money(estimate.discount_amount)],
    ['Итого после скидки', money(estimate.total_after_discount)]
  ];

  if (estimate.tax_enabled) {
    totals.push([`Налог (${estimate.tax_percent || 0}%)`, money(estimate.tax_amount)]);
  }

  totals.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(11).text(label, 310, doc.y, { width: 200 });
    doc.text(value, 500, doc.y, { width: 80, align: 'right' });
    doc.moveDown(0.2);
  });

  doc.moveDown(0.1);
  doc.moveTo(310, doc.y).lineTo(555, doc.y).strokeColor('#333').stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(13).text('ИТОГО К ОПЛАТЕ', 310, doc.y, { width: 170 });
  doc.text(`${money(estimate.grand_total)} ₽`, 470, doc.y, { width: 85, align: 'right' });

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(
    'Стандартная смена: 10 часов (включая 1 час обеда). Овертайм: 11–18 ч = 3500 ₽/ч; 18–24 ч = x2; 24+ = x4. Погрузка/разгрузка: 14000 ₽.',
    40,
    doc.y,
    { width: 515 }
  );

  doc.end();
}
