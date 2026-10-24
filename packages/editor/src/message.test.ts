import { describe, expect, it } from 'vitest';
import { messageHtml } from './message';

// A message as its conversation shows it (design/chat.md, 3.1).

describe('a message as HTML', () => {
  it('shows its Markdown, a mention as a chip, and opens only web and mail addresses', () => {
    const html = messageHtml('**Hi** [@Mert Kaya](scrawl:person/person-mert), see [the docs](https://scrawlnotes.com) and [this](javascript:alert(1)). [@room](scrawl:room)');
    expect(html).toContain('<strong>Hi</strong>');
    expect(html).toContain('<span class="msg-at" data-person="person-mert">@Mert Kaya</span>');
    expect(html).toContain('<a href="https://scrawlnotes.com" target="_blank" rel="noopener noreferrer">the docs</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<span class="msg-at room">@room</span>');
  });

  it('shows raw HTML as text, and a picture by its words without loading it', () => {
    const html = messageHtml('<img src=x onerror=alert(1)> ![a cat](https://example.com/cat.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a cat');
  });

  it('keeps a code block as it was written, with its language', () => {
    expect(messageHtml('```ts\nconst a = "<b>";\n```')).toBe('<pre class="msg-code" data-lang="ts"><code>const a = &quot;&lt;b&gt;&quot;;</code></pre>');
  });
});
