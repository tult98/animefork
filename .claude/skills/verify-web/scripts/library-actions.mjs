// Scenario: like, dislike and save to a playlist from the hover card and the details modal, signed in against the real API. Run: VERIFY_WEB_EMAIL=<email> VERIFY_WEB_PASSWORD=<password> EV=<evidence dir> node .claude/skills/verify-web/scripts/library-actions.mjs
import { start } from './rec.mjs';
const email = process.env.VERIFY_WEB_EMAIL;
const password = process.env.VERIFY_WEB_PASSWORD;
if (!email || !password) {
  console.log(
    'SKIPPED: set VERIFY_WEB_EMAIL and VERIFY_WEB_PASSWORD (a confirmed account on the local apps/api)',
  );
  process.exit(0);
}
const r = await start('library-actions', {
  ev: process.env.EV,
  actions: 14,
  proves:
    'signed in: the hover card likes, dislikes and saves to a new playlist without opening the details modal, Escape closes only the save dialog, and the details modal shows the same state, its status line and its own save dialog on top of it',
});
const { page } = r;
const requests = [];
page.on('request', (req) => {
  if (req.url().includes(':3100/v1/library') && req.method() !== 'GET')
    requests.push(`${req.method()} ${new URL(req.url()).pathname}`);
});
const listName = `Verify ${Date.now()}`;

await page.context().clearCookies();
await page.goto(r.url('/sign-in'));
await page.getByLabel('Địa chỉ email').fill(email);
await page.getByLabel('Mật khẩu').fill(password);
await page.getByRole('button', { name: 'Đăng nhập' }).click();
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await page.waitForSelector(
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/"] img',
  { timeout: 60000 },
);
await page.reload();
await page.waitForSelector(
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/"] img',
  { timeout: 60000 },
);
await r.title();

const card = page
  .locator(
    '[data-testid="shelf:airing-this-season"] [data-testid^="card:/phim/"]',
  )
  .first();
const cardId = await card.getAttribute('data-testid');
const preview = page.getByTestId(`${cardId}:preview`);
const like = (scope) =>
  scope.getByRole('button', { name: 'Thích', exact: true });
const dislike = (scope) => scope.getByRole('button', { name: 'Không thích' });
// The headed window can lose the pointer and close the hover preview, so each preview click first brings it back.
const inPreview = async (locator, text) => {
  await r.step(text);
  if (!(await preview.count())) {
    await page.mouse.move(0, 0);
    await card.locator('[data-cover]').hover();
    await preview.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
  }
  await locator.click();
  await page.waitForTimeout(1000);
};
const pressed = async (locator) =>
  (await locator.getAttribute('aria-pressed')) === 'true';

await card.locator('[data-cover]').hover();
await preview.waitFor({ timeout: 10000 });
await page.waitForTimeout(600);
await r.shot('1-hover-card');
r.check(
  'library loaded, the hover card buttons are enabled',
  await like(preview).isEnabled(),
);

await inPreview(like(preview), 'Like on the hover card');
await page.waitForFunction(
  () =>
    document
      .querySelector('[aria-label="Thích"]')
      ?.getAttribute('aria-pressed') === 'true',
);
r.check('like pressed', await pressed(like(preview)));
r.check(
  'details modal did not open',
  (await page.getByTestId('details').count()) === 0,
);
await inPreview(dislike(preview), 'Dislike on the hover card');
await page.waitForFunction(
  () =>
    document
      .querySelector('[aria-label="Không thích"]')
      ?.getAttribute('aria-pressed') === 'true',
);
r.check(
  'dislike pressed and like released',
  (await pressed(dislike(preview))) && !(await pressed(like(preview))),
);

await inPreview(
  preview.getByTestId('title:save'),
  'Open the save dialog from the hover card',
);
const dialog = page.getByTestId('save-playlist');
await dialog.waitFor();
await r.click(
  dialog.getByRole('button', { name: 'Danh sách mới' }),
  'Start a new playlist',
);
await r.type(dialog.getByLabel('Tên danh sách'), listName, 'Name the playlist');
await r.shot('2-save-dialog');
await r.click(dialog.getByRole('button', { name: 'Tạo' }), 'Create it');
await dialog.getByLabel(listName).waitFor();
r.check(
  'new playlist is checked for the title',
  await dialog.getByLabel(listName).isChecked(),
);
r.check('hover preview survived the dialog opening', await preview.isVisible());

await page.keyboard.press('Escape');
await page.waitForFunction(
  () => !document.querySelector('[data-testid="save-playlist"]'),
);
r.check(
  'Escape closed the dialog and not the preview',
  await preview.isVisible(),
);
r.check(
  'focus returned to the save button',
  await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'title:save',
  ),
);
r.check(
  'save button shows saved',
  (await preview.getByTestId('title:save').getAttribute('aria-label')) ===
    'Đã lưu. Sửa danh sách',
);

await inPreview(
  preview.getByRole('button', { name: /^Xem chi tiết/ }),
  'Open the details modal',
);
const modal = page.getByTestId('details');
await modal.waitFor();
await r.shot('3-details');
const status = modal.getByTestId('title:status');
r.check(
  `status line shows the playlist and the dislike`,
  (await status.innerText()).includes(listName) &&
    (await status.innerText()).includes('Bạn đã không thích tiêu đề này'),
);
r.check(
  'no show-less copy anywhere',
  !(await modal.innerText()).toLowerCase().includes('ít'),
);

await r.click(
  modal.getByTestId('title:save'),
  'Open the save dialog over the details modal',
);
await dialog.waitFor();
await r.click(
  dialog.getByLabel(listName),
  'Remove the title from the playlist',
);
await page.waitForFunction(
  (n) =>
    ![...document.querySelectorAll('[data-testid="save-playlist"] label')]
      .find((l) => l.textContent === n)
      .querySelector('input').checked,
  listName,
);
await page.keyboard.press('Escape');
await page.waitForFunction(
  () => !document.querySelector('[data-testid="save-playlist"]'),
);
r.check(
  'Escape closed only the nested dialog, the details modal is open',
  await modal.isVisible(),
);
r.check(
  'status line dropped the playlist',
  !(await status.innerText()).includes(listName),
);

await r.click(dislike(modal), 'Clear the dislike in the modal');
await page.waitForFunction(
  () =>
    document
      .querySelector('[data-testid="details"] [aria-label="Không thích"]')
      ?.getAttribute('aria-pressed') === 'false',
);
r.check('status line is empty again', (await status.innerText()).trim() === '');
r.check(
  'requests: rating PUT, playlist create, add, remove, rating DELETE',
  ['PUT', 'POST', 'DELETE'].every((m) => requests.some((q) => q.startsWith(m))),
);
console.log(requests.join('\n'));
await r.shot('4-cleared');
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
