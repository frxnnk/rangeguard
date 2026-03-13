import { NextResponse } from 'next/server';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface DocMeta {
  slug: string;
  title: string;
  category: 'estrategia' | 'tecnico' | 'operativo';
  description: string;
}

const DOC_REGISTRY: DocMeta[] = [
  {
    slug: 'ESTRATEGIA_ANTI_WHIPSAW',
    title: 'Estrategia Anti-Whipsaw',
    category: 'estrategia',
    description: 'Buffer de histéresis, debounce y cooldown para evitar false breakouts',
  },
  {
    slug: 'ANALISIS_TECNICO_HEDGE',
    title: 'Análisis Técnico de Hedging',
    category: 'tecnico',
    description: 'Cómo funciona el hedge de IL en pools Uniswap V3 con perpetuos',
  },
  {
    slug: 'PERFORMANCE_ANALYSIS',
    title: 'Análisis de Rendimiento',
    category: 'tecnico',
    description: 'Optimizaciones de latencia, caché y paralelización',
  },
  {
    slug: 'PRODUCTION_READINESS',
    title: 'Producción',
    category: 'operativo',
    description: 'Checklist y pasos para pasar de testnet a mainnet',
  },
  {
    slug: 'TESTNET_GUIDE',
    title: 'Guía Testnet',
    category: 'operativo',
    description: 'Paso a paso para testing en Hyperliquid testnet',
  },
  {
    slug: 'RAILWAY_DEPLOY',
    title: 'Deploy en Railway',
    category: 'operativo',
    description: 'Configuración de Railway, variables de entorno y volúmenes',
  },
];

function getDocsDir(): string {
  // In Next.js, cwd is the package root. Docs are at monorepo root.
  return join(process.cwd(), '..', '..', 'docs');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  const docsDir = getDocsDir();

  if (slug) {
    // Return single doc content
    const meta = DOC_REGISTRY.find((d) => d.slug === slug);
    if (!meta) {
      return NextResponse.json({ error: 'Doc not found' }, { status: 404 });
    }

    try {
      const content = readFileSync(join(docsDir, `${slug}.md`), 'utf-8');
      return NextResponse.json({ ...meta, content });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  // Return list of available docs (check which files exist)
  const docs = DOC_REGISTRY.filter((meta) => {
    try {
      readdirSync(docsDir).includes(`${meta.slug}.md`);
      return true;
    } catch {
      return false;
    }
  });

  return NextResponse.json({ docs });
}
