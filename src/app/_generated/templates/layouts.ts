export type LayoutEntry = {
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
