/** Entrées factices pour démonstration du journal d’audit (stockage session). */

export function createDemoAuditEntries() {
  const now = Date.now()
  return [
    {
      id: `demo-${now}-1`,
      action: 'documents.upload',
      entity_type: 'document',
      created_at: new Date(now - 8 * 60 * 1000).toISOString(),
    },
    {
      id: `demo-${now}-2`,
      action: 'workflow.instance.start',
      entity_type: 'workflow',
      created_at: new Date(now - 35 * 60 * 1000).toISOString(),
    },
    {
      id: `demo-${now}-3`,
      action: 'auth.login',
      entity_type: 'user',
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: `demo-${now}-4`,
      action: 'documents.version.upload',
      entity_type: 'document',
      created_at: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
    },
  ]
}
