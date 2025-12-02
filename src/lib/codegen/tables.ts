import path from 'node:path';
import Database from 'better-sqlite3';
import type { TablePayload } from '@/lib/flow/schemas';
import { ensureDir, fileExists, listFiles, moveFile, resolveFromRoot, writeTextFile } from './utils/fs';
import { runDrizzle } from './utils/runDrizzle';

const schemaDir = resolveFromRoot('src/db/schema');
const archiveDir = path.join(schemaDir, '_archive');

type Column = TablePayload['columns'][number];

const typeMap: Record<Column['type'], string> = {
  integer: 'integer',
  text: 'text',
  real: 'real',
  boolean: 'integer'
};

function toIdentifier(value: string) {
  return value
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&');
}

function formatDefault(defaultValue: Column['default']) {
  if (typeof defaultValue === 'string') {
    return `"${defaultValue}"`;
  }
  if (defaultValue === undefined) return undefined;
  return String(defaultValue);
}

function columnToString(column: Column, tableId: string, tableName: string) {
  const identifier = toIdentifier(column.name);
  const baseType = typeMap[column.type];
  let builder = `${baseType}("${column.name}")`;
  if (column.type === 'boolean') {
    builder += '.$type<boolean>()';
  }
  if (column.primaryKey) {
    const pkOptions = column.autoIncrement ? '{ autoIncrement: true }' : '';
    builder += `.primaryKey(${pkOptions})`;
  }
  if (column.notNull) {
    builder += '.notNull()';
  }
  const defaultValue = formatDefault(column.default);
  if (defaultValue !== undefined) {
    builder += `.default(${defaultValue})`;
  }
  if (column.fk) {
    const fkTable =
      column.fk.table === tableName ? tableId : toIdentifier(column.fk.table);
    const fkColumn = toIdentifier(column.fk.column);
    const onDelete = column.fk.onDelete ? `{ onDelete: "${column.fk.onDelete}" }` : 'undefined';
    builder += `.references(() => ${fkTable}.${fkColumn}, ${onDelete})`;
  }
  return `${identifier}: ${builder}`;
}

function buildImports(payload: TablePayload) {
  const imports = new Set(['sqliteTable']);
  payload.columns.forEach((column) => {
    imports.add(typeMap[column.type]);
  });
  return `import { ${Array.from(imports).sort().join(', ')} } from 'drizzle-orm/sqlite-core';`;
}

function buildForeignKeyImports(payload: TablePayload) {
  const fkTables = new Set<string>();
  payload.columns.forEach((column) => {
    if (column.fk && column.fk.table !== payload.tableName) {
      fkTables.add(column.fk.table);
    }
  });
  return Array.from(fkTables)
    .map((table) => `import { ${toIdentifier(table)} } from './${table}';`)
    .join('\n');
}

function generateTableContent(payload: TablePayload) {
  const imports = buildImports(payload);
  const fkImports = buildForeignKeyImports(payload);
  const tableId = toIdentifier(payload.tableName);
  const columns = payload.columns.map((column) => columnToString(column, tableId, payload.tableName)).join(',\n  ');
  const headerComment = payload.displayName ? `// ${payload.displayName}\n` : '';
  const fkSection = fkImports ? `\n${fkImports}` : '';
  return `${headerComment}${imports}${fkSection ? `\n${fkSection}` : ''}

export const ${tableId} = sqliteTable('${payload.tableName}', {
  ${columns}
});
`;}

async function updateSchemaIndex() {
  const files = (await listFiles(schemaDir))
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts' && !file.startsWith('_'))
    .sort();
  const exports = files.map((file) => `export * from './${path.basename(file, '.ts')}';`).join('\n');
  const content = exports || 'export {};\n';
  await writeTextFile(path.join(schemaDir, 'index.ts'), `// Auto-generated schema exports\n${content}`);
}

function sanitizeTableIdentifier(tableName: string) {
  const normalized = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  return normalized;
}

async function dropTable(tableName: string) {
  const db = new Database(resolveFromRoot('sqlite.db'));
  db.prepare(`DROP TABLE IF EXISTS ${sanitizeTableIdentifier(tableName)};`).run();
  db.close();
}

export async function upsertTable(payload: TablePayload) {
  const tableFile = path.join(schemaDir, `${payload.tableName}.ts`);
  const content = generateTableContent(payload);
  await writeTextFile(tableFile, content);
  await updateSchemaIndex();
  await runDrizzle();
  return { ok: true, message: `Table ${payload.tableName} synced.` };
}

export async function deleteTable(tableName: string) {
  const sourceFile = path.join(schemaDir, `${tableName}.ts`);
  if (await fileExists(sourceFile)) {
    const archived = path.join(archiveDir, `${tableName}-${Date.now()}.ts`);
    await ensureDir(archiveDir);
    await moveFile(sourceFile, archived);
  }
  await updateSchemaIndex();
  await dropTable(tableName);
  await runDrizzle();
  return { ok: true, message: `Table ${tableName} archived.` };
}
