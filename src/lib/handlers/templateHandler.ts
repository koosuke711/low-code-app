import type { TemplateNode } from '@/lib/flow/schemas';
import { deleteTemplate, upsertTemplate } from '@/lib/codegen/templates';

export async function handleTemplate(node: TemplateNode) {
  if (node.operation === 'delete') {
    return deleteTemplate(node.payload.templateId);
  }
  return upsertTemplate(node.payload);
}
