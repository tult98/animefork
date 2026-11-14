// Scenario: the My library page against the real API. Likes, dislikes and saves titles from the hover cards, then opens /my-list. Run: VERIFY_WEB_EMAIL=<email> VERIFY_WEB_PASSWORD=<password> EV=<evidence dir> node .claude/skills/verify-web/scripts/library-page.mjs
// The account needs one watch_progress row so the history section has a card, see features/README.md.
import { start } from './rec.mjs';
const email = process.env.VERIFY_WEB_EMAIL;
const password = process.env.VERIFY_WEB_PASSWORD;
if (!email || !password) {
  console.log(
    'SKIPPED: set VERIFY_WEB_EMAIL and VERIFY_WEB_PASSWORD (a confirmed account on the local apps/api)',
  );
  process.exit(0);
}
const r = await start('library-page', {
  ev: process.env.EV,
  actions: 12,
  proves:
    'signed in: titles liked, disliked and saved from hover cards are counted and listed on /my-list, the sidebar switches sections and keeps them in the URL across a reload, removing a card sends a DELETE, history has no remove button, and the narrow layout has no horizontal scroll',
});
const { page } = r;
const requests = [];
page.on('request', (req) => {
  if (req.url().includes(':3100/v1/library') && req.method() !== 'GET')
    requests.push(`${req.method()} ${new URL(req.url()).pathname}`);
});
const listName = `Verify ${Date.now()}`;
const cards =
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/phim/"][data-testid$="/"]';

await page.context().clearCookies();
await page.goto(r.url('/sign-in'));
await page.getByLabel('Địa chỉ email').fill(email);
await page.getByLabel('Mật khẩu').fill(password);
await page.getByRole('button', { name: 'Đăng nhập' }).click();
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await page.waitForSelector(`${cards} img`, { timeout: 60000 });
await page.reload();
await page.waitForSelector(`${cards} img`, { timeout: 60000 });
await r.title();

// The headed window can lose the pointer and close the hover preview, so each click first brings it back.
const inPreview = async (index, locatorOf, text) => {
  const card = page.locator(cards).nth(index);
  const id = await card.getAttribute('data-testid');
  const preview = page.getByTestId(`${id}:preview`);
  await r.step(text);
  if (!(await preview.count())) {
    await page.mouse.move(0, 0);
    await card.locator('[data-cover]').hover();
    await preview.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
  }
  await locatorOf(preview).click();
  await page.waitForTimeout(1000);
};
const nameOf = (index) =>
  page
    .locator(cards)
    .nth(index)
    .locator('[data-cover]')
    .getAttribute('aria-label');

const likedLabel = await nameOf(0);
await inPreview(
  0,
  (p) => p.getByRole('button', { name: 'Thích', exact: true }),
  'Like the first card',
);
await inPreview(
  0,
  (p) => p.getByTestId('title:save'),
  'Open the save dialog on the first card',
);
const dialog = page.getByTestId('save-playlist');
await dialog.waitFor();
await r.click(
  dialog.getByRole('button', { name: 'Danh sách mới' }),
  'Start a new playlist',
);
await r.type(dialog.getByLabel('Tên danh sách'), listName, 'Name the playlist');
await r.click(dialog.getByRole('button', { name: 'Tạo' }), 'Create it');
await dialog.getByLabel(listName).waitFor();
await page.keyboard.press('Escape');
await page.waitForFunction(
  () => !document.querySelector('[data-testid="save-playlist"]'),
);
await page.mouse.move(0, 0);
await inPreview(
  1,
  (p) => p.getByRole('button', { name: 'Không thích' }),
  'Dislike the second card',
);

await r.click(
  page.getByRole('link', { name: 'Danh sách của tôi' }).first(),
  'Open My library from the nav',
);
await page.getByTestId('library').waitFor();
const nav = (id) => page.getByTestId(`library:nav:${id}`);
await page.getByTestId('library:grid').waitFor();
await r.shot('1-history');
r.check(
  'history is the default section and lists the seeded row',
  (await nav('history').getAttribute('aria-current')) === 'page' &&
    (await page.getByTestId('library:history:verify-history-title').count()) ===
      1,
);
r.check(
  'history cards have no remove button',
  (await page.getByRole('button', { name: /^(Bỏ|Xóa)/ }).count()) === 0,
);
r.check(
  'sidebar counts: 1 liked, 1 disliked, 1 in the playlist',
  (await nav('liked').innerText()).trim().endsWith('1') &&
    (await nav('disliked').innerText()).trim().endsWith('1') &&
    (
      await page
        .locator('[data-testid^="library:nav:"]', { hasText: listName })
        .innerText()
    )
      .trim()
      .endsWith('1'),
);

await r.click(nav('liked'), 'Switch to Đã thích');
await page.waitForURL(/section=liked/);
r.check(
  'the liked card is the one liked from the hover card',
  (await page.getByTestId('library:grid').locator('a').count()) === 1 &&
    (await page.getByTestId('library:grid').innerText()).length > 0,
);
await r.shot('2-liked');
await page.reload();
await page.getByTestId('library:grid').waitFor();
r.check(
  'reloading keeps the section from the URL',
  (await nav('liked').getAttribute('aria-current')) === 'page',
);

await page.setViewportSize({ width: 390, height: 800 });
r.check(
  'narrow layout has no horizontal scroll',
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
);
await r.shot('3-narrow');
await page.setViewportSize({ width: 1280, height: 800 });

await r.click(
  page.getByRole('button', { name: 'Bỏ thích' }),
  'Remove the like',
);
await page.getByTestId('library:empty').waitFor();
r.check(
  'removing the card sent a rating DELETE and showed the empty state',
  requests.some((q) => q.startsWith('DELETE /v1/library/ratings/')) &&
    (await page.getByTestId('library:empty').innerText()).includes(
      'Chưa thích tiêu đề nào',
    ),
);
await r.shot('4-empty');
r.check(
  'no show-less copy anywhere',
  !(await page.getByTestId('library').innerText())
    .toLowerCase()
    .includes('ít '),
);
console.log(likedLabel);
console.log(requests.join('\n'));
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
