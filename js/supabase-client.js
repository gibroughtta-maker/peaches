(function () {
  const cfg = window.PEACHES_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.error("Missing Supabase config.");
    return;
  }

  const supabaseFactory = window.supabaseJs || window.supabase;
  if (!supabaseFactory?.createClient) {
    console.error("Missing Supabase JS library.");
    return;
  }

  window.supabase = supabaseFactory.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
  );

  window.getCurrentProfile = async function () {
    const { data: authData } = await window.supabase.auth.getUser();
    if (!authData?.user) return null;

    const { data, error } = await window.supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  window.requireRole = async function (role) {
    const profile = await window.getCurrentProfile();
    return profile && profile.role === role;
  };

  window.signOut = async function () {
    await window.supabase.auth.signOut();
  };
})();
