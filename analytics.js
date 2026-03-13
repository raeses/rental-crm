// ===== ANALYTICS: EQUIPMENT PAYBACK =====

function renderAnalyticsPayback(paybackItems = []) {
  const tableBody = document.getElementById('paybackTableBody');
  if (!tableBody) return;

  if (!paybackItems.length) {
    tableBody.innerHTML = "<tr><td colspan='6' class='empty'>Пока нет данных для аналитики</td></tr>";
    return;
  }

  const { formatMoney, formatPercent } = window.crmApp || {};

  tableBody.innerHTML = paybackItems
    .map(
      item => `
      <tr>
        <td>${item.name || '-'}</td>
        <td>${formatMoney ? formatMoney(item.purchase_price) : Number(item.purchase_price || 0).toLocaleString()}</td>
        <td>${formatMoney ? formatMoney(item.revenue_total) : Number(item.revenue_total || 0).toLocaleString()}</td>
        <td>${formatMoney ? formatMoney(item.direct_expenses_total) : Number(item.direct_expenses_total || 0).toLocaleString()}</td>
        <td>${formatMoney ? formatMoney(item.profit_total) : Number(item.profit_total || 0).toLocaleString()}</td>
        <td>${formatPercent ? formatPercent(item.payback_percent) : `${Number(item.payback_percent || 0).toFixed(1)}%`}</td>
      </tr>
    `
    )
    .join('');
}

function syncAnalyticsFromAppState() {
  const appState = window.crmApp?.getState?.();
  renderAnalyticsPayback(appState?.payback || []);
}

document.addEventListener('crm:data-loaded', event => {
  renderAnalyticsPayback(event.detail?.payback || []);
});

document.addEventListener('DOMContentLoaded', () => {
  syncAnalyticsFromAppState();
});
