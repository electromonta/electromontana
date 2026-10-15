// Función del servidor para manejar los usuarios de Electro Montana.
// Usa la llave de servicio, que solo existe en el servidor de Supabase (nunca en la app ni en el repo).
//   accion "crear": un dueño crea un usuario (dueño o empleado) con una clave temporal.
//   accion "clave": un dueño le pone una clave nueva a un usuario (al entrar se le pide cambiarla).
// Los usuarios entran con un nombre corto ("franklin"); por dentro es franklin@electromontana.app.
// Nunca se mandan correos: las cuentas se crean ya confirmadas.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMINIO = "electromontana.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

function llaveServicio(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, llaveServicio(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return responder({ error: "Datos no válidos" }, 400);
  }

  // Solo un dueño activo
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien, error: eAuth } = await admin.auth.getUser(token);
  if (eAuth || !quien?.user) return responder({ error: "Sesión no válida. Vuelve a entrar." }, 401);
  const { data: yo } = await admin.from("usuarios").select("id, rol, activo").eq("id", quien.user.id).maybeSingle();
  if (!yo || !yo.activo || yo.rol !== "dueno") return responder({ error: "Solo los dueños pueden manejar usuarios." }, 403);

  const accion = String(b.accion ?? "");
  const clave = String(b.clave ?? "");

  if (accion === "crear") {
    const usuario = String(b.usuario ?? "").trim().toLowerCase();
    const nombre = String(b.nombre ?? "").trim();
    const rol = String(b.rol ?? "empleado");
    const sede = rol === "empleado" ? String(b.sede ?? "") : null;
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return responder({ error: "El usuario debe tener de 3 a 30 letras o números, sin espacios." }, 400);
    if (!nombre) return responder({ error: "Escribe el nombre." }, 400);
    if (clave.length < 6) return responder({ error: "La clave debe tener al menos 6 caracteres." }, 400);
    if (rol !== "dueno" && rol !== "empleado") return responder({ error: "Rol no válido." }, 400);
    if (rol === "empleado" && sede !== "socopo" && sede !== "pedraza") return responder({ error: "Elige la sede del empleado." }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error || !data.user) {
      const msg = /already|registered|exists/i.test(error?.message ?? "") ? "Ya existe ese usuario." : (error?.message ?? "No se pudo crear");
      return responder({ error: msg }, 400);
    }
    const { error: e2 } = await admin.from("usuarios").insert({
      id: data.user.id, usuario, nombre, rol, sede, activo: true, debe_cambiar_clave: true,
    });
    if (e2) {
      await admin.auth.admin.deleteUser(data.user.id);
      return responder({ error: "No se pudo guardar el usuario: " + e2.message }, 400);
    }
    await admin.from("auditoria").insert({
      tabla: "usuarios", registro_id: data.user.id, accion: "crear", antes: null,
      despues: { usuario, nombre, rol, sede }, usuario_id: yo.id,
    });
    return responder({ ok: true, id: data.user.id });
  }

  if (accion === "clave") {
    const id = String(b.id ?? "");
    const { data: destino } = await admin.from("usuarios").select("id").eq("id", id).maybeSingle();
    if (!destino) return responder({ error: "Ese usuario no existe." }, 404);
    if (clave.length < 6) return responder({ error: "La clave debe tener al menos 6 caracteres." }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
    if (error) return responder({ error: error.message }, 400);
    // Si un dueño le pone clave a otra persona, esa persona debe cambiarla al entrar
    await admin.from("usuarios").update({ debe_cambiar_clave: id !== yo.id }).eq("id", id);
    await admin.from("auditoria").insert({
      tabla: "usuarios", registro_id: id, accion: "clave", antes: null, despues: null, usuario_id: yo.id,
    });
    return responder({ ok: true });
  }

  return responder({ error: "Acción no válida" }, 400);
});
