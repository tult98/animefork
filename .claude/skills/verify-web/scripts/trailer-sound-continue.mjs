// Scenario: a continue watching card plays its trailer, and one sound switch rules every trailer. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/trailer-sound-continue.mjs
import { start } from './rec.mjs';
const r = await start('trailer-sound-continue', {
  ev: process.env.EV,
  actions: 3,
  proves:
    'home (session and watch history mocked from live titles): a continue watching card plays its trailer with a round sound button over the video; turning sound on there unmutes the hero, and muting the hero mutes the next card trailer; only one video plays at a time; the details modal of a continue title plays its trailer',
});
const { page } = r;
await page.goto(r.url('/'));
await page.waitForSelector(
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/"] img',
  { timeout: 60000 },
);
const rows = await page.evaluate(() =>
  [
    ...document.querySelectorAll(
      '[data-testid="shelf:airing-this-season"] [data-testid^="card:/phim/"]',
    ),
  ]
    .slice(0, 8)
    .map((card) => ({
      slug: card.dataset.testid
        .replace(/^card:\/phim\//, '')
        .replace(/\/$/, ''),
      titleName: card.querySelector('[data-cover] img').alt,
      image: card.querySelector('[data-cover] img').src,
    })),
);
r.check(`picked live titles for the history (${rows.length})`, rows.length > 0);

await page.route('**/v1/auth/me', (route) =>
  route.fulfill({
    json: { user: { id: 'verify-user', email: 'verify@example.test' } },
  }),
);
await page.route('**/v1/watch-progress', (route) =>
  route.fulfill({
    json: {
      items: rows.map((row, i) => ({
        ...row,
        episodeId: '1',
        episodeLabel: 'Tập 1',
        seasonSlug: null,
        positionS: 300,
        durationS: 1440,
        completed: false,
        updatedAt: new Date(Date.now() - i * 60000).toISOString(),
      })),
    },
  }),
);
await page.reload();
await page.waitForSelector(`[data-testid="card:continue:${rows[0].slug}"]`, {
  timeout: 60000,
});
await page.waitForTimeout(4000);
await r.title();

const continueCards = rows.map((row) =>
  page.getByTestId(`card:continue:${row.slug}`),
);
const playing = '[data-testid="card:promo-video"][data-phase="playing"]';
const sound = page.getByTestId('card:promo-video:sound');
const isMuted = (sel) =>
  page.evaluate(
    (s) => window.YT.get(document.querySelector(`${s} iframe`).id).isMuted(),
    sel,
  );

async function hoverUntilTrailer(cards, from) {
  for (let i = from; i < cards.length; i++) {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(800);
    await cards[i].locator('[data-cover]').hover();
    const ok = await page
      .waitForSelector('[data-testid="card:promo-video"]', { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!ok) continue;
    await page.locator('[data-testid$=":preview"]').hover();
    if (
      await page
        .waitForSelector(playing, { timeout: 8000 })
        .then(() => true)
        .catch(() => false)
    )
      return i;
  }
  return -1;
}

const first = await hoverUntilTrailer(continueCards, 0);
r.check(
  'a continue watching card plays its trailer in the popover (live MAL data)',
  first >= 0,
);
if (first >= 0) {
  await sound.waitFor({ timeout: 3000 });
  await page.waitForTimeout(800);
  await r.shot('1-continue-trailer-playing');
  const look = await sound.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const art = el
      .closest('[data-testid$=":preview"]')
      .querySelector('[data-testid="card:promo-video"]')
      .getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      insideLink: Boolean(el.closest('a')),
      round: s.borderRadius,
      size: [Math.round(b.width), Math.round(b.height)],
      inset: [
        Math.round(art.right - b.right),
        Math.round(art.bottom - b.bottom),
      ],
      label: el.getAttribute('aria-label'),
    };
  });
  r.check(
    `sound button sits bottom-right over the video, not inside the link (${JSON.stringify(look)})`,
    !look.insideLink &&
      look.inset[0] > 0 &&
      look.inset[0] < 24 &&
      look.inset[1] > 0 &&
      look.inset[1] < 24,
  );
  r.check(
    'card trailer starts muted',
    (await isMuted('[data-testid$=":preview"]')) === true,
  );
  const url = page.url();
  await r.click(sound, 'Turn the card trailer sound on');
  await page.waitForTimeout(600);
  r.check(
    'card trailer unmuted',
    (await isMuted('[data-testid$=":preview"]')) === false,
  );
  r.check(
    'button now offers to mute',
    (await sound.getAttribute('aria-label')) === 'Tắt tiếng',
  );
  r.check(
    'clicking the sound button neither navigated nor opened details',
    page.url() === url && (await page.getByTestId('details').count()) === 0,
  );
  await r.shot('2-continue-trailer-unmuted');
}

await page.mouse.move(640, 200);
await page.mouse.wheel(0, -2000);
const heroPlaying =
  '[data-testid^="hero:slide:"][data-active] [data-testid="trailer"][data-phase="playing"]';
const hero = await page
  .waitForSelector(heroPlaying, { timeout: 90000 })
  .then(() => true)
  .catch(() => false);
r.check('hero trailer plays', hero);
if (hero) {
  await page.waitForTimeout(800);
  r.check(
    'hero trailer follows the card: unmuted',
    (await isMuted('[data-testid="hero"]')) === false,
  );
  r.check(
    'hero button offers to mute',
    (await page.getByTestId('hero:mute').getAttribute('aria-label')) ===
      'Tắt tiếng',
  );
  await r.shot('3-hero-follows-unmuted');
  await r.click(page.getByTestId('hero:mute'), 'Mute the hero trailer');
  await page.waitForTimeout(600);
  r.check(
    'hero trailer muted',
    (await isMuted('[data-testid="hero"]')) === true,
  );
}

const next = await hoverUntilTrailer(
  continueCards,
  first + 1 > 0 ? first + 1 : 0,
);
const again = next >= 0 ? next : await hoverUntilTrailer(continueCards, 0);
r.check('another continue card trailer plays', again >= 0);
if (again >= 0) {
  await page.waitForTimeout(800);
  r.check(
    'the next card trailer starts muted, following the hero',
    (await isMuted('[data-testid$=":preview"]')) === true,
  );
  r.check(
    'its button offers to turn sound on',
    (await sound.getAttribute('aria-label')) === 'Bật tiếng',
  );
  const videos = await page
    .locator('[data-testid="trailer"], [data-testid="card:promo-video"]')
    .count();
  r.check(
    `only the card video plays while its popover is open (${videos} video)`,
    videos === 1 &&
      (await page
        .locator('[data-testid="hero"] [data-testid="trailer"]')
        .count()) === 0,
  );
  await r.shot('4-next-card-follows-muted');

  await r.click(
    page.getByTestId(`card:continue:${rows[again].slug}:details`),
    'Open the details of the continue watching title',
  );
  const modalPlays = await page
    .waitForSelector(
      '[data-testid="details"] [data-testid="trailer"][data-phase="playing"]',
      { timeout: 30000 },
    )
    .then(() => true)
    .catch(() => false);
  r.check(
    'the details modal of a continue watching title plays its trailer',
    modalPlays,
  );
  if (modalPlays) {
    await page.waitForTimeout(1200);
    const open = await page
      .locator('[data-testid="trailer"], [data-testid="card:promo-video"]')
      .count();
    r.check(`only the modal video plays (${open} video)`, open === 1);
    await r.shot('5-continue-details-trailer');
  }
}

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
