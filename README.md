# dx-entrada

Puerta de entrada del diagnosticador (diagnostico.anwarsepulveda.com). La página ya no le habla a Make directo: le habla a este Worker, y el Worker le habla a Make con una llave que solo él conoce.

Qué hace en cada envío: solo acepta POST desde diagnostico.anwarsepulveda.com · revisa que la acción exista, que el correo tenga forma de correo y que las 10 respuestas estén entre 1 y 4 · neutraliza cualquier texto que empiece con `=`, `+`, `-` o `@` para que Google Sheets no lo lea como fórmula · frena a 20 envíos por IP cada 10 minutos · reenvía a Make con `x-make-apikey`.

Pruebas: `node test/test.mjs` (16).

Secretos (Cloudflare → Workers → dx-entrada → Settings → Variables and Secrets): `MAKE_URL` y `MAKE_KEY`. Nunca van en el código.
