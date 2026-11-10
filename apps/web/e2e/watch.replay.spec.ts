import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const SEASON_2 = 'tonikaku-kawaii-2nd-season-a4476';
const EPISODES = ['72839', '73010', '73386', '73701', '74002'];

const video = (page: Page) => page.getByTestId('player:video');
const time = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const state = (page: Page) =>
  page.getByTestId('player').getAttribute('data-state');

async function open(page: Page, path = `/watch/${SLUG}`, query = '') {
  await page.goto(`${path}?transport=replay${query}`);
  await expect(page.getByTestId('player')).toBeVisible();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    /^(playing|paused)$/,
  );
}

async function paused(page: Page) {
  await open(page);
  if ((await state(page)) === 'playing')
    await page.getByTestId('player:play').click();
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    'paused',
  );
}

test('the sample stream plays and the clock advances', async ({ page }) => {
  await paused(page);
  await page.getByTestId('player:play').click();
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    'playing',
  );
  await expect.poll(() => time(page)).toBeGreaterThan(0.5);
  await expect(page.getByTestId('player:play')).toHaveAccessibleName(
    'Tạm dừng',
  );
});

test('an HLS stream plays through the patched hls.js loader', async ({
  page,
}) => {
  const playlist = page.waitForResponse((res) =>
    res.url().endsWith('/fixtures/sample-hls/index.m3u8'),
  );
  await open(page, `/watch/${SLUG}`, '&sample=hls');
  expect((await playlist).status()).toBe(200);
  if ((await state(page)) === 'paused') {
    await page.getByTestId('player:play').click();
  }
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    'playing',
  );
  await expect.poll(() => time(page)).toBeGreaterThan(0.5);
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration))
    .toBeGreaterThan(25);
});

test('pause stops the clock and clicking the stage toggles play', async ({
  page,
}) => {
  await paused(page);
  await page.getByTestId('player:stage').click();
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    'playing',
  );
  await expect.poll(() => time(page)).toBeGreaterThan(0.3);
  await page.getByTestId('player:play').click();
  await expect(page.getByTestId('player')).toHaveAttribute(
    'data-state',
    'paused',
  );
  const stopped = await time(page);
  await page.waitForTimeout(400);
  expect(await time(page)).toBe(stopped);
});

test('the scrubber seeks and the label counts down the remaining time', async ({
  page,
}) => {
  await paused(page);
  const duration = await video(page).evaluate(
    (v: HTMLVideoElement) => v.duration,
  );
  await page.getByTestId('player:seek').fill('10');
  await expect.poll(() => time(page)).toBeCloseTo(10, 0);
  const remaining = Math.floor(duration - 10);
  await expect(page.getByTestId('player:remaining')).toHaveText(
    `0:${String(remaining).padStart(2, '0')}`,
  );
});

test('back and forward move the clock by ten seconds', async ({ page }) => {
  await paused(page);
  await page.getByTestId('player:seek').fill('12');
  await expect.poll(() => time(page)).toBeCloseTo(12, 0);
  await page.getByTestId('player:forward10').click();
  await expect.poll(() => time(page)).toBeCloseTo(22, 0);
  await page.getByTestId('player:back10').click();
  await expect.poll(() => time(page)).toBeCloseTo(12, 0);
  await page.getByTestId('player:back10').click();
  await page.getByTestId('player:back10').click();
  await expect.poll(() => time(page)).toBe(0);
});

test('the volume slider and the mute button drive the video', async ({
  page,
}) => {
  await paused(page);
  await page.getByTestId('player:mute').hover();
  await page.getByTestId('player:volume').fill('40');
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.volume))
    .toBeCloseTo(0.4, 2);

  await page.getByTestId('player:mute').click();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.muted))
    .toBe(true);
  await expect(page.getByTestId('player:mute')).toHaveAccessibleName(
    'Bật tiếng',
  );
  await page.getByTestId('player:mute').click();
  await expect(page.getByTestId('player:mute')).toHaveAccessibleName(
    'Tắt tiếng',
  );
});

