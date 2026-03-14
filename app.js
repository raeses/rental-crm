const API = '/api';

const state = {
  items: [],
  rentals: [],
  clients: [],
  transactions: [],
  financeSummary: null,
  payback: [],
  projectEstimatesByProject: {},
  activeRentalId: null,
  activeEstimateId: null,
  activeEstimate: null,
  rentalItems: [],
  subrentals: []
};

const ITEM_STATUS_LABELS = {
  available: 'Доступна',
  unavailable: 'Недоступна',
  maintenance: 'На обслуживании',
  archived: 'В архиве'
};

const ITEM_OWNER_TYPE_LABELS = {
  own: 'Собственная',
  partner: 'Партнерская'
};

const PROJECT_STATUS_LABELS = {
  draft: 'Черновик',
  confirmed: 'Подтвержден',
  completed: 'Завершен',
  closed: 'Отменен'
};

let loadAllDataPromise = null;
const itemFilters = {
  category: 'all',
  lifecycle: 'active'
};

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
  if (normalized === 'черновик') return 'draft';
  if (normalized === 'подтвержден') return 'confirmed';
  if (normalized === 'завершен') return 'completed';
  if (normalized === 'отменен') return 'closed';
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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getItemStatusLabel(status) {
  return ITEM_STATUS_LABELS[String(status || '').toLowerCase()] || status || '-';
}

function isItemArchived(item = {}) {
  if (Boolean(Number(item.is_archived)) || item.is_archived === true) {
    return true;
  }

  const itemId = Number(item.id || item.item_id || 0);
  if (!itemId) return false;

  const matchedItem = state.items.find(entry => Number(entry.id) === itemId);
  return Boolean(matchedItem && (Boolean(Number(matchedItem.is_archived)) || matchedItem.is_archived === true));
}

function getItemOwnerTypeLabel(ownerType) {
  return ITEM_OWNER_TYPE_LABELS[String(ownerType || '').toLowerCase()] || ownerType || '-';
}

function getProjectStatusLabel(status) {
  return PROJECT_STATUS_LABELS[String(status || '').toLowerCase()] || status || '-';
}

function renderProjectStatusOptions(selectedStatus = 'draft') {
  const current = String(selectedStatus || 'draft').toLowerCase();
  return Object.entries(PROJECT_STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`)
    .join('');
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

  if (normalized === 'archived') cls = 'gray';
  if (['available', 'paid', 'active', 'confirmed', 'income'].includes(normalized)) cls = 'green';
  if (['unavailable', 'cancelled', 'closed', 'unpaid', 'lost', 'expense'].includes(normalized)) cls = 'red';

  return `<span class="pill ${cls}">${status || '-'}</span>`;
}

function getStatusPillWithLabel(status, label) {
  const normalized = String(status || '').toLowerCase();
  let cls = 'yellow';

  if (normalized === 'archived') cls = 'gray';
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

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU');
}

function formatDateRange(start, end) {
  const left = formatShortDate(start);
  const right = formatShortDate(end);
  if (left === '-' && right === '-') return '-';
  return `${left} — ${right}`;
}

function toApiDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getProjectEstimates(projectId) {
  return state.projectEstimatesByProject[Number(projectId)] || [];
}

function getEstimateDisplayName(estimate = {}) {
  return [estimate.estimate_number, estimate.title].filter(Boolean).join(' — ') || `Смета #${estimate.id}`;
}

function getEstimateCatalogItems(search = '', category = 'all') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const normalizedCategory = String(category || 'all');

  return state.items.filter(item => {
    if (isItemArchived(item)) return false;
    if (normalizedCategory !== 'all' && String(item.category || '') !== normalizedCategory) return false;
    if (!normalizedSearch) return true;
    return String(item.name || '').toLowerCase().includes(normalizedSearch);
  });
}

