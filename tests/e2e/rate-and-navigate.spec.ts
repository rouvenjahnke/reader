import { test, expect } from '@playwright/test';

const summaries = [
  {
    id: 'article-fixture',
    path: '/reader-pipeline/math_blogs/article.md',
    pipelineFolder: 'math_blogs',
    pipelineRelativePath: 'math_blogs/article.md',
    frontmatter: {
      title: 'A current mathematics article',
      source: "Terry Tao's Blog",
      author: 'Terence Tao',
      score: 8.4,
      reader_status: 'unrated',
      tags: ['mathematics']
    }
  },
  {
    id: 'paper-fixture',
    path: '/reader-pipeline/math_preprints/paper.md',
    pipelineFolder: 'math_preprints',
    pipelineRelativePath: 'math_preprints/paper.md',
    collection: 'papers',
    frontmatter: {
      title: 'Prismatic structures in derived geometry',
      source: 'Semantic Scholar Watchlist',
      authors: ['Peter Scholze', 'Bhargav Bhatt'],
      arxiv_id: '2608.01234',
      score: 9.1,
      paper_status: 'inbox',
      matched_authors: ['Peter Scholze'],
      matched_topics: ['Prismatic cohomology'],
      tags: ['paper', 'mathematics']
    }
  },
  {
    id: 'paper-wavelet-fixture',
    path: '/reader-pipeline/math_preprints/wavelet.md',
    pipelineFolder: 'math_preprints',
    pipelineRelativePath: 'math_preprints/wavelet.md',
    collection: 'papers',
    frontmatter: {
      title: 'Stable wavelet representations',
      source: 'Semantic Scholar Watchlist',
      authors: ['Ingrid Daubechies'],
      arxiv_id: '2608.05678',
      score: 8.7,
      paper_status: 'inbox',
      matched_authors: ['Ingrid Daubechies'],
      matched_topics: ['Harmonic analysis'],
      tags: ['paper', 'mathematics']
    }
  }
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/articles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summaries) });
  });
  await page.route(/\/api\/articles\/[^/]+$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const summary = summaries.find((item) => item.id === id);
    await route.fulfill({
      status: summary ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(summary ? { ...summary, body: `# ${summary.frontmatter.title}\n\nFixture body.` } : { error: 'Not found' })
    });
  });
});

test('list opens without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('Search title, body, tag')).toBeVisible();
  await expect(page.getByText('A current mathematics article')).toBeVisible();
});

test('mobile filter bar stays compact until filters are requested', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const showFilters = page.getByRole('button', { name: 'Show filters' });
  await expect(showFilters).toBeVisible();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeHidden();

  await showFilters.click();
  await expect(page.getByRole('button', { name: 'Hide filters' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Triage/ })).toBeVisible();

  await page.getByRole('button', { name: 'Hide filters' }).click();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeHidden();
});

test('paper mode filters watched people separately in a mobile bottom sheet', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Papers' }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeVisible();
  await expect(page.getByText('Stable wavelet representations')).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByText('A current mathematics article')).toBeHidden();

  await page.getByRole('button', { name: 'Show filters' }).click();
  await expect(page.getByRole('button', { name: 'All stages' })).toBeVisible();
  await page.getByRole('button', { name: 'All stages' }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeVisible();
  await page.getByRole('button', { name: 'All stages' }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeHidden();
  await page.getByRole('button', { name: 'All stages' }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeVisible();

  await page.getByRole('button', { name: /^Authors/ }).click();
  const authorDialog = page.getByRole('dialog', { name: 'Watched authors filter' });
  await expect(authorDialog).toBeVisible();
  await expect(authorDialog.getByText('Prismatic cohomology', { exact: true })).toBeHidden();

  const sheetBox = await authorDialog.locator('[data-filter-sheet]').boundingBox();
  expect(sheetBox?.width ?? 1000).toBeLessThanOrEqual(390);
  expect(Math.abs((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0) - 844)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `/tmp/reader-paper-authors-${testInfo.project.name}-verified.png`, fullPage: true });

  await authorDialog.getByPlaceholder('Search people').fill('Scholze');
  const peterScholze = authorDialog.getByRole('checkbox', { name: 'Peter Scholze' });
  await authorDialog.getByText('Peter Scholze', { exact: true }).click();
  await expect(peterScholze).toBeChecked();
  await authorDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeVisible();
  await expect(page.getByText('Stable wavelet representations')).toBeHidden();

  await page.getByRole('button', { name: /^Authors \(1\)/ }).click();
  await page.getByText('Peter Scholze', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Peter Scholze' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: /^Topics/ }).click();
  const topicDialog = page.getByRole('dialog', { name: 'Watched topics filter' });
  await topicDialog.getByPlaceholder('Search watched topics').fill('Harmonic');
  await expect(topicDialog.getByText('Harmonic analysis', { exact: true })).toBeVisible();
  await expect(topicDialog.getByText('Peter Scholze', { exact: true })).toBeHidden();
});

test('compact mobile and desktop layouts have no horizontal overflow', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'android-chrome';
  if (!mobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText('A current mathematics article')).toBeVisible();

  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);

  const header = page.locator('main > div').first();
  const box = await header.boundingBox();
  if (mobile) expect(box?.height ?? 1000).toBeLessThan(190);

  await page.screenshot({
    path: `/tmp/reader-${mobile ? 'mobile' : 'desktop'}-verified.png`,
    fullPage: true
  });

  await page.getByRole('button', { name: 'Papers' }).click();
  await expect(page.getByText('Prismatic structures in derived geometry')).toBeVisible();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  await page.screenshot({
    path: `/tmp/reader-paper-${mobile ? 'mobile' : 'desktop'}-verified.png`,
    fullPage: true
  });
});
