import { useCallback, useEffect, useState } from 'react'
import api, { hasStoredAuthSession } from '../services/api/client'
import i18n from '../i18n.js'

const emptyMeta = () => ({
  totalBytes: 0,
  byMonth: {},
  mimeByKind: { Images: 0, PDF: 0, Office: 0, Autres: 0 },
  byStatus: {},
  documentPoints: [],
})

export function useDashboardData() {
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsReady, setStatsReady] = useState(false)
  const [error, setError] = useState(null)
  const [recentDocuments, setRecentDocuments] = useState([])
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [pendingTasks, setPendingTasks] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [documentsAccessible, setDocumentsAccessible] = useState(false)
  const [meta, setMeta] = useState(emptyMeta)
  const [archivable, setArchivable] = useState({ count: 0, documents: [] })

  const load = useCallback(async () => {
    if (!hasStoredAuthSession()) {
      setLoading(false)
      setStatsLoading(false)
      setStatsReady(false)
      setError(null)
      setRecentDocuments([])
      setTotalDocuments(0)
      setPendingTasks([])
      setAuditLogs([])
      setDocumentsAccessible(false)
      setMeta(emptyMeta())
      setArchivable({ count: 0, documents: [] })
      return
    }

    setLoading(true)
    setStatsLoading(true)
    setError(null)
    setDocumentsAccessible(false)
    setStatsReady(false)

    try {
      const [statsResult, docRes, taskRes, auditRes, archivableRes] = await Promise.allSettled([
        api.get('/documents/stats'),
        api.get('/documents?page=1&limit=5'),
        api.get('/workflows/instances?status=pending'),
        api.get('/audit-logs'),
        api.get('/documents/archivable'),
      ])

      let statsPayload = null
      if (statsResult.status === 'fulfilled') {
        statsPayload = statsResult.value.data?.data
      } else {
        const msg =
          statsResult.reason?.response?.data?.message ||
          statsResult.reason?.message ||
          i18n.t('dashboard.errors.stats')
        setError(msg)
      }

      if (statsPayload) {
        setTotalDocuments(Number(statsPayload.total) || 0)
        setMeta({
          totalBytes: Number(statsPayload.totalBytes) || 0,
          byMonth:
            statsPayload.byMonth && typeof statsPayload.byMonth === 'object'
              ? statsPayload.byMonth
              : {},
          mimeByKind: {
            Images: Number(statsPayload.byMimeCategory?.Images) || 0,
            PDF: Number(statsPayload.byMimeCategory?.PDF) || 0,
            Office: Number(statsPayload.byMimeCategory?.Office) || 0,
            Autres: Number(statsPayload.byMimeCategory?.Autres) || 0,
          },
          byStatus:
            statsPayload.byStatus && typeof statsPayload.byStatus === 'object'
              ? statsPayload.byStatus
              : {},
          documentPoints: Array.isArray(statsPayload.documentPoints)
            ? statsPayload.documentPoints
            : [],
        })
        setStatsReady(true)
      } else {
        setMeta(emptyMeta())
        setStatsReady(false)
      }

      if (docRes.status === 'fulfilled') {
        setDocumentsAccessible(true)
        const payload = docRes.value.data
        setRecentDocuments(payload.data || [])
        if (!statsPayload) {
          setTotalDocuments(Number(payload.pagination?.total ?? 0))
        }
      } else {
        setRecentDocuments([])
        const msg = docRes.reason?.response?.data?.message || i18n.t('dashboard.errors.docs')
        setError((prev) => prev || msg)
      }

      if (taskRes.status === 'fulfilled') {
        setPendingTasks(taskRes.value.data?.data || [])
      } else {
        setPendingTasks([])
      }

      if (auditRes.status === 'fulfilled') {
        const rows = auditRes.value.data?.data || []
        setAuditLogs(rows.slice(0, 5))
      } else {
        setAuditLogs([])
      }

      if (archivableRes.status === 'fulfilled') {
        const payload = archivableRes.value.data?.data || archivableRes.value.data || {}
        setArchivable({
          count: Number(payload.count || 0),
          documents: Array.isArray(payload.documents) ? payload.documents : [],
        })
      } else {
        setArchivable({ count: 0, documents: [] })
      }
    } catch (e) {
      setError(e.response?.data?.message || e.message || i18n.t('dashboard.errors.load'))
    } finally {
      setLoading(false)
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return {
    loading,
    statsLoading,
    statsReady,
    error,
    recentDocuments,
    totalDocuments,
    pendingTasks,
    auditLogs,
    archivable,
    documentsAccessible,
    meta,
    refetch: load,
  }
}
