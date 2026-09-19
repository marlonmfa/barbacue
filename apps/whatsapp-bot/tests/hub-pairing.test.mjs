// Regression tests for the central WhatsApp pairing hub.
//
// The bug these pin down: `connection.update` handlers were bound to the
// *session* rather than the *socket*. Baileys keeps emitting events after a
// socket is replaced, so the old socket's `close` event nulled the brand-new
// socket, flipped the status to "disconnected", wiped the fresh QR and
// scheduled a duplicate reconnect. In production this made all three accounts
// impossible to pair and left the central account with a half-written creds.json
// (registered:false + me + pairingCode) that bricked every later attempt.
//
//   node --experimental-test-module-mocks --test tests/hub-pairing.test.mjs
//
// Runs against dist/, so `npm run build` must have run first.
import { test, mock, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { join } from "node:path";

const SESSIONS = mkdtempSync(join(tmpdir(), "wa-hub-test-"));
process.env.SESSIONS_DIR = SESSIONS;
process.env.BOT_LOG_LEVEL = "silent";

/** Every fake socket handed to the hub, in creation order. */
let sockets = [];
/** Per-account creds the mocked auth store returns. */
let creds = {};

function fakeSocket() {
  const ev = new EventEmitter();
  const sock = {
    ev,
    user: undefined,
    end: mock.fn(),
    logout: mock.fn(async () => {}),
    waitForSocketOpen: mock.fn(async () => {}),
    requestPairingCode: mock.fn(async (phone) => `PAIR${phone.slice(-4)}`),
    sendMessage: mock.fn(async () => ({ key: { id: "x" } })),
    sendPresenceUpdate: mock.fn(async () => {}),
    readMessages: mock.fn(async () => {}),
    profilePictureUrl: mock.fn(async () => null),
  };
  sockets.push(sock);
  // Baileys surfaces the QR asynchronously once the handshake starts.
  setTimeout(() => ev.emit("connection.update", { qr: `qr-ref-${sockets.length}-${Date.now()}` }), 10);
  return sock;
}

let hub;

before(async () => {
  mock.module("@whiskeysockets/baileys", {
    defaultExport: () => fakeSocket(),
    namedExports: {
      Browsers: { ubuntu: (name) => ["Ubuntu", name, "22.04.4"] },
      DisconnectReason: { loggedOut: 401, restartRequired: 515, connectionClosed: 428, timedOut: 408 },
      downloadMediaMessage: async () => Buffer.alloc(0),
      fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
      useMultiFileAuthState: async (dir) => {
        const id = dir.split("/").pop();
        creds[id] ??= { registered: false };
        return { state: { creds: creds[id] }, saveCreds: async () => {} };
      },
    },
  });
  hub = await import("../dist/wa/hub.js");
});

beforeEach(() => { sockets = []; creds = {}; });
after(() => rmSync(SESSIONS, { recursive: true, force: true }));

const account = (id) => hub.accountList().find((a) => a.id === id);
const closeWith = (sock, statusCode) =>
  sock.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode } } } });
const settle = (ms) => new Promise((done) => setTimeout(done, ms));

test("THE regression: a superseded socket's close event cannot touch the live session", async () => {
  await hub.pair("central", "qr");
  assert.equal(sockets.length, 1, "first pair should open exactly one socket");
  const stale = sockets[0];
  const firstQr = account("central").qrDataUrl;
  assert.ok(firstQr, "first pair should surface a QR");

  await hub.pair("central", "qr");
  assert.equal(sockets.length, 2, "re-pair should open a second socket");
  const liveQr = account("central").qrDataUrl;
  assert.notEqual(liveQr, firstQr, "the panel must show the new socket's QR");

  // Baileys emits this late, after the replacement is already in place.
  closeWith(stale, 428);
  await settle(50);

  const after = account("central");
  assert.equal(after.status, "qr_ready", "stale close must not flip the live session to disconnected");
  assert.equal(after.qrDataUrl, liveQr, "stale close must not wipe the live QR");

  // The old code scheduled reconnects at reconnects*2000ms; wait past that.
  await settle(2_600);
  assert.equal(sockets.length, 2, "stale close must not spawn a duplicate reconnect socket");
});

test("re-pairing wipes half-written creds so a partial pairing cannot poison it", async () => {
  const dir = join(SESSIONS, "central");
  mkdirSync(dir, { recursive: true });
  // Exactly the shape found on the production box after the failed attempt.
  writeFileSync(join(dir, "creds.json"), JSON.stringify({ registered: false, pairingCode: "ABCD1234", me: { id: "47997056624@s.whatsapp.net" } }));

  await hub.pair("central", "qr");

  assert.equal(existsSync(join(dir, "creds.json")), false, "pair() must start from a clean auth folder");
});

test("phone pairing waits for the socket instead of a fixed sleep, and returns the code", async () => {
  const result = await hub.pair("central", "phone", "+55 (47) 99705-6624");

  const sock = sockets.at(-1);
  assert.equal(sock.waitForSocketOpen.mock.callCount(), 1, "must await the real handshake");
  assert.equal(sock.requestPairingCode.mock.calls[0].arguments[0], "5547997056624", "digits only");
  assert.equal(result.pairingCode, "PAIR6624");
  assert.equal(account("central").pairingCode, "PAIR6624");
});

test("a malformed number is rejected before any socket is opened", async () => {
  await assert.rejects(() => hub.pair("central", "phone", "123"), /DDI e DDD/);
  assert.equal(sockets.length, 0, "no socket should be opened for an invalid number");
});

test("an unwatched account stops retrying instead of looping for days", async () => {
  await hub.pair("central", "qr");
  assert.equal(sockets.length, 1);

  // Force the pairing window shut, then drop the connection the way an expired
  // QR does (408). Nobody is watching, so the hub must stand down.
  hub.closePairingWindow("central");
  closeWith(sockets[0], 408);
  await settle(2_600);

  assert.equal(sockets.length, 1, "no reconnect should be scheduled outside the pairing window");
  assert.match(account("central").lastError, /parear novamente/);
});

test("515 after pair-success reconnects immediately and is not counted as a failure", async () => {
  await hub.pair("central", "qr");
  assert.equal(sockets.length, 1);

  closeWith(sockets[0], 515);
  await settle(400);

  assert.equal(sockets.length, 2, "restartRequired must reopen the socket right away");
});

test("logout (401) clears credentials and asks for a fresh pairing", async () => {
  const dir = join(SESSIONS, "central");
  await hub.pair("central", "qr");
  assert.equal(existsSync(dir), true);

  closeWith(sockets[0], 401);
  await settle(100);

  assert.equal(existsSync(join(dir, "creds.json")), false);
  assert.equal(account("central").status, "disconnected");
  assert.match(account("central").lastError, /Pareie novamente/);
});

test("startHub does not open sockets for accounts that were never paired", async () => {
  await hub.startHub();
  assert.equal(sockets.length, 0, "unpaired accounts must wait for an admin, not spin QRs forever");
});
