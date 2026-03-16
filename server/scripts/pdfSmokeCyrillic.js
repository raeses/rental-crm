import fs from 'fs';
import { Writable } from 'stream';
import { renderEstimatePdf } from '../pdf/estimatePdf.js';

const outputPath = process.argv[2] || '/tmp/estimate-cyrillic-smoke.pdf';
const output = fs.createWriteStream(outputPath);
const headers = {};

const res = new Writable({
  write(chunk, encoding, callback) {
    output.write(chunk, encoding, callback);
  },
  final(callback) {
    output.end();
    callback();
  }
});

res.setHeader = (name, value) => {
  headers[name] = value;
};

res.on('finish', () => {
  console.log(`PDF created: ${outputPath}`);
  console.log(`Content-Type: ${headers['Content-Type']}`);
  console.log(`Content-Disposition: ${headers['Content-Disposition']}`);
  console.log('Cyrillic smoke data used: ФИО, адрес, категории, названия позиций.');
});

renderEstimatePdf(res, {
  download: true,
  project: {
    name: 'Проект «Съёмка на Чистых прудах»',
    operator: 'Иванов Иван Иванович',
    client: 'ООО «КиноПроект», г. Москва, ул. Лесная, д. 7'
  },
  estimate: {
    id: 101,
    estimate_number: 'ТЕСТ/КИРИЛЛИЦА/01',
    title: 'Проверка русских символов в PDF',
    start_date: '2026-03-16',
    end_date: '2026-03-18',
    subtotal: 56600,
    discount_percent: 5,
    discount_amount: 2830,
    total_after_discount: 53770,
    tax_enabled: 1,
    tax_percent: 9,
    tax_amount: 4839.3,
    grand_total: 58609.3
  },
  items: [
    {
      category: 'Камеры',
      item_name: 'Sony FX6, комплект «Документальное кино»',
      quantity: 1,
      price_per_unit: 7200,
      kit_total: 7200,
      days: 3,
      line_total: 21600
    },
    {
      category: 'Оптика и фильтры',
      item_name: 'Набор объективов Sigma Art + фильтры ND',
      quantity: 1,
      price_per_unit: 6500,
      kit_total: 6500,
      days: 3,
      line_total: 19500
    },
    {
      category: 'Персонал',
      item_name: 'Фокус-пуллер / ассистент оператора',
      quantity: 1,
      price_per_unit: 3500,
      kit_total: 3500,
      days: 3,
      line_total: 10500
    },
    {
      category: 'Логистика',
      item_name: 'Доставка и возврат техники по адресу клиента',
      quantity: 1,
      price_per_unit: 5000,
      kit_total: 5000,
      days: 1,
      line_total: 5000
    }
  ]
});
