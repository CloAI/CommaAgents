import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

const search = createFromSource(source, {
  language: 'english',
});

export const dynamic = 'force-static';
export const GET = search.staticGET;
