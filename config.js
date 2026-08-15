window.PLAYYR_SUPABASE = {
  url: 'https://xnqhyzogskfoexjbkjov.supabase.co',
  publishableKey: 'sb_publishable_fQGxHiLcUerzFShQEkqQNQ_90rY0jfN'
};

// Browser key for Google Maps JavaScript API + Places API (New).
// Restrict this key to PLAYYR's production domains in Google Cloud Console.
window.PLAYYR_GOOGLE_MAPS = window.PLAYYR_GOOGLE_MAPS || {
  apiKey: ''
};

window.supabaseClient = window.supabase.createClient(
  window.PLAYYR_SUPABASE.url,
  window.PLAYYR_SUPABASE.publishableKey
);
