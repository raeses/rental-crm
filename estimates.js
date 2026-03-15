const ebState = {
  projects: [],
  estimates: [],
  currentEstimate: null,
  items: []
};

const ESTIMATE_API = window.APP_CONFIG?.apiBase || '/api';
let estimateBuilderInitialized = false;
let estimateProjectsPromise = null;

const CATEGORY_OPTIONS = [
  'Camera',
  'Camera Accessories',
  'Camera Support',
  'Lenses and Filters',
  'Monitors and Playback',
  'Personnel',
  'Logistics'
];

function money(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value || 0))} ₽`;
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

async function req(path, options = {}) {
  const nextPath = path.startsWith('http') ? path : `${ESTIMATE_API}${path.replace(/^\/api/, '')}`;
  const res = await fetch(nextPath, { credentials: 'same-origin', ...options });
  const isPdf = res.headers.get('content-type')?.includes('application/pdf');
  if (!res.ok) {
    const payload = isPdf ? {} : await res.json().catch(() => ({}));
    if (res.status === 401 && window.APP_CONFIG?.loginPath) {
      window.location.replace(window.APP_CONFIG.loginPath);
    }
    throw new Error(payload.error || `Request failed: ${path}`);
  }
  return isPdf ? res.blob() : res.json();
}

function calcRow(item) {
  const kit_total = round2(Number(item.quantity || 0) * Number(item.price_per_unit || 0));
  const line_total = round2(kit_total * Number(item.days || 0));
  return { ...item, kit_total, line_total };
}

function calcTotals() {
  const subtotal = round2(ebState.items.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const discount_percent = Number(document.getElementById('ebDiscountPercent').value || 0);
  const discount_amount = round2(subtotal * discount_percent / 100);
  const total_after_discount = round2(subtotal - discount_amount);
  const tax_enabled = document.getElementById('ebTaxEnabled').checked;
  const tax_percent = Number(document.getElementById('ebTaxPercent').value || 0);
  const tax_amount = tax_enabled ? round2(total_after_discount * tax_percent / 100) : 0;
  const grand_total = round2(total_after_discount + tax_amount);

  document.getElementById('ebTotals').innerHTML = `
    <div class="card-label">Totals</div>
    <div class="muted">Subtotal: ${money(subtotal)}</div>
    <div class="muted">Discount amount: ${money(discount_amount)}</div>
    <div class="muted">After discount: ${money(total_after_discount)}</div>
    ${tax_enabled ? `<div class="muted">Tax amount: ${money(tax_amount)}</div>` : ''}
    <div><strong>GRAND TOTAL: ${money(grand_total)}</strong></div>
  `;

  return { subtotal, discount_percent, discount_amount, total_after_discount, tax_enabled, tax_percent, tax_amount, grand_total };
}

function renderRows() {
  const body = document.getElementById('ebItemsBody');
  if (!ebState.items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Добавьте первую позицию сметы.</td></tr>';
    calcTotals();
    return;
  }

  const grouped = [];
  CATEGORY_OPTIONS.forEach(category => {
    const rows = ebState.items.filter(item => item.category === category);
    if (rows.length) {
      grouped.push({ type: 'cat', category });
      rows.forEach(row => grouped.push({ type: 'item', row }));
    }
  });

  body.innerHTML = grouped.map(entry => {
    if (entry.type === 'cat') {
      return `<tr><td colspan="7"><strong>${entry.category}</strong></td></tr>`;
    }

    const idx = ebState.items.findIndex(item => item.__key === entry.row.__key);
    const row = entry.row;

    return `
      <tr>
        <td>
          <select onchange="estimateBuilder.changeCategory(${idx}, this.value)">
            ${CATEGORY_OPTIONS.map(opt => `<option value="${opt}" ${opt === row.category ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
          <input value="${row.item_name || ''}" onchange="estimateBuilder.changeField(${idx}, 'item_name', this.value)" />
        </td>
        <td><input type="number" min="1" value="${row.quantity}" onchange="estimateBuilder.changeField(${idx}, 'quantity', this.value)" /></td>
        <td><input type="number" min="0" step="0.01" value="${row.price_per_unit}" onchange="estimateBuilder.changeField(${idx}, 'price_per_unit', this.value)" /></td>
        <td>${money(row.kit_total)}</td>
        <td><input type="number" min="1" value="${row.days}" onchange="estimateBuilder.changeField(${idx}, 'days', this.value)" /></td>
        <td>${money(row.line_total)}</td>
        <td>
          <button class="secondary" onclick="estimateBuilder.duplicateRow(${idx})">Duplicate row</button>
          <button class="secondary" onclick="estimateBuilder.moveRow(${idx}, -1)">↑</button>
          <button class="secondary" onclick="estimateBuilder.moveRow(${idx}, 1)">↓</button>
          <button class="secondary" onclick="estimateBuilder.deleteRow(${idx})">Delete row</button>
        </td>
      </tr>
    `;
  }).join('');

  calcTotals();
}

