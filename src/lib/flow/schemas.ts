import { z } from 'zod';

export const NodeTypeEnum = z.enum(['table', 'endpoint', 'route', 'template', 'layout']);
export const OperationEnum = z.enum(['upsert', 'delete']);

const foreignKeySchema = z.object({
  table: z.string().min(1),
  column: z.string().min(1),
  onDelete: z.enum(['cascade', 'restrict', 'set null', 'no action']).optional()
});

const columnSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['integer', 'text', 'real', 'boolean']),
  primaryKey: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  notNull: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  fk: foreignKeySchema.optional()
});

const tablePayloadSchema = z.object({
  tableName: z.string().min(1),
  displayName: z.string().optional(),
  columns: z.array(columnSchema).min(1)
});

const whereConditionSchema = z.object({
  column: z.string().min(1),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=']),
  source: z.string().min(1)
});

const endpointPayloadSchema = z.object({
  method: z.enum(['GET', 'POST', 'DELETE']),
  path: z.string().min(1),
  table: z.string().min(1),
  action: z.enum(['select', 'insert', 'delete']),
  fieldMapping: z.record(z.string()).optional(),
  where: z.array(whereConditionSchema).optional()
});

const routePayloadSchema = z.object({
  routeId: z.string().min(1),
  path: z.string().min(1),
  pageName: z.string().min(1),
  dynamic: z.boolean().default(false)
});

const baseComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional()
});

const inputComponentSchema = baseComponentSchema.extend({
  type: z.enum(['input', 'textarea']),
  placeholder: z.string().optional(),
  bind: z
    .object({
      endpointPath: z.string().min(1),
      field: z.string().min(1)
    })
    .optional()
});

const buttonComponentSchema = baseComponentSchema.extend({
  type: z.literal('button'),
  color: z.enum(['primary', 'secondary', 'danger']).optional(),
  action: z
    .object({
      type: z.literal('callEndpoint'),
      endpointPath: z.string().min(1),
      method: z.enum(['POST', 'GET', 'PUT', 'PATCH', 'DELETE']).default('POST')
    })
    .optional()
});

const tableComponentSchema = baseComponentSchema.extend({
  type: z.literal('table'),
  tableName: z.string().min(1),
  columns: z.array(z.string().min(1)).optional(),
  dataSource: z.object({
    endpointPath: z.string().min(1),
    primaryKey: z.string().min(1)
  }),
  dynamicRouting: z.boolean().optional()
});

const templatePayloadSchema = z.object({
  templateId: z.string().min(1),
  routePath: z.string().min(1),
  components: z.array(z.union([inputComponentSchema, buttonComponentSchema, tableComponentSchema]))
});

const layoutPayloadSchema = z.object({
  layoutId: z.string().min(1),
  templateId: z.string().min(1),
  routeId: z.string().min(1),
  areas: z.record(z.array(z.string().min(1))).default({})
});

export const BaseNodeSchema = z.object({
  nodeType: NodeTypeEnum,
  operation: OperationEnum,
  payload: z.unknown()
});

export const TableNodeSchema = z.discriminatedUnion('operation', [
  z.object({
    nodeType: z.literal('table'),
    operation: z.literal('upsert'),
    payload: tablePayloadSchema
  }),
  z.object({
    nodeType: z.literal('table'),
    operation: z.literal('delete'),
    payload: z.object({ tableName: z.string().min(1) })
  })
]);

export const EndpointNodeSchema = z.discriminatedUnion('operation', [
  z.object({
    nodeType: z.literal('endpoint'),
    operation: z.literal('upsert'),
    payload: endpointPayloadSchema
  }),
  z.object({
    nodeType: z.literal('endpoint'),
    operation: z.literal('delete'),
    payload: z.object({ path: z.string().min(1), method: z.enum(['GET', 'POST', 'DELETE']) })
  })
]);

export const RouteNodeSchema = z.discriminatedUnion('operation', [
  z.object({
    nodeType: z.literal('route'),
    operation: z.literal('upsert'),
    payload: routePayloadSchema
  }),
  z.object({
    nodeType: z.literal('route'),
    operation: z.literal('delete'),
    payload: z.object({ path: z.string().min(1) })
  })
]);

export const TemplateNodeSchema = z.discriminatedUnion('operation', [
  z.object({
    nodeType: z.literal('template'),
    operation: z.literal('upsert'),
    payload: templatePayloadSchema
  }),
  z.object({
    nodeType: z.literal('template'),
    operation: z.literal('delete'),
    payload: z.object({ templateId: z.string().min(1) })
  })
]);

export const LayoutNodeSchema = z.discriminatedUnion('operation', [
  z.object({
    nodeType: z.literal('layout'),
    operation: z.literal('upsert'),
    payload: layoutPayloadSchema
  }),
  z.object({
    nodeType: z.literal('layout'),
    operation: z.literal('delete'),
    payload: z.object({ layoutId: z.string().min(1) })
  })
]);

export type TablePayload = z.infer<typeof tablePayloadSchema>;
export type EndpointPayload = z.infer<typeof endpointPayloadSchema>;
export type RoutePayload = z.infer<typeof routePayloadSchema>;
export type TemplatePayload = z.infer<typeof templatePayloadSchema>;
export type LayoutPayload = z.infer<typeof layoutPayloadSchema>;

export type TableNode = z.infer<typeof TableNodeSchema>;
export type EndpointNode = z.infer<typeof EndpointNodeSchema>;
export type RouteNode = z.infer<typeof RouteNodeSchema>;
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;
export type LayoutNode = z.infer<typeof LayoutNodeSchema>;

export type FlowNode = TableNode | EndpointNode | RouteNode | TemplateNode | LayoutNode;
