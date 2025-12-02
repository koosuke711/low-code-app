import path from 'node:path';
import fs from 'node:fs/promises';
import type { TemplatePayload } from '@/lib/flow/schemas';
import { ensureDir, removeFile, resolveFromRoot, writeTextFile } from './utils/fs';
import { ensureRoute, ensureDynamicRoute } from './routes';

type Manifest = {
  templates: Record<string, { templateId: string; routePath: string }>;
};

const manifestPath = resolveFromRoot('src/app/_generated/templates/manifest.json');
const registryPath = resolveFromRoot('src/app/_generated/templates/registry.ts');

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { templates: {} };
  }
}

async function writeManifest(manifest: Manifest) {
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
}

function toComponentName(templateId: string) {
  const cleaned = templateId
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/\s+(\w)/g, (_, char: string) => char.toUpperCase())
    .replace(/\s/g, '');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return capitalized || 'GeneratedTemplate';
}

function templateFilePath(templateId: string) {
  return path.join(resolveFromRoot('src/app/_generated/templates'), `${templateId}.tsx`);
}

function buildTemplateFile(payload: TemplatePayload) {
  const componentName = toComponentName(payload.templateId);
  const components = JSON.stringify(payload.components, null, 2);
  return `import { TemplateSurface } from '@/lib/templates/runtime';
import type { TemplateComponent } from '@/lib/templates/runtime';

const componentsConfig = ${components} satisfies TemplateComponent[];

export default function ${componentName}() {
  return (
    <TemplateSurface templateId="${payload.templateId}" routePath="${payload.routePath}" components={componentsConfig} />
  );
}
`;
}

async function updateRegistry(manifest: Manifest) {
  const entries = Object.values(manifest.templates);
  if (!entries.length) {
    const empty = `import type { ComponentType } from 'react';

type TemplateEntry = { templateId: string; Component: ComponentType };

const registry: Record<string, TemplateEntry[]> = {};

export function getTemplatesForRoute(routePath: string): TemplateEntry[] {
  return registry[routePath] ?? [];
}
`;
    await writeTextFile(registryPath, empty);
    return;
  }

  const imports = entries
    .map((entry) => `import ${toComponentName(entry.templateId)} from './${entry.templateId}';`)
    .join('\n');
  const grouped = entries.reduce<Record<string, { templateId: string; component: string }[]>>((acc, entry) => {
    acc[entry.routePath] = acc[entry.routePath] ?? [];
    acc[entry.routePath].push({ templateId: entry.templateId, component: toComponentName(entry.templateId) });
    return acc;
  }, {});
  const registryLiteral = Object.entries(grouped)
    .map(([route, templates]) => {
      const list = templates
        .map((item) => `{ templateId: '${item.templateId}', Component: ${item.component} }`)
        .join(', ');
      return `  '${route}': [${list}]`;
    })
    .join(',\n');

  const content = `import type { ComponentType } from 'react';
${imports}

type TemplateEntry = { templateId: string; Component: ComponentType };

const registry: Record<string, TemplateEntry[]> = {
${registryLiteral}
};

export function getTemplatesForRoute(routePath: string): TemplateEntry[] {
  return registry[routePath] ?? [];
}
`;
  await writeTextFile(registryPath, content);
}

async function ensureDynamicPages(payload: TemplatePayload) {
  const dynamicTables = payload.components.filter(
    (component): component is Extract<TemplatePayload['components'][number], { type: 'table' }> =>
      component.type === 'table' && Boolean(component.dynamicRouting)
  );
  await Promise.all(
    dynamicTables.map((table) =>
      ensureDynamicRoute(payload.routePath, {
        routePath: payload.routePath,
        endpointPath: table.dataSource.endpointPath,
        primaryKey: table.dataSource.primaryKey
      })
    )
  );
}

export async function upsertTemplate(payload: TemplatePayload) {
  const manifest = await readManifest();
  manifest.templates[payload.templateId] = { templateId: payload.templateId, routePath: payload.routePath };
  await ensureRoute(payload.routePath);
  await ensureDynamicPages(payload);
  await writeManifest(manifest);
  const filePath = templateFilePath(payload.templateId);
  await ensureDir(path.dirname(filePath));
  await writeTextFile(filePath, buildTemplateFile(payload));
  await updateRegistry(manifest);
  return { ok: true, message: `Template ${payload.templateId} generated.` };
}

export async function deleteTemplate(templateId: string) {
  const manifest = await readManifest();
  delete manifest.templates[templateId];
  await writeManifest(manifest);
  await updateRegistry(manifest);
  await removeFile(templateFilePath(templateId));
  return { ok: true, message: `Template ${templateId} removed.` };
}
