import path from 'node:path';
import fs from 'node:fs/promises';
import type { EndpointPayload } from '@/lib/flow/schemas';
import { ensureDir, fileExists, removeFile, resolveFromRoot, writeTextFile } from './utils/fs';

type EndpointConfig = EndpointPayload;
type Method = EndpointConfig['method'];
type Manifest = Record<string, Partial<Record<Method, EndpointConfig>>>;

const manifestPath = resolveFromRoot('src/app/api/manifest.json');

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Manifest) {
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
}

function normalizeApiPath(apiPath: string) {
  let normalized = apiPath.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (!normalized.startsWith('/api')) {
    normalized = `/api${normalized}`;
  }
  return normalized.replace(/\/$/, '');
}

function routeSegments(apiPath: string) {
  const withoutApi = apiPath.replace(/^\/api/, '');
  return withoutApi
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? `[${segment.slice(1)}]` : segment));
}

function toIdentifier(value: string) {
  return value
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&');
}

function buildSourceResolver() {
  return `type RouteContext = { params: Record<string, string> };

type SourceBag = {
  body?: Record<string, any>;
  query: URLSearchParams;
  params: Record<string, string>;
};

function readFromSource(source: string, bag: SourceBag) {
  if (!source) return undefined;
  const [scope, ...rest] = source.split('.');
  if (scope === 'body') {
    return rest.reduce((acc, key) => (acc ? acc[key] : undefined), bag.body);
  }
  if (scope === 'query') {
    return bag.query.get(rest.join('.')) ?? undefined;
  }
  if (scope === 'params') {
    return bag.params[rest.join('.')];
  }
  return undefined;
}
`;
}

type MethodGroup = NonNullable<Manifest[string]>;

function buildWhereClauses(config: EndpointConfig, alias: string) {
  const lines: string[] = [];
  (config.where ?? []).forEach((condition, index) => {
    const valueVar = `${alias}Value${index}`;
    lines.push(`  const ${valueVar} = readFromSource('${condition.source}', bag);
  if (${valueVar} !== undefined && ${valueVar} !== null) {
    filters.push(${operatorExpression(condition.op, config.table, condition.column, valueVar)});
  }`);
  });
  const content = lines.length
    ? `  const filters: any[] = [];
${lines.join('\n')}
  const whereClause = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
`
    : '  const whereClause = undefined;\n';
  return content;
}

function operatorExpression(op: string, table: string, column: string, valueVar: string) {
  const columnId = `${toIdentifier(table)}.${toIdentifier(column)}`;
  switch (op) {
    case '=':
      return `eq(${columnId}, ${valueVar})`;
    case '!=':
      return `ne(${columnId}, ${valueVar})`;
    case '>':
      return `gt(${columnId}, ${valueVar})`;
    case '>=':
      return `gte(${columnId}, ${valueVar})`;
    case '<':
      return `lt(${columnId}, ${valueVar})`;
    case '<=':
      return `lte(${columnId}, ${valueVar})`;
    default:
      return `eq(${columnId}, ${valueVar})`;
  }
}

function needsBody(config: EndpointConfig) {
  const mappingSources = Object.values(config.fieldMapping ?? {});
  const whereSources = (config.where ?? []).map((condition) => condition.source);
  return [...mappingSources, ...whereSources].some((source) => source.startsWith('body.'));
}

function buildFieldMapping(config: EndpointConfig) {
  const entries = Object.entries(config.fieldMapping ?? {});
  if (!entries.length) {
    return '  const values = {} as Record<string, any>;\n';
  }
  const lines = entries.map(([column, source]) => {
    return `    ${column}: readFromSource('${source}', bag)`;
  });
  return `  const values = {
${lines.join(',\n')}
  } as Record<string, any>;
`;
}

