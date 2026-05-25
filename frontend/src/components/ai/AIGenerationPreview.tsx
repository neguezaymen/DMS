import { useMemo } from 'react'
import { Badge } from '@/components/shadcn/badge'
import { Separator } from '@/components/shadcn/separator'
import { cn } from '@/lib/utils'

type Block =
  | { type: 'title'; text: string }
  | { type: 'meta'; text: string }
  | { type: 'section'; text: string }
  | { type: 'subject'; text: string }
  | { type: 'greeting'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'signature'; text: string }
  | { type: 'footer'; text: string }

function parseGenerationOutput(raw: string): Block[] {
  const lines = String(raw || '').split(/\n/)
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      i += 1
      continue
    }

    if (i === 0 && trimmed.length > 0 && trimmed === trimmed.toUpperCase() && trimmed.length < 80) {
      blocks.push({ type: 'title', text: trimmed })
      i += 1
      continue
    }

    if (/^objet\s*:/i.test(trimmed)) {
      blocks.push({ type: 'subject', text: trimmed.replace(/^objet\s*:\s*/i, '') })
      i += 1
      continue
    }

    if (/^(bonjour|madame|monsieur|cher|chère)/i.test(trimmed)) {
      blocks.push({ type: 'greeting', text: trimmed })
      i += 1
      continue
    }

    if (/^(article|section|\d+\.)\s/i.test(trimmed) || /^[A-ZÉÈÊÀÙ\s\-—]{4,}$/.test(trimmed)) {
      blocks.push({ type: 'section', text: trimmed })
      i += 1
      continue
    }

    if (/^[-•*]\s/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-•*]\s*/, '') })
      i += 1
      continue
    }

    if (/^—/.test(trimmed) || /mode démonstration|dms workspace/i.test(trimmed)) {
      blocks.push({ type: 'footer', text: trimmed.replace(/^—\s*/, '') })
      i += 1
      continue
    }

    if (/^(cordialement|bien cordialement|signature|fait pour)/i.test(trimmed)) {
      blocks.push({ type: 'signature', text: trimmed })
      i += 1
      while (i < lines.length && lines[i].trim() && !/^objet|^article|^\d+\./i.test(lines[i].trim())) {
        blocks.push({ type: 'signature', text: lines[i].trim() })
        i += 1
      }
      continue
    }

    if (
      i === 1 &&
      blocks[0]?.type === 'title' &&
      trimmed.length < 120 &&
      !trimmed.endsWith('.')
    ) {
      blocks.push({ type: 'meta', text: trimmed })
      i += 1
      continue
    }

    blocks.push({ type: 'paragraph', text: trimmed })
    i += 1
  }

  return blocks
}

type Props = {
  content: string
  emptyLabel?: string
  className?: string
}

export default function AIGenerationPreview({ content, emptyLabel = '—', className }: Props) {
  const blocks = useMemo(() => parseGenerationOutput(content), [content])

  if (!content?.trim()) {
    return (
      <p className={cn('rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground', className)}>
        {emptyLabel}
      </p>
    )
  }

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-sm',
        className,
      )}
    >
      <div className="border-b bg-gradient-to-r from-primary/90 to-primary px-5 py-4 text-primary-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
          DMS Workspace · Génération IA
        </p>
        <p className="mt-1 text-lg font-semibold leading-tight">
          {blocks.find((b) => b.type === 'title')?.text || 'Résultat généré'}
        </p>
      </div>

      <div className="space-y-4 p-5">
        {blocks
          .filter((b) => b.type !== 'title')
          .map((block, index) => {
            switch (block.type) {
              case 'meta':
                return (
                  <p key={index} className="text-xs text-muted-foreground">
                    {block.text}
                  </p>
                )
              case 'subject':
                return (
                  <div key={index} className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Objet
                    </p>
                    <p className="mt-0.5 text-sm font-medium">{block.text}</p>
                  </div>
                )
              case 'section':
                return (
                  <div key={index}>
                    {index > 0 ? <Separator className="mb-3" /> : null}
                    <h3 className="text-sm font-semibold text-primary">{block.text}</h3>
                  </div>
                )
              case 'greeting':
                return (
                  <p key={index} className="text-sm font-medium">
                    {block.text}
                  </p>
                )
              case 'bullet':
                return (
                  <div key={index} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{block.text}</span>
                  </div>
                )
              case 'signature':
                return (
                  <p key={index} className="text-sm text-muted-foreground">
                    {block.text}
                  </p>
                )
              case 'footer':
                return (
                  <Badge key={index} variant="outline" className="text-[10px] font-normal">
                    {block.text}
                  </Badge>
                )
              default:
                return (
                  <p key={index} className="text-sm leading-relaxed text-foreground/90">
                    {block.text}
                  </p>
                )
            }
          })}
      </div>
    </article>
  )
}
