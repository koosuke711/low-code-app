import type { RouteNode } from '@/lib/flow/schemas';
import { deleteRoute, ensureRoute, upsertRoute } from '@/lib/codegen/routes';

export async function handleRoute(node: RouteNode) {
  if (node.operation === 'delete') {
    return deleteRoute(node.payload.path);
  }
  await ensureRoute(node.payload.path);
  return upsertRoute(node.payload);
}
