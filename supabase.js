let _supabaseClient = null;

function getClient() {
  if (!_supabaseClient) {
    if (typeof supabase === 'undefined') {
      throw new Error("Supabase library not loaded. Check the CDN script tag.");
    }
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    });
  }
  return _supabaseClient;
}

async function storeUserData(user) {
  if (!user) return;
  const profile = {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    updated_at: new Date().toISOString()
  };
  const { error } = await getClient().from('profiles').upsert(profile, { onConflict: 'id' });
  if (error) console.error('Error storing user profile:', error);
}

async function getUserData() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return null;
  const { data, error } = await getClient().from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.full_name || data.email?.split('@')[0] || 'User',
    avatar: data.avatar_url || '',
    phone: data.phone || '',
    street: data.street || '',
    postal_code: data.postal_code || '',
    city: data.city || '',
    state: data.state || '',
    country: data.country || '',
    balance: data.balance || 0
  };
}

function clearUserData() {}

function getUserInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

async function initAuth() {
  const { data: { session } } = await getClient().auth.getSession();
  if (session?.user) {
    await storeUserData(session.user);
    const profile = await getUserData();
    if (profile) return profile;
    return {
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
      avatar: session.user.user_metadata?.avatar_url || ''
    };
  }
  return null;
}

function onAuthChange(callback) {
  getClient().auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await storeUserData(session.user);
    }
    if (event === 'SIGNED_OUT') {
      clearUserData();
    }
    if (callback) callback(event, session);
  });
}

async function signUpWithEmail(email, password, name, phone) {
  const { data, error } = await getClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });
  if (error) throw error;
  if (data.session && data.user) {
    const profile = {
      id: data.user.id,
      email,
      full_name: name,
      phone: phone || '',
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(profile)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create profile');
    }
  }
  return data;
}

async function signInWithEmail(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await storeUserData(data.user);
  return data;
}

async function signInWithGoogle(redirectTo) {
  const { data, error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) throw error;
}

async function signOut() {
  const { error } = await getClient().auth.signOut();
  clearUserData();
  if (error) throw error;
}

async function updateProfile(updates) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  updates.updated_at = new Date().toISOString();
  const { error } = await getClient().from('profiles').upsert({ id: session.user.id, ...updates }, { onConflict: 'id' });
  if (error) throw error;
}

async function resetPassword(email, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/Reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ email, newPassword })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return data;
}

async function saveCard(cardData) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().from('cards').insert({
    user_id: session.user.id,
    last_four: cardData.last_four,
    cardholder_name: cardData.cardholder_name,
    expiry_month: cardData.expiry_month,
    expiry_year: cardData.expiry_year,
    card_type: cardData.card_type
  }).select().single();
  if (error) throw error;
  return data;
}

async function getCards() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await getClient().from('cards').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

async function deleteCard(cardId) {
  const { error } = await getClient().from('cards').delete().eq('id', cardId);
  if (error) throw error;
}

async function getSavingsGoals() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await getClient().from('savings_goals').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

async function createSavingsGoal(name, targetAmount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().from('savings_goals').insert({
    user_id: session.user.id, name, target_amount: targetAmount
  }).select().single();
  if (error) throw error;
  return data;
}

async function savingsDeposit(goalId, amount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('savings_deposit', { goal_id: goalId, amount });
  if (error) throw error;
  return data;
}

async function savingsWithdraw(goalId, amount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('savings_withdraw', { goal_id: goalId, amount });
  if (error) throw error;
  return data;
}

async function investMoney(amount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('invest_money', { amount });
  if (error) throw error;
  return data;
}

async function claimReturns(investmentId) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('claim_returns', { investment_id: investmentId });
  if (error) throw error;
  return data;
}

async function getInvestments() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await getClient().from('investments').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

async function transferMoney(targetEmail, amount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('transfer_money', { target_email: targetEmail, amount });
  if (error) throw error;
  return data;
}

async function deposit(amount, description) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('deposit', { amount, description: description || '' });
  if (error) throw error;
  return data;
}

async function withdraw(amount) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().rpc('withdraw', { amount });
  if (error) throw error;
  return data;
}

async function getBalance() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return 0;
  const { data, error } = await getClient().from('profiles').select('balance').eq('id', session.user.id).single();
  if (error) return 0;
  return data?.balance || 0;
}

async function saveBankDetails(details) {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await getClient().from('bank_details').upsert(
    { user_id: session.user.id, ...details },
    { onConflict: 'user_id' }
  ).select().single();
  if (error) throw error;
  return data;
}

async function getBankDetails() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return null;
  const { data, error } = await getClient().from('bank_details').select('*').eq('user_id', session.user.id).single();
  if (error) return null;
  return data;
}

async function getTransactions() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await getClient().from('transactions').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}
