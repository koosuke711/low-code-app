import path from 'node:path';
import fs from 'node:fs/promises';
import type { RoutePayload } from '@/lib/flow/schemas';
import { ensureDir, moveFile, normalizeRoutePath, resolveFromRoot, writeTextFile } from './utils/fs';

type Manifest = Record<string, RoutePayload>;
const manifestPath = resolveFromRoot('src/app/_generated/routes/manifest.json');

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

function pathSegments(routePath: string) {
  return routePath
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? `[${segment.slice(1)}]` : segment));
}

function breadcrumbs(routePath: string) {
  const segments = routePath.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  segments.reduce((acc, segment) => {
    const href = `${acc}/${segment}`.replace(/\/+/g, '/');
    crumbs.push({ label: segment, href });
    return href;
  }, '');
  return crumbs;
}

function toComponentName(name: string) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/\\s+(\\w)/g, (_, char: string) => char.toUpperCase())
    .replace(/\\s/g, '');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return capitalized || 'GeneratedRoutePage';
}

function buildPageContent(routePath: string, pageName: string) {
  const crumbs = breadcrumbs(routePath);
  const crumbArray = JSON.stringify(crumbs);
  const componentName = toComponentName(pageName);
  return `import { Fragment } from 'react';
import Link from 'next/link';
import { getTemplatesForRoute } from '@/app/_generated/templates/registry';

const routePath = '${routePath}';
const crumbs = ${crumbArray};

export default function ${componentName}() {
  const templates = getTemplatesForRoute(routePath);
  return (
    <div className="generated-page">
      <nav className="breadcrumb">
        <Link href="/">/</Link>
        {crumbs.map((crumb) => (
          <Fragment key={crumb.href}>
            <span>/</span>
            <Link href={crumb.href}>{crumb.label}</Link>
          </Fragment>
        ))}
      </nav>
      <section>
        {templates.length ? (
          templates.map(({ templateId, Component }) => <Component key={templateId} />)
        ) : (
          <p>テンプレートが未割り当てです。</p>
        )}
      </section>
    </div>
  );
}
`;
}

function routeDir(routePath: string) {
  const segments = pathSegments(routePath);
  return path.join(resolveFromRoot('src/app'), ...segments);
}

export async function ensureRoute(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  await ensureDir(routeDir(normalized));
}

export async function upsertRoute(payload: RoutePayload) {
  const routePath = normalizeRoutePath(payload.path);
  const manifest = await readManifest();
  manifest[routePath] = payload;
  await writeManifest(manifest);
  const filePath = path.join(routeDir(routePath), 'page.tsx');
  await ensureDir(path.dirname(filePath));
  const content = buildPageContent(routePath, payload.pageName);
  await writeTextFile(filePath, content);
  return { ok: true, message: `Route ${routePath} generated.` };
}

export async function deleteRoute(routePath: string) {
  const normalized = normalizeRoutePath(routePath);
  const dir = routeDir(normalized);
  const manifest = await readManifest();
  delete manifest[normalized];
  await writeManifest(manifest);
  const archiveBase = path.join(resolveFromRoot('src/app/_archive'), normalized.replace(/\//g, '_'));
  try {
    await moveFile(dir, `${archiveBase}-${Date.now()}`);
  } catch {
    // ignore move errors
  }
  return { ok: true, message: `Route ${normalized} archived.` };
}

type DynamicRouteOptions = {
  routePath: string;
  endpointPath: string;
  primaryKey: string;
};

function dynamicPageContent(options: DynamicRouteOptions) {
  return `'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function GeneratedDetailPage({ params }: { params: Record<string, string> }) {
  const router = useRouter();
  const [record, setRecord] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function fetchDetail() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('${options.endpointPath}/' + params.id, { cache: 'no-store', signal: controller.signal });
        const json = await res.json();
        const data = Array.isArray(json.data) ? json.data[0] : json.data;
        setRecord(data ?? null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
    return () => controller.abort();
  }, [params.id]);

  const handleDelete = async () => {
    await fetch('${options.endpointPath}/' + params.id, { method: 'DELETE' });
    router.push('${options.routePath}');
  };

  return (
    <div className="generated-page">
      <nav className="breadcrumb">
        <Link href="${options.routePath}">戻る</Link>
      </nav>
      {loading && <p>読み込み中...</p>}
      {error && <p>{error}</p>}
      {record && (
        <div>
          <pre>{JSON.stringify(record, null, 2)}</pre>
          <button type="button" onClick={handleDelete}>削除</button>
        </div>
      )}
    </div>
  );
}
`;
}

export async function ensureDynamicRoute(routePath: string, options: DynamicRouteOptions) {
  const normalized = normalizeRoutePath(routePath);
  const dir = path.join(routeDir(normalized), '[id]');
  await ensureDir(dir);
  const filePath = path.join(dir, 'page.tsx');
  await writeTextFile(filePath, dynamicPageContent({ ...options, routePath: normalized }));
}
