import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

export function resolveFromRoot(...segments: string[]) {
  return path.join(ROOT, ...segments);
}

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function readTextFile(filePath: string) {
  return fs.readFile(filePath, 'utf8');
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeFile(filePath: string) {
  try {
    await fs.rm(filePath, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove file', filePath, error);
  }
}

export async function moveFile(src: string, dest: string) {
  await ensureDir(path.dirname(dest));
  await fs.rename(src, dest);
}

export async function listFiles(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export function normalizeRoutePath(routePath: string) {
  if (!routePath.startsWith('/')) {
    return `/${routePath}`;
  }
  return routePath.replace(/\/$/, '') || '/';
}