async function loadProjectEstimates(projectId) {
  const estimates = await apiGet(`/projects/${projectId}/estimates`);
  state.projectEstimatesByProject[Number(projectId)] = Array.isArray(estimates) ? estimates : [];
  return getProjectEstimates(projectId);
}

async function loadEstimateDetails(estimateId) {
  const estimate = await apiGet(`/estimates/${estimateId}`);
  state.activeEstimate = estimate;
  state.activeEstimateId = String(estimate.id);

  const projectId = Number(estimate.project_id);
  if (projectId) {
    const existing = getProjectEstimates(projectId);
    const summary = { ...estimate };
    delete summary.items;

    state.projectEstimatesByProject[projectId] = existing.some(item => Number(item.id) === Number(summary.id))
      ? existing.map(item => (Number(item.id) === Number(summary.id) ? { ...item, ...summary } : item))
      : [summary, ...existing];
  }

  return estimate;
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
  populateItemFilters();
  renderItems();
  renderProjects();
  renderClients();
  renderTransactions();
  renderSubrentals();
  renderSubrentalsTotals();
  fillSelects();
}

function populateItemFilters() {
  const categoryFilter = document.getElementById('itemCategoryFilter');
  if (!categoryFilter) return;

  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  categoryFilter.innerHTML = ['<option value="all">Все категории</option>', ...categories.map(category => `<option value="${category}">${category}</option>`)].join('');
  categoryFilter.value = itemFilters.category;
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
  const paybackItems = state.payback.filter(item => !isItemArchived(item));

  if (!paybackItems.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет данных по окупаемости.</td></tr>';
    return;
  }

  body.innerHTML = paybackItems
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
  const paybackItems = state.payback.filter(item => !isItemArchived(item));

  if (!paybackItems.length) {
    box.textContent = 'Сначала добавь технику, проекты и операции. Потом здесь появятся подсказки по окупаемости.';
    return;
  }

  const best = [...paybackItems].sort((a, b) => Number(b.payback_percent || 0) - Number(a.payback_percent || 0))[0];
  const worst = [...paybackItems].sort((a, b) => Number(a.payback_percent || 0) - Number(b.payback_percent || 0))[0];

  box.innerHTML = `
    <p>Самая быстрая по окупаемости сейчас: <strong>${best.name || '-'}</strong> — ${formatPercent(best.payback_percent)}.</p>
    <p>Самая слабая по окупаемости сейчас: <strong>${worst.name || '-'}</strong> — ${formatPercent(worst.payback_percent)}.</p>
    <p>Главная цель этой системы — видеть не просто занятость техники, а реальные деньги: доход, расход, прибыль и сколько осталось до полного возврата вложений.</p>
  `;
}

function renderItems() {
  const body = document.getElementById('itemsBody');
  const filteredItems = getFilteredItems();

  if (!filteredItems.length) {
    const emptyMessage = state.items.length
      ? 'По текущим фильтрам техника не найдена.'
      : 'Пока нет техники.';
    body.innerHTML = `<tr><td colspan="7" class="empty">${emptyMessage}</td></tr>`;
    return;
  }

  body.innerHTML = filteredItems
    .map(
      item => `
      <tr>
        <td>${item.name || '-'}</td>
        <td>${item.category || '-'}</td>
        <td>${formatMoney(item.base_rate || item.price)}</td>
        <td>${getStatusPillWithLabel(isItemArchived(item) ? 'archived' : item.status, isItemArchived(item) ? 'В архиве' : getItemStatusLabel(item.status))}</td>
        <td>${formatMoney(item.revenue_total)}</td>
        <td>${formatPercent(item.payback_percent)}</td>
        <td><button class="secondary" onclick="openItemModal(${Number(item.id)})">Редактировать</button></td>
      </tr>
    `
    )
    .join('');
}

