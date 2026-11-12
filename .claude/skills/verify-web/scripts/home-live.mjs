// Scenario: live home page through the real extension. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/home-live.mjs
import { start } from './rec.mjs';
const r = await start('home-live', { ev: process.env.EV, actions: 3, proves: 'home: live shelves load through the extension, hero next works, airing see-all opens the listing' });
const { page } = r;
await page.goto(r.url('/'));
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await page.reload(); // warm route chunks so compile time is not in the clip
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await r.title();
const transport = await page.evaluate(() => window.__app.transport.constructor.name);
const shelves = await page.evaluate(() => window.__app.shelves().map((s) => [s.id, (s.cards ?? s.paths ?? []).length]));
r.check(`transport is ExtensionTransport (${transport})`, transport === 'ExtensionTransport');
r.check(`5 shelves with cards (${JSON.stringify(shelves)})`, shelves.length === 5 && shelves.every(([, n]) => n > 0));
await r.shot('1-home');

await r.click(page.getByTestId('hero:pause'), 'Pause the carousel');
const c0 = await page.getByTestId('hero:counter').innerText();
await r.click(page.getByTestId('hero:next'), 'Next slide');
await page.waitForFunction((c) => document.querySelector('[data-testid="hero:counter"]').innerText !== c, c0);
r.check(`hero counter moved (${c0} -> ${await page.getByTestId('hero:counter').innerText()})`, true);

await r.click(page.getByTestId('shelf:airing-this-season:see-all'), 'Open the airing listing');
await page.waitForURL('**/airing-this-season**');
await page.waitForSelector('[data-testid="listing:grid"]', { timeout: 60000 });
await r.shot('2-listing');
r.check('listing route opened', new URL(page.url()).pathname === '/airing-this-season');
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
