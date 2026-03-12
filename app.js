const API = '/api';

const state = {
  items: [],
  rentals: [],
  clients: [],
  transactions: [],
  financeSummary: null,
  payback: [],
  estimatesByRental: {},
  activeRentalId: null
};

function formatMoney(value) {
  const num = Number(value || 0);
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num)} ₽`;
}

function formatPercent(value) {
  const num = Number(value || 0);
  return `${num.toFixed(1)}%`;
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

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`Ошибка загрузки: ${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка сохранения');
  }

  return data;
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

async function loadAllData() {
  try {
    const [items, rentals, clients, transactions, financeSummary, payback] = await Promise.all([
      apiGet('/items'),
      apiGet('/rentals'),
      apiGet('/clients'),
      apiGet('/transactions'),
      apiGet('/finance/summary'),
      apiGet('/finance/item-payback')
    ]);

    state.items = Array.isArray(items) ? items : [];
    state.rentals = Array.isArray(rentals) ? rentals : [];
    state.clients = Array.isArray(clients) ? clients : [];
    state.transactions = Array.isArray(transactions) ? transactions : [];
    state.financeSummary = financeSummary || {};
    state.payback = (Array.isArray(payback) ? payback : []).map(normalizePaybackItem);

    renderAll();
    notifyDataLoaded();
  } catch (error) {
    alert(error.message);
    console.error(error);
  }
}

function renderAll() {
  renderSummaryCards();
  renderDashboardPayback();
  renderDashboardNotes();
  renderItems();
  renderProjects();
  renderClients();
  renderTransactions();
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
    body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет техники.</td></tr>';
    return;
  }

  body.innerHTML = state.items
    .map(
      item => `
      <tr>
        <td>${item.name || '-'}</td>
        <td>${item.category || '-'}</td>
        <td>${formatMoney(item.base_rate || item.price)}</td>
        <td>${getStatusPill(item.status)}</td>
        <td>${formatMoney(item.revenue_total)}</td>
        <td>${formatPercent(item.payback_percent)}</td>
      </tr>
    `
    )
    .join('');
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

      return `
        <tr class="project-row" onclick="openProjectModal(${Number(rental.id)})">
          <td>${rental.title || '-'}</td>
          <td>${client ? client.name : '-'}</td>
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

function fillSelects() {
  const clientOptions = ['<option value="">Без клиента</option>']
    .concat(state.clients.map(c => `<option value="${c.id}">${c.name}</option>`))
    .join('');
  document.getElementById('rentalClient').innerHTML = clientOptions;

  const rentalOptions = ['<option value="">Не выбрано</option>']
    .concat(state.rentals.map(r => `<option value="${r.id}">${r.title}</option>`))
    .join('');
  document.getElementById('txRental').innerHTML = rentalOptions;

  const itemOptions = ['<option value="">Не выбрано</option>']
    .concat(state.items.map(i => `<option value="${i.id}">${i.name}</option>`))
    .join('');
  document.getElementById('txItem').innerHTML = itemOptions;
  document.getElementById('modalRiItem').innerHTML = itemOptions;

  if (state.activeRentalId) {
    renderProjectModal(state.activeRentalId);
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
    await apiPost('/items', {
      name: document.getElementById('itemName').value.trim(),
      category: document.getElementById('itemCategory').value.trim(),
      price: Number(document.getElementById('itemPrice').value || 0),
      base_rate: Number(document.getElementById('itemBaseRate').value || 0),
      purchase_price: Number(document.getElementById('itemPurchasePrice').value || 0),
      purchase_date: document.getElementById('itemPurchaseDate').value || null,
      status: document.getElementById('itemStatus').value,
      owner_type: document.getElementById('itemOwnerType').value,
      serial_number: document.getElementById('itemSerial').value.trim()
    });

    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemBaseRate').value = '';
    document.getElementById('itemPurchasePrice').value = '';
    document.getElementById('itemPurchaseDate').value = '';
    document.getElementById('itemSerial').value = '';

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

    await apiPost('/rentals', {
      client_id: document.getElementById('rentalClient').value || null,
      title: document.getElementById('rentalTitle').value.trim(),
      start_date: startDate,
      end_date: endDate,
      status: document.getElementById('rentalStatus').value
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
  estimateSelect.innerHTML = estimates
    .map(estimate => `<option value="${estimate.id}">${estimate.name}</option>`)
    .join('');

  document.getElementById('projectEstimatesBody').innerHTML = estimates
    .map(
      estimate => `
      <tr>
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
  renderProjectModal(state.activeRentalId);
  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
}

function createEstimate() {
  if (!state.activeRentalId) return;

  const name = prompt('Название новой сметы', `Смета ${ensureRentalEstimates(state.activeRentalId).length + 1}`);
  if (!name || !name.trim()) return;

  const estimates = ensureRentalEstimates(state.activeRentalId);
  estimates.push({
    id: `${state.activeRentalId}-${Date.now()}`,
    name: name.trim(),
    created_at: new Date().toISOString()
  });

  renderProjectModal(state.activeRentalId);
}

async function addRentalItemFromModal() {
  try {
    if (!state.activeRentalId) {
      alert('Сначала открой проект из таблицы.');
      return;
    }

    const estimateSelect = document.getElementById('projectEstimateSelect');
    const estimateName = estimateSelect.options[estimateSelect.selectedIndex]?.text || 'Основная смета';
    const rawNote = document.getElementById('modalRiNote').value.trim();
    const note = `[Смета: ${estimateName}]${rawNote ? ` ${rawNote}` : ''}`;

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

      closeSidebar();
    });
  });

  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeProjectModal();
      closeSidebar();
    }
  });

  document.getElementById('projectModalOverlay').addEventListener('click', event => {
    if (event.target.id === 'projectModalOverlay') closeProjectModal();
  });
}


window.crmApp = {
  getState: () => state,
  formatMoney,
  formatPercent,
  normalizePaybackItem,
  openProjectModal
};

setupNavigation();
setupProjectDateGuard();
loadAllData();
