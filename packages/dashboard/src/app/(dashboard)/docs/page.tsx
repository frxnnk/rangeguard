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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  estrategia: { label: 'Estrategia', icon: FlaskConical, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  tecnico: { label: 'Técnico', icon: Cpu, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  operativo: { label: 'Operativo', icon: Server, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

function DocCard({ doc, onClick }: { doc: DocMeta; onClick: () => void }) {
  const cat = CATEGORY_CONFIG[doc.category];
  const Icon = cat.icon;

  return (
    <Card
      className="cursor-pointer hover:border-sidebar-primary/40 transition-colors bg-card"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <Badge variant="outline" className={cat.color}>
            {cat.label}
          </Badge>
        </div>
        <CardTitle className="text-base mt-3">{doc.title}</CardTitle>
        <CardDescription className="text-xs">{doc.description}</CardDescription>
      </CardHeader>
    </Card>
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
    <div>
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
        <CardContent className="pt-6">
          <ScrollArea className="max-h-[calc(100vh-16rem)]">
            <article className="prose prose-invert prose-sm max-w-none
              prose-headings:text-foreground prose-headings:font-bold
              prose-h1:text-xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4
              prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
              prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-code:text-sidebar-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg
              prose-table:text-sm
              prose-th:text-foreground prose-th:font-semibold prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-border
              prose-td:text-muted-foreground prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border
              prose-blockquote:border-sidebar-primary prose-blockquote:text-muted-foreground prose-blockquote:bg-muted/50 prose-blockquote:rounded-r-lg prose-blockquote:py-1
              prose-li:text-muted-foreground
              prose-a:text-sidebar-primary prose-a:no-underline hover:prose-a:underline
              prose-hr:border-border
            ">
              <Markdown remarkPlugins={[remarkGfm]}>{data.content}</Markdown>
            </article>
          </ScrollArea>
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
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="size-6 text-sidebar-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentación</h1>
          <p className="text-sm text-muted-foreground">
            Estrategias, análisis técnicos y guías operativas
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
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
        <div className="space-y-8">
          {categories.map((cat) => {
            const catDocs = docs.filter((d) => d.category === cat);
            if (catDocs.length === 0) return null;
            const config = CATEGORY_CONFIG[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <config.icon className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {config.label}
                  </h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {catDocs.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
