import type { EndpointNode } from '@/lib/flow/schemas';
import { deleteEndpoint, upsertEndpoint } from '@/lib/codegen/endpoints';

export async function handleEndpoint(node: EndpointNode) {
  if (node.operation === 'delete') {
    return deleteEndpoint(node.payload.path, node.payload.method);
  }
  return upsertEndpoint(node.payload);
}
