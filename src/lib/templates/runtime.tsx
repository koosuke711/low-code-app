'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getLayoutForTemplate } from '@/app/_generated/templates/layouts';

export type TemplateComponentBase = {
  id: string;
  label?: string;
};

type InputComponent = TemplateComponentBase & {
  type: 'input' | 'textarea';
  placeholder?: string;
  bind?: {
    endpointPath: string;
    field: string;
  };
};

type ButtonComponent = TemplateComponentBase & {
  type: 'button';
  color?: 'primary' | 'secondary' | 'danger';
  action?: {
    type: 'callEndpoint';
    endpointPath: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  };
};

type TableComponent = TemplateComponentBase & {
  type: 'table';
  tableName: string;
  columns?: string[];
  dataSource: {
    endpointPath: string;
    primaryKey: string;
  };
  dynamicRouting?: boolean;
};

export type TemplateComponent = InputComponent | ButtonComponent | TableComponent;

const buttonColors: Record<string, string> = {
  primary: '#22d3ee',
  secondary: '#a78bfa',
  danger: '#fb7185'
};

export function TemplateSurface({
  templateId,
  routePath,
  components
}: {
  templateId: string;
  routePath: string;
  components: TemplateComponent[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [tableData, setTableData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const layout = getLayoutForTemplate(templateId);

  const tables = useMemo(
    () => components.filter((component): component is TableComponent => component.type === 'table'),
    [components]
  );

  const fetchTables = useCallback(async () => {
    if (!tables.length) return;
    const entries = await Promise.all(
      tables.map(async (table) => {
        const response = await fetch(table.dataSource.endpointPath, { cache: 'no-store' });
        const json = await response.json().catch(() => ({ data: [] }));
        const data = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
        return [table.id, data] as const;
      })
    );
    setTableData(Object.fromEntries(entries));
  }, [tables]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const resolvePayload = useCallback(
    (endpointPath: string) => {
      const payload: Record<string, any> = {};
      components.forEach((component) => {
        if ('bind' in component && component.bind && component.bind.endpointPath === endpointPath) {
          payload[component.bind.field] = values[component.id];
        }
      });
      return payload;
    },
    [components, values]
  );

  const executeAction = useCallback(
    async (action?: ButtonComponent['action']) => {
      if (!action) return;
      try {
        setLoading(true);
        const payload = resolvePayload(action.endpointPath);
        const res = await fetch(action.endpointPath, {
          method: action.method,
          headers: { 'Content-Type': 'application/json' },
          body: ['GET', 'DELETE'].includes(action.method) ? undefined : JSON.stringify(payload)
        });
        if (!res.ok) {
          console.error(await res.text());
        }
        await fetchTables();
      } finally {
        setLoading(false);
      }
    },
    [resolvePayload, fetchTables]
  );

  const renderInput = (component: InputComponent) => {
    const value = values[component.id] ?? '';
    const placeholder = component.placeholder ?? component.label ?? '';
    if (component.type === 'textarea') {
      return (
        <label key={component.id} className="generated-component">
          {component.label && <span>{component.label}</span>}
          <textarea
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValues((prev) => ({ ...prev, [component.id]: event.target.value }))}
          />
        </label>
      );
    }
    return (
      <label key={component.id} className="generated-component">
        {component.label && <span>{component.label}</span>}
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValues((prev) => ({ ...prev, [component.id]: event.target.value }))}
        />
      </label>
    );
  };

  const renderButton = (component: ButtonComponent) => {
    const color = buttonColors[component.color ?? 'primary'] ?? buttonColors.primary;
    return (
      <button
        key={component.id}
        type="button"
        disabled={loading}
        style={{ background: color }}
        onClick={() => executeAction(component.action)}
      >
        {component.label ?? '実行'}
      </button>
    );
  };

  const renderTable = (component: TableComponent) => {
    const rows = tableData[component.id] ?? [];
    const columns = component.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return (
      <div key={component.id} className="generated-table">
        {component.label && <h3>{component.label}</h3>}
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pk = row[component.dataSource.primaryKey];
              const isClickable = component.dynamicRouting && pk !== undefined && pk !== null;
              return (
                <tr
                  key={pk ?? Math.random()}
                  onClick={() => {
                    if (isClickable) {
                      router.push(`${routePath}/${pk}`);
                    }
                  }}
                  style={isClickable ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? '')}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderComponent = (component: TemplateComponent) => {
    switch (component.type) {
      case 'button':
        return renderButton(component);
      case 'table':
        return renderTable(component);
      default:
        return renderInput(component as InputComponent);
    }
  };

  const content = components.map(renderComponent);

  if (!layout) {
    return <div className="generated-template">{content}</div>;
  }

  return (
    <div className="generated-template layout-grid">
      {Object.entries(layout.areas).map(([area, componentIds]) => (
        <section key={area} className="layout-area">
          <header>
            <strong>{area}</strong>
          </header>
          <div>
            {componentIds.map((componentId) => {
              const component = components.find((item) => item.id === componentId);
              if (!component) return null;
              return <div key={component.id}>{renderComponent(component)}</div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
