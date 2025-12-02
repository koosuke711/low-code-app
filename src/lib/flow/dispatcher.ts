import {
  type FlowNode,
  type TableNode,
  type EndpointNode,
  type RouteNode,
  type TemplateNode,
  type LayoutNode
} from './schemas';
import { handleTable } from '@/lib/handlers/tableHandler';
import { handleEndpoint } from '@/lib/handlers/endpointHandler';
import { handleRoute } from '@/lib/handlers/routeHandler';
import { handleTemplate } from '@/lib/handlers/templateHandler';
import { handleLayout } from '@/lib/handlers/layoutHandler';

export async function dispatchNode(node: FlowNode) {
  switch (node.nodeType) {
    case 'table':
      return handleTable(node as TableNode);
    case 'endpoint':
      return handleEndpoint(node as EndpointNode);
    case 'route':
      return handleRoute(node as RouteNode);
    case 'template':
      return handleTemplate(node as TemplateNode);
    case 'layout':
      return handleLayout(node as LayoutNode);
    default:
      return { ok: false, error: `Unsupported nodeType ${(node as any)?.nodeType}` };
  }
}
