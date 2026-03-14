const API = '/api';

const state = {
  items: [],
  rentals: [],
  clients: [],
  transactions: [],
  financeSummary: null,
  payback: [],
  estimatesByRental: {},
  activeRentalId: null,
  activeEstimateId: null,
  rentalItems: [],
  subrentals: []
};

const ITEM_STATUS_LABELS = {
  available: 'Доступна',
  unavailable: 'Недоступна',
  maintenance: 'На обслуживании'
};

const ITEM_OWNER_TYPE_LABELS = {
  own: 'Собственная',
  partner: 'Партнерская'
};

let loadAllDataPromise = null;

const LEGACY_API_LABELS = {
  '/items': 'Техника',
  '/clients': 'Клиенты',
  '/transactions': 'Финансы',
  '/finance/summary': 'Финансовая сводка',
  '/finance/item-payback': 'Аналитика окупаемости',
  '/rental-items': 'Техника в проекте',
  '/subrentals': 'Субаренда',
  '/rentals': 'Проекты (legacy)'
};

function normalizeProjectForLegacyUi(project = {}) {
  return {
    ...project,
    title: project.title || project.name || '',
    client_name: project.client || '',
    total: Number(project.total || 0),
    paid_amount: Number(project.paid_amount || 0),
    payment_status: project.payment_status || project.status || 'draft'
  };
}

function mapLegacyProjectStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'new') return 'draft';
  if (normalized === 'cancelled') return 'closed';
  return normalized || 'draft';
}

