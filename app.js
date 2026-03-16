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
  estimateCatalogSelection: [],
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

const PROJECT_TAX_PRESETS = {
  none: { label: 'Без налога', percent: 0 },
  ip_9: { label: 'ИП +9%', percent: 9 },
  sz_6: { label: 'СЗ +6%', percent: 6 },
  custom: { label: 'Свой налог', percent: null }
};

const ESTIMATE_CATEGORY_ORDER = [
  'Camera',
  'Camera Accessories',
  'Camera Support',
  'Lenses and Filters',
  'Monitors and Playback',
  'Personnel',
  'Logistics',
  'Other'
];

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
    estimate_count: Number(project.estimate_count || 0),
    discount_percent: Number(project.discount_percent || 0),
    paid_amount: Number(project.paid_amount || 0),
    tax_profile: normalizeProjectTaxProfile(project.tax_profile, project.tax_percent),
    tax_percent: Number(project.tax_percent || 0),
    payment_status: project.payment_status || project.status || 'draft'
  };
}

function normalizeProjectTaxProfile(profile, percent) {
  const normalizedProfile = String(profile || '').toLowerCase();
  const numericPercent = Number(percent || 0);

  if (normalizedProfile && PROJECT_TAX_PRESETS[normalizedProfile]) {
    return normalizedProfile;
  }

  if (numericPercent === 9) return 'ip_9';
  if (numericPercent === 6) return 'sz_6';
  if (numericPercent > 0) return 'custom';
  return 'none';
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
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num)}%`;
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

function renderProjectTaxOptions(selectedProfile = 'none') {
  const current = normalizeProjectTaxProfile(selectedProfile, 0);
  return Object.entries(PROJECT_TAX_PRESETS)
    .map(([value, meta]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${meta.label}</option>`)
    .join('');
}

function getProjectTaxPercent(project = {}) {
  return Math.max(0, Number(project.tax_percent || 0));
}

function getProjectDiscountPercent(project = {}) {
  return Math.min(100, Math.max(0, Number(project.discount_percent || 0)));
}

function getProjectTaxLabel(project = {}) {
  const profile = normalizeProjectTaxProfile(project.tax_profile, project.tax_percent);
  const percent = getProjectTaxPercent(project);
  if (percent <= 0) return 'Без налога';
  if (profile === 'ip_9') return 'ИП +9%';
  if (profile === 'sz_6') return 'СЗ +6%';
  return `Свой налог +${percent}%`;
}

function getProjectTaxPayload(profile, customPercentValue) {
  const normalizedProfile = normalizeProjectTaxProfile(profile, customPercentValue);
  if (normalizedProfile === 'ip_9') {
    return { tax_profile: 'ip_9', tax_percent: 9 };
  }
  if (normalizedProfile === 'sz_6') {
    return { tax_profile: 'sz_6', tax_percent: 6 };
  }
  if (normalizedProfile === 'custom') {
    return {
      tax_profile: 'custom',
      tax_percent: Math.max(0, Number(customPercentValue || 0))
    };
  }

  return { tax_profile: 'none', tax_percent: 0 };
}

function updateProjectTaxFieldVisibility(prefix) {
  const profileSelect = document.getElementById(`${prefix}TaxProfile`);
  const customField = document.getElementById(`${prefix}TaxCustomField`);
  const customInput = document.getElementById(`${prefix}TaxCustom`);
  if (!profileSelect || !customField || !customInput) return;

  const profile = normalizeProjectTaxProfile(profileSelect.value, customInput.value);
  customField.classList.toggle('hidden', profile !== 'custom');

  if (profile === 'ip_9') customInput.value = '9';
  if (profile === 'sz_6') customInput.value = '6';
  if (profile === 'none') customInput.value = '0';
}

function readProjectTaxForm(prefix) {
  const profile = document.getElementById(`${prefix}TaxProfile`)?.value || 'none';
  const customPercent = document.getElementById(`${prefix}TaxCustom`)?.value || 0;
  return getProjectTaxPayload(profile, customPercent);
}

