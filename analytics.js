
// ===== ANALYTICS: EQUIPMENT PAYBACK =====

async function loadEquipmentPayback() {
  const tableBody = document.getElementById("paybackTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "<tr><td colspan='6'>Загрузка...</td></tr>";

  try {
    const res = await fetch("/api/finance/item-payback");
    const data = await res.json();

    tableBody.innerHTML = "";

    data.forEach(item => {
      const payback = item.purchase_price > 0
        ? ((item.profit / item.purchase_price) * 100).toFixed(1)
        : 0;

      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${Number(item.purchase_price || 0).toLocaleString()}</td>
        <td>${Number(item.revenue || 0).toLocaleString()}</td>
        <td>${Number(item.expenses || 0).toLocaleString()}</td>
        <td>${Number(item.profit || 0).toLocaleString()}</td>
        <td>${payback}%</td>
      `;

      tableBody.appendChild(row);
    });

  } catch (error) {
    console.error("Payback load error:", error);
    tableBody.innerHTML = "<tr><td colspan='6'>Ошибка загрузки данных</td></tr>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadEquipmentPayback();
});
