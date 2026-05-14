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
        return {
          id: staff.id,
          role: staff.role || "therapist",
          display_name: staff.full_name,
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
        display_name: customer.full_name,
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
      return data;
    }

    async function listCustomers() {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, phone, points, member_since")
        .order("full_name", { ascending: true })
        .limit(50);
      throwIfError(error);
      return data || [];
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

    async function getCustomerHome(customerId) {
      const [customer, vouchers, transactions] = await Promise.all([
        getCustomer(customerId),
        listActiveVouchers(),
        listTransactions(customerId, 20),
      ]);
      return { customer, vouchers, transactions };
    }

    async function addPoints({ customerId, delta, note, voucherId }) {
      const numericDelta = Number(delta);
      if (!customerId) throw new Error("Choose a customer first.");
      if (!Number.isInteger(numericDelta) || numericDelta === 0) {
        throw new Error("Enter a non-zero whole number of points.");
      }

      const { data, error } = await supabase.rpc("add_points", {
        p_customer_id: customerId,
        p_delta: numericDelta,
        p_note: note || (numericDelta > 0 ? "Points added" : "Reward redeemed"),
        p_type: numericDelta > 0 ? "earn" : "redeem",
        p_voucher_id: voucherId || null,
      });
      throwIfError(error);
      return data;
    }

    async function redeemVoucher({ customerId, voucher }) {
      if (!voucher) throw new Error("Choose a voucher first.");
      return addPoints({
        customerId,
        delta: -Math.abs(Number(voucher.points_cost)),
        note: voucher.name,
        voucherId: voucher.id,
      });
    }

    return {
      addPoints,
      getAuthUser,
      getCurrentProfile,
      getCustomer,
      getCustomerHome,
      initials,
      listActiveVouchers,
      listCustomers,
      listTransactions,
      redeemVoucher,
    };
  }

  window.PeachesData = { create, initials };
})();