function calculateEstimateTotals(estimate, items) {
  const subtotal = items.reduce((sum, item) => {
    const calc = calculateEstimateItem(item, estimate);
    return sum + (calc.priceBeforeDiscount * calc.quantity * calc.shifts);
  }, 0);
  const discountPercent = Math.max(0, Number(estimate?.discount_percent || 0));
  const discountAmount = subtotal * (discountPercent / 100);
  const totalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const taxPercent = Number(estimate?.tax_enabled ? estimate.tax_percent || 0 : 0);
  const taxAmount = taxPercent > 0 ? totalAfterDiscount * (taxPercent / 100) : 0;
  const grandTotal = totalAfterDiscount + taxAmount;

  return {
    subtotal,
    discountPercent,
    discountAmount,
    totalAfterDiscount,
    taxPercent,
    taxAmount,
    grandTotal
  };
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

function getProjectShiftCount(project = {}) {
  const start = toDateOnly(project.start_date);
  const end = toDateOnly(project.end_date);
  if (!start || !end || end < start) return 1;
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function getEstimateShiftCount(estimate = {}) {
  const start = toDateOnly(estimate.start_date);
  const end = toDateOnly(estimate.end_date);
  if (!start || !end || end < start) return 1;
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function getProjectEstimateTotals(estimates = []) {
  return estimates.reduce(
    (acc, estimate) => {
      acc.count += 1;
      acc.subtotal += Number(estimate.subtotal || 0);
      acc.total += Number(estimate.grand_total || 0);
      acc.shiftCount += getEstimateShiftCount(estimate);
      return acc;
    },
    { count: 0, subtotal: 0, total: 0, shiftCount: 0 }
  );
}

function getInventoryGroupKey(name, category) {
  return `${String(name || '').trim().toLowerCase()}::${String(category || '').trim().toLowerCase()}`;
}

function getCatalogInventoryGroups() {
  const groups = new Map();

  state.items
    .filter(item => !isItemArchived(item) && String(item.status || '').toLowerCase() === 'available')
    .forEach(item => {
      const key = getInventoryGroupKey(item.name, item.category);
      const current = groups.get(key);

      if (current) {
        current.availableCount += 1;
        current.itemIds.push(Number(item.id));
        return;
      }

      groups.set(key, {
        key,
        representativeId: Number(item.id),
        name: item.name || 'Техника',
        category: item.category || '-',
        rate: Number(item.base_rate ?? item.price ?? 0),
        availableCount: 1,
        itemIds: [Number(item.id)]
      });
    });

  return [...groups.values()].sort((left, right) => {
    const categoryCompare = String(left.category).localeCompare(String(right.category), 'ru');
    if (categoryCompare !== 0) return categoryCompare;
    return String(left.name).localeCompare(String(right.name), 'ru');
  });
}

function getAvailableCountForEstimateItem(item = {}) {
  const key = getInventoryGroupKey(item.item_name, item.category);
  const matchingGroup = getCatalogInventoryGroups().find(group => group.key === key);
  return Math.max(1, Number(matchingGroup?.availableCount || 0));
}

function getEstimateCatalogItems(search = '', category = 'all') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const normalizedCategory = String(category || 'all');

  return getCatalogInventoryGroups().filter(group => {
    if (normalizedCategory !== 'all' && String(group.category || '') !== normalizedCategory) return false;
    if (!normalizedSearch) return true;
    return String(group.name || '').toLowerCase().includes(normalizedSearch);
  });
}

function getEstimateCatalogSelectionSet() {
  return new Set((state.estimateCatalogSelection || []).map(value => Number(value)));
}

function setEstimateCatalogSelection(selection) {
  state.estimateCatalogSelection = [...new Set(selection.map(value => Number(value)).filter(Boolean))];
}

function clearEstimateCatalogSelection() {
  state.estimateCatalogSelection = [];
}

function syncEstimateCatalogSelection() {
  const allowedIds = new Set(getCatalogInventoryGroups().map(item => Number(item.representativeId || 0)).filter(Boolean));
  setEstimateCatalogSelection(
    (state.estimateCatalogSelection || []).filter(value => allowedIds.has(Number(value)))
  );
}

function updateEstimateCatalogSelectionSummary(items = []) {
  const selection = getEstimateCatalogSelectionSet();
  const selectedVisibleCount = items.filter(item => selection.has(Number(item.representativeId))).length;
  const selectedTotalCount = selection.size;
  const summary = document.getElementById('estimateCatalogSelectionSummary');
  const addSelectedButton = document.getElementById('estimateCatalogAddSelected');
  const clearButton = document.getElementById('estimateCatalogClearSelection');
  const selectAllButton = document.getElementById('estimateCatalogSelectAll');

  if (summary) {
    summary.textContent = selectedTotalCount
      ? `Выбрано позиций: ${selectedTotalCount}${selectedVisibleCount !== selectedTotalCount ? ` · на экране: ${selectedVisibleCount}` : ''}`
      : 'Можно отметить несколько позиций и добавить их одним действием.';
  }

  if (addSelectedButton) addSelectedButton.disabled = selectedTotalCount === 0;
  if (clearButton) clearButton.disabled = selectedTotalCount === 0;
  if (selectAllButton) selectAllButton.disabled = items.length === 0;
}

function toggleEstimateCatalogSelection(itemId, checked) {
  const selection = getEstimateCatalogSelectionSet();
  if (checked) selection.add(Number(itemId));
  else selection.delete(Number(itemId));

  setEstimateCatalogSelection([...selection]);
  updateEstimateCatalogSelectionSummary(getEstimateCatalogItems(
    document.getElementById('estimateCatalogSearch')?.value || '',
    document.getElementById('estimateCatalogCategory')?.value || 'all'
  ));
}

function selectAllEstimateCatalogItems() {
  const items = getEstimateCatalogItems(
    document.getElementById('estimateCatalogSearch')?.value || '',
    document.getElementById('estimateCatalogCategory')?.value || 'all'
  );
  const selection = getEstimateCatalogSelectionSet();
  items.forEach(item => selection.add(Number(item.representativeId)));
  setEstimateCatalogSelection([...selection]);
  renderEstimateCatalogModal();
}

function getEstimateCategories(items = []) {
  const categories = new Set(ESTIMATE_CATEGORY_ORDER);

  state.items.forEach(item => {
    if (item?.category) categories.add(item.category);
  });

  items.forEach(item => {
    if (item?.category) categories.add(item.category);
  });

  return [...categories].sort((left, right) => {
    const leftIndex = ESTIMATE_CATEGORY_ORDER.indexOf(left);
    const rightIndex = ESTIMATE_CATEGORY_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return String(left).localeCompare(String(right), 'ru');
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
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
  updateProjectTaxFieldVisibility('rental');
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

    const taxPayload = readProjectTaxForm('rental');
    const discountPercent = Math.min(100, Math.max(0, Number(document.getElementById('rentalDiscount').value || 0)));

    await apiPost('/projects', {
      name: projectName,
      client: clientSelect?.value ? selectedClientName : null,
      start_date: startDate,
      end_date: endDate,
      status: mapLegacyProjectStatus(document.getElementById('rentalStatus').value),
      discount_percent: discountPercent,
      ...taxPayload
    });

    document.getElementById('rentalTitle').value = '';
    document.getElementById('rentalStart').value = '';
    document.getElementById('rentalEnd').value = '';
    document.getElementById('rentalStatus').value = 'draft';
    document.getElementById('rentalDiscount').value = '0';
    document.getElementById('rentalTaxProfile').value = 'none';
    document.getElementById('rentalTaxCustom').value = '0';
    updateProjectTaxFieldVisibility('rental');

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
    const discountPercent = Math.min(100, Math.max(0, Number(document.getElementById('projectModalDiscount').value || 0)));
    const taxPayload = readProjectTaxForm('projectModal');

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
      status,
      discount_percent: discountPercent,
      ...taxPayload
    });

    const estimates = getProjectEstimates(rental.id);
    await Promise.all(
      estimates.map(estimate =>
        apiPut(`/estimates/${estimate.id}`, {
          project_id: Number(estimate.project_id || rental.id),
          estimate_number: estimate.estimate_number,
          title: estimate.title || null,
          start_date: toApiDate(startDate),
          end_date: toApiDate(endDate),
          discount_percent: discountPercent,
          tax_enabled: Number(taxPayload.tax_percent || 0) > 0,
          tax_percent: Number(taxPayload.tax_percent || 0)
        })
      )
    );

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
    <div class="field-group">
      <span class="field-label">Налог проекта</span>
      <select id="projectModalTaxProfile" onchange="updateProjectTaxFieldVisibility('projectModal')">
        ${renderProjectTaxOptions(rental.tax_profile)}
      </select>
    </div>
    <label class="field-group">
      <span class="field-label">Скидка проекта, %</span>
      <input id="projectModalDiscount" type="number" step="0.01" min="0" max="100" value="${getProjectDiscountPercent(rental)}" />
    </label>
    <label class="field-group" id="projectModalTaxCustomField">
      <span class="field-label">Свой налог, %</span>
      <input id="projectModalTaxCustom" type="number" step="0.01" min="0" value="${getProjectTaxPercent(rental)}" />
    </label>
    <button class="primary full" onclick="saveProjectDetails()">Сохранить проект</button>
    <div id="projectModalStats" class="project-summary-grid full"></div>
  `;
  updateProjectTaxFieldVisibility('projectModal');

  const estimateSelect = document.getElementById('projectEstimateSelect');
  const estimatesBody = document.getElementById('projectEstimatesBody');
  const estimateMeta = document.getElementById('projectEstimateMeta');
  const projectShiftCount = getProjectShiftCount(rental);
  const projectDiscount = getProjectDiscountPercent(rental);

  estimateSelect.innerHTML = '<option value="">Загрузка смет...</option>';
  estimatesBody.innerHTML = '<tr><td colspan="5" class="empty">Загрузка смет...</td></tr>';
  estimateMeta.textContent = 'Загрузка смет...';

  const estimates = await loadProjectEstimates(rental.id);
  if (!estimates.length) {
    estimateSelect.innerHTML = '<option value="">Смет пока нет</option>';
    estimatesBody.innerHTML = '<tr><td colspan="5" class="empty">Для этого проекта пока нет смет.</td></tr>';
    estimateMeta.textContent = `Всего смет: 0 · Общая сумма: ${formatMoney(0)} · Смен по проекту: ${projectShiftCount}`;
    document.getElementById('projectModalStats').innerHTML = `
      <div class="card project-summary-card">
        <div class="card-label">Общая сумма проекта</div>
        <div class="card-value">${formatMoney(0)}</div>
      </div>
      <div class="card project-summary-card">
        <div class="card-label">Всего смет</div>
        <div class="card-value">0</div>
      </div>
      <div class="card project-summary-card">
        <div class="card-label">Смен по проекту</div>
        <div class="card-value">${projectShiftCount}</div>
      </div>
      <div class="card project-summary-card">
        <div class="card-label">Скидка проекта</div>
        <div class="card-value">${formatPercent(projectDiscount)}</div>
      </div>
      <div class="card project-summary-card">
        <div class="card-label">Налог проекта</div>
        <div class="card-value project-summary-tax">${getProjectTaxLabel(rental)}</div>
      </div>
    `;
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
        <td>${getEstimateShiftCount(estimate)}</td>
        <td>${formatMoney(estimate.subtotal || 0)}</td>
        <td>${formatMoney(estimate.grand_total || 0)}</td>
      </tr>
    `
    )
    .join('');

  const totals = getProjectEstimateTotals(estimates);
  estimateMeta.textContent = `Всего смет: ${totals.count} · Общая сумма: ${formatMoney(totals.total)} · Смен по проекту: ${projectShiftCount}`;
  document.getElementById('projectModalStats').innerHTML = `
    <div class="card project-summary-card">
      <div class="card-label">Общая сумма проекта</div>
      <div class="card-value">${formatMoney(totals.total)}</div>
    </div>
    <div class="card project-summary-card">
      <div class="card-label">Всего смет</div>
      <div class="card-value">${totals.count}</div>
    </div>
    <div class="card project-summary-card">
      <div class="card-label">Смен по проекту</div>
      <div class="card-value">${projectShiftCount}</div>
    </div>
    <div class="card project-summary-card">
      <div class="card-label">Скидка проекта</div>
      <div class="card-value">${formatPercent(projectDiscount)}</div>
    </div>
    <div class="card project-summary-card">
      <div class="card-label">Налог проекта</div>
      <div class="card-value project-summary-tax">${getProjectTaxLabel(rental)}</div>
    </div>
  `;
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
      discount_percent: getProjectDiscountPercent(rental),
      tax_enabled: getProjectTaxPercent(rental) > 0,
      tax_percent: getProjectTaxPercent(rental)
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
  const shifts = Math.max(1, getEstimateShiftCount(estimate));
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

async function syncEstimateItemsToProjectDates(estimate) {
  const expectedShifts = getEstimateShiftCount(estimate);
  const items = getEstimateItems(estimate);
  const itemsToSync = items.filter(item => Number(item.days || 0) !== expectedShifts);
  if (!itemsToSync.length) return estimate;

  await Promise.all(
    itemsToSync.map(item =>
      apiPut(`/estimate-items/${item.id}`, {
        category: item.category || 'Camera',
        item_name: item.item_name || item.name || 'Техника',
        quantity: Math.max(1, Number(item.quantity || 1)),
        price_per_unit: Number(item.price_per_unit || item.price || 0),
        days: expectedShifts,
        position_order: Number(item.position_order || 0),
        source_type: item.source_type || 'catalog',
        catalog_item_id: item.catalog_item_id || null,
        notes: item.notes || null
      })
    )
  );

  return loadEstimateDetails(estimate.id);
}

function buildEstimateTableRows(items, estimate) {
  const sortedItems = [...items].sort((left, right) => {
    const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'ru');
    if (categoryCompare !== 0) return categoryCompare;
    const nameCompare = String(left.item_name || '').localeCompare(String(right.item_name || ''), 'ru');
    if (nameCompare !== 0) return nameCompare;
    return Number(left.position_order || 0) - Number(right.position_order || 0);
  });

  const categories = getEstimateCategories(sortedItems);

  return categories
    .map(category => {
      const categoryItems = sortedItems.filter(item => String(item.category || 'Other') === String(category));
      const categoryHeader = `
        <tr class="estimate-category-row">
          <td colspan="7">
            <div class="estimate-category-header">
              <span>${escapeHtml(category || 'Без категории')}</span>
              <button class="secondary estimate-category-add" onclick='openEstimateCatalogModal(${JSON.stringify(String(category || "Other"))})'>Добавить технику</button>
            </div>
          </td>
        </tr>
      `;

      if (!categoryItems.length) {
        return `
          ${categoryHeader}
          <tr class="estimate-empty-category-row">
            <td colspan="7" class="empty">В этой категории пока нет техники.</td>
          </tr>
        `;
      }

      const categoryRows = categoryItems.map(item => {
        const calc = calculateEstimateItem(item, estimate);
        const availableCount = getAvailableCountForEstimateItem(item);

        return `
          <tr>
            <td><div class="estimate-cell-main estimate-cell-name">${escapeHtml(item.item_name || '-')}</div></td>
            <td>
              <div class="estimate-inline-stack">
                <div class="money-inline">
                  <input
                    id="estimate-item-price-${item.id}"
                    class="estimate-inline-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value="${calc.priceBeforeDiscount.toFixed(2)}"
                    onchange="updateEstimateItemInline(${item.id})"
                  />
                  <span class="money-inline-suffix">₽</span>
                </div>
              </div>
            </td>
            <td><div class="estimate-cell-main estimate-cell-number">${formatMoney(calc.priceAfterDiscount)}</div></td>
            <td>
              <div class="estimate-inline-stack estimate-inline-stack-qty">
                <input
                  id="estimate-item-quantity-${item.id}"
                  class="estimate-inline-input estimate-inline-qty"
                  type="number"
                  step="1"
                  min="1"
                  max="${availableCount}"
                  value="${calc.quantity}"
                  onchange="updateEstimateItemInline(${item.id})"
                />
                <span class="estimate-inline-hint">В базе: ${availableCount}</span>
              </div>
            </td>
            <td><div class="estimate-cell-main estimate-cell-number">${calc.shifts}</div></td>
            <td><div class="estimate-cell-main estimate-cell-number">${formatMoney(calc.total)}</div></td>
            <td>
              <div class="actions-inline table-actions-inline estimate-cell-main estimate-cell-actions">
                <button class="secondary" onclick="deleteEstimateItemRow(${item.id})">Удалить</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      return `${categoryHeader}${categoryRows}`;
    })
    .join('');
}

function renderEstimateModal() {
  const estimate = getActiveEstimate();
  if (!estimate || !state.activeRentalId) return;

  const rental = state.rentals.find(item => Number(item.id) === Number(state.activeRentalId));
  const items = getEstimateItems(estimate);

  document.getElementById('estimateModalTitle').textContent = getEstimateDisplayName(estimate);
  document.getElementById('estimateModalSubtitle').textContent = rental ? `Проект: ${rental.title || '-'}` : '';
  document.getElementById('estimateDiscount').value = String(Number(estimate.discount_percent || 0));
  document.getElementById('estimateDiscount').classList.add('estimate-discount-input');
  document.getElementById('estimateTaxInfo').textContent =
    totalsTaxLabel(getProjectTaxLabel(rental), estimate);

  const body = document.getElementById('estimateItemsBody');
  body.innerHTML = buildEstimateTableRows(items, estimate);

  const totals = calculateEstimateTotals(estimate, items);
  const taxLabel = totals.taxPercent > 0 ? `Включая налог (${getProjectTaxLabel(rental)})` : null;

  document.getElementById('estimateSummary').innerHTML = `
    <div class="card-label">Итоги сметы</div>
    <div class="estimate-summary-metric">
      <span>Период</span>
      <strong>${formatDateRange(estimate.start_date, estimate.end_date)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>Смен</span>
      <strong>${getEstimateShiftCount(estimate)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>Техника</span>
      <strong>${items.length}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>До скидки</span>
      <strong>${formatMoney(totals.subtotal)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>Скидка (${totals.discountPercent}%)</span>
      <strong>${formatMoney(totals.discountAmount)}</strong>
    </div>
    <div class="estimate-summary-metric">
      <span>После скидки</span>
      <strong>${formatMoney(totals.totalAfterDiscount)}</strong>
    </div>
    ${taxLabel ? `
      <div class="estimate-summary-metric">
        <span>${taxLabel}</span>
        <strong>${formatMoney(totals.taxAmount)}</strong>
      </div>
    ` : ''}
    <div class="estimate-summary-metric estimate-summary-total">
      <span>Итог</span>
      <strong>${formatMoney(totals.grandTotal)}</strong>
    </div>
  `;
}

function totalsTaxLabel(projectTaxLabel, estimate) {
  const taxPercent = Number(estimate?.tax_enabled ? estimate.tax_percent || 0 : 0);
  if (taxPercent <= 0) return 'Налог проекта: без налога';
  const fallbackLabel = `Налог проекта: ${projectTaxLabel || `+${taxPercent}%`}`;
  if (!projectTaxLabel || projectTaxLabel === 'Без налога') return fallbackLabel;
  return `${fallbackLabel} · применяется после скидки`;
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
    await syncEstimateItemsToProjectDates(state.activeEstimate);
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
  const rental = state.rentals.find(item => Number(item.id) === Number(state.activeRentalId));
  const taxPercent = getProjectTaxPercent(rental);

  try {
    const updated = await apiPut(`/estimates/${estimate.id}`, {
      project_id: Number(estimate.project_id),
      estimate_number: estimate.estimate_number,
      title: estimate.title || null,
      start_date: toApiDate(estimate.start_date),
      end_date: toApiDate(estimate.end_date),
      discount_percent: Math.min(100, Math.max(0, Number(document.getElementById('estimateDiscount').value || 0))),
      tax_enabled: taxPercent > 0,
      tax_percent: taxPercent
    });

    state.activeEstimate = updated;
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    alert(error.message);
  }
}

async function updateEstimateItemInline(itemId) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const item = getEstimateItems(estimate).find(entry => Number(entry.id) === Number(itemId));
  if (!item) return;

  const priceInput = document.getElementById(`estimate-item-price-${item.id}`);
  const quantityInput = document.getElementById(`estimate-item-quantity-${item.id}`);
  if (!priceInput || !quantityInput) return;

  const maxQuantity = getAvailableCountForEstimateItem(item);
  const nextPrice = Math.max(0, Number(priceInput.value || 0));
  const nextQuantity = Math.max(1, Number(quantityInput.value || 1));

  if (nextQuantity > maxQuantity) {
    quantityInput.value = String(Math.max(1, Number(item.quantity || 1)));
    alert(`Нельзя поставить больше ${maxQuantity} шт. — столько активных единиц есть в каталоге.`);
    return;
  }

  try {
    await apiPut(`/estimate-items/${item.id}`, {
      category: item.category || 'Camera',
      item_name: item.item_name || item.name || 'Техника',
      quantity: nextQuantity,
      price_per_unit: nextPrice,
      days: getEstimateShiftCount(estimate),
      position_order: Number(item.position_order || 0),
      source_type: item.source_type || 'catalog',
      catalog_item_id: item.catalog_item_id || null,
      notes: item.notes || null
    });

    await loadEstimateDetails(estimate.id);
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    priceInput.value = String(Number(item.price_per_unit || item.price || 0));
    quantityInput.value = String(Math.max(1, Number(item.quantity || 1)));
    alert(error.message);
  }
}

async function deleteEstimateItemRow(itemId) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const item = getEstimateItems(estimate).find(entry => Number(entry.id) === Number(itemId));
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

  const categories = getEstimateCategories();
  const currentCategory = categorySelect.value || 'all';
  categorySelect.innerHTML = ['<option value="all">Все категории</option>', ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join('');
  categorySelect.value = categories.includes(currentCategory) || currentCategory === 'all' ? currentCategory : 'all';

  const items = getEstimateCatalogItems(searchInput.value, categorySelect.value);
  syncEstimateCatalogSelection();
  const selection = getEstimateCatalogSelectionSet();
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Подходящая техника не найдена.</td></tr>';
    updateEstimateCatalogSelectionSummary(items);
    return;
  }

  body.innerHTML = items
    .map(item => `
      <tr>
        <td>
          <label class="catalog-item-checkbox">
            <input
              type="checkbox"
              ${selection.has(Number(item.representativeId)) ? 'checked' : ''}
              onchange="toggleEstimateCatalogSelection(${item.representativeId}, this.checked)"
            />
          </label>
        </td>
        <td>
          <div class="catalog-item-name">${escapeHtml(item.name || '-')}</div>
          <div class="catalog-item-meta">В базе: ${item.availableCount} шт.</div>
        </td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td>${formatMoney(item.rate || 0)}</td>
        <td><button class="secondary" onclick="addCatalogItemToEstimate(${item.representativeId})">Добавить</button></td>
      </tr>
    `)
    .join('');

  updateEstimateCatalogSelectionSummary(items);
}

function openEstimateCatalogModal(category = 'all') {
  const estimate = getActiveEstimate();
  if (!estimate) {
    alert('Сначала открой смету.');
    return;
  }

  const searchInput = document.getElementById('estimateCatalogSearch');
  const categorySelect = document.getElementById('estimateCatalogCategory');
  clearEstimateCatalogSelection();
  if (searchInput) searchInput.value = '';
  if (categorySelect) categorySelect.value = category || 'all';
  renderEstimateCatalogModal();
  document.getElementById('estimateCatalogOverlay').classList.add('open');
}

function closeEstimateCatalogModal() {
  const overlay = document.getElementById('estimateCatalogOverlay');
  clearEstimateCatalogSelection();
  if (overlay) overlay.classList.remove('open');
}

function getEstimateCatalogOperation(estimate, sourceItem) {
  if (!sourceItem) {
    throw new Error('Не удалось найти технику в каталоге.');
  }

  const existingRow = getEstimateItems(estimate).find(item =>
    String(item.source_type || 'catalog') === 'catalog' &&
    getInventoryGroupKey(item.item_name, item.category) === getInventoryGroupKey(sourceItem.name, sourceItem.category)
  );

  if (existingRow) {
    const availableCount = getAvailableCountForEstimateItem(existingRow);
    const nextQuantity = Math.max(1, Number(existingRow.quantity || 1)) + 1;

    if (nextQuantity > availableCount) {
      throw new Error(`Нельзя добавить больше ${availableCount} шт. — столько активных единиц есть в каталоге.`);
    }

    return {
      type: 'update',
      path: `/estimate-items/${existingRow.id}`,
      payload: {
        category: existingRow.category || sourceItem.category || 'Camera',
        item_name: existingRow.item_name || sourceItem.name || 'Техника',
        quantity: nextQuantity,
        price_per_unit: Number(existingRow.price_per_unit || sourceItem.base_rate || sourceItem.price || 0),
        days: getEstimateShiftCount(estimate),
        position_order: Number(existingRow.position_order || 0),
        source_type: existingRow.source_type || 'catalog',
        catalog_item_id: existingRow.catalog_item_id || Number(sourceItem.id),
        notes: existingRow.notes || null
      }
    };
  }

  return {
    type: 'create',
    path: `/estimates/${estimate.id}/items`,
    payload: {
      category: sourceItem.category || 'Camera',
      item_name: sourceItem.name || 'Техника',
      quantity: 1,
      price_per_unit: Number(sourceItem.base_rate ?? sourceItem.price ?? 0),
      days: getEstimateShiftCount(estimate),
      source_type: 'catalog',
      catalog_item_id: Number(sourceItem.id),
      notes: null
    }
  };
}

async function applyEstimateCatalogOperation(operation) {
  if (!operation) return;

  if (operation.type === 'update') {
    await apiPut(operation.path, operation.payload);
    return;
  }

  await apiPost(operation.path, operation.payload);
}

async function addCatalogItemToEstimate(itemId) {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const sourceItem = state.items.find(item => Number(item.id) === Number(itemId));

  try {
    const operation = getEstimateCatalogOperation(estimate, sourceItem);
    await applyEstimateCatalogOperation(operation);
    closeEstimateCatalogModal();
    await loadEstimateDetails(estimate.id);
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
  } catch (error) {
    alert(error.message);
  }
}

async function addSelectedCatalogItemsToEstimate() {
  const estimate = getActiveEstimate();
  if (!estimate) return;

  const selectedIds = state.estimateCatalogSelection || [];
  if (!selectedIds.length) {
    alert('Сначала отметь хотя бы одну позицию.');
    return;
  }

  try {
    const operations = selectedIds.map(itemId => {
      const sourceItem = state.items.find(item => Number(item.id) === Number(itemId));
      return getEstimateCatalogOperation(estimate, sourceItem);
    });

    for (const operation of operations) {
      await applyEstimateCatalogOperation(operation);
    }

    await loadEstimateDetails(estimate.id);
    closeEstimateCatalogModal();
    await renderProjectModal(state.activeRentalId);
    renderEstimateModal();
    alert(`В смету добавлено позиций: ${selectedIds.length}`);
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
window.renderEstimateCatalogModal = renderEstimateCatalogModal;
window.clearEstimateCatalogSelection = clearEstimateCatalogSelection;
window.toggleEstimateCatalogSelection = toggleEstimateCatalogSelection;
window.selectAllEstimateCatalogItems = selectAllEstimateCatalogItems;
window.addCatalogItemToEstimate = addCatalogItemToEstimate;
window.addSelectedCatalogItemsToEstimate = addSelectedCatalogItemsToEstimate;
window.updateEstimateItemInline = updateEstimateItemInline;

setupNavigation();
setupProjectDateGuard();
resetItemForm();
loadAllData({ silent: true });