function hydrateEstimateMeta(estimate) {
  document.getElementById('ebEstimateNumber').value = estimate.estimate_number || '';
  document.getElementById('ebEstimateTitle').value = estimate.title || '';
  document.getElementById('ebEstimateStart').value = estimate.start_date ? String(estimate.start_date).slice(0, 10) : '';
  document.getElementById('ebEstimateEnd').value = estimate.end_date ? String(estimate.end_date).slice(0, 10) : '';
  document.getElementById('ebDiscountPercent').value = estimate.discount_percent || 0;
  document.getElementById('ebTaxEnabled').checked = Boolean(estimate.tax_enabled);
  document.getElementById('ebTaxPercent').value = estimate.tax_percent || 0;
}

function normalizeItems(items = []) {
  return items.map((item, idx) => calcRow({
    ...item,
    __key: item.id ? `db-${item.id}` : `tmp-${Date.now()}-${idx}`,
    category: item.category || 'Camera',
    item_name: item.item_name || '',
    quantity: Number(item.quantity || 1),
    price_per_unit: Number(item.price_per_unit || 0),
    days: Number(item.days || 1),
    source_type: item.source_type || 'manual'
  }));
}

async function loadEstimate(id) {
  if (!id) {
    ebState.currentEstimate = null;
    ebState.items = [];
    renderRows();
    return;
  }

  const estimate = await req(`/estimates/${id}`);
  ebState.currentEstimate = estimate;
  hydrateEstimateMeta(estimate);
  ebState.items = normalizeItems(estimate.items || []);
  renderRows();
}

async function loadEstimatesByProject(projectId) {
  ebState.estimates = await req(`/projects/${projectId}/estimates`);
  const select = document.getElementById('ebEstimateSelect');
  select.innerHTML = ebState.estimates.map(e => `<option value="${e.id}">${e.estimate_number} ${e.title ? `— ${e.title}` : ''}</option>`).join('');
  await loadEstimate(select.value);
}

async function loadProjects() {
  if (estimateProjectsPromise) return estimateProjectsPromise;

  estimateProjectsPromise = (async () => {
    ebState.projects = await req('/projects');
    const projectSelect = document.getElementById('ebProjectSelect');
    projectSelect.innerHTML = ebState.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (projectSelect.value) await loadEstimatesByProject(projectSelect.value);
  })();

  try {
    return await estimateProjectsPromise;
  } finally {
    estimateProjectsPromise = null;
  }
}

function getEstimatePayload() {
  const totals = calcTotals();
  return {
    project_id: Number(document.getElementById('ebProjectSelect').value),
    estimate_number: document.getElementById('ebEstimateNumber').value.trim(),
    title: document.getElementById('ebEstimateTitle').value.trim(),
    start_date: document.getElementById('ebEstimateStart').value || null,
    end_date: document.getElementById('ebEstimateEnd').value || null,
    discount_percent: Number(document.getElementById('ebDiscountPercent').value || 0),
    tax_enabled: document.getElementById('ebTaxEnabled').checked,
    tax_percent: Number(document.getElementById('ebTaxPercent').value || 0),
    ...totals
  };
}