test('the speed popup sets the playback rate and marks the choice', async ({
  page,
}) => {
  await paused(page);
  await page.getByTestId('player:speed').hover();
  await expect(page.getByTestId('player:speed-panel')).toBeVisible();
  await expect(page.getByTestId('speed:1')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByTestId('speed:1.5').click();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.playbackRate))
    .toBe(1.5);
  await expect(page.getByTestId('speed:1.5')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('speed:1')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('the timeline hides while an action popup is hovered', async ({
  page,
}) => {
  await paused(page);
  const timeline = page.locator('.pl-timeline');
  await expect(timeline).toHaveCSS('visibility', 'visible');
  await page.getByTestId('player:speed').hover();
  await expect(timeline).toHaveCSS('visibility', 'hidden');
  await page.mouse.move(600, 300);
  await expect(timeline).toHaveCSS('visibility', 'visible');
});

test('the episodes popup lists the season and switching plays the pick', async ({
  page,
}) => {
  await paused(page);
  await page.getByTestId('player:episodes').hover();
  const panel = page.getByTestId('player:episodes-panel');
  await expect(panel).toBeVisible();
  await expect(
    panel.locator('[data-testid^="episode:"][data-current]'),
  ).toHaveCount(EPISODES.length);
  await expect(page.getByTestId('episode:1')).toHaveAttribute(
    'data-current',
    'true',
  );
  await expect(page.getByTestId('episode:progress')).toBeVisible();

  await page.getByTestId('episode:3').click();
  await expect(page).toHaveURL(new RegExp(`/watch/${SLUG}/${EPISODES[2]}`));
  await expect(page.getByTestId('player:episode-label')).toHaveText('Tập 3');
  await expect(page.getByTestId('player:title')).toHaveText(
    'Tonikaku Kawaii [BD]',
  );
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(3);
  await page.mouse.move(600, 300);
  await page.getByTestId('player:episodes').hover();
  await expect(page.getByTestId('episode:3')).toHaveAttribute(
    'data-current',
    'true',
  );
});

test('the seasons view opens from the back button and opens another season', async ({
  page,
}) => {
  await paused(page);
  await page.getByTestId('player:episodes').hover();
  await page.getByTestId('player:seasons-back').click();
  await expect(page.getByTestId('player:seasons-panel')).toBeVisible();
  await expect(page.getByTestId(`season:${SLUG}`)).toHaveAttribute(
    'data-current',
    'true',
  );
  await expect(page.getByTestId(`season:${SLUG}`)).toContainText('5 tập');

  await page.getByTestId(`season:${SEASON_2}`).click();
  const panel = page.getByTestId('player:episodes-panel');
  await expect(
    panel.locator('[data-testid^="episode:"][data-current]'),
  ).toHaveCount(3);
  await expect(panel).toContainText('Phần 2');
  await expect(page.getByTestId('episode:1')).toHaveAttribute(
    'data-current',
    'false',
  );

  await page.getByTestId('episode:2').click();
  await expect(page).toHaveURL(new RegExp(`/watch/${SEASON_2}/91102`));
  await expect(page.getByTestId('player:episode-label')).toHaveText('Tập 2');
});

test('next episode advances and is disabled on the last one', async ({
  page,
}) => {
  await open(page, `/watch/${SLUG}/${EPISODES[3]}`);
  await page.getByTestId('player:next').click();
  await expect(page).toHaveURL(new RegExp(`/${EPISODES[4]}$`));
  await expect(page.getByTestId('player:episode-label')).toHaveText('Tập 5');
  await expect(page.getByTestId('player:next')).toBeDisabled();
});

test('the fullscreen button follows the document state', async ({ page }) => {
  await paused(page);
  const button = page.getByTestId('player:fullscreen');
  await expect(button).toHaveAccessibleName('Toàn màn hình');
  await button.click();
  await expect(button).toHaveAccessibleName('Thoát toàn màn hình');
  await expect(button).toHaveAttribute('data-active', 'true');
  await button.click();
  await expect(button).toHaveAccessibleName('Toàn màn hình');
  await expect(button).toHaveAttribute('data-active', 'false');
});

test('there is no rating bug when the page carries no age rating', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId('player:rating')).toHaveCount(0);
});

test('an episode that is not on the title says so', async ({ page }) => {
  await page.goto(`/watch/${SLUG}/1?transport=replay`);
  await expect(page.getByTestId('watch:not-found')).toBeVisible();
});

test('the watch screen has no site chrome', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
});

test('the title page opens the first episode in the player', async ({
  page,
}) => {
  await page.goto(`/title/${SLUG}/?transport=replay`);
  await page.getByTestId('title:watch').click();
  await expect(page).toHaveURL(new RegExp(`/watch/${SLUG}$`));
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('player:episode-label')).toHaveText(
    'Tập 1_BD_Full',
  );
});
