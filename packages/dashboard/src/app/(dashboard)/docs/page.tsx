'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  FlaskConical,
  Cpu,
  Server,
  ArrowLeft,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface DocMeta {
  slug: string;
  title: string;
  category: 'estrategia' | 'tecnico' | 'operativo';
  description: string;
}

interface DocFull extends DocMeta {
  content: string;
}

const CATEGORY_CONFIG = {
  estrategia: {
    label: 'Estrategia',
    icon: FlaskConical,
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  tecnico: {
    label: 'Técnico',
    icon: Cpu,
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  operativo: {
    label: 'Operativo',
    icon: Server,
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
};

/** Strip the first H1 from markdown (we show it separately in the header) */
function stripFirstH1(md: string): string {
  return md.replace(/^#\s+.+\n+/, '');
}

function DocCard({ doc, onClick }: { doc: DocMeta; onClick: () => void }) {
  const cat = CATEGORY_CONFIG[doc.category];
  const Icon = cat.icon;

  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:border-sidebar-primary/40 transition-all text-left w-full"
    >
      <div className="shrink-0 p-2.5 rounded-lg bg-muted group-hover:bg-sidebar-primary/10 transition-colors">
        <Icon className="size-5 text-muted-foreground group-hover:text-sidebar-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-foreground text-sm">{doc.title}</span>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${cat.color}`}>
            {cat.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
    </button>
  );
}

function DocViewer({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data, isLoading } = useQuery<DocFull>({
    queryKey: ['doc', slug],
    queryFn: () => fetch(`/api/docs?slug=${slug}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (!data?.content) {
    return <p className="text-muted-foreground">Documento no encontrado.</p>;
  }

  const cat = CATEGORY_CONFIG[data.category];

  return (
    <div className="max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mb-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 mr-2" />
        Volver
      </Button>

      <div className="flex items-center gap-3 mb-6">
        <Badge variant="outline" className={cat.color}>
          {cat.label}
        </Badge>
        <h1 className="text-2xl font-bold text-foreground">{data.title}</h1>
      </div>

      <Card className="bg-card">
        <CardContent className="pt-6 pb-8">
          <article
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-foreground prose-headings:font-bold
              prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-b prose-h2:border-border prose-h2:pb-2
              prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
              prose-h4:text-sm prose-h4:mt-4 prose-h4:mb-1
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-code:text-sidebar-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:text-xs
              prose-table:text-xs
              prose-th:text-foreground prose-th:font-semibold prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-border
              prose-td:text-muted-foreground prose-td:px-3 prose-td:py-1.5 prose-td:border prose-td:border-border
              prose-blockquote:border-sidebar-primary prose-blockquote:text-muted-foreground prose-blockquote:bg-muted/50 prose-blockquote:rounded-r-lg prose-blockquote:py-1
              prose-li:text-muted-foreground prose-li:marker:text-muted-foreground/50
              prose-a:text-sidebar-primary prose-a:no-underline hover:prose-a:underline
              prose-hr:border-border
            "
          >
            <Markdown remarkPlugins={[remarkGfm]}>{stripFirstH1(data.content)}</Markdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DocsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ docs: DocMeta[] }>({
    queryKey: ['docs-list'],
    queryFn: () => fetch('/api/docs').then((r) => r.json()),
  });

  if (selectedSlug) {
    return <DocViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  }

  const docs = data?.docs ?? [];
  const categories = ['estrategia', 'tecnico', 'operativo'] as const;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <BookOpen className="size-6 text-sidebar-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentación</h1>
          <p className="text-sm text-muted-foreground">
            Estrategias, análisis técnicos y guías operativas
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="size-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No hay documentos disponibles</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const catDocs = docs.filter((d) => d.category === cat);
            if (catDocs.length === 0) return null;
            const config = CATEGORY_CONFIG[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <config.icon className="size-3.5 text-muted-foreground/50" />
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {config.label}
                  </h2>
                </div>
                <div className="space-y-2">
                  {catDocs.map((doc) => (
                    <DocCard
                      key={doc.slug}
                      doc={doc}
                      onClick={() => setSelectedSlug(doc.slug)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
