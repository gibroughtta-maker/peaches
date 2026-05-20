(function () {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let profile = null;
  let customers = [];
  let filteredCustomers = [];
  let vouchers = [];
  let selectedCustomer = null;
  let selectedVoucher = null;
  let selectedVerifiedByScan = false;
  let selectedScanToken = null;
  let qrScanner = null;
  let scanning = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function setStatus(selector, message, tone) {
    const node = document.querySelector(selector);
    if (!node) return;
    node.textContent = message || "";
    node.dataset.tone = tone || "";
  }

  function initials(name) {
    return window.PeachesData?.initials(name) || "--";
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatRewardMeta(voucher) {
    const parts = [];
    if (voucher.retail_value) parts.push(`Worth &pound;${Number(voucher.retail_value).toFixed(2)}`);
    if (voucher.valid_months) parts.push(`${Number(voucher.valid_months)} month voucher`);
    return parts.join(" · ") || escapeHtml(voucher.description || "Peaches reward");
  }

  function extractCustomerScan(decoded) {
    if (!decoded) return null;
    const text = String(decoded).trim();
    if (UUID_REGEX.test(text)) return { customerId: text.toLowerCase(), qrToken: null };
    try {
      const payload = JSON.parse(text);
      const customerId = payload.customer_id || payload.customerId;
      const qrToken = payload.qr_token || payload.qrToken;
      if (customerId && qrToken && UUID_REGEX.test(customerId)) {
        return { customerId: customerId.toLowerCase(), qrToken: String(qrToken) };
      }
    } catch (error) {
      // QR codes may be URLs or plain UUIDs from older builds.
    }
    try {
      const url = new URL(text);
      const customerId = url.searchParams.get("customer") || url.searchParams.get("customer_id");
      const qrToken = url.searchParams.get("qr_token") || url.searchParams.get("token");
      if (customerId && qrToken && UUID_REGEX.test(customerId)) {
        return { customerId: customerId.toLowerCase(), qrToken };
      }
    } catch (error) {
      // Non-URL text is fine.
    }
    return null;
  }

  async function show(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("active", screen.id === screenId);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (screenId === "scan-screen") {
      await startScanner();
    } else {
      await stopScanner();
    }
  }

  async function stopScanner() {
    if (!qrScanner || !scanning) return;
    try {
      await qrScanner.stop();
    } catch (error) {
      // Camera may already be stopped by the browser.
    }
    scanning = false;
  }

  async function startScanner() {
    if (!window.Html5Qrcode) {
      setStatus("#scan-status", "QR scanner library did not load.", "error");
      return;
    }
    if (scanning) return;

    setStatus("#scan-status", "Starting camera...");
    if (!qrScanner) qrScanner = new window.Html5Qrcode("qr-reader");

    try {
      await qrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        onScanSuccess,
        () => {},
      );
      scanning = true;
      setStatus("#scan-status", "Point camera at the customer's QR code.");
    } catch (error) {
      setStatus("#scan-status", "Camera blocked. Allow camera access. Manual lookup can view a customer, but cannot add points.", "error");
    }
  }

  async function onScanSuccess(decodedText) {
    const scan = extractCustomerScan(decodedText);
    if (!scan?.customerId || !scan.qrToken) {
      setStatus("#scan-status", "QR code not recognised. Try the customer's Peaches QR.", "error");
      return;
    }
    await openCustomer(scan.customerId, { verifiedByScan: true, qrToken: scan.qrToken, navigateTo: "client-detail" });
  }

  function renderStaff() {
    const name = profile?.display_name || "Staff";
    const role = profile?.role || "therapist";
    setText("#staff-name", name);
    setText("#staff-avatar", initials(name));
    setText("#staff-meta", `${role} · Peaches`);
  }

  function renderStats(transactions) {
    const today = new Date().toISOString().slice(0, 10);
    const todayTx = transactions.filter((tx) => String(tx.created_at || "").slice(0, 10) === today);
    const earnedToday = todayTx
      .filter((tx) => tx.points_delta > 0)
      .reduce((sum, tx) => sum + Number(tx.points_delta || 0), 0);
    const visitsToday = new Set(todayTx.map((tx) => tx.customer_id)).size;
    const topPoints = customers.reduce((max, customer) => Math.max(max, Number(customer.points || 0)), 0);

    setText("#stat-clients", String(customers.length));
    setText("#stat-points", `+${earnedToday}`);
    setText("#stat-visits", String(visitsToday));
    setText("#stat-top", String(topPoints));
  }

  function clientRow(customer) {
    const verified = selectedVerifiedByScan && selectedCustomer?.id === customer.id;
    return `
      <button class="client-row ${verified ? "verified" : ""}" type="button" data-customer-id="${escapeHtml(customer.id)}">
        <span class="client-avatar">${escapeHtml(initials(customer.full_name))}</span>
        <span class="client-main">
          <span class="client-name">${escapeHtml(customer.full_name)}</span>
          <span class="client-sub">${escapeHtml(customer.phone || "")}</span>
        </span>
        <span>
          <span class="points">${Number(customer.points || 0)}</span>
          <span class="points-label">pts</span>
        </span>
      </button>
    `;
  }

  function renderCustomers(nextCustomers) {
    filteredCustomers = nextCustomers;
    const list = document.getElementById("customer-list");
    if (!list) return;

    setText("#customer-count", `${filteredCustomers.length} shown`);
    list.innerHTML = filteredCustomers.length
      ? filteredCustomers.map(clientRow).join("")
      : `<div class="empty-state">No customers found.</div>`;

    list.querySelectorAll("[data-customer-id]").forEach((row) => {
      row.addEventListener("click", () => {
        openCustomer(row.dataset.customerId, { verifiedByScan: false, navigateTo: "client-detail" })
          .catch((error) => setStatus("#dashboard-status", error.message, "error"));
      });
    });
  }

  function renderDetail(transactions) {
    if (!selectedCustomer) return;
    const balance = Number(selectedCustomer.points || 0);
    const verifiedLabel = selectedVerifiedByScan ? "QR verified" : "Not scanned";

    setText("#detail-name", selectedCustomer.full_name);
    setText("#detail-sub", selectedCustomer.phone || "Customer");
    setText("#detail-points", String(balance));
    setText("#verified-state", verifiedLabel);
    setText("#add-points-sub", `${selectedCustomer.full_name} · ${balance} pts`);
    setText("#voucher-sub", `${selectedCustomer.full_name} · ${balance} pts available`);

    const note = document.getElementById("scan-required-note");
    const addButton = document.getElementById("go-add-points");
    const redeemButton = document.getElementById("go-redeem");
    if (note) note.hidden = selectedVerifiedByScan;
    if (addButton) addButton.disabled = !selectedVerifiedByScan;
    if (redeemButton) redeemButton.disabled = !selectedVerifiedByScan;

    const txList = document.getElementById("transaction-list");
    if (txList) {
      txList.innerHTML = transactions.length
        ? transactions.map(renderTransaction).join("")
        : `<div class="empty-state">No point history yet.</div>`;
    }

    renderVouchers();
    renderCustomers(filteredCustomers.length ? filteredCustomers : customers);
  }

  function renderTransaction(tx) {
    const delta = Number(tx.points_delta || 0);
    const positive = delta >= 0;
    const sign = positive ? "+" : "";
    return `
      <div class="tx-item">
        <div>
          <div class="tx-name">${escapeHtml(tx.note || (positive ? "Points added" : "Voucher redeemed"))}</div>
          <div class="tx-meta">${escapeHtml(formatDate(tx.created_at))}</div>
        </div>
        <div class="tx-points ${positive ? "plus" : "minus"}">${sign}${delta}</div>
      </div>
    `;
  }

  function renderVouchers() {
    const list = document.getElementById("voucher-list");
    const button = document.getElementById("redeem-btn");
    if (!list || !button || !selectedCustomer) return;

    const balance = Number(selectedCustomer.points || 0);
    list.innerHTML = vouchers.length
      ? vouchers.map((voucher) => renderVoucher(voucher, balance)).join("")
      : `<div class="empty-state">No active vouchers configured.</div>`;

    list.querySelectorAll("[data-voucher-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const voucher = vouchers.find((item) => item.id === card.dataset.voucherId);
        if (!voucher || balance < Number(voucher.points_cost || 0)) return;
        selectedVoucher = voucher;
        renderVouchers();
      });
    });

    if (selectedVoucher && balance >= Number(selectedVoucher.points_cost || 0)) {
      button.disabled = false;
      button.textContent = `Redeem - ${selectedVoucher.description || selectedVoucher.name} (-${selectedVoucher.points_cost} pts)`;
    } else {
      selectedVoucher = null;
      button.disabled = true;
      button.textContent = "Choose Voucher";
    }
  }

  function renderVoucher(voucher, balance) {
    const cost = Number(voucher.points_cost || 0);
    const unlocked = balance >= cost;
    const selected = selectedVoucher?.id === voucher.id;
    const status = unlocked ? `${cost} pts` : `${Math.max(cost - balance, 0)} to go`;
    return `
      <button class="voucher-card ${unlocked ? "unlocked" : "locked"} ${selected ? "selected" : ""}" type="button" data-voucher-id="${escapeHtml(voucher.id)}" ${unlocked ? "" : "disabled"}>
        <span class="voucher-icon">${escapeHtml(voucher.emoji || "*")}</span>
        <span class="voucher-main">
          <span class="voucher-name">${escapeHtml(voucher.description || voucher.name)}</span>
          <span class="voucher-desc">${formatRewardMeta(voucher)}</span>
        </span>
        <span>
          <span class="points">${cost}</span>
          <span class="points-label">${escapeHtml(status)}</span>
        </span>
      </button>
    `;
  }

  function applyCustomerSearch() {
    const term = document.getElementById("customer-search")?.value.trim().toLowerCase() || "";
    const matches = customers.filter((customer) => (
      String(customer.full_name || "").toLowerCase().includes(term)
      || String(customer.phone || "").toLowerCase().includes(term)
    ));
    renderCustomers(matches);
  }

  async function openCustomer(customerId, options = {}) {
    const verifiedByScan = Boolean(options.verifiedByScan);
    if (!customerId || !UUID_REGEX.test(customerId)) {
      throw new Error("Enter a valid customer UUID.");
    }
    if (verifiedByScan && !options.qrToken) {
      throw new Error("Scan the customer's current QR code first.");
    }

    await stopScanner();
    const customer = customers.find((item) => item.id === customerId)
      || await window.peachesData.getCustomer(customerId);
    if (!customer) throw new Error("Customer was not found in Supabase.");

    selectedCustomer = customer;
    selectedVerifiedByScan = verifiedByScan;
    selectedScanToken = verifiedByScan ? options.qrToken || null : null;
    selectedVoucher = null;
    setStatus("#scan-status", verifiedByScan ? "Customer verified." : "");

    const transactions = await window.peachesData.listTransactions(customer.id, 20);
    renderDetail(transactions);
    resetForms();
    if (options.navigateTo) await show(options.navigateTo);
  }

  async function refreshSelectedCustomer() {
    if (!selectedCustomer) return;
    const [freshCustomer, transactions, staffTransactions] = await Promise.all([
      window.peachesData.getCustomer(selectedCustomer.id),
      window.peachesData.listTransactions(selectedCustomer.id, 20),
      listStaffTransactions(),
    ]);

    selectedCustomer = freshCustomer;
    customers = customers.map((customer) => customer.id === freshCustomer.id ? freshCustomer : customer);
    renderStats(staffTransactions);
    applyCustomerSearch();
    renderDetail(transactions);
  }

  function resetForms() {
    const points = document.getElementById("add-points-input");
    const note = document.getElementById("add-points-note");
    if (points) points.value = "";
    if (note) note.value = "";
    setStatus("#add-points-status", "");
    setStatus("#redeem-status", "");
  }

  async function listStaffTransactions() {
    const { data, error } = await window.supabase
      .from("transactions")
      .select("id, customer_id, points_delta, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  async function loadData() {
    profile = await window.peachesData.getCurrentProfile();
    renderStaff();
    const [nextCustomers, nextVouchers, transactions] = await Promise.all([
      window.peachesData.listCustomers(),
      window.peachesData.listActiveVouchers(),
      listStaffTransactions(),
    ]);
    customers = nextCustomers;
    vouchers = nextVouchers;
    renderStats(transactions);
    renderCustomers(customers);

    const scannedCustomerId = new URLSearchParams(window.location.search).get("customer");
    if (scannedCustomerId) {
      const token = new URLSearchParams(window.location.search).get("qr_token");
      await openCustomer(scannedCustomerId, { verifiedByScan: Boolean(token), qrToken: token, navigateTo: "client-detail" });
    }
  }

  async function addPoints() {
    const button = document.getElementById("confirm-add-points");
    const delta = Number(document.getElementById("add-points-input")?.value || 0);
    const note = document.getElementById("add-points-note")?.value.trim() || "Points added";
    if (!selectedVerifiedByScan) {
      setStatus("#add-points-status", "Scan the customer's QR code first.", "error");
      return;
    }
    if (!Number.isInteger(delta) || delta <= 0) {
      setStatus("#add-points-status", "Enter whole points greater than 0.", "error");
      return;
    }

    button.disabled = true;
    setStatus("#add-points-status", "Saving points...");
    try {
      await window.peachesData.addPoints({ customerId: selectedCustomer?.id, delta, note, qrToken: selectedScanToken });
      setStatus("#add-points-status", "Points added.", "success");
      selectedVerifiedByScan = false;
      selectedScanToken = null;
      await refreshSelectedCustomer();
      await show("client-detail");
    } catch (error) {
      setStatus("#add-points-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function redeemVoucher() {
    const button = document.getElementById("redeem-btn");
    if (!selectedVerifiedByScan) {
      setStatus("#redeem-status", "Scan the customer's QR code first.", "error");
      return;
    }
    if (!selectedVoucher) {
      setStatus("#redeem-status", "Choose an unlocked voucher.", "error");
      return;
    }

    button.disabled = true;
    setStatus("#redeem-status", "Redeeming voucher...");
    try {
      await window.peachesData.redeemVoucher({
        customerId: selectedCustomer?.id,
        voucher: selectedVoucher,
        qrToken: selectedScanToken,
      });
      setStatus("#redeem-status", "Voucher redeemed.", "success");
      selectedVerifiedByScan = false;
      selectedScanToken = null;
      selectedVoucher = null;
      await refreshSelectedCustomer();
      await show("client-detail");
    } catch (error) {
      setStatus("#redeem-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-show]").forEach((button) => {
      button.addEventListener("click", () => show(button.dataset.show));
    });
    document.getElementById("open-scanner")?.addEventListener("click", () => show("scan-screen"));
    document.getElementById("go-add-points")?.addEventListener("click", () => show("add-points-screen"));
    document.getElementById("go-redeem")?.addEventListener("click", () => show("voucher-screen"));
    document.getElementById("confirm-add-points")?.addEventListener("click", addPoints);
    document.getElementById("redeem-btn")?.addEventListener("click", redeemVoucher);
    document.getElementById("customer-search")?.addEventListener("input", applyCustomerSearch);
    document.getElementById("manual-open-customer")?.addEventListener("click", () => {
      const value = document.getElementById("manual-customer-id")?.value.trim();
      openCustomer(value, { verifiedByScan: false, navigateTo: "client-detail" })
        .catch((error) => setStatus("#scan-status", error.message, "error"));
    });
    document.getElementById("sign-out-button")?.addEventListener("click", () => {
      window.PeachesAuth?.signOut?.();
    });
  }

  async function init() {
    if (document.body.dataset.requiredRole !== "therapist" || !window.peachesData) return;
    bindEvents();
    try {
      await loadData();
      document.body.dataset.appReady = "true";
    } catch (error) {
      setStatus("#dashboard-status", error.message, "error");
      console.error(error);
    }
  }

  window.show = show;
  window.startScanner = startScanner;
  window.stopScanner = stopScanner;

  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
})();
