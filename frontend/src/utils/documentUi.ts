/** Libellés et classes visuelles communs (statuts, étiquettes). */

function normalizeStatusKey(status: unknown): string {
  if (status == null || status === '') return ''
  let s = String(status).trim().toLowerCase()
  const typos: Record<string, string> = {
    actit: 'active',
    activ: 'active',
    activee: 'active',
    actif: 'active',
  }
  if (typos[s]) s = typos[s]
  s = s.replace(/\s+/g, '_').replace(/-/g, '_')
  if (s === 'inreview' || s === 'in_review' || s === 'pending' || s === 'review') return 'in_review'
  return s
}

export function dashboardStatusBucket(status: unknown): string {
  const s = normalizeStatusKey(status)
  if (s === 'pending_approval') return 'En attente validation'
  if (s === 'draft' || s === 'brouillon') return 'Brouillon'
  if (s === 'in_review') return 'En relecture'
  if (s === 'approved') return 'Approuvé'
  if (s === 'archived') return 'Archivé'
  if (s === 'active') return 'Actif'
  if (s === 'rejected') return 'Rejeté'
  return 'Autre'
}

const STATUS_BADGE: Record<string, string> = {
  pending_approval:
    'inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300',
  draft:
    'inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  brouillon:
    'inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  in_review:
    'inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300',
  approved:
    'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  active:
    'inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300',
  archived:
    'inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
  rejected:
    'inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300',
  changes_requested:
    'inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300',
  completed:
    'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  running:
    'inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-300',
  in_progress:
    'inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-300',
  cancelled:
    'inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
}

export function statusBadgeClass(status: unknown): string {
  const s = normalizeStatusKey(status)
  return STATUS_BADGE[s] || STATUS_BADGE.draft
}

export function statusLabelFr(status: unknown): string {
  const s = normalizeStatusKey(status)
  const map: Record<string, string> = {
    pending_approval: 'En attente validation',
    draft: 'Brouillon',
    brouillon: 'Brouillon',
    in_review: 'En relecture',
    pending: 'En relecture',
    approved: 'Approuvé',
    archived: 'Archivé',
    active: 'Actif',
    rejected: 'Rejeté',
    changes_requested: 'Modifications demandées',
    completed: 'Terminé',
    running: 'En cours',
    in_progress: 'En cours',
    cancelled: 'Annulé',
  }
  if (map[s]) return map[s]
  const raw = status ? String(status).trim() : ''
  if (!raw) return '—'
  const lower = raw.toLowerCase()
  if (lower === 'actit' || lower === 'activ') return 'Actif'
  return raw
}

export function statusLabel(status: unknown, t: (k: string) => string): string {
  const s = normalizeStatusKey(status)
  const key = `documentStatus.${s || 'unknown'}`
  const out = t(key)
  if (out && out !== key) return out
  return statusLabelFr(status)
}

export function workflowTimelineAction(action: unknown, t: (k: string) => string): string {
  const raw = String(action || '').toLowerCase()
  const a = raw === 'request-changes' ? 'request_changes' : raw.replace(/-/g, '_')
  const key = `documentDetail.wfTimeline.${a}`
  const translated = t(key)
  return translated !== key ? translated : String(action || t('common.emDash'))
}

export const DEFAULT_DOCUMENT_CATEGORY = 'Général'

export const DOCUMENT_CATEGORY_PRESETS = [
  DEFAULT_DOCUMENT_CATEGORY,
  'Contrat',
  'Facture',
  'Rapport',
  'Lettre',
  'Candidature',
  'Devis',
  'RH',
  'Finance',
  'Juridique',
  'Commercial',
] as const

export function normalizeDocumentCategory(name: unknown): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  if (lower === 'general' || lower === 'général') return DEFAULT_DOCUMENT_CATEGORY
  return trimmed
}

export function mergeDocumentCategories(
  rawList: unknown[],
  { ensureDefault = true }: { ensureDefault?: boolean } = {},
): string[] {
  const byKey = new Map<string, string>()
  for (const raw of rawList) {
    const canonical = normalizeDocumentCategory(raw)
    if (!canonical) continue
    const key = canonical.toLowerCase()
    if (!byKey.has(key) || canonical === DEFAULT_DOCUMENT_CATEGORY) {
      byKey.set(key, canonical)
    }
  }
  if (ensureDefault && !byKey.has(DEFAULT_DOCUMENT_CATEGORY.toLowerCase())) {
    byKey.set(DEFAULT_DOCUMENT_CATEGORY.toLowerCase(), DEFAULT_DOCUMENT_CATEGORY)
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' }),
  )
}

const TAG_CHIP: Record<string, string> = {
  important:
    'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300',
  work: 'inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300',
  personnel:
    'inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300',
  archive:
    'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  urgent:
    'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300',
  relire:
    'inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-300',
  default:
    'inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground',
}

export function tagChipClass(tag: unknown): string {
  const t = String(tag || '').trim().toLowerCase()
  if (!t) return TAG_CHIP.default
  if (t.includes('important')) return TAG_CHIP.important
  if (t.includes('travail') || t === 'work') return TAG_CHIP.work
  if (t.includes('personnel') || t.includes('personal')) return TAG_CHIP.personnel
  if (t.includes('archive')) return TAG_CHIP.archive
  if (t.includes('urgent')) return TAG_CHIP.urgent
  if (t.includes('relire') || t.includes('à relire')) return TAG_CHIP.relire
  return TAG_CHIP.default
}