function formatMoney(value) {
  const num = Number(value || 0);
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num)} ₽`;
}

function formatPercent(value) {
  const num = Number(value || 0);
  return `${num.toFixed(1)}%`;
}

function getItemStatusLabel(status) {
  return ITEM_STATUS_LABELS[String(status || '').toLowerCase()] || status || '-';
}

function getItemOwnerTypeLabel(ownerType) {
  return ITEM_OWNER_TYPE_LABELS[String(ownerType || '').toLowerCase()] || ownerType || '-';
}

function normalizePaybackItem(item = {}) {
  const purchasePrice = Number(item.purchase_price || 0);
  const revenueTotal = Number(item.revenue_total ?? item.revenue ?? 0);
  const expensesTotal = Number(item.direct_expenses_total ?? item.expenses ?? 0);
  const profitTotal = Number(item.profit_total ?? item.profit ?? 0);
  const paybackPercent = Number(
    item.payback_percent ?? (purchasePrice > 0 ? (profitTotal / purchasePrice) * 100 : 0)
  );

  return {
    ...item,
    purchase_price: purchasePrice,
    revenue_total: revenueTotal,
    direct_expenses_total: expensesTotal,
    profit_total: profitTotal,
    payback_percent: paybackPercent
  };
}

function getStatusPill(status) {
  const normalized = String(status || '').toLowerCase();
  let cls = 'yellow';

  if (['available', 'paid', 'active', 'confirmed', 'income'].includes(normalized)) cls = 'green';
  if (['unavailable', 'cancelled', 'unpaid', 'lost', 'expense'].includes(normalized)) cls = 'red';

  return `<span class="pill ${cls}">${status || '-'}</span>`;
}

function getStatusPillWithLabel(status, label) {
  const normalized = String(status || '').toLowerCase();
  let cls = 'yellow';

  if (['available', 'paid', 'active', 'confirmed', 'income'].includes(normalized)) cls = 'green';
  if (['unavailable', 'cancelled', 'unpaid', 'lost', 'expense'].includes(normalized)) cls = 'red';

  return `<span class="pill ${cls}">${label || status || '-'}</span>`;
}

function getFeatureLabel(path) {
  return LEGACY_API_LABELS[path] || path;
}

async function readApiPayload(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json().catch(() => null);
  }

  const text = await res.text().catch(() => '');
  return text ? { rawText: text } : null;
}

function buildApiError(path, res, payload, fallbackMessage) {
  const backendMessage =
    payload && typeof payload === 'object' && 'error' in payload
      ? payload.error
      : null;

  if (backendMessage) {
    return new Error(backendMessage);
  }

  if (res.status === 404) {
    return new Error(`Раздел "${getFeatureLabel(path)}" пока не подключен к текущему backend.`);
  }

  if (res.status >= 500) {
    return new Error(`Сервер временно недоступен для "${getFeatureLabel(path)}".`);
  }

  return new Error(fallbackMessage);
}

async function apiGet(path) {
  const res = await fetch(API + path);
  const payload = await readApiPayload(res);
  if (!res.ok) throw buildApiError(path, res, payload, `Ошибка загрузки: ${path}`);
  return payload;
}

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await readApiPayload(res);
  if (!res.ok) {
    throw buildApiError(path, res, data, 'Ошибка сохранения');
  }

  return data;
}

async function apiPut(path, body) {
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await readApiPayload(res);
  if (!res.ok) {
    throw buildApiError(path, res, data, 'Ошибка обновления');
  }

  return data;
}


async function apiGetSafe(path, fallback = null) {
  try {
    return await apiGet(path);
  } catch (error) {
    console.warn(`Не удалось загрузить ${path}:`, error.message);
    return fallback;
  }
}

function notifyDataLoaded() {
  document.dispatchEvent(new CustomEvent('crm:data-loaded', { detail: { ...state } }));
}

function getTodayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastDate(value) {
  const date = toDateOnly(value);
  if (!date) return false;
  const today = toDateOnly(getTodayISODate());
  return date < today;
}

function ensureRentalEstimates(rentalId) {
  const id = Number(rentalId);
  if (!id) return [];

  if (!state.estimatesByRental[id]) {
    state.estimatesByRental[id] = [
      { id: `${id}-base`, name: 'Основная смета', created_at: new Date().toISOString() }
    ];
  }

  return state.estimatesByRental[id];
}

async function loadAllData(options = {}) {
  const { silent = false } = options;

  if (loadAllDataPromise) return loadAllDataPromise;

  loadAllDataPromise = (async () => {
    try {
      const [projects, items, clients, transactions, financeSummary, payback, rentalItems, subrentals] = await Promise.all([
        apiGet('/projects'),
        apiGetSafe('/items', []),
        apiGetSafe('/clients', []),
        apiGetSafe('/transactions', []),
        apiGetSafe('/finance/summary', {}),
        apiGetSafe('/finance/item-payback', []),
        apiGetSafe('/rental-items', []),
        apiGetSafe('/subrentals', [])
      ]);

      state.items = Array.isArray(items) ? items : [];
      state.rentals = (Array.isArray(projects) ? projects : []).map(normalizeProjectForLegacyUi);
      state.clients = Array.isArray(clients) ? clients : [];
      state.transactions = Array.isArray(transactions) ? transactions : [];
      state.financeSummary = financeSummary || {};
      state.payback = (Array.isArray(payback) ? payback : []).map(normalizePaybackItem);
      state.rentalItems = Array.isArray(rentalItems) ? rentalItems : [];
      state.subrentals = Array.isArray(subrentals) ? subrentals : [];

      renderAll();
      notifyDataLoaded();
    } catch (error) {
      if (!silent) alert(error.message);
      console.error(error);
    } finally {
      loadAllDataPromise = null;
    }
  })();

  return loadAllDataPromise;
}

function renderAll() {
  renderSummaryCards();
  renderDashboardPayback();
  renderDashboardNotes();
  renderItems();
  renderProjects();
  renderClients();
  renderTransactions();
  renderSubrentals();
  renderSubrentalsTotals();
  fillSelects();
}

function renderSummaryCards() {
  const wrap = document.getElementById('summaryCards');
  const data = state.financeSummary || {};

  const cards = [
    ['Доходы', formatMoney(data.total_income)],
    ['Расходы', formatMoney(data.total_expense)],
    ['Прибыль', formatMoney(data.profit)],
    ['Потенциал окупаемости', formatMoney(data.purchase_value_total)]
  ];

  wrap.innerHTML = cards
    .map(
      ([label, value]) => `
      <div class="card">
        <div class="card-label">${label}</div>
        <div class="card-value">${value}</div>
      </div>
    `
    )
    .join('');
}

function renderDashboardPayback() {
  const body = document.getElementById('dashboardPaybackBody');

  if (!state.payback.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет данных по окупаемости.</td></tr>';
    return;
  }

  body.innerHTML = state.payback
    .slice(0, 8)
    .map(
      item => `
      <tr>
        <td>${item.name || '-'}</td>
        <td>${formatMoney(item.purchase_price)}</td>
        <td>${formatMoney(item.revenue_total)}</td>
        <td>${formatMoney(item.direct_expenses_total)}</td>
        <td>${formatMoney(item.profit_total)}</td>
        <td>${formatPercent(item.payback_percent)}</td>
      </tr>
    `
    )
    .join('');
}

function renderDashboardNotes() {
  const box = document.getElementById('dashboardNotes');

  if (!state.payback.length) {
    box.textContent = 'Сначала добавь технику, проекты и операции. Потом здесь появятся подсказки по окупаемости.';
    return;
  }

  const best = [...state.payback].sort((a, b) => Number(b.payback_percent || 0) - Number(a.payback_percent || 0))[0];
  const worst = [...state.payback].sort((a, b) => Number(a.payback_percent || 0) - Number(b.payback_percent || 0))[0];

  box.innerHTML = `
    <p>Самая быстрая по окупаемости сейчас: <strong>${best.name || '-'}</strong> — ${formatPercent(best.payback_percent)}.</p>
    <p>Самая слабая по окупаемости сейчас: <strong>${worst.name || '-'}</strong> — ${formatPercent(worst.payback_percent)}.</p>
    <p>Главная цель этой системы — видеть не просто занятость техники, а реальные деньги: доход, расход, прибыль и сколько осталось до полного возврата вложений.</p>
  `;
}

function renderItems() {
  const body = document.getElementById('itemsBody');

  if (!state.items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Пока нет техники.</td></tr>';
    return;
  }

  body.innerHTML = state.items
    .map(
      item => `
      <tr>
        <td>${item.name || '-'}</td>
        <td>${item.category || '-'}</td>
        <td>${formatMoney(item.base_rate || item.price)}</td>
        <td>${getStatusPillWithLabel(item.status, getItemStatusLabel(item.status))}</td>
        <td>${formatMoney(item.revenue_total)}</td>
        <td>${formatPercent(item.payback_percent)}</td>
        <td><button class="secondary" onclick="openItemModal(${Number(item.id)})">Редактировать</button></td>
      </tr>
    `
    )
    .join('');
}

function resetItemForm() {
  document.getElementById('itemName').value = '';
  document.getElementById('itemCategory').value = 'Camera';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemBaseRate').value = '';
  document.getElementById('itemPurchasePrice').value = '';
  document.getElementById('itemPurchaseDate').value = '';
  document.getElementById('itemStatus').value = 'available';
  document.getElementById('itemOwnerType').value = 'own';
  document.getElementById('itemSerial').value = '';
}

function renderItemUsageHistory(history = []) {
  const body = document.getElementById('itemHistoryBody');
  const summary = document.getElementById('itemHistorySummary');
  const totalShifts = history.reduce((sum, entry) => sum + Number(entry.days || 0), 0);

  if (summary) {
    summary.textContent = `Всего отработано смен: ${totalShifts}`;
  }

  if (!body) return;

  if (!history.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Эта техника пока не использовалась в сметах.</td></tr>';
    return;
  }

  body.innerHTML = history
    .map(entry => {
      const periodStart = entry.estimate_start_date || entry.project_start_date;
      const periodEnd = entry.estimate_end_date || entry.project_end_date;
      const period = [periodStart, periodEnd].filter(Boolean).join(' - ') || '-';

      return `
        <tr>
          <td>${entry.project_name || '-'}</td>
          <td>${entry.estimate_number || '-'}${entry.estimate_title ? `<br><span class="muted">${entry.estimate_title}</span>` : ''}</td>
          <td>${period}</td>
          <td>${entry.quantity || 0}</td>
          <td>${formatMoney(entry.price_per_unit)}</td>
          <td>${entry.days || 0}</td>
          <td>${formatMoney(entry.line_total)}</td>
        </tr>
      `;
    })
    .join('');
}

function populateItemModal(item) {
  document.getElementById('itemModalId').value = item.id || '';
  document.getElementById('itemModalName').value = item.name || '';
  document.getElementById('itemModalCategory').value = item.category || 'Camera';
  document.getElementById('itemModalPrice').value = item.base_rate ?? item.price ?? '';
  document.getElementById('itemModalPurchasePrice').value = item.purchase_price ?? '';
  document.getElementById('itemModalPurchaseDate').value = item.purchase_date ? String(item.purchase_date).slice(0, 10) : '';
  document.getElementById('itemModalStatus').value = item.status || 'available';
  document.getElementById('itemModalOwnerType').value = item.owner_type || 'own';
  document.getElementById('itemModalSerial').value = item.serial_number || '';
  document.getElementById('itemModalTitle').textContent = item.name || 'Техника';
  document.getElementById('itemModalSubtitle').textContent = `ID: ${item.id}`;
  renderItemUsageHistory(item.usage_history || []);
}

async function openItemModal(itemId) {
  try {
    const item = await apiGet(`/items/${itemId}`);
    if (!item) return;
    populateItemModal(item);
    document.getElementById('itemModalOverlay').classList.add('open');
  } catch (error) {
    alert(error.message);
  }
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').classList.remove('open');
}

async function saveItemFromModal() {
  try {
    const itemId = document.getElementById('itemModalId').value;
    if (!itemId) return;
    const itemRate = Number(document.getElementById('itemModalPrice').value || 0);

    await apiPut(`/items/${itemId}`, {
      name: document.getElementById('itemModalName').value.trim(),
      category: document.getElementById('itemModalCategory').value.trim(),
      price: itemRate,
      base_rate: itemRate,
      purchase_price: Number(document.getElementById('itemModalPurchasePrice').value || 0),
      purchase_date: document.getElementById('itemModalPurchaseDate').value || null,
      status: document.getElementById('itemModalStatus').value,
      owner_type: document.getElementById('itemModalOwnerType').value,
      serial_number: document.getElementById('itemModalSerial').value.trim()
    });

    await loadAllData();
    await openItemModal(itemId);
    alert('Техника обновлена');
  } catch (error) {
    alert(error.message);
  }
}

function renderProjects() {
  const body = document.getElementById('projectsBody');

  if (!state.rentals.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет проектов.</td></tr>';
    return;
  }

  body.innerHTML = state.rentals
    .map(rental => {
      const client = state.clients.find(c => Number(c.id) === Number(rental.client_id));
      const clientName = rental.client_name || rental.client || (client ? client.name : '-');

      return `
        <tr class="project-row" onclick="openProjectModal(${Number(rental.id)})">
          <td>${rental.title || '-'}</td>
          <td>${clientName || '-'}</td>
          <td>${rental.start_date || '-'}<br><span class="muted">${rental.end_date || '-'}</span></td>
          <td>${formatMoney(rental.total)}</td>
          <td>${formatMoney(rental.paid_amount || 0)}</td>
          <td>${getStatusPill(rental.payment_status || rental.status)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderClients() {
  const body = document.getElementById('clientsBody');

  if (!state.clients.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty">Пока нет клиентов.</td></tr>';
    return;
  }

  body.innerHTML = state.clients
    .map(
      client => `
      <tr>
        <td>${client.name || '-'}</td>
        <td>${client.phone || '-'}</td>
        <td>${client.note || '-'}</td>
      </tr>
    `
    )
    .join('');
}

function renderTransactions() {
  const body = document.getElementById('transactionsBody');

  if (!state.transactions.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет операций.</td></tr>';
    return;
  }

  body.innerHTML = state.transactions
    .map(tx => {
      const rental = state.rentals.find(r => Number(r.id) === Number(tx.rental_id));
      const item = state.items.find(i => Number(i.id) === Number(tx.item_id));

      return `
        <tr>
          <td>${getStatusPill(tx.type)}</td>
          <td>${formatMoney(tx.amount)}</td>
          <td>${tx.category || '-'}</td>
          <td>${rental ? rental.title : '-'}</td>
          <td>${item ? item.name : '-'}</td>
          <td>${tx.note || '-'}</td>
        </tr>
      `;
    })
    .join('');
}


function getSubrentalDerivedValues(subrental) {
  const supplierPrice = Number(subrental.supplier_price_per_day || 0);
  const clientPrice = Number(subrental.client_price_per_day || 0);
  const quantity = Number(subrental.quantity || 0);
  const days = Number(subrental.days || 0);

  const supplierTotal = Number(subrental.supplier_total ?? supplierPrice * quantity * days);
  const clientTotal = Number(subrental.client_total ?? clientPrice * quantity * days);
  const margin = Number(subrental.margin ?? clientTotal - supplierTotal);

  return { supplierTotal, clientTotal, margin };
}

function renderSubrentals() {
  const body = document.getElementById('subrentalsBody');
  if (!body) return;

  if (!state.subrentals.length) {
    body.innerHTML = '<tr><td colspan="11" class="empty">Пока нет субаренд.</td></tr>';
    return;
  }

  body.innerHTML = state.subrentals
    .map(subrental => {
      const rental = state.rentals.find(r => Number(r.id) === Number(subrental.project_id));
      const { supplierTotal, clientTotal, margin } = getSubrentalDerivedValues(subrental);
      const rowClass = margin < 0 ? 'negative' : (margin > 0 ? 'positive' : 'neutral');

      return `
        <tr class="subrental-row ${rowClass}">
          <td>${rental ? rental.title : (subrental.project_id || '-')}</td>
          <td>${subrental.equipment_name || '-'}</td>
          <td>${subrental.supplier_name || '-'}</td>
          <td>${formatMoney(subrental.supplier_price_per_day)}</td>
          <td>${formatMoney(subrental.client_price_per_day)}</td>
          <td>${subrental.quantity || 0}</td>
          <td>${subrental.days || 0}</td>
          <td>${formatMoney(supplierTotal)}</td>
          <td>${formatMoney(clientTotal)}</td>
          <td>${formatMoney(margin)}</td>
          <td>
            <div class="actions-inline">
              <button onclick="editSubrental(${Number(subrental.id)})">Изменить</button>
              <button onclick="deleteSubrental(${Number(subrental.id)})">Удалить</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderSubrentalsTotals() {
  const wrap = document.getElementById('subrentalsTotals');
  if (!wrap) return;

  const totals = state.subrentals.reduce(
    (acc, subrental) => {
      const { supplierTotal, clientTotal, margin } = getSubrentalDerivedValues(subrental);
      acc.supplier += supplierTotal;
      acc.client += clientTotal;
      acc.margin += margin;
      return acc;
    },
    { supplier: 0, client: 0, margin: 0 }
  );

  wrap.innerHTML = [
    ['Себестоимость субаренды', formatMoney(totals.supplier)],
    ['Выставлено клиенту', formatMoney(totals.client)],
    ['Маржа субаренды', formatMoney(totals.margin)]
  ]
    .map(
      ([label, value]) => `
      <div class="card totals-grid-item">
        <div class="card-label">${label}</div>
        <div class="card-value">${value}</div>
      </div>
    `
    )
    .join('');
}

function validateSubrentalPayload(payload) {
  if (!payload.project_id) return 'Выбери проект.';
  if (!payload.equipment_name) return 'Укажи технику.';
  if (payload.quantity <= 0) return 'Количество должно быть больше 0.';
  if (payload.days <= 0) return 'Количество дней должно быть больше 0.';
  if (payload.supplier_price_per_day < 0 || payload.client_price_per_day < 0) {
    return 'Цены не могут быть отрицательными.';
  }
  return null;
}

async function createSubrental() {
  try {
    const payload = {
      project_id: Number(document.getElementById('subrentalProject').value),
      equipment_name: document.getElementById('subrentalEquipmentName').value.trim(),
      supplier_name: document.getElementById('subrentalSupplierName').value.trim(),
      supplier_contact: document.getElementById('subrentalSupplierContact').value.trim(),
      supplier_price_per_day: Number(document.getElementById('subrentalSupplierPrice').value || 0),
      client_price_per_day: Number(document.getElementById('subrentalClientPrice').value || 0),
      quantity: Number(document.getElementById('subrentalQty').value || 0),
      days: Number(document.getElementById('subrentalDays').value || 0),
      notes: document.getElementById('subrentalNotes').value.trim()
    };

    const validationError = validateSubrentalPayload(payload);
    if (validationError) {
      alert(validationError);
      return;
    }

    await apiPost('/subrentals', payload);

    document.getElementById('subrentalEquipmentName').value = '';
    document.getElementById('subrentalSupplierName').value = '';
    document.getElementById('subrentalSupplierContact').value = '';
    document.getElementById('subrentalSupplierPrice').value = '';
    document.getElementById('subrentalClientPrice').value = '';
    document.getElementById('subrentalQty').value = '1';
    document.getElementById('subrentalDays').value = '1';
    document.getElementById('subrentalNotes').value = '';

    await loadAllData();
    alert('Субаренда сохранена');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteSubrental(id) {
  try {
    if (!confirm('Удалить субаренду?')) return;

    const res = await fetch(`${API}/subrentals/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Ошибка удаления');
    }

    await loadAllData();
    alert('Субаренда удалена');
  } catch (error) {
    alert(error.message);
  }
}

async function editSubrental(id) {
  try {
    const current = state.subrentals.find(item => Number(item.id) === Number(id));
    if (!current) return;

    const supplierPrice = prompt('Цена поставщика / день', current.supplier_price_per_day ?? 0);
    if (supplierPrice === null) return;
    const clientPrice = prompt('Цена клиента / день', current.client_price_per_day ?? 0);
    if (clientPrice === null) return;
    const quantity = prompt('Количество', current.quantity ?? 1);
    if (quantity === null) return;
    const days = prompt('Дней', current.days ?? 1);
    if (days === null) return;
    const notes = prompt('Комментарий', current.notes || '');
    if (notes === null) return;

    const payload = {
      supplier_price_per_day: Number(supplierPrice),
      client_price_per_day: Number(clientPrice),
      quantity: Number(quantity),
      days: Number(days),
      notes: String(notes).trim()
    };

    if (payload.quantity <= 0 || payload.days <= 0 || payload.supplier_price_per_day < 0 || payload.client_price_per_day < 0) {
      alert('Проверь значения: количество/дни > 0, цены >= 0');
      return;
    }

    const res = await fetch(`${API}/subrentals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка обновления');

    await loadAllData();
    alert('Субаренда обновлена');
  } catch (error) {
    alert(error.message);
  }
}

function fillSelects() {
  const clientOptions = state.clients.length
    ? ['<option value="">Без клиента</option>']
      .concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`))
      .join('')
    : '<option value="">Клиенты пока недоступны</option>';
  document.getElementById('rentalClient').innerHTML = clientOptions;

  const rentalOptions = ['<option value="">Не выбрано</option>']
    .concat(state.rentals.map(r => `<option value="${r.id}">${r.title || r.name || `Проект #${r.id}`}</option>`))
    .join('');
  document.getElementById('txRental').innerHTML = rentalOptions;

  const subrentalProject = document.getElementById('subrentalProject');
  if (subrentalProject) {
    subrentalProject.innerHTML = rentalOptions;
  }

  const itemOptions = ['<option value="">Не выбрано</option>']
    .concat(state.items.map(i => `<option value="${i.id}">${i.name}</option>`))
    .join('');
  document.getElementById('txItem').innerHTML = itemOptions;
  document.getElementById('modalRiItem').innerHTML = itemOptions;

  const estimateItemSelect = document.getElementById('estimateItemSelect');
  if (estimateItemSelect) estimateItemSelect.innerHTML = itemOptions;

  if (state.activeRentalId) {
    renderProjectModal(state.activeRentalId);
  }

  onEstimateItemChange();
}

async function createClient() {
  try {
    await apiPost('/clients', {
      name: document.getElementById('clientName').value.trim(),
      phone: document.getElementById('clientPhone').value.trim(),
      note: document.getElementById('clientNote').value.trim()
    });

    document.getElementById('clientName').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientNote').value = '';

    await loadAllData();
    alert('Клиент сохранён');
  } catch (error) {
    alert(error.message);
  }
}

async function createItem() {
  try {
    const payload = {
      name: document.getElementById('itemName').value.trim(),
      category: document.getElementById('itemCategory').value.trim(),
      price: Number(document.getElementById('itemPrice').value || 0),
      base_rate: Number(document.getElementById('itemBaseRate').value || 0),
      purchase_price: Number(document.getElementById('itemPurchasePrice').value || 0),
      purchase_date: document.getElementById('itemPurchaseDate').value || null,
      status: document.getElementById('itemStatus').value,
      owner_type: document.getElementById('itemOwnerType').value,
      serial_number: document.getElementById('itemSerial').value.trim()
    };

    await apiPost('/items', payload);
    resetItemForm();

    await loadAllData();
    alert('Техника сохранена');
  } catch (error) {
    alert(error.message);
  }
}

async function createRental() {
  try {
    const startDate = document.getElementById('rentalStart').value || null;
    const endDate = document.getElementById('rentalEnd').value || null;
    const projectName = document.getElementById('rentalTitle').value.trim();
    const clientSelect = document.getElementById('rentalClient');
    const selectedClientName = clientSelect?.selectedOptions?.[0]?.textContent?.trim();

    if (!projectName) {
      alert('Укажи название проекта.');
      return;
    }

    if (startDate && isPastDate(startDate)) {
      alert('Нельзя создать проект в прошлом. Выбери сегодняшнюю дату или будущее.');
      return;
    }

    if (endDate && isPastDate(endDate)) {
      alert('Дата завершения не может быть в прошлом.');
      return;
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      alert('Дата завершения не может быть раньше даты начала.');
      return;
    }

    await apiPost('/projects', {
      name: projectName,
      client: clientSelect?.value ? selectedClientName : null,
      start_date: startDate,
      end_date: endDate,
      status: mapLegacyProjectStatus(document.getElementById('rentalStatus').value)
    });

    document.getElementById('rentalTitle').value = '';
    document.getElementById('rentalStart').value = '';
    document.getElementById('rentalEnd').value = '';

    await loadAllData();
    alert('Проект сохранён');
  } catch (error) {
    alert(error.message);
  }
}

function renderProjectModal(rentalId) {
  const rental = state.rentals.find(item => Number(item.id) === Number(rentalId));
  if (!rental) return;

  const client = state.clients.find(c => Number(c.id) === Number(rental.client_id));
  const estimates = ensureRentalEstimates(rental.id);

  document.getElementById('projectModalTitle').textContent = rental.title || 'Проект';
  document.getElementById('projectModalSubtitle').textContent = `Клиент: ${client ? client.name : 'Без клиента'}`;
  document.getElementById('projectModalInfo').innerHTML = `
    <div class="card"><div class="card-label">Период</div><div>${rental.start_date || '-'} — ${rental.end_date || '-'}</div></div>
    <div class="card"><div class="card-label">Статус</div><div>${rental.status || '-'}</div></div>
    <div class="card"><div class="card-label">Сумма</div><div>${formatMoney(rental.total)}</div></div>
    <div class="card"><div class="card-label">Оплачено</div><div>${formatMoney(rental.paid_amount || 0)}</div></div>
  `;

  const estimateSelect = document.getElementById('projectEstimateSelect');
  const currentEstimateId = state.activeEstimateId && estimates.some(item => item.id === state.activeEstimateId)
    ? state.activeEstimateId
    : estimates[0]?.id;

  estimateSelect.innerHTML = estimates
    .map(estimate => `<option value="${estimate.id}">${estimate.name}</option>`)
    .join('');

  if (currentEstimateId) {
    estimateSelect.value = currentEstimateId;
    state.activeEstimateId = currentEstimateId;
  }

  document.getElementById('projectEstimatesBody').innerHTML = estimates
    .map(
      estimate => `
      <tr class="project-row" onclick="openEstimateModal('${estimate.id}')">
        <td>${estimate.name}</td>
        <td>${new Date(estimate.created_at).toLocaleDateString('ru-RU')}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('projectEstimateMeta').textContent = `Всего смет: ${estimates.length}`;
}

function openProjectModal(rentalId) {
  state.activeRentalId = Number(rentalId);
  state.activeEstimateId = null;
  renderProjectModal(state.activeRentalId);
  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
  closeEstimateModal();
}

function createEstimate() {
  if (!state.activeRentalId) return;

  const name = prompt('Название новой сметы', `Смета ${ensureRentalEstimates(state.activeRentalId).length + 1}`);
  if (!name || !name.trim()) return;

  const estimates = ensureRentalEstimates(state.activeRentalId);
  estimates.push({
    id: `${state.activeRentalId}-${Date.now()}`,
    name: name.trim(),
    created_at: new Date().toISOString(),
    discount_percent: 0,
    shifts: 1,
    items: []
  });

  state.activeEstimateId = estimates[estimates.length - 1].id;
  renderProjectModal(state.activeRentalId);
}

function parseEstimatePrefix(note = '') {
  const idMatch = String(note).match(/\[СметаID:\s*([^\]]+)\]/);
  const nameMatch = String(note).match(/\[Смета:\s*([^\]]+)\]/);

  return {
    estimateId: idMatch ? idMatch[1].trim() : null,
    estimateName: nameMatch ? nameMatch[1].trim() : null
  };
}

function buildEstimateNote(estimate, rawNote = '') {
  const estimateName = estimate?.name || 'Основная смета';
  const estimateId = estimate?.id || 'base';
  const suffix = rawNote ? ` ${rawNote}` : '';
  return `[СметаID: ${estimateId}] [Смета: ${estimateName}]${suffix}`;
}

function getActiveEstimate() {
  if (!state.activeRentalId) return null;

  const estimates = ensureRentalEstimates(state.activeRentalId);
  if (!estimates.length) return null;

  let estimateId = state.activeEstimateId || document.getElementById('projectEstimateSelect')?.value;
  if (!estimateId) estimateId = estimates[0].id;

  const estimate = estimates.find(item => String(item.id) === String(estimateId)) || estimates[0];
  state.activeEstimateId = estimate.id;

  if (typeof estimate.discount_percent !== 'number') estimate.discount_percent = Number(estimate.discount_percent || 0);
  if (typeof estimate.shifts !== 'number' || estimate.shifts <= 0) estimate.shifts = Number(estimate.shifts || 1);
  if (!Array.isArray(estimate.items)) estimate.items = [];

  return estimate;
}

function getEstimateItems(estimate) {
  if (!estimate || !state.activeRentalId) return [];

  const localItems = Array.isArray(estimate.items) ? estimate.items : [];
  const apiItems = state.rentalItems
    .filter(item => Number(item.rental_id) === Number(state.activeRentalId))
    .filter(item => {
      const parsed = parseEstimatePrefix(item.note || '');
      if (parsed.estimateId) return String(parsed.estimateId) === String(estimate.id);
      return parsed.estimateName && parsed.estimateName === estimate.name;
    })
    .map(item => ({
      id: item.id,
      item_id: Number(item.item_id),
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      days: Number(item.days || 1),
      note: item.note || ''
    }));

  const merged = [...apiItems];
  localItems.forEach(local => {
    if (!local.id || !apiItems.some(apiItem => String(apiItem.id) === String(local.id))) {
      merged.push(local);
    }
  });

  estimate.items = merged;
  return merged;
}

function calculateEstimateItem(item, estimate) {
  const discount = Number(estimate?.discount_percent || 0);
  const shifts = Number(estimate?.shifts || 1);
  const priceBeforeDiscount = Number(item.price || 0);
  const priceAfterDiscount = Math.max(0, priceBeforeDiscount * (1 - discount / 100));
  const quantity = Number(item.quantity || 1);

  return {
    shifts,
    quantity,
    priceBeforeDiscount,
    priceAfterDiscount,
    total: priceAfterDiscount * quantity * shifts
  };
}

function renderEstimateModal() {
  const estimate = getActiveEstimate();
  if (!estimate || !state.activeRentalId) return;

  const rental = state.rentals.find(item => Number(item.id) === Number(state.activeRentalId));
  const items = getEstimateItems(estimate);

  document.getElementById('estimateModalTitle').textContent = estimate.name || 'Смета';
  document.getElementById('estimateModalSubtitle').textContent = rental ? `Проект: ${rental.title}` : '';
  document.getElementById('estimateShifts').value = String(Number(estimate.shifts || 1));
  document.getElementById('estimateDiscount').value = String(Number(estimate.discount_percent || 0));

  const body = document.getElementById('estimateItemsBody');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">В этой смете пока нет техники.</td></tr>';
  } else {
    body.innerHTML = items
      .map((item, idx) => {
        const source = state.items.find(sourceItem => Number(sourceItem.id) === Number(item.item_id));
        const calc = calculateEstimateItem(item, estimate);
        return `
          <tr>
            <td>${source ? source.name : '-'}</td>
            <td>${calc.quantity}</td>
            <td>${formatMoney(calc.priceBeforeDiscount)}</td>
            <td>${formatMoney(calc.priceAfterDiscount)}</td>
            <td>${calc.shifts}</td>
            <td>${formatMoney(calc.total)}</td>
            <td><button class="secondary" onclick="editEstimateItem(${idx})">Изменить</button></td>
          </tr>
        `;
      })
      .join('');
  }

  const totals = items.reduce((acc, item) => {
    const calc = calculateEstimateItem(item, estimate);
    acc.before += calc.priceBeforeDiscount * calc.quantity * calc.shifts;
    acc.after += calc.total;
    return acc;
  }, { before: 0, after: 0 });

  document.getElementById('estimateSummary').innerHTML = `
    <div class="card-label">Итоги сметы</div>
    <div class="muted">До скидки: ${formatMoney(totals.before)}</div>
    <div class="muted">После скидки: ${formatMoney(totals.after)}</div>
  `;
}

function openEstimateModal(estimateId = null) {
  if (!state.activeRentalId) return;

  if (estimateId) {
    state.activeEstimateId = estimateId;
  } else {
    state.activeEstimateId = document.getElementById('projectEstimateSelect')?.value || state.activeEstimateId;
  }

  renderEstimateModal();
  document.getElementById('estimateModalOverlay').classList.add('open');
}

function closeEstimateModal() {
  const overlay = document.getElementById('estimateModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function applyEstimateSettings() {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  estimate.shifts = Math.max(1, Number(document.getElementById('estimateShifts').value || 1));
  estimate.discount_percent = Math.min(100, Math.max(0, Number(document.getElementById('estimateDiscount').value || 0)));

  renderEstimateModal();
}

function editEstimateItem(index) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const item = estimate.items[index];
  if (!item) return;

  const price = prompt('Цена до скидки', item.price ?? 0);
  if (price === null) return;
  const quantity = prompt('Количество', item.quantity ?? 1);
  if (quantity === null) return;

  const nextPrice = Number(price || 0);
  const nextQuantity = Math.max(1, Number(quantity || 1));

  item.price = nextPrice;
  item.quantity = nextQuantity;

  if (item.id) {
    fetch(`${API}/rental-items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price: nextPrice,
        quantity: nextQuantity,
        days: Number(item.days || 1),
        subrent_cost: Number(item.subrent_cost || 0),
        note: item.note || ''
      })
    }).catch(() => {});
  }

  renderEstimateModal();
}