function buildMethodHandler(method: Method, config: EndpointConfig) {
  const tableId = toIdentifier(config.table);
  const sourceResolver = buildWhereClauses(config, method.toLowerCase());
  const requiresBody = needsBody(config) || config.action === 'insert';
  let bodyLine = requiresBody ? '  const body = await request.json();\n' : '  const body = undefined;\n';
  const bagLine = '  const bag: SourceBag = { body, query: request.nextUrl.searchParams, params } as SourceBag;\n';
  const whereLine = sourceResolver;

  let operationBlock = '';
  if (config.action === 'select') {
    operationBlock = `  let query = db.select().from(${tableId});
  if (whereClause) {
    query = query.where(whereClause);
  }
  const data = await query;
  return NextResponse.json({ ok: true, data });`;
  } else if (config.action === 'insert') {
    const valuesBlock = buildFieldMapping(config);
    operationBlock = `${valuesBlock}  const result = await db.insert(${tableId}).values(values).returning();
  return NextResponse.json({ ok: true, data: result });`;
  } else if (config.action === 'delete') {
    operationBlock = `  if (!whereClause) {
    throw new Error('Delete endpoint requires a where clause.');
  }
  const result = await db.delete(${tableId}).where(whereClause).returning();
  return NextResponse.json({ ok: true, data: result });`;
  }

  return `export async function ${method}(request: NextRequest, context: RouteContext) {
  try {
    const params = context?.params ?? {};
${bodyLine}${bagLine}${whereLine}${operationBlock}
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
`;
}

function collectComparatorImports(methods: MethodGroup) {
  const imports = new Set<string>();
  Object.values(methods).forEach((config) => {
    if (!config) return;
    if ((config.where?.length ?? 0) > 0) {
      imports.add('and');
    }
    (config.where ?? []).forEach((condition) => {
      switch (condition.op) {
        case '=':
          imports.add('eq');
          break;
        case '!=':
          imports.add('ne');
          break;
        case '>':
          imports.add('gt');
          break;
        case '>=':
          imports.add('gte');
          break;
        case '<':
          imports.add('lt');
          break;
        case '<=':
          imports.add('lte');
          break;
        default:
          imports.add('eq');
      }
    });
    if ((config.where?.length ?? 0) > 1) {
      imports.add('and');
    }
  });
  return Array.from(imports);
}

function buildRouteFile(pathKey: string, methods: MethodGroup) {
  const methodEntries = Object.entries(methods).filter(([, config]) => Boolean(config)) as [Method, EndpointConfig][];
  if (!methodEntries.length) {
    return '';
  }
  const tables = new Set(methodEntries.map(([, config]) => config.table));
  const tableImports = Array.from(tables)
    .map((table) => `import { ${toIdentifier(table)} } from '@/db/schema/${table}';`)
    .join('\n');
  const comparatorImports = collectComparatorImports(methods);
  const comparatorLine = comparatorImports.length ? `import { ${comparatorImports.join(', ')} } from 'drizzle-orm';\n` : '';
  const handlers = methodEntries.map(([method, config]) => buildMethodHandler(method, config)).join('\n');
  return `import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
${tableImports}
${comparatorLine}${buildSourceResolver()}${handlers}`;
}

async function writeRouteFile(pathKey: string, methods: MethodGroup) {
  const content = buildRouteFile(pathKey, methods);
  const segments = routeSegments(pathKey);
  const filePath = path.join(resolveFromRoot('src/app/api'), ...segments, 'route.ts');
  if (!content) {
    if (await fileExists(filePath)) {
      await removeFile(filePath);
    }
    return;
  }
  await ensureDir(path.dirname(filePath));
  await writeTextFile(filePath, content);
}

export async function upsertEndpoint(payload: EndpointConfig) {
  const manifest = await readManifest();
  const pathKey = normalizeApiPath(payload.path);
  manifest[pathKey] = manifest[pathKey] ?? {};
  manifest[pathKey][payload.method] = payload;
  await writeManifest(manifest);
  await writeRouteFile(pathKey, manifest[pathKey]!);
  return { ok: true, message: `Endpoint ${payload.method} ${pathKey} generated.` };
}

export async function deleteEndpoint(path: string, method: Method) {
  const manifest = await readManifest();
  const pathKey = normalizeApiPath(path);
  if (!manifest[pathKey]) {
    return { ok: true, message: 'Endpoint already removed.' };
  }
  delete manifest[pathKey]![method];
  if (!Object.keys(manifest[pathKey]!).length) {
    delete manifest[pathKey];
  }
  await writeManifest(manifest);
  await writeRouteFile(pathKey, manifest[pathKey] ?? {});
  return { ok: true, message: `Endpoint ${method} ${pathKey} removed.` };
}
