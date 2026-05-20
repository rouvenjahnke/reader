import { ArticleReader } from '@/components/ArticleReader';
import { decodeArticleId } from '@/lib/ids';
import { getArticle } from '@/lib/nextcloud';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ArticlePage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params;
  const article = await getArticle(decodeArticleId(id));
  return <ArticleReader article={article} />;
}
