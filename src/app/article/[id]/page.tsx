import { ArticleReaderShell } from '@/components/ArticleReaderShell';
import { decodeArticleId } from '@/lib/ids';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ArticlePage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params;
  const path = decodeArticleId(id);
  return <ArticleReaderShell id={id} path={path} />;
}
