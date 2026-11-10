import { browser } from 'wxt/browser';

/**
 * Injects the two page-world scripts, `embed` and `page-patch`, with a
 * <script src> tag so they run in the page's own JS world.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    const isEmbedPage = new URLSearchParams(location.search).has(
      'animevsub-embed-origins',
    );

    function injectScript(path: '/embed.js' | '/page-patch.js') {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL(path);
      script.async = false;

      const parent = document.head ?? document.documentElement;
      if (parent) {
        parent.prepend(script);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          (document.head ?? document.documentElement)?.prepend(script);
        });
      }
    }

    if (isEmbedPage)
      document.querySelectorAll('script').forEach((script) => script.remove());

    // Embed bridge: exposes window.AnimeVsubEmbed on every page and listens for
    // requests inside embedded animevietsub pages.
    injectScript('/embed.js');

    if (!isEmbedPage && !location.href.includes('animevsub.eu.org'))
      injectScript('/page-patch.js');
  },
});
