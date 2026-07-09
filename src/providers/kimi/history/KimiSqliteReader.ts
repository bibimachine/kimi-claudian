import { spawnSync as defaultSpawnSync } from 'node:child_process';

import { findNodeExecutable } from '../../../utils/env';

export type StoredRow = Record<string, unknown>;

export interface StoredSessionRows {
  messageRows: StoredRow[];
  partRows: StoredRow[];
}

interface SqliteModule {
  DatabaseSync: new (location: string, options?: Record<string, unknown>) => {
    close(): void;
    prepare(sql: string): {
      all(...params: unknown[]): StoredRow[];
    };
  };
}

export interface KimiSqliteReaderDependencies {
  findNodeExecutable?: () => string | null;
  requireSqliteModule?: () => SqliteModule | null;
  spawnSync?: typeof defaultSpawnSync;
}

export const KIMI_SQLITE_QUERY_MAX_BUFFER = 100 * 1024 * 1024;
export const KIMI_MESSAGE_ROW_SQL = buildKimiMessageRowsSql('?');

const KIMI_PART_ROW_SQL = buildKimiPartRowsSql('?');
const KIMI_SQLITE_CHILD_SCRIPT = `
const { DatabaseSync } = require('node:sqlite');
const [databasePath, sessionId, messageSql, partSql] = process.argv.slice(1);
let db;
try {
  db = new DatabaseSync(databasePath, { readonly: true });
  const messageRows = db.prepare(messageSql).all(sessionId);
  const partRows = db.prepare(partSql).all(sessionId);
  process.stdout.write(JSON.stringify({ messageRows, partRows }));
} finally {
  if (db) db.close();
}
`.trim();

export async function loadKimiSessionRows(
  databasePath: string,
  sessionId: string,
  dependencies: KimiSqliteReaderDependencies = {},
): Promise<StoredSessionRows | null> {
  const resolvedDependencies = resolveDependencies(dependencies);

  const viaCurrentProcess = loadSessionRowsWithCurrentProcessSqlite(
    databasePath,
    sessionId,
    resolvedDependencies.requireSqliteModule,
  );
  if (viaCurrentProcess) {
    return viaCurrentProcess;
  }

  const viaNodeProcess = loadSessionRowsWithNodeProcess(
    databasePath,
    sessionId,
    resolvedDependencies.findNodeExecutable,
    resolvedDependencies.spawnSync,
  );
  if (viaNodeProcess) {
    return viaNodeProcess;
  }

  return loadSessionRowsWithSqliteCli(
    databasePath,
    sessionId,
    resolvedDependencies.spawnSync,
  );
}

function resolveDependencies(
  dependencies: KimiSqliteReaderDependencies,
): Required<KimiSqliteReaderDependencies> {
  return {
    findNodeExecutable,
    requireSqliteModule,
    spawnSync: defaultSpawnSync,
    ...dependencies,
  };
}

function requireSqliteModule(): SqliteModule | null {
  try {
    if (typeof module === 'undefined' || typeof module.require !== 'function') {
      return null;
    }

    const sqlite = module.require('node:sqlite') as unknown;
    return isSqliteModule(sqlite) ? sqlite : null;
  } catch {
    return null;
  }
}

function isSqliteModule(value: unknown): value is SqliteModule {
  return (
    isPlainObject(value)
    && typeof value.DatabaseSync === 'function'
  );
}

function loadSessionRowsWithCurrentProcessSqlite(
  databasePath: string,
  sessionId: string,
  requireSqlite: () => SqliteModule | null,
): StoredSessionRows | null {
  const sqlite = requireSqlite();
  if (!sqlite) {
    return null;
  }

  let db: InstanceType<SqliteModule['DatabaseSync']> | null = null;
  try {
    db = new sqlite.DatabaseSync(databasePath, { readonly: true });
    const messageRows = db.prepare(KIMI_MESSAGE_ROW_SQL).all(sessionId);
    const partRows = db.prepare(KIMI_PART_ROW_SQL).all(sessionId);
    return { messageRows, partRows };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function loadSessionRowsWithNodeProcess(
  databasePath: string,
  sessionId: string,
  findNode: () => string | null,
  spawnSync: typeof defaultSpawnSync,
): StoredSessionRows | null {
  const nodePath = findNode();
  if (!nodePath) {
    return null;
  }

  const result = spawnSync(
    nodePath,
    [
      '-e',
      KIMI_SQLITE_CHILD_SCRIPT,
      databasePath,
      sessionId,
      KIMI_MESSAGE_ROW_SQL,
      KIMI_PART_ROW_SQL,
    ],
    {
      encoding: 'utf8',
      maxBuffer: KIMI_SQLITE_QUERY_MAX_BUFFER,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseStoredSessionRows(getSpawnStdout(result.stdout));
}

function loadSessionRowsWithSqliteCli(
  databasePath: string,
  sessionId: string,
  spawnSync: typeof defaultSpawnSync,
): StoredSessionRows | null {
  const escapedSessionId = escapeSqlLiteral(sessionId);
  const messageRows = runSqlite3JsonQuery(
    databasePath,
    buildKimiMessageRowsSql(`'${escapedSessionId}'`),
    spawnSync,
  );
  const partRows = runSqlite3JsonQuery(
    databasePath,
    buildKimiPartRowsSql(`'${escapedSessionId}'`),
    spawnSync,
  );

  if (!messageRows || !partRows) {
    return null;
  }

  return { messageRows, partRows };
}

function runSqlite3JsonQuery(
  databasePath: string,
  sql: string,
  spawnSync: typeof defaultSpawnSync,
): StoredRow[] | null {
  const result = spawnSync(
    'sqlite3',
    ['-json', databasePath, sql],
    {
      encoding: 'utf8',
      maxBuffer: KIMI_SQLITE_QUERY_MAX_BUFFER,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseStoredRows(getSpawnStdout(result.stdout));
}

function parseStoredSessionRows(value: string): StoredSessionRows | null {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    if (!isPlainObject(parsed)) {
      return null;
    }

    const messageRows = parseStoredRowsValue(parsed.messageRows);
    const partRows = parseStoredRowsValue(parsed.partRows);
    return messageRows && partRows ? { messageRows, partRows } : null;
  } catch {
    return null;
  }
}

function parseStoredRows(value: string): StoredRow[] | null {
  try {
    return parseStoredRowsValue(JSON.parse(value || '[]') as unknown);
  } catch {
    return null;
  }
}

function parseStoredRowsValue(value: unknown): StoredRow[] | null {
  return Array.isArray(value)
    ? value.filter((row): row is StoredRow => isPlainObject(row))
    : null;
}

function getSpawnStdout(stdout: string | Buffer | null | undefined): string {
  return typeof stdout === 'string'
    ? stdout
    : stdout?.toString('utf8') ?? '';
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll('\'', '\'\'');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildKimiMessageRowsSql(sessionIdExpression: string): string {
  return `
with message_json as (
  select
    id,
    time_created,
    data,
    json_valid(data) as data_valid
  from message
  where session_id = ${sessionIdExpression}
)
select
  id,
  time_created,
  data_valid,
  case when data_valid then json_extract(data, '$.role') end as role,
  case when data_valid then json_extract(data, '$.time.created') end as data_time_created,
  case when data_valid then json_extract(data, '$.time.completed') end as data_time_completed
from message_json
order by time_created asc, id asc;`.trim();
}

function buildKimiPartRowsSql(sessionIdExpression: string): string {
  return `
select id, message_id, data
from part
where session_id = ${sessionIdExpression}
order by message_id asc, id asc;`.trim();
}