function onEstimateItemChange() {
  const select = document.getElementById('estimateItemSelect');
  const priceInput = document.getElementById('estimateItemPrice');
  const selectedId = Number(select?.value || 0);
  if (!selectedId || !priceInput) return;

  const item = state.items.find(entry => Number(entry.id) === selectedId);
  const warehousePrice = Number(item?.base_rate ?? item?.price ?? 0);
  priceInput.value = String(warehousePrice || 0);
}

async function addEstimateItem() {
  const estimate = getActiveEstimate();
  if (!estimate || !state.activeRentalId) return;

  const itemId = Number(document.getElementById('estimateItemSelect').value || 0);
  const price = Number(document.getElementById('estimateItemPrice').value || 0);
  const quantity = Math.max(1, Number(document.getElementById('estimateItemQty').value || 1));
  const noteRaw = document.getElementById('estimateItemNote').value.trim();

  if (!itemId) {
    alert('Выбери технику.');
    return;
  }

  const payload = {
    rental_id: Number(state.activeRentalId),
    item_id: itemId,
    price,
    days: 1,
    quantity,
    subrent_cost: 0,
    note: buildEstimateNote(estimate, noteRaw)
  };

  try {
    const saved = await apiPost('/rental-items', payload);

    estimate.items.push({
      id: saved?.id,
      item_id: itemId,
      price,
      quantity,
      days: 1,
      note: payload.note
    });

    document.getElementById('estimateItemQty').value = '1';
    document.getElementById('estimateItemNote').value = '';

    renderEstimateModal();
    await loadAllData();
  } catch (error) {
    alert(error.message);
  }
}

