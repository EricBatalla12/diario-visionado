// Datos de conexión con Supabase (Project Settings → API).
// Las dos claves son públicas por diseño: la URL del proyecto y la clave
// anon/publishable. Lo que protege los datos son las reglas de esquema.sql,
// no esconder esto. La clave service_role/secret NUNCA va aquí.
export const SUPABASE_URL = "https://ihxokfwwoxzrynhfoips.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_zjmrSOQIwCaGheW_r_XajQ_gKi91ETF";

// Enlace de donaciones (Ko-fi, Buy Me a Coffee, PayPal.me…). Vacío = no se
// enseña el botón de apoyar. Tiene que empezar por https://
export const DONAR = "";
