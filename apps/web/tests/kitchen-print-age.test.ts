import assert from "node:assert/strict";
import test from "node:test";
import { isStalePrintJob, PRINT_MAX_QUEUE_AGE_HOURS, STALE_PRINT_ERROR } from "../src/lib/kitchen-print";

test("tickets com mais de 6 h na fila são descartados; os recentes e agendados não", () => {
  const now = new Date("2026-11-09T20:00:00Z");
  assert.equal(PRINT_MAX_QUEUE_AGE_HOURS, 6);
  assert.equal(isStalePrintJob(new Date("2026-10-07T11:28:53Z"), now), true);
  assert.equal(isStalePrintJob(new Date("2026-11-09T13:59:00Z"), now), true);
  assert.equal(isStalePrintJob(new Date("2026-11-09T14:01:00Z"), now), false);
  assert.equal(isStalePrintJob(new Date("2026-11-09T21:00:00Z"), now), false); // agendado para depois
  assert.match(STALE_PRINT_ERROR, /não imprimir/);
});
