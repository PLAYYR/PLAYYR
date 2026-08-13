window.PLAYYR_SUPABASE = {
  url: 'https://xnqhyzogskfoexjbkjov.supabase.co',
  publishableKey: 'sb_publishable_fQGxHiLcUerzFShQEkqQNQ_90rY0jfN'
};

window.supabaseClient = window.supabase.createClient(
  window.PLAYYR_SUPABASE.url,
  window.PLAYYR_SUPABASE.publishableKey
);
