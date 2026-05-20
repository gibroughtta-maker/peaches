(function () {
  function moneyDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function txLabel(tx) {
    return tx.note || (tx.points_delta < 0 ? "Reward redeemed" : "Points added");
  }

  function formatRewardMeta(voucher) {
    const parts = [];
    if (voucher.retail_value) parts.push(`Worth £${Number(voucher.retail_value).toFixed(2)}`);
    if (voucher.valid_months) parts.push(`${voucher.valid_months} month voucher`);
    return parts.join(" · ") || voucher.description || "Peaches reward";
  }

  function renderCustomerQr(customer) {
    const qrNode = document.querySelector(".qr-code");
    if (!qrNode) return;

    const payload = customer.id;
    qrNode.dataset.customerId = customer.id;
    qrNode.dataset.qrPayload = payload;

    if (window.qrcode) {
      const qr = window.qrcode(0, "M");
      qr.addData(payload);
      qr.make();
      qrNode.innerHTML = qr.createSvgTag(4, 2);
      qrNode.querySelector("svg")?.setAttribute("aria-label", "Customer QR code");
      return;
    }

    qrNode.textContent = customer.id.slice(0, 8).toUpperCase();
  }

  function renderVoucher(voucher, balance) {
    const unlocked = balance >= voucher.points_cost;
    const remaining = Math.max(voucher.points_cost - balance, 0);
    return `
      <div style="background:var(--white);border-radius:12px;border:1.5px solid ${unlocked ? "var(--pink)" : "var(--cream-dark)"};padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:10px;${unlocked ? "box-shadow:0 2px 14px rgba(212,39,122,.1);" : "opacity:.65;"}">
        <div style="width:48px;height:48px;border-radius:10px;background:${unlocked ? "linear-gradient(135deg,#F9D0E0,#F0A0C0)" : "#f0f0f0"};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;${unlocked ? "" : "filter:grayscale(1);opacity:.45;"}">${voucher.emoji || "*"}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;color:var(--text-dark);margin-bottom:2px;">${voucher.name}</div>
          <div style="font-size:10px;color:var(--text-light);">${formatRewardMeta(voucher)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="background:${unlocked ? "var(--pink)" : "var(--cream-dark)"};color:${unlocked ? "white" : "var(--text-light)"};font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:6px;">${unlocked ? "Ready" : "Locked"}</div>
          <div style="font-size:9px;color:${unlocked ? "var(--pink)" : "var(--text-light)"};margin-top:4px;">${unlocked ? `${voucher.points_cost} pts` : `${remaining} to go`}</div>
        </div>
      </div>
    `;
  }

  function renderTransactions(transactions) {
    if (!transactions.length) {
      return `<li class="tx-item"><div class="tx-info"><div class="tx-name">No point history yet</div><div class="tx-meta">Earn points after your next visit</div></div><div class="tx-points plus">0</div></li>`;
    }

    return transactions.map((tx) => {
      const positive = tx.points_delta >= 0;
      const sign = positive ? "+" : "";
      return `
        <li class="tx-item">
          <div class="tx-info"><div class="tx-name">${txLabel(tx)}</div><div class="tx-meta">${moneyDate(tx.created_at)}</div></div>
          <div class="tx-points ${positive ? "plus" : "minus"}">${sign}${tx.points_delta}</div>
        </li>
      `;
    }).join("");
  }

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = text;
    });
  }

  async function init() {
    if (document.body.dataset.requiredRole !== "customer" || !window.peachesData) return;

    const user = await window.peachesData.getAuthUser();
    if (!user) return;

    const { customer, vouchers, transactions } = await window.peachesData.getCustomerHome(user.id);
    if (!customer) return;

    const displayName = customer.full_name || "Customer";
    const balance = customer.points || 0;
    const nextReward = vouchers.find((voucher) => voucher.points_cost > balance);

    const body = document.querySelector("#customer .phone-body");
    if (body) {
      body.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;">
          <div>
            <div class="greeting" style="font-size:20px;">Hello, ${displayName}</div>
            <div class="greeting-sub" style="margin-bottom:0;">Member since ${moneyDate(customer.member_since)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;color:var(--pink);line-height:1;">${balance}</div>
            <div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-light);">Points</div>
          </div>
        </div>
        <div style="background:var(--white);border-radius:14px;padding:18px 16px 16px;margin-bottom:20px;box-shadow:0 2px 12px rgba(212,39,122,.07);">
          <div style="font-size:11px;color:var(--text-light);letter-spacing:.05em;">${nextReward ? `Next reward at <strong style="color:var(--pink);">${nextReward.points_cost} pts</strong>` : "All visible rewards are unlocked"}</div>
          <div style="font-size:10px;color:var(--text-mid);margin-top:8px;">Earn 1 point for every £1 paid. Rewards are issued as treatment vouchers.</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div class="section-title" style="margin-bottom:0;">Rewards</div>
          <div style="display:flex;gap:10px;">
            <div style="font-size:10px;color:var(--pink);cursor:pointer;" onclick="show('qr')">My QR</div>
            <div style="font-size:10px;color:var(--text-light);">|</div>
            <div style="font-size:10px;color:var(--pink);cursor:pointer;" onclick="show('history')">History</div>
          </div>
        </div>
        ${vouchers.map((voucher) => renderVoucher(voucher, balance)).join("")}
      `;
    }

    renderCustomerQr(customer);

    const historyBody = document.querySelector("#history .phone-body");
    if (historyBody) {
      historyBody.innerHTML = `
        <div class="history-header">
          <button class="back-btn" onclick="show('customer')" aria-label="Back to rewards">←</button>
          <div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--text-dark);">Point History</div>
            <div style="font-size:11px;color:var(--text-light);">${customer.full_name}</div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div class="points-label" style="text-align:right;color:var(--text-light);margin-bottom:2px;">Balance</div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--pink);">${balance}</div>
          </div>
        </div>
        <ul class="tx-list">${renderTransactions(transactions)}</ul>
      `;
    }

    document.body.dataset.appReady = "true";
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => console.error(error));
  });
})();