async function upsertItems() {
  const estimateId = ebState.currentEstimate?.id;
  if (!estimateId) return;

  for (let i = 0; i < ebState.items.length; i += 1) {
    const row = ebState.items[i];
    const payload = {
      category: row.category,
      item_name: row.item_name,
      quantity: Number(row.quantity),
      price_per_unit: Number(row.price_per_unit),
      days: Number(row.days),
      position_order: i + 1,
      source_type: row.source_type || 'manual',
      catalog_item_id: row.catalog_item_id || null,
      notes: row.notes || null
    };

    if (row.id) {
      await req(`/estimate-items/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      const saved = await req(`/estimates/${estimateId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      row.id = saved.id;
      row.__key = `db-${saved.id}`;
    }
  }

  await req(`/estimates/${estimateId}/reorder-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: ebState.items.filter(i => i.id).map(i => i.id) })
  });
}

const estimateBuilder = {
  async loadProjects(options = {}) {
    const { silent = false } = options;
    try {
      await loadProjects();
    } catch (error) {
      if (!silent) alert(error.message);
    }
  },

  async createEstimatePrompt() {
    try {
      const projectId = Number(document.getElementById('ebProjectSelect').value || 0);
      if (!projectId) return;
      const estimateNumber = prompt('Estimate number', `${projectId}/${ebState.estimates.length + 1}`);
      if (!estimateNumber) return;

      const created = await req('/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          estimate_number: estimateNumber.trim(),
          title: 'Main Estimate',
          discount_percent: 0,
          tax_enabled: false,
          tax_percent: 0
        })
      });

      await loadEstimatesByProject(projectId);
      document.getElementById('ebEstimateSelect').value = String(created.id);
      await loadEstimate(created.id);
    } catch (error) {
      alert(error.message);
    }
  },

  addItem() {
    ebState.items.push(calcRow({
      __key: `tmp-${Date.now()}`,
      category: 'Camera',
      item_name: '',
      quantity: 1,
      price_per_unit: 0,
      days: 1,
      source_type: 'manual'
    }));
    renderRows();
  },

  addFromCatalog() {
    const crmState = window.crmApp?.getState?.() || { items: [] };
    if (!crmState.items.length) {
      alert('Каталог техники пуст.');
      return;
    }

    const first = crmState.items[0];
    ebState.items.push(calcRow({
      __key: `tmp-${Date.now()}`,
      category: first.category || 'Camera',
      item_name: first.name,
      quantity: 1,
      price_per_unit: Number(first.base_rate ?? first.price ?? 0),
      days: 1,
      source_type: 'catalog',
      catalog_item_id: first.id
    }));
    renderRows();
  },

  duplicateRow(index) {
    const source = ebState.items[index];
    if (!source) return;
    const copy = calcRow({ ...source, id: null, __key: `tmp-${Date.now()}-copy` });
    ebState.items.splice(index + 1, 0, copy);
    renderRows();
  },

  async deleteRow(index) {
    const row = ebState.items[index];
    if (!row) return;
    ebState.items.splice(index, 1);
    if (row.id) {
      await req(`/estimate-items/${row.id}`, { method: 'DELETE' });
    }
    renderRows();
  },

  moveRow(index, offset) {
    const next = index + offset;
    if (next < 0 || next >= ebState.items.length) return;
    const [row] = ebState.items.splice(index, 1);
    ebState.items.splice(next, 0, row);
    renderRows();
  },

  changeCategory(index, value) {
    if (!ebState.items[index]) return;
    ebState.items[index].category = value;
    renderRows();
  },

  changeField(index, field, value) {
    const row = ebState.items[index];
    if (!row) return;
    if (['quantity', 'price_per_unit', 'days'].includes(field)) row[field] = Number(value || 0);
    else row[field] = value;
    ebState.items[index] = calcRow(row);
    renderRows();
  },

  async saveEstimate() {
    try {
      if (!ebState.currentEstimate) {
        alert('Сначала выберите смету.');
        return;
      }

      const payload = getEstimatePayload();
      await req(`/estimates/${ebState.currentEstimate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await upsertItems();
      await loadEstimate(ebState.currentEstimate.id);
      alert('Смета сохранена');
    } catch (error) {
      alert(error.message);
    }
  },

  async archiveEstimate() {
    try {
      if (!ebState.currentEstimate) return;
      await req(`/estimates/${ebState.currentEstimate.id}/archive`, { method: 'POST' });
      await loadEstimatesByProject(document.getElementById('ebProjectSelect').value);
      alert('Смета архивирована');
    } catch (error) {
      alert(error.message);
    }
  },

  previewPdf() {
    if (!ebState.currentEstimate) return;
    window.open(`${ESTIMATE_API}/estimates/${ebState.currentEstimate.id}/pdf`, '_blank');
  },

  generatePdf() {
    if (!ebState.currentEstimate) return;
    window.open(`${ESTIMATE_API}/estimates/${ebState.currentEstimate.id}/pdf`, '_blank');
  }
};

window.estimateBuilder = estimateBuilder;

function initializeEstimateBuilder() {
  if (estimateBuilderInitialized) return;
  estimateBuilderInitialized = true;

  estimateBuilder.loadProjects({ silent: true });
}

document.addEventListener('DOMContentLoaded', () => {
  const projectSelect = document.getElementById('ebProjectSelect');
  const estimateSelect = document.getElementById('ebEstimateSelect');
  const discount = document.getElementById('ebDiscountPercent');
  const taxEnabled = document.getElementById('ebTaxEnabled');
  const taxPercent = document.getElementById('ebTaxPercent');

  if (projectSelect) {
    projectSelect.addEventListener('change', () => loadEstimatesByProject(projectSelect.value).catch(e => alert(e.message)));
  }
  if (estimateSelect) {
    estimateSelect.addEventListener('change', () => loadEstimate(estimateSelect.value).catch(e => alert(e.message)));
  }
  if (discount) discount.addEventListener('input', calcTotals);
  if (taxEnabled) taxEnabled.addEventListener('change', calcTotals);
  if (taxPercent) taxPercent.addEventListener('input', calcTotals);

  if (!document.getElementById('page-estimates')?.classList.contains('hidden')) {
    initializeEstimateBuilder();
  }
});

document.addEventListener('crm:page-change', event => {
  if (event.detail?.page === 'estimates') {
    initializeEstimateBuilder();
  }
});
