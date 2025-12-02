import type { ComponentType } from 'react';

type TemplateEntry = {
  templateId: string;
  Component: ComponentType;
};

type TemplateRegistry = Record<string, TemplateEntry[]>;

const registry: TemplateRegistry = {};

export function getTemplatesForRoute(routePath: string): TemplateEntry[] {
  return registry[routePath] ?? [];
}
