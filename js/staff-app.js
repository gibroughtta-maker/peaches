(function () {
  let customers = [];
  let selectedCustomer = null;
  let vouchers = [];
  let selectedVoucher = null;

  function setText(selector, text, root) {
    (root || document).querySelectorAll(selector).forEach((node) => {
      node.textContent = text;
    });
  }

  function initials(name) {
    return window.PeachesData?.initials(name) || "??";
  }

  function renderCustomerRow(customer) {
    return `
      <div class="client-row" data-customer-id="${customer.id}">
        <div class="client-av">${initials(customer.full_name)}</div>
        <div class="client-info">
          <div class="client-name">${customer.full_name}</div>
          <div class="client-phone">${customer.phone}</div>
        </div>
        <div class="client-pts"><div class="pts-big">${customer.points}</div><div class="pts-tiny">pts</div></div>
        <span class="chevron">&gt;</span>
      </div>
    `;
  }

  function renderTransaction(tx) {
    const positive = tx.points_delta >= 0;
    const sign = positive ? "+" : "";
    const date = tx.created_at
      ? new Date(tx.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";
    return `
      <li class="tx-item">
        <div class="tx-dot ${positive ? "plus" : "minus"}"></div>
        <div class="tx-info"><div class="tx-name">${tx.note || (positive ? "Points added" : "Reward redeemed")}</div><div class="tx-meta">${date}</div></div>
        <div class="tx-pts ${positive ? "plus" : "minus"}">${sign}${tx.points_delta}</div>
      </li>
    `;
  }

  function renderVoucher(voucher) {
    const unlocked = selectedCustomer && selectedCustomer.points >= voucher.points_cost;
    const meta = voucher.retail_value
      ? `Worth £${Number(voucher.retail_value).toFixed(2)} · ${voucher.valid_months || 6} month voucher`
      : (voucher.description || "Peaches reward");
    return `
      <div class="voucher-card ${selectedVoucher?.id === voucher.id ? "selected" : ""}" data-voucher-id="${voucher.id}" style="${unlocked ? "" : "opacity:.45;cursor:default;"}">
        <div class="voucher-emoji" style="${unlocked ? "" : "filter:grayscale(1);"}">${voucher.emoji || "*"}</div>
        <div class="voucher-info">
          <div class="voucher-name">${voucher.name}</div>
          <div class="voucher-desc">${meta}</div>
        </div>
        <div class="voucher-cost">
          <div class="voucher-pts">${voucher.points_cost}</div>
          <div class="voucher-pts-label">pts</div>
        </div>
        <div class="check-circle">OK</div>
      </div>
    `;
  }

  async function refreshSelectedCustomer() {
    if (!selectedCustomer) return;
    const [fresh, transactions] = await Promise.all([
      window.peachesData.getCustomer(selectedCustomer.id),
      window.peachesData.listTransactions(selectedCustomer.id, 10),
    ]);
    selectedCustomer = fresh;
    renderClientDetail(transactions);
    renderDashboard(customers.map((customer) => (
      customer.id === fresh.id ? fresh : customer
    )));
  }

  function renderClientDetail(transactions) {
    if (!selectedCustomer) return;
    setText("#client-detail .detail-title", selectedCustomer.full_name);
    setText("#client-detail .detail-sub", selectedCustomer.phone);
    setText("#client-detail .pts-band-val", String(selectedCustomer.points));
    setText(".found-name", selectedCustomer.full_name);
    setText(".found-pts", `Current balance: ${selectedCustomer.points} pts`);
    setText("#voucher-screen .detail-sub", `${selectedCustomer.full_name} - ${selectedCustomer.points} pts available`);

    const txList = document.querySelector("#client-detail .tx-list");
    if (txList) {
      txList.innerHTML = transactions.length
        ? transactions.map(renderTransaction).join("")
        : `<li class="tx-item"><div class="tx-info"><div class="tx-name">No point history yet</div><div class="tx-meta">This customer has no transactions.</div></div><div class="tx-pts plus">0</div></li>`;
    }

    renderVouchers();
  }

  function renderDashboard(nextCustomers) {
    customers = nextCustomers;
    const list = document.querySelector("#dashboard .client-list");
    if (!list) return;
    list.innerHTML = customers.map(renderCustomerRow).join("");
    list.querySelectorAll(".client-row").forEach((row) => {
      row.addEventListener("click", async () => {
        selectedCustomer = customers.find((customer) => customer.id === row.dataset.customerId);
        const transactions = await window.peachesData.listTransactions(selectedCustomer.id, 10);
        renderClientDetail(transactions);
        window.show?.("client-detail");
      });
    });

    setText("#dashboard .stat-card-num", String(customers.length), document.querySelector("#dashboard .stat-card"));
  }

  async function selectCustomerById(customerId) {
    if (!customerId) return false;
    selectedCustomer = customers.find((customer) => customer.id === customerId)
      || await window.peachesData.getCustomer(customerId);
    if (!selectedCustomer) return false;
    const transactions = await window.peachesData.listTransactions(selectedCustomer.id, 10);
    renderClientDetail(transactions);
    window.show?.("client-detail");
    return true;
  }

  function renderVouchers() {
    const lists = document.querySelectorAll("#voucher-screen .voucher-list");
    if (!lists.length) return;
    lists[0].innerHTML = vouchers
      .filter((voucher) => !selectedCustomer || selectedCustomer.points >= voucher.points_cost)
      .map(renderVoucher)
      .join("") || `<div style="font-size:12px;color:var(--text-light);">No unlocked rewards.</div>`;
    if (lists[1]) {
      lists[1].innerHTML = vouchers
        .filter((voucher) => selectedCustomer && selectedCustomer.points < voucher.points_cost)
        .map(renderVoucher)
        .join("");
    }

    document.querySelectorAll("#voucher-screen .voucher-card[data-voucher-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const voucher = vouchers.find((item) => item.id === card.dataset.voucherId);
        if (!selectedCustomer || selectedCustomer.points < voucher.points_cost) return;
        selectedVoucher = voucher;
        renderVouchers();
        const btn = document.getElementById("redeem-btn");
        if (btn) btn.textContent = `Redeem - ${voucher.name} (-${voucher.points_cost} pts)`;
      });
    });
  }

  async function init() {
    if (document.body.dataset.requiredRole !== "therapist" || !window.peachesData) return;

    const [nextCustomers, nextVouchers] = await Promise.all([
      window.peachesData.listCustomers(),
      window.peachesData.listActiveVouchers(),
    ]);
    vouchers = nextVouchers;
    selectedCustomer = nextCustomers[0] || null;
    selectedVoucher = null;
    renderDashboard(nextCustomers);
    const scannedCustomerId = new URLSearchParams(window.location.search).get("customer");
    const openedScannedCustomer = scannedCustomerId && await selectCustomerById(scannedCustomerId);
    if (!openedScannedCustomer && selectedCustomer) {
      await refreshSelectedCustomer();
    }

    const searchInput = document.querySelector("#dashboard .search-wrap input");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const term = searchInput.value.trim().toLowerCase();
        renderDashboard(nextCustomers.filter((customer) =>
          customer.full_name.toLowerCase().includes(term) || customer.phone.toLowerCase().includes(term),
        ));
      });
    }

    const confirmButton = document.querySelector(".btn-confirm");
    if (confirmButton) {
      confirmButton.addEventListener("click", async (event) => {
        event.preventDefault();
        const pointsInput = document.querySelector(".pts-input-wrap input");
        const noteInput = document.querySelector(".note-input");
        confirmButton.disabled = true;
        try {
          await window.peachesData.addPoints({
            customerId: selectedCustomer?.id,
            delta: Number(pointsInput?.value || 0),
            note: noteInput?.value || "Points added",
          });
          await refreshSelectedCustomer();
          window.show?.("client-detail");
        } catch (error) {
          alert(error.message);
        } finally {
          confirmButton.disabled = false;
        }
      });
    }

    const redeemButton = document.getElementById("redeem-btn");
    if (redeemButton) {
      redeemButton.addEventListener("click", async (event) => {
        event.preventDefault();
        redeemButton.disabled = true;
        try {
          await window.peachesData.redeemVoucher({
            customerId: selectedCustomer?.id,
            voucher: selectedVoucher,
          });
          selectedVoucher = null;
          await refreshSelectedCustomer();
          window.show?.("client-detail");
        } catch (error) {
          alert(error.message);
        } finally {
          redeemButton.disabled = false;
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => console.error(error));
  });
})();
