import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Save } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import { Separator } from '@/components/shadcn/separator'
import { useToast } from '../state/ToastContext'

const PALETTE = [
  { type: 'start', label: 'Début', color: '#10b981' },
  { type: 'approval', label: 'Approbation', color: '#4f46e5' },
  { type: 'reject', label: 'Rejet', color: '#dc2626' },
  { type: 'condition', label: 'Condition', color: '#f59e0b' },
  { type: 'notification', label: 'Notification', color: '#0ea5e9' },
  { type: 'delay', label: 'Délai', color: '#8b5cf6' },
  { type: 'end', label: 'Fin', color: '#64748b' },
]

function FlowNode({ data, type }: { data: any; type: string }) {
  const meta = PALETTE.find((p) => p.type === type) || PALETTE[0]
  return (
    <div
      className="min-w-[160px] rounded-lg border-2 bg-card px-3 py-2 text-xs shadow-sm"
      style={{ borderColor: meta.color }}
    >
      <Handle type="target" position={Position.Top} className="size-2.5! bg-muted-foreground!" />
      <strong className="block text-sm">{data?.label || meta.label}</strong>
      {type === 'approval' && data?.assigneeType ? (
        <span className="mt-1 block text-muted-foreground">
          {data.assigneeType} #{data.assigneeId}
        </span>
      ) : null}
      {type === 'condition' ? (
        <span className="mt-1 block text-muted-foreground">
          {data?.field || 'amount'} {data?.operator || '>'} {data?.value ?? 0}
        </span>
      ) : null}
      {type === 'delay' ? (
        <span className="mt-1 block text-muted-foreground">{data?.days ?? 1} j</span>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="size-2.5! bg-muted-foreground!"
      />
      {type === 'approval' ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="approve"
            className="size-2.5! bg-emerald-500!"
          />
          <Handle
            type="source"
            position={Position.Left}
            id="reject"
            className="size-2.5! bg-rose-500!"
          />
        </>
      ) : null}
      {type === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="size-2.5! bg-emerald-500!"
          />
          <Handle
            type="source"
            position={Position.Left}
            id="false"
            className="size-2.5! bg-rose-500!"
          />
        </>
      ) : null}
    </div>
  )
}

const nodeTypes = {
  start: (props: any) => <FlowNode {...props} type="start" />,
  approval: (props: any) => <FlowNode {...props} type="approval" />,
  reject: (props: any) => <FlowNode {...props} type="reject" />,
  condition: (props: any) => <FlowNode {...props} type="condition" />,
  notification: (props: any) => <FlowNode {...props} type="notification" />,
  delay: (props: any) => <FlowNode {...props} type="delay" />,
  end: (props: any) => <FlowNode {...props} type="end" />,
}

const DEFAULT_GRAPH = {
  nodes: [
    { id: 'start-1', type: 'start', position: { x: 280, y: 40 }, data: { label: 'Début' } },
    {
      id: 'approval-1',
      type: 'approval',
      position: { x: 240, y: 160 },
      data: { label: 'Validation manager', assigneeType: 'role', assigneeId: 2, dueHours: 48 },
    },
    { id: 'end-1', type: 'end', position: { x: 280, y: 300 }, data: { label: 'Terminé' } },
  ],
  edges: [
    { id: 'e1', source: 'start-1', target: 'approval-1' },
    { id: 'e2', source: 'approval-1', target: 'end-1', sourceHandle: 'approve' },
  ],
}

let nodeSeq = 1