async function addRentalItemFromModal() {
  try {
    if (!state.activeRentalId) {
      alert('Сначала открой проект из таблицы.');
      return;
    }

    const estimate = getActiveEstimate();
    const rawNote = document.getElementById('modalRiNote').value.trim();
    const note = buildEstimateNote(estimate, rawNote);

    await apiPost('/rental-items', {
      rental_id: Number(state.activeRentalId),
      item_id: Number(document.getElementById('modalRiItem').value),
      price: Number(document.getElementById('modalRiPrice').value || 0),
      days: Number(document.getElementById('modalRiDays').value || 1),
      quantity: Number(document.getElementById('modalRiQty').value || 1),
      subrent_cost: Number(document.getElementById('modalRiSubrentCost').value || 0),
      note
    });

    document.getElementById('modalRiPrice').value = '';
    document.getElementById('modalRiDays').value = '1';
    document.getElementById('modalRiQty').value = '1';
    document.getElementById('modalRiSubrentCost').value = '0';
    document.getElementById('modalRiNote').value = '';

    await loadAllData();
    openProjectModal(state.activeRentalId);
    alert('Техника добавлена в смету проекта');
  } catch (error) {
    alert(error.message);
  }
}

async function createTransaction() {
  try {
    await apiPost('/transactions', {
      type: document.getElementById('txType').value,
      amount: Number(document.getElementById('txAmount').value || 0),
      category: document.getElementById('txCategory').value.trim(),
      rental_id: document.getElementById('txRental').value || null,
      item_id: document.getElementById('txItem').value || null,
      note: document.getElementById('txNote').value.trim()
    });

    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';

    await loadAllData();
    alert('Операция сохранена');
  } catch (error) {
    alert(error.message);
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen = sidebar.classList.contains('open');

  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    return;
  }

  sidebar.classList.add('open');
  overlay.classList.add('open');
}

