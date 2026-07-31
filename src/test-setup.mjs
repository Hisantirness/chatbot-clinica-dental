import { afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const testDb = path.join(os.tmpdir(), `clinica-test-${process.pid}.db`);
process.env.DB_PATH = testDb;

afterAll(() => {
  try {
    fs.rmSync(testDb, { force: true });
  } catch {}
});
