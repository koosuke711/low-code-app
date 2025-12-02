import fs from 'node:fs/promises';
import type { LayoutPayload } from '@/lib/flow/schemas';
import { resolveFromRoot, writeTextFile } from './utils/fs';

type Manifest = {
  layouts: Record<string, LayoutPayload>;
};

const manifestPath = resolveFromRoot('src/app/_generated/templates/layoutManifest.json');
const layoutsFile = resolveFromRoot('src/app/_generated/templates/layouts.ts');

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { layouts: {} };
  }
}

async function writeManifest(manifest: Manifest) {
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function syncLayoutsTs(manifest: Manifest) {
  const entries = Object.values(manifest.layouts);
  if (!entries.length) {
    const empty = `export type LayoutEntry = {
  layoutId: string;
  templateId: string;
  routeId: string;
  areas: Record<string, string[]>;
};

type LayoutManifest = Record<string, LayoutEntry>;

const manifest: LayoutManifest = {};

export function getLayoutForTemplate(templateId: string): LayoutEntry | undefined {
  return manifest[templateId];
}
`;
    await writeTextFile(layoutsFile, empty);
    return;
  }
  const rows = entries
    .map((entry) => `  '${entry.templateId}': ${JSON.stringify(entry)}`)
    .join(',\n');
  const content = `export type LayoutEntry = {
  layoutId: string;
  templateId: string;
  routeId: string;
  areas: Record<string, string[]>;
};

type LayoutManifest = Record<string, LayoutEntry>;

const manifest: LayoutManifest = {
${rows}
};

export function getLayoutForTemplate(templateId: string): LayoutEntry | undefined {
  return manifest[templateId];
}
`;
  await writeTextFile(layoutsFile, content);
}

export async function upsertLayout(payload: LayoutPayload) {
  const manifest = await readManifest();
  manifest.layouts[payload.layoutId] = payload;
  await writeManifest(manifest);
  await syncLayoutsTs(manifest);
  return { ok: true, message: `Layout ${payload.layoutId} applied.` };
}

export async function deleteLayout(layoutId: string) {
  const manifest = await readManifest();
  delete manifest.layouts[layoutId];
  await writeManifest(manifest);
  await syncLayoutsTs(manifest);
  return { ok: true, message: `Layout ${layoutId} removed.` };
}