function setupProjectDateGuard() {
  const today = getTodayISODate();
  const start = document.getElementById('rentalStart');
  const end = document.getElementById('rentalEnd');

  start.min = today;
  end.min = today;
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav button');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(button => button.classList.remove('active'));
      btn.classList.add('active');

      const page = btn.dataset.page;
      document.querySelectorAll('main > section').forEach(section => section.classList.add('hidden'));
      document.getElementById(`page-${page}`).classList.remove('hidden');
      document.dispatchEvent(new CustomEvent('crm:page-change', { detail: { page } }));

      closeSidebar();
    });
  });

  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeItemModal();
      closeProjectModal();
      closeSidebar();
    }
  });

  const projectModalOverlay = document.getElementById('projectModalOverlay');
  if (projectModalOverlay) {
    projectModalOverlay.addEventListener('click', event => {
      if (event.target.id === 'projectModalOverlay') closeProjectModal();
    });
  }

  const estimateModalOverlay = document.getElementById('estimateModalOverlay');
  if (estimateModalOverlay) {
    estimateModalOverlay.addEventListener('click', event => {
      if (event.target.id === 'estimateModalOverlay') closeEstimateModal();
    });
  }

  const itemModalOverlay = document.getElementById('itemModalOverlay');
  if (itemModalOverlay) {
    itemModalOverlay.addEventListener('click', event => {
      if (event.target.id === 'itemModalOverlay') closeItemModal();
    });
  }

  const estimateSelect = document.getElementById('projectEstimateSelect');
  if (estimateSelect) {
    estimateSelect.addEventListener('change', () => {
      state.activeEstimateId = estimateSelect.value || null;
    });
  }

  const estimateItemSelect = document.getElementById('estimateItemSelect');
  if (estimateItemSelect) estimateItemSelect.addEventListener('change', onEstimateItemChange);
}



window.crmApp = {
  getState: () => state,
  formatMoney,
  formatPercent,
  normalizePaybackItem,
  openProjectModal,
  openEstimateModal
};

window.openItemModal = openItemModal;
window.closeItemModal = closeItemModal;
window.saveItemFromModal = saveItemFromModal;

setupNavigation();
setupProjectDateGuard();
resetItemForm();
loadAllData({ silent: true });