function getFilteredItems() {
  return state.items.filter(item => {
    const matchesCategory = itemFilters.category === 'all' || item.category === itemFilters.category;
    if (!matchesCategory) return false;

    if (itemFilters.lifecycle === 'all') return true;
    if (itemFilters.lifecycle === 'archived') return isItemArchived(item);
    if (itemFilters.lifecycle === 'maintenance') return !isItemArchived(item) && item.status === 'maintenance';
    if (itemFilters.lifecycle === 'available') return !isItemArchived(item) && item.status === 'available';
    if (itemFilters.lifecycle === 'active') return !isItemArchived(item);

    return true;
  });
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
  document.getElementById('itemModalSubtitle').textContent = isItemArchived(item) ? `ID: ${item.id} · В архиве` : `ID: ${item.id}`;
  const archiveButton = document.getElementById('itemArchiveButton');
  if (archiveButton) archiveButton.textContent = isItemArchived(item) ? 'Вернуть из архива' : 'Перенести в архив';
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

async function toggleItemArchive() {
  try {
    const itemId = document.getElementById('itemModalId').value;
    if (!itemId) return;

    const currentItem = state.items.find(item => Number(item.id) === Number(itemId));
    const archived = isItemArchived(currentItem);
    const path = archived ? `/items/${itemId}/restore` : `/items/${itemId}/archive`;

    await apiPost(path, {});
    await loadAllData();

    if (archived) {
      await openItemModal(itemId);
      alert('Техника возвращена из архива');
      return;
    }

    closeItemModal();
    alert('Техника перенесена в архив');
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
          <td>${formatShortDate(rental.start_date)}<br><span class="muted">${formatShortDate(rental.end_date)}</span></td>
          <td>${formatMoney(rental.total)}</td>
          <td>${formatMoney(rental.paid_amount || 0)}</td>
          <td>${getStatusPillWithLabel(rental.status || rental.payment_status, getProjectStatusLabel(rental.status || rental.payment_status))}</td>
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
  const modalRiItem = document.getElementById('modalRiItem');
  if (modalRiItem) modalRiItem.innerHTML = itemOptions;

  const estimateCatalogCategory = document.getElementById('estimateCatalogCategory');
  if (estimateCatalogCategory) {
    renderEstimateCatalogModal();
  }

  if (state.activeRentalId) {
    renderProjectModal(state.activeRentalId).catch(error => {
      console.warn(error.message);
    });
  }
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
    const itemRate = Number(document.getElementById('itemPrice').value || 0);
    const payload = {
      name: document.getElementById('itemName').value.trim(),
      category: document.getElementById('itemCategory').value.trim(),
      price: itemRate,
      base_rate: Number(document.getElementById('itemBaseRate').value || itemRate),
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
    document.getElementById('rentalStatus').value = 'draft';

    await loadAllData();
    alert('Проект сохранён');
  } catch (error) {
    alert(error.message);
  }
}

async function saveProjectDetails() {
  try {
    if (!state.activeRentalId) return;

    const rental = state.rentals.find(item => Number(item.id) === Number(state.activeRentalId));
    if (!rental) return;

    const name = document.getElementById('projectModalName').value.trim();
    const startDate = document.getElementById('projectModalStart').value || null;
    const endDate = document.getElementById('projectModalEnd').value || null;
    const status = mapLegacyProjectStatus(document.getElementById('projectModalStatus').value);

    if (!name) {
      alert('Укажи название проекта.');
      return;
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      alert('Дата завершения не может быть раньше даты начала.');
      return;
    }

    await apiPut(`/projects/${rental.id}`, {
      internal_number: rental.internal_number || null,
      name,
      client: rental.client_name || rental.client || null,
      operator: rental.operator || null,
      start_date: startDate,
      end_date: endDate,
      status
    });

    await loadAllData({ silent: true });
    await renderProjectModal(rental.id);
    alert('Проект обновлён');
  } catch (error) {
    alert(error.message);
  }
}

async function renderProjectModal(rentalId) {
  const rental = state.rentals.find(item => Number(item.id) === Number(rentalId));
  if (!rental) return;

  const client = state.clients.find(c => Number(c.id) === Number(rental.client_id));
  const clientName = rental.client_name || rental.client || client?.name || 'Без клиента';

  document.getElementById('projectModalTitle').textContent = rental.title || 'Проект';
  document.getElementById('projectModalSubtitle').textContent = `Клиент: ${clientName}`;
  document.getElementById('projectModalInfo').innerHTML = `
    <div class="field-group">
      <span class="field-label">Название проекта</span>
      <input id="projectModalName" value="${escapeHtml(rental.title || '')}" placeholder="Название проекта" />
    </div>
    <div class="field-group">
      <span class="field-label">Статус проекта</span>
      <select id="projectModalStatus">${renderProjectStatusOptions(rental.status || 'draft')}</select>
    </div>
    <div class="field-group">
      <span class="field-label">Дата начала</span>
      <input id="projectModalStart" type="date" value="${toApiDate(rental.start_date) || ''}" />
    </div>
    <div class="field-group">
      <span class="field-label">Дата завершения</span>
      <input id="projectModalEnd" type="date" value="${toApiDate(rental.end_date) || ''}" />
    </div>
    <button class="primary full" onclick="saveProjectDetails()">Сохранить проект</button>
  `;

  const estimateSelect = document.getElementById('projectEstimateSelect');
  const estimatesBody = document.getElementById('projectEstimatesBody');
  const estimateMeta = document.getElementById('projectEstimateMeta');

  estimateSelect.innerHTML = '<option value="">Загрузка смет...</option>';
  estimatesBody.innerHTML = '<tr><td colspan="2" class="empty">Загрузка смет...</td></tr>';
  estimateMeta.textContent = 'Загрузка смет...';

  const estimates = await loadProjectEstimates(rental.id);
  if (!estimates.length) {
    estimateSelect.innerHTML = '<option value="">Смет пока нет</option>';
    estimatesBody.innerHTML = '<tr><td colspan="2" class="empty">Для этого проекта пока нет смет.</td></tr>';
    estimateMeta.textContent = 'Всего смет: 0';
    state.activeEstimateId = null;
    state.activeEstimate = null;
    return;
  }

  const currentEstimateId = state.activeEstimateId && estimates.some(item => String(item.id) === String(state.activeEstimateId))
    ? String(state.activeEstimateId)
    : String(estimates[0].id);

  estimateSelect.innerHTML = estimates
    .map(estimate => `<option value="${estimate.id}">${getEstimateDisplayName(estimate)}</option>`)
    .join('');

  if (currentEstimateId) {
    estimateSelect.value = currentEstimateId;
    state.activeEstimateId = currentEstimateId;
  }

  estimatesBody.innerHTML = estimates
    .map(
      estimate => `
      <tr class="project-row" onclick="openEstimateModal('${estimate.id}')">
        <td>${getEstimateDisplayName(estimate)}</td>
        <td>${formatShortDate(estimate.created_at)}</td>
      </tr>
    `
    )
    .join('');

  estimateMeta.textContent = `Всего смет: ${estimates.length}`;
}

function openProjectModal(rentalId) {
  state.activeRentalId = Number(rentalId);
  state.activeEstimateId = null;
  state.activeEstimate = null;
  document.getElementById('projectModalOverlay').classList.add('open');
  renderProjectModal(state.activeRentalId).catch(error => {
    alert(error.message);
  });
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
  closeEstimateCatalogModal();
  closeEstimateModal();
}

async function createEstimate() {
  if (!state.activeRentalId) return;

  const rental = state.rentals.find(item => Number(item.id) === Number(state.activeRentalId));
  if (!rental) return;

  const estimates = getProjectEstimates(state.activeRentalId);

  try {
    const created = await apiPost('/estimates', {
      project_id: Number(rental.id),
      estimate_number: `${rental.id}/${estimates.length + 1}`,
      title: null,
      start_date: toApiDate(rental.start_date),
      end_date: toApiDate(rental.end_date),
      discount_percent: 0,
      tax_enabled: false,
      tax_percent: 0
    });

    state.activeEstimateId = String(created.id);
    await renderProjectModal(state.activeRentalId);
    await openEstimateModal(created.id);
  } catch (error) {
    alert(error.message);
  }
}

function getActiveEstimate() {
  return state.activeEstimate;
}

function getEstimateItems(estimate) {
  if (!estimate) return [];
  return Array.isArray(estimate.items) ? estimate.items : [];
}

function calculateEstimateItem(item, estimate) {
  const discount = Number(estimate?.discount_percent || 0);
  const shifts = Math.max(1, Number(item.days || 1));
  const priceBeforeDiscount = Number(item.price_per_unit || item.price || 0);
  const priceAfterDiscount = Math.max(0, priceBeforeDiscount * (1 - discount / 100));
  const quantity = Math.max(1, Number(item.quantity || 1));

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

  document.getElementById('estimateModalTitle').textContent = getEstimateDisplayName(estimate);
  document.getElementById('estimateModalSubtitle').textContent = rental ? `Проект: ${rental.title || '-'}` : '';
  document.getElementById('estimateDiscount').value = String(Number(estimate.discount_percent || 0));

  const body = document.getElementById('estimateItemsBody');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">В этой смете пока нет техники. Нажми «Добавить технику», чтобы собрать первую позицию.</td></tr>';
  } else {
    body.innerHTML = items
      .map((item, idx) => {
        const calc = calculateEstimateItem(item, estimate);
        return `
          <tr>
            <td>${escapeHtml(item.item_name || '-')}</td>
            <td>${formatMoney(calc.priceBeforeDiscount)}</td>
            <td>${formatMoney(calc.priceAfterDiscount)}</td>
            <td>${calc.quantity}</td>
            <td>${calc.shifts}</td>
            <td>${formatMoney(calc.total)}</td>
            <td>
              <div class="actions-inline table-actions-inline">
                <button class="secondary" onclick="editEstimateItem(${idx})">Изменить</button>
                <button class="secondary" onclick="deleteEstimateItemRow(${idx})">Удалить</button>
              </div>
            </td>
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
    <div class="estimate-summary-metric">
      <span>Период</span>
      <strong>${formatDateRange(estimate.start_date, estimate.end_date)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>Техника</span>
      <strong>${items.length}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>До скидки</span>
      <strong>${formatMoney(totals.before)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>После скидки</span>
      <strong>${formatMoney(totals.after)}</strong>
    </div>
  `;
}

async function openEstimateModal(estimateId = null) {
  if (!state.activeRentalId) return;

  const nextEstimateId = estimateId || document.getElementById('projectEstimateSelect')?.value || state.activeEstimateId;
  if (!nextEstimateId) {
    alert('Выбери смету проекта.');
    return;
  }

  try {
    await loadEstimateDetails(nextEstimateId);
    renderEstimateModal();
    document.getElementById('estimateModalOverlay').classList.add('open');
  } catch (error) {
    alert(error.message);
  }
}

function closeEstimateModal() {
  closeEstimateCatalogModal();
  const overlay = document.getElementById('estimateModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function openEstimatePdf() {
  const estimate = getActiveEstimate();
  if (!estimate) {
    alert('Сначала открой смету.');
    return;
  }

  window.open(`${API}/estimates/${estimate.id}/pdf`, '_blank', 'noopener');
}

async function applyEstimateSettings() {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  try {
    const updated = await apiPut(`/estimates/${estimate.id}`, {
      project_id: Number(estimate.project_id),
      estimate_number: estimate.estimate_number,
      title: estimate.title || null,
      start_date: toApiDate(estimate.start_date),
      end_date: toApiDate(estimate.end_date),
      discount_percent: Math.min(100, Math.max(0, Number(document.getElementById('estimateDiscount').value || 0))),
      tax_enabled: Boolean(estimate.tax_enabled),
      tax_percent: Number(estimate.tax_percent || 0)
    });

    state.activeEstimate = updated;
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    alert(error.message);
  }
}

async function editEstimateItem(index) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const item = getEstimateItems(estimate)[index];
  if (!item) return;

  const price = prompt('Базовая цена за смену', item.price_per_unit ?? item.price ?? 0);
  if (price === null) return;
  const quantity = prompt('Количество', item.quantity ?? 1);
  if (quantity === null) return;
  const days = prompt('Смен', item.days ?? 1);
  if (days === null) return;

  const nextPrice = Number(price || 0);
  const nextQuantity = Math.max(1, Number(quantity || 1));
  const nextDays = Math.max(1, Number(days || 1));

  try {
    await apiPut(`/estimate-items/${item.id}`, {
      category: item.category || 'Camera',
      item_name: item.item_name || item.name || 'Техника',
      quantity: nextQuantity,
      price_per_unit: nextPrice,
      days: nextDays,
      position_order: Number(item.position_order || index + 1),
      source_type: item.source_type || 'catalog',
      catalog_item_id: item.catalog_item_id || null,
      notes: item.notes || null
    });

    await loadEstimateDetails(estimate.id);
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteEstimateItemRow(index) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const item = getEstimateItems(estimate)[index];
  if (!item) return;

  const confirmed = window.confirm(`Удалить из сметы позицию «${item.item_name || 'Техника'}»?`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API}/estimate-items/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const payload = await readApiPayload(res);
      throw buildApiError(`/estimate-items/${item.id}`, res, payload, 'Ошибка удаления позиции');
    }
    await loadEstimateDetails(estimate.id);
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    alert(error.message);
  }
}

function renderEstimateCatalogModal() {
  const searchInput = document.getElementById('estimateCatalogSearch');
  const categorySelect = document.getElementById('estimateCatalogCategory');
  const body = document.getElementById('estimateCatalogBody');
  if (!searchInput || !categorySelect || !body) return;

  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const currentCategory = categorySelect.value || 'all';
  categorySelect.innerHTML = ['<option value="all">Все категории</option>', ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join('');
  categorySelect.value = categories.includes(currentCategory) || currentCategory === 'all' ? currentCategory : 'all';

  const items = getEstimateCatalogItems(searchInput.value, categorySelect.value);
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Подходящая техника не найдена.</td></tr>';
    return;
  }

  body.innerHTML = items
    .map(item => `
      <tr>
        <td>${escapeHtml(item.name || '-')}</td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td>${formatMoney(item.base_rate ?? item.price ?? 0)}</td>
        <td><button class="secondary" onclick="addCatalogItemToEstimate(${item.id})">Добавить</button></td>
      </tr>
    `)
    .join('');
}

function openEstimateCatalogModal() {
  const estimate = getActiveEstimate();
  if (!estimate) {
    alert('Сначала открой смету.');
    return;
  }

  const searchInput = document.getElementById('estimateCatalogSearch');
  const categorySelect = document.getElementById('estimateCatalogCategory');
  if (searchInput) searchInput.value = '';
  if (categorySelect) categorySelect.value = 'all';
  renderEstimateCatalogModal();
  document.getElementById('estimateCatalogOverlay').classList.add('open');
}

function closeEstimateCatalogModal() {
  const overlay = document.getElementById('estimateCatalogOverlay');
  if (overlay) overlay.classList.remove('open');
}

async function addCatalogItemToEstimate(itemId) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const sourceItem = state.items.find(item => Number(item.id) === Number(itemId));
  if (!sourceItem) {
    alert('Не удалось найти технику в каталоге.');
    return;
  }

  try {
    await apiPost(`/estimates/${estimate.id}/items`, {
      category: sourceItem.category || 'Camera',
      item_name: sourceItem.name || 'Техника',
      quantity: 1,
      price_per_unit: Number(sourceItem.base_rate ?? sourceItem.price ?? 0),
      days: 1,
      source_type: 'catalog',
      catalog_item_id: Number(itemId),
      notes: null
    });

    closeEstimateCatalogModal();
    await loadEstimateDetails(estimate.id);
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
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
    const estimateId = estimate?.id || document.getElementById('projectEstimateSelect')?.value;
    if (!estimateId) {
      alert('Сначала создай или выбери смету проекта.');
      return;
    }

    const catalogItemId = Number(document.getElementById('modalRiItem').value || 0);
    const sourceItem = state.items.find(item => Number(item.id) === catalogItemId);
    if (!catalogItemId || !sourceItem) {
      alert('Выбери технику из каталога.');
      return;
    }

    await apiPost(`/estimates/${estimateId}/items`, {
      category: sourceItem.category || 'Camera',
      item_name: sourceItem.name || 'Техника',
      quantity: Math.max(1, Number(document.getElementById('modalRiQty').value || 1)),
      price_per_unit: Number(document.getElementById('modalRiPrice').value || sourceItem.base_rate || sourceItem.price || 0),
      days: Math.max(1, Number(document.getElementById('modalRiDays').value || 1)),
      source_type: 'catalog',
      catalog_item_id: catalogItemId,
      notes: document.getElementById('modalRiNote').value.trim() || null
    });

    document.getElementById('modalRiPrice').value = '';
    document.getElementById('modalRiDays').value = '1';
    document.getElementById('modalRiQty').value = '1';
    document.getElementById('modalRiNote').value = '';

    if (String(estimateId) === String(state.activeEstimateId) && document.getElementById('estimateModalOverlay').classList.contains('open')) {
      await loadEstimateDetails(estimateId);
      renderEstimateModal();
    }
    await renderProjectModal(state.activeRentalId);
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
      closeEstimateCatalogModal();
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

  const estimateCatalogOverlay = document.getElementById('estimateCatalogOverlay');
  if (estimateCatalogOverlay) {
    estimateCatalogOverlay.addEventListener('click', event => {
      if (event.target.id === 'estimateCatalogOverlay') closeEstimateCatalogModal();
    });
  }

  const itemModalOverlay = document.getElementById('itemModalOverlay');
  if (itemModalOverlay) {
    itemModalOverlay.addEventListener('click', event => {
      if (event.target.id === 'itemModalOverlay') closeItemModal();
    });
  }

  const itemCategoryFilter = document.getElementById('itemCategoryFilter');
  if (itemCategoryFilter) {
    itemCategoryFilter.addEventListener('change', event => {
      itemFilters.category = event.target.value;
      renderItems();
    });
  }

  const itemLifecycleFilter = document.getElementById('itemLifecycleFilter');
  if (itemLifecycleFilter) {
    itemLifecycleFilter.addEventListener('change', event => {
      itemFilters.lifecycle = event.target.value;
      renderItems();
    });
  }

  const estimateSelect = document.getElementById('projectEstimateSelect');
  if (estimateSelect) {
    estimateSelect.addEventListener('change', () => {
      state.activeEstimateId = estimateSelect.value || null;
    });
  }

  const estimateCatalogSearch = document.getElementById('estimateCatalogSearch');
  if (estimateCatalogSearch) {
    estimateCatalogSearch.addEventListener('input', () => {
      renderEstimateCatalogModal();
    });
  }

  const estimateCatalogCategory = document.getElementById('estimateCatalogCategory');
  if (estimateCatalogCategory) {
    estimateCatalogCategory.addEventListener('change', () => {
      renderEstimateCatalogModal();
    });
  }
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
window.toggleItemArchive = toggleItemArchive;
window.openEstimatePdf = openEstimatePdf;
window.openEstimateCatalogModal = openEstimateCatalogModal;
window.closeEstimateCatalogModal = closeEstimateCatalogModal;
window.addCatalogItemToEstimate = addCatalogItemToEstimate;

setupNavigation();
setupProjectDateGuard();
resetItemForm();
loadAllData({ silent: true });
