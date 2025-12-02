import type { TableNode } from '@/lib/flow/schemas';
import { deleteTable, upsertTable } from '@/lib/codegen/tables';

export async function handleTable(node: TableNode) {
  if (node.operation === 'delete') {
    return deleteTable(node.payload.tableName);
  }
  return upsertTable(node.payload);
}
