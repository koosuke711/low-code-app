import type { LayoutNode } from '@/lib/flow/schemas';
import { deleteLayout, upsertLayout } from '@/lib/codegen/layout';

export async function handleLayout(node: LayoutNode) {
  if (node.operation === 'delete') {
    return deleteLayout(node.payload.layoutId);
  }
  return upsertLayout(node.payload);
}
