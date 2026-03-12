const API = '/api';

    const state = {
      items: [],
      rentals: [],
      clients: [],
      transactions: [],
      financeSummary: null,
      payback: []
    };

    function formatMoney(value) {
      const num = Number(value || 0);
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num) + ' ₽';
    }

    function formatPercent(value) {
      const num = Number(value || 0);
      return num.toFixed(1) + '%';
    }

    function getStatusPill(status) {
      const s = String(status || '').toLowerCase();
      let cls = 'yellow';
      if (['available', 'paid', 'active', 'confirmed'].includes(s)) cls = 'green';
      if (['unavailable', 'cancelled', 'unpaid', 'lost'].includes(s)) cls = 'red';
      return `<span class="pill ${cls}">${status || '-'}</span>`;
    }

    async function apiGet(path) {
      const res = await fetch(API + path);
      if (!res.ok) throw new Error('Ошибка загрузки: ' + path);
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
        state.payback = Array.isArray(payback) ? payback : [];

        renderAll();
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
      wrap.innerHTML = cards.map(([label, value]) => `
        <div class="card">
          <div class="card-label">${label}</div>
          <div class="card-value">${value}</div>
        </div>
      `).join('');
    }

    function renderDashboardPayback() {
      const body = document.getElementById('dashboardPaybackBody');
      if (!state.payback.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет данных по окупаемости.</td></tr>';
        return;
      }
      body.innerHTML = state.payback.slice(0, 8).map(item => `
        <tr>
          <td>${item.name || '-'}</td>
          <td>${formatMoney(item.purchase_price)}</td>
          <td>${formatMoney(item.revenue_total)}</td>
          <td>${formatMoney(item.direct_expenses_total)}</td>
          <td>${formatMoney(item.profit_total)}</td>
          <td>${formatPercent(item.payback_percent)}</td>
        </tr>
      `).join('');
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
      body.innerHTML = state.items.map(item => `
        <tr>
          <td>${item.name || '-'}</td>
          <td>${item.category || '-'}</td>
          <td>${formatMoney(item.base_rate || item.price)}</td>
          <td>${getStatusPill(item.status)}</td>
          <td>${formatMoney(item.revenue_total)}</td>
          <td>${formatPercent(item.payback_percent)}</td>
        </tr>
      `).join('');
    }

    function renderProjects() {
      const body = document.getElementById('projectsBody');
      if (!state.rentals.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет проектов.</td></tr>';
        return;
      }
      body.innerHTML = state.rentals.map(rental => {
        const client = state.clients.find(c => Number(c.id) === Number(rental.client_id));
        return `
          <tr>
            <td>${rental.title || '-'}</td>
            <td>${client ? client.name : '-'}</td>
            <td>${rental.start_date || '-'}<br><span class="muted">${rental.end_date || '-'}</span></td>
            <td>${formatMoney(rental.total)}</td>
            <td>${formatMoney(rental.paid_amount || 0)}</td>
            <td>${getStatusPill(rental.payment_status || rental.status)}</td>
          </tr>
        `;
      }).join('');
    }

    function renderClients() {
      const body = document.getElementById('clientsBody');
      if (!state.clients.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty">Пока нет клиентов.</td></tr>';
        return;
      }
      body.innerHTML = state.clients.map(client => `
        <tr>
          <td>${client.name || '-'}</td>
          <td>${client.phone || '-'}</td>
          <td>${client.note || '-'}</td>
        </tr>
      `).join('');
    }

    function renderTransactions() {
      const body = document.getElementById('transactionsBody');
      if (!state.transactions.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Пока нет операций.</td></tr>';
        return;
      }
      body.innerHTML = state.transactions.map(tx => {
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
      }).join('');
    }

    function fillSelects() {
      const clientOptions = ['<option value="">Без клиента</option>'].concat(
        state.clients.map(c => `<option value="${c.id}">${c.name}</option>`)
      ).join('');
      document.getElementById('rentalClient').innerHTML = clientOptions;

      const rentalOptions = ['<option value="">Не выбрано</option>'].concat(
        state.rentals.map(r => `<option value="${r.id}">${r.title}</option>`)
      ).join('');
      document.getElementById('riRental').innerHTML = rentalOptions;
      document.getElementById('txRental').innerHTML = rentalOptions;

      const itemOptions = ['<option value="">Не выбрано</option>'].concat(
        state.items.map(i => `<option value="${i.id}">${i.name}</option>`)
      ).join('');
      document.getElementById('riItem').innerHTML = itemOptions;
      document.getElementById('txItem').innerHTML = itemOptions;
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
        await apiPost('/rentals', {
          client_id: document.getElementById('rentalClient').value || null,
          title: document.getElementById('rentalTitle').value.trim(),
          start_date: document.getElementById('rentalStart').value || null,
          end_date: document.getElementById('rentalEnd').value || null,
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

    async function addRentalItem() {
      try {
        await apiPost('/rental-items', {
          rental_id: Number(document.getElementById('riRental').value),
          item_id: Number(document.getElementById('riItem').value),
          price: Number(document.getElementById('riPrice').value || 0),
          days: Number(document.getElementById('riDays').value || 1),
          quantity: Number(document.getElementById('riQty').value || 1),
          subrent_cost: Number(document.getElementById('riSubrentCost').value || 0),
          note: document.getElementById('riNote').value.trim()
        });
        document.getElementById('riPrice').value = '';
        document.getElementById('riDays').value = '1';
        document.getElementById('riQty').value = '1';
        document.getElementById('riSubrentCost').value = '0';
        document.getElementById('riNote').value = '';
        await loadAllData();
        alert('Техника добавлена в проект');
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

    function openSidebar() {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebarOverlay').classList.add('open');
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      const isOpen = sidebar.classList.contains('open');
      if (isOpen) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      } else {
        sidebar.classList.add('open');
        overlay.classList.add('open');
      }
    }

    function setupNavigation() {
      const navButtons = document.querySelectorAll('.nav button');
      navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          navButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const page = btn.dataset.page;
          document.querySelectorAll('main > section').forEach(section => section.classList.add('hidden'));
          document.getElementById('page-' + page).classList.remove('hidden');
          closeSidebar();
        });
      });

      document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
      document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeSidebar();
        }
      });
    }

    setupNavigation();
    loadAllData();
