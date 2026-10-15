// Conexión a la base de Electro Montana. La key "publishable" es pública por diseño:
// la seguridad real está en las reglas (RLS) de la base. Nunca poner aquí una clave secreta.
window.EM_CONFIG = {
  url: 'https://fyylawnpgodapwdfuqau.supabase.co',
  key: 'sb_publishable_SFTH1kPa1m-1WJUedTo-mA_vQ5SBZax',
  dominio: 'electromontana.app' // los usuarios entran con "franklin"; por dentro es franklin@electromontana.app
};
