import type { ExplainNode, ExplainPlan } from '@shared/types'

export function ExplainTree({ plan }: { plan: ExplainPlan }) {
  return (
    <div className="explain-tree">
      <div className="toolbar">
        <strong>Query plan</strong>
        <span className="tiny muted">
          {plan.planningTime != null ? `Planning ${plan.planningTime.toFixed(2)} ms` : ''}
          {plan.executionTime != null ? ` · Execution ${plan.executionTime.toFixed(2)} ms` : ''}
        </span>
      </div>
      <div className="explain-nodes">
        <NodeView node={plan.root} depth={0} />
      </div>
    </div>
  )
}

function NodeView({ node, depth }: { node: ExplainNode; depth: number }) {
  const cost = node.actualTime ?? node.totalCost
  const width = Math.max(8, Math.min(100, Number(cost ?? 8)))
  return (
    <div className="explain-node" style={{ marginLeft: depth * 16 }}>
      <div className="explain-head">
        <strong>{node.nodeType}</strong>
        {node.relation && <span className="badge">{node.relation}</span>}
        <span className="tiny muted">
          {node.actualRows != null ? `${node.actualRows} rows` : node.planRows != null ? `${node.planRows} est.` : ''}
          {node.actualTime != null ? ` · ${node.actualTime.toFixed(2)} ms` : ''}
        </span>
      </div>
      <div className="explain-bar">
        <span style={{ width: `${width}%` }} />
      </div>
      {node.children.map((child, index) => (
        <NodeView key={`${child.nodeType}-${index}`} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}
