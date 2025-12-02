import { NextResponse, type NextRequest } from 'next/server';
import {
  BaseNodeSchema,
  EndpointNodeSchema,
  LayoutNodeSchema,
  RouteNodeSchema,
  TableNodeSchema,
  TemplateNodeSchema,
  type FlowNode
} from '@/lib/flow/schemas';
import { dispatchNode } from '@/lib/flow/dispatcher';

const schemaMap = {
  table: TableNodeSchema,
  endpoint: EndpointNodeSchema,
  route: RouteNodeSchema,
  template: TemplateNodeSchema,
  layout: LayoutNodeSchema
};

function buildError(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseResult = BaseNodeSchema.safeParse(body);
    if (!baseResult.success) {
      return NextResponse.json({ ok: false, error: baseResult.error.flatten() }, { status: 400 });
    }
    const schema = schemaMap[baseResult.data.nodeType];
    if (!schema) {
      return NextResponse.json({ ok: false, error: `Unsupported nodeType ${baseResult.data.nodeType}` }, { status: 400 });
    }
    const nodeResult = schema.safeParse(body);
    if (!nodeResult.success) {
      return NextResponse.json({ ok: false, error: nodeResult.error.flatten() }, { status: 400 });
    }
    const node = nodeResult.data as FlowNode;
    const result = await dispatchNode(node);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? 'Handler error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: result.message ?? 'Success' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: buildError(error) }, { status: 500 });
  }
}
