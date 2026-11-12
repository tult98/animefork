// Records every moment an <img> showing a source-site image sits inside an element matching `selector`.
export function watchSourceImages(selector: string) {
  const seen: string[] = [];
  const scan = () => {
    for (const img of document.querySelectorAll<HTMLImageElement>(
      `${selector} img`,
    )) {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('https://cdn.animevietsub.best/')) seen.push(src);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  return { seen, stop: () => observer.disconnect() };
}
