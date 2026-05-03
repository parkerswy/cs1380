require('../distribution.js')();
require('./helpers/sync-guard');

const distribution = globalThis.distribution;
const shared = require('../distribution/search/shared.js');

test('m6 search normalizes URLs before hashing/storing', (done) => {
  distribution.local.search.normalizeUrl(
      'HTTPS://Example.COM:443/a//b/?z=2&a=1#:~:text=hello',
      (error, value) => {
        try {
          expect(error).toBeNull();
          expect(value).toBe('https://example.com/a/b?a=1&z=2');
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      },
  );
});

test('m6 search uses safe namespaced hash keys', () => {
  const first = shared.keyForUrl('https://a.com/x-y');
  const second = shared.keyForUrl('https://a.com/xy');
  const term = shared.keyForTerm('incident');

  expect(first).toMatch(/^u[0-9a-f]{64}$/);
  expect(second).toMatch(/^u[0-9a-f]{64}$/);
  expect(term).toMatch(/^t[0-9a-f]{64}$/);
  expect(first).not.toBe(second);
  expect(first).not.toBe(term);
});

test('m6 search extracts links and processes text consistently', (done) => {
  const html = `
    <html>
      <head><style>.x { color: red; }</style></head>
      <body>
        <a href="/incidents/1#:~:text=bad">one</a>
        <a href="https://EXAMPLE.com/incidents/2?b=2&a=1">two</a>
        AI incidents were running and repeated incidents.
      </body>
    </html>
  `;

  distribution.local.search.extractLinks(html, 'https://example.com/root', (linkError, links) => {
    distribution.local.search.extractText(html, (extractError, text) => {
      distribution.local.search.processText(text, (textError, tokens) => {
        try {
          expect(linkError).toBeNull();
          expect(extractError).toBeNull();
          expect(textError).toBeNull();
          expect(links).toEqual([
            'https://example.com/incidents/1',
            'https://example.com/incidents/2?a=1&b=2',
          ]);
          expect(tokens).toEqual(expect.arrayContaining(['incident', 'runn', 'repeat']));
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      });
    });
  });
});