export default function VisualWorkflowEditorPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id')

  const [meta, setMeta] = useState({
    name: '',
    description: '',
    documentCategory: 'Général',
  })
  const [roles, setRoles] = useState<any[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onConnect = useCallback(
    (connection: any) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          eds,
        ),
      ),
    [setEdges],
  )

  useEffect(() => {
    const boot = async () => {
      try {
        const rolesRes = await api.get('/roles')
        setRoles(rolesRes.data?.data || [])
      } catch {
        setRoles([])
      }
      if (!editId) {
        setNodes(DEFAULT_GRAPH.nodes as any)
        setEdges(DEFAULT_GRAPH.edges as any)
        setMeta({ name: 'Workflow visuel', description: '', documentCategory: 'Général' })
        return
      }
      const res = await api.get(`/workflows/visual/${editId}`)
      const wf = res.data?.data
      const def = wf?.visual_definition
      if (def?.nodes?.length) {
        setNodes(def.nodes)
        setEdges(def.edges || [])
      }
      setMeta({
        name: wf?.name || '',
        description: wf?.description || '',
        documentCategory: wf?.document_category || 'Général',
      })
    }
    void boot()
  }, [editId, setNodes, setEdges])

  const selected = useMemo(
    () => nodes.find((n: any) => n.id === selectedNode) || null,
    [nodes, selectedNode],
  )

  const addBlock = (type: string) => {
    nodeSeq += 1
    const id = `${type}-${nodeSeq}`
    const base = PALETTE.find((p) => p.type === type)
    const data: any = { label: base?.label || type }
    if (type === 'approval') {
      data.assigneeType = 'role'
      data.assigneeId = roles[0]?.id || 2
      data.dueHours = 24
    }
    if (type === 'condition') {
      data.field = 'amount'
      data.operator = '>'
      data.value = 10000
    }
    if (type === 'delay') data.days = 3
    if (type === 'notification') {
      data.title = 'Notification workflow'
      data.message = 'Étape automatique exécutée'
      data.targetType = 'owner'
    }
    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: {
          x: 120 + (nds.length % 4) * 160,
          y: 80 + Math.floor(nds.length / 4) * 120,
        },
        data,
      } as any,
    ])
  }

  const updateSelectedData = (patch: any) => {
    if (!selectedNode) return
    setNodes((nds: any) =>
      nds.map((n: any) =>
        n.id === selectedNode ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    )
  }

  const save = async () => {
    if (!meta.name.trim()) {
      toast.error(t('visualWorkflow.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const definition = { version: 1, nodes, edges }
      if (editId) {
        await api.put(`/workflows/visual/${editId}`, { ...meta, definition })
        toast.success(t('visualWorkflow.saved'))
      } else {
        const res = await api.post('/workflows/visual', { ...meta, definition })
        toast.success(t('visualWorkflow.created'))
        navigate(`/workflows/visual-editor?id=${res.data.data.id}`, { replace: true })
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('visualWorkflow.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('visualWorkflow.title')}
        subtitle={t('visualWorkflow.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/workflows/templates">
                <ArrowLeft className="mr-2 size-4" />
                {t('visualWorkflow.backTemplates')}
              </Link>
            </Button>
            <Button onClick={save} disabled={saving} size="sm">
              <Save className="mr-2 size-4" />
              {saving ? t('common.saving') : t('visualWorkflow.save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="vf-name">{t('visualWorkflow.name')}</Label>
            <Input
              id="vf-name"
              value={meta.name}
              onChange={(e) => setMeta((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vf-cat">{t('common.category')}</Label>
            <Input
              id="vf-cat"
              value={meta.documentCategory}
              onChange={(e) => setMeta((p) => ({ ...p, documentCategory: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vf-desc">{t('visualWorkflow.description')}</Label>
            <Input
              id="vf-desc"
              value={meta.description}
              onChange={(e) => setMeta((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">{t('visualWorkflow.palette')}</h3>
          <div className="space-y-1.5">
            {PALETTE.map((block) => (
              <button
                key={block.type}
                type="button"
                className="flex w-full items-center gap-2 rounded-md border-l-4 bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                style={{ borderLeftColor: block.color }}
                onClick={() => addBlock(block.type)}
              >
                {block.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('visualWorkflow.paletteHint')}</p>
        </aside>

        <div className="h-[70vh] rounded-lg border bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            onNodeClick={(_, node) => setSelectedNode(node.id)}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <aside className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">{t('visualWorkflow.inspector')}</h3>
          <Separator className="mb-3" />
          {!selected ? (
            <p className="text-xs text-muted-foreground">{t('visualWorkflow.selectNode')}</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vf-node-label">{t('visualWorkflow.nodeLabel')}</Label>
                <Input
                  id="vf-node-label"
                  value={(selected as any).data?.label || ''}
                  onChange={(e) => updateSelectedData({ label: e.target.value })}
                />
              </div>
              {(selected as any).type === 'approval' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-assignee-type">
                      {t('visualWorkflow.assigneeType')}
                    </Label>
                    <Select
                      value={(selected as any).data?.assigneeType || 'role'}
                      onValueChange={(v) => updateSelectedData({ assigneeType: v })}
                    >
                      <SelectTrigger id="vf-assignee-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="role">{t('visualWorkflow.role')}</SelectItem>
                        <SelectItem value="user">{t('visualWorkflow.user')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-assignee">{t('visualWorkflow.assignee')}</Label>
                    <Select
                      value={String((selected as any).data?.assigneeId || '')}
                      onValueChange={(v) => updateSelectedData({ assigneeId: Number(v) })}
                    >
                      <SelectTrigger id="vf-assignee">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r: any) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-due">{t('visualWorkflow.dueHours')}</Label>
                    <Input
                      id="vf-due"
                      type="number"
                      value={(selected as any).data?.dueHours ?? 24}
                      onChange={(e) =>
                        updateSelectedData({ dueHours: Number(e.target.value) })
                      }
                    />
                  </div>
                </>
              ) : null}
              {(selected as any).type === 'condition' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-field">{t('visualWorkflow.conditionField')}</Label>
                    <Input
                      id="vf-field"
                      value={(selected as any).data?.field || 'amount'}
                      onChange={(e) => updateSelectedData({ field: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-op">{t('visualWorkflow.operator')}</Label>
                    <Select
                      value={(selected as any).data?.operator || '>'}
                      onValueChange={(v) => updateSelectedData({ operator: v })}
                    >
                      <SelectTrigger id="vf-op">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=">">{`>`}</SelectItem>
                        <SelectItem value=">=">{`>=`}</SelectItem>
                        <SelectItem value="<">{`<`}</SelectItem>
                        <SelectItem value="<=">{`<=`}</SelectItem>
                        <SelectItem value="==">{`=`}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vf-threshold">{t('visualWorkflow.threshold')}</Label>
                    <Input
                      id="vf-threshold"
                      type="number"
                      value={(selected as any).data?.value ?? 10000}
                      onChange={(e) => updateSelectedData({ value: Number(e.target.value) })}
                    />
                  </div>
                </>
              ) : null}
              {(selected as any).type === 'delay' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="vf-days">{t('visualWorkflow.delayDays')}</Label>
                  <Input
                    id="vf-days"
                    type="number"
                    value={(selected as any).data?.days ?? 1}
                    onChange={(e) => updateSelectedData({ days: Number(e.target.value) })}
                  />
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
