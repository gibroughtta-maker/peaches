(function () {
  function assertSupabase(supabase) {
    if (!supabase?.auth || !supabase.from || !supabase.rpc) {
      throw new Error("Supabase is not ready.");
    }
  }

  function throwIfError(error) {
    if (error) throw error;
  }

  function initials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "??";
  }

  function emailName(email) {
    return String(email || "")
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .trim();
  }

  function displayName({ fullName, metadataName, email, fallback = "Peaches Member" }) {
    return String(fullName || metadataName || emailName(email) || fallback).trim();
  }

  function withCustomerDisplayName(customer) {
    if (!customer) return customer;
    return {
      ...customer,
      full_name: displayName({
        fullName: customer.full_name,
        email: customer.phone,
        fallback: "Customer",
      }),
    };
  }

  function create(supabase) {
    assertSupabase(supabase);

    async function getAuthUser() {
      const { data, error } = await supabase.auth.getUser();
      throwIfError(error);
      return data?.user || null;
    }

    async function getCurrentProfile() {
      const user = await getAuthUser();
      if (!user) return null;

      const { data: staff, error: staffError } = await supabase
        .from("staff")
        .select("id, full_name, email, role")
        .eq("id", user.id)
        .maybeSingle();
      throwIfError(staffError);

      if (staff) {
        const staffName = displayName({
          fullName: staff.full_name,
          metadataName: user.user_metadata?.full_name,
          email: staff.email || user.email,
          fallback: "Staff",
        });
        return {
          id: staff.id,
          role: staff.role || "therapist",
          display_name: staffName,
          email: staff.email || user.email || "",
        };
      }

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id, full_name, phone, points")
        .eq("id", user.id)
        .maybeSingle();
      throwIfError(customerError);

      if (!customer) return null;

      return {
        id: customer.id,
        role: "customer",
        display_name: displayName({
          fullName: customer.full_name,
          metadataName: user.user_metadata?.full_name,
          email: user.email,
          fallback: "Customer",
        }),
        email: user.email || "",
      };
    }

    async function getCustomer(customerId) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, phone, points, member_since")
        .eq("id", customerId)
        .maybeSingle();
      throwIfError(error);
      return withCustomerDisplayName(data);
    }

    async function listCustomers() {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, phone, points, member_since")
        .order("full_name", { ascending: true })
        .limit(50);
      throwIfError(error);
      return (data || []).map(withCustomerDisplayName);
    }

    async function listTransactions(customerId, limit) {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, points_delta, note, created_at, voucher_id")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(limit || 20);
      throwIfError(error);
      return data || [];
    }

    async function listActiveVouchers() {
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, name, description, emoji, points_cost, retail_value, valid_months")
        .eq("is_active", true)
        .order("points_cost", { ascending: true });
      throwIfError(error);
      return data || [];
    }

    async function listSmoothestPeaches({ months = 3, limit = 10 } = {}) {
      const { data, error } = await supabase.rpc("smoothest_peaches", {
        p_months: months,
        p_limit: limit,
      });
      throwIfError(error);
      return data || [];
    }

    async function getCustomerQrToken(customerId) {
      const { data, error } = await supabase
        .from("customer_qr_tokens")
        .select("token")
        .eq("customer_id", customerId)
        .maybeSingle();
      throwIfError(error);
      if (!data?.token) throw new Error("Customer QR token is not ready.");
      return data.token;
    }

    async function getCustomerHome(customerId) {
      const [customer, vouchers, transactions, qrToken, leaderboard] = await Promise.all([
        getCustomer(customerId),
        listActiveVouchers(),
        listTransactions(customerId, 20),
        getCustomerQrToken(customerId),
        listSmoothestPeaches(),
      ]);
      if (customer) customer.qr_token = qrToken;
      return { customer, vouchers, transactions, leaderboard };
    }

    async function addPoints({ customerId, delta, note, voucherId, qrToken }) {
      const numericDelta = Number(delta);
      if (!customerId) throw new Error("Choose a customer first.");
      if (!qrToken) throw new Error("Scan the customer's QR code first.");
      if (!Number.isInteger(numericDelta) || numericDelta === 0) {
        throw new Error("Enter a non-zero whole number of points.");
      }

      const { data, error } = await supabase.rpc("add_points", {
        p_customer_id: customerId,
        p_delta: numericDelta,
        p_note: note || (numericDelta > 0 ? "Points added" : "Reward redeemed"),
        p_type: numericDelta > 0 ? "earn" : "redeem",
        p_voucher_id: voucherId || null,
        p_qr_token: qrToken,
      });
      throwIfError(error);
      return data;
    }

    async function redeemVoucher({ customerId, voucher, qrToken }) {
      if (!voucher) throw new Error("Choose a voucher first.");
      return addPoints({
        customerId,
        delta: -Math.abs(Number(voucher.points_cost)),
        note: voucher.name,
        voucherId: voucher.id,
        qrToken,
      });
    }

    return {
      addPoints,
      getAuthUser,
      getCurrentProfile,
      getCustomer,
      getCustomerHome,
      getCustomerQrToken,
      initials,
      listActiveVouchers,
      listCustomers,
      listSmoothestPeaches,
      listTransactions,
      redeemVoucher,
    };
  }

  window.PeachesData = { create, initials };
})();
