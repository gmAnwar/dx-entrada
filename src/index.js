/* dx-entrada · puerta de entrada del diagnosticador
 * página → este Worker → Make (con llave)
 * 1. solo POST JSON desde diagnostico.anwarsepulveda.com
 * 2. forma correcta: action permitida, correo con forma de correo, 10 respuestas 1-4
 * 3. neutraliza fórmulas: "=" y "@" al inicio siempre; "+" y "-" solo si les sigue letra o paréntesis
 *    (así +52 81 1234 5678 sigue siendo teléfono; telefono/phone solo se saltan el escudo si traen puro + dígitos espacios ( ) - .)
 * 4. límite por IP: 10 envíos por minuto (una persona real hace 2-4 en su peor minuto)
 * 5. reenvía a Make con x-make-apikey (secreto MAKE_KEY, lo pega Anwar en Cloudflare)
 */

const ORIGENES = new Set(["https://diagnostico.anwarsepulveda.com"]);
const ACCIONES = new Set(["quiz_start", "quiz_complete", "waitlist", "cta_llamada", "detalle_view", "momento", "purchase", "send_email"]);
const CAMPOS_MAX = 60;          // campos por envío
const TEXTO_MAX = 500;          // caracteres por campo
const RESPUESTAS = ["b1_presupuesto","b2_campanas","b3_equipo","b4_metricas","b5_automatizacion","b6_ventas","b7_oferta","b8_cliente","b9_respuesta","b10_creatividades"];

const SIN_ESCUDO = new Set(["telefono", "phone"]);
export function limpiar(v, k) {
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  if (v == null) return "";
  let s = String(v).slice(0, TEXTO_MAX).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const esTel = SIN_ESCUDO.has(k) && /^\s*\+?[\d\s().-]{7,20}$/.test(s);   // solo si de verdad parece teléfono
  if (!esTel && /^\s*(?:[=@]|[+\-]\s*[A-Za-z(])/.test(s)) s = "'" + s;   // Sheets ya no lo lee como fórmula
  return s;
}

export function validar(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "no es objeto";
  const llaves = Object.keys(d);
  if (llaves.length > CAMPOS_MAX) return "demasiados campos";
  if (!ACCIONES.has(d.action)) return "action desconocida";
  if (d.email && !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(d.email))) return "correo inválido";
  for (const k of RESPUESTAS) {
    if (d[k] == null || d[k] === "") continue;
    const n = Number(d[k]); if (!(n >= 1 && n <= 4)) return "respuesta fuera de rango: " + k;
  }
  if (d.etapa != null && d.etapa !== "" && !(Number(d.etapa) >= 1 && Number(d.etapa) <= 4)) return "etapa fuera de rango";
  for (const k of llaves) if (typeof d[k] === "object" && d[k] !== null) return "campo anidado: " + k;
  return null;
}

export function sanear(d) {
  const out = {};
  for (const k of Object.keys(d)) if (/^[a-z0-9_]{1,40}$/i.test(k)) out[k] = limpiar(d[k], k);
  return out;
}

function cors(origin) {
  const ok = ORIGENES.has(origin) ? origin : "https://diagnostico.anwarsepulveda.com";
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Methods": "POST, OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const h = cors(origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (req.method !== "POST") return new Response("no", { status: 405, headers: h });
    if (!ORIGENES.has(origin)) return new Response("origen", { status: 403, headers: h });

    const ip = req.headers.get("CF-Connecting-IP") || "0";
    if (env.LIMITE) {
      const { success } = await env.LIMITE.limit({ key: ip });
      if (!success) return new Response("despacio", { status: 429, headers: h });
    }

    let d;
    try { d = await req.json(); } catch { return new Response("json", { status: 400, headers: h }); }
    const err = validar(d);
    if (err) return new Response(err, { status: 422, headers: h });
    const limpio = sanear(d);
    limpio.ip_pais = req.headers.get("CF-IPCountry") || "";

    const r = await fetch(env.MAKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-make-apikey": env.MAKE_KEY || "" },
      body: JSON.stringify(limpio),
    });
    return new Response(r.ok ? "ok" : "make:" + r.status, { status: r.ok ? 200 : 502, headers: h });
  },
};
