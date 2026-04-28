import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './index.js';
import 'dotenv/config';

const migrationDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migrations = ['0001_initial.sql'];
const sql = getSql();

for (const migration of migrations) {
  const migrationSql = await readFile(join(migrationDir, migration), 'utf8');
  await sql.query(migrationSql);
  console.log(`Applied ${migration}`);
}
