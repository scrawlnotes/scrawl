import { describe, expect, it } from 'vitest';
import { messageHtml, shortLink } from './message';

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

  it('keeps a code block as it was written, with its language and Copy, folded past fifteen lines', () => {
    const short = messageHtml('```ts\nconst a = "<b>";\n```');
    expect(short).toContain('<pre class="msg-code" data-lang="ts"><code>const a = &quot;&lt;b&gt;&quot;;</code></pre>');
    expect(short).toContain('<span>ts</span><button type="button" class="msg-copy" data-act="copy">Copy</button>');
    expect(short).not.toContain('msg-more');
    const long = messageHtml('```\n' + Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n```');
    expect(long).toContain('<div class="msg-codebox long">');
    expect(long).toContain('Show all 20 lines');
  });

  it('makes a note, a task or a card a chip that opens it, and a message’s address a link in the app', () => {
    const chip = messageHtml('[SCR-41 Agent guide](scrawl:item/card/sp-acme/Roadmap.board.json?id=c1 "Roadmap · Review")');
    expect(chip).toContain('<button type="button" class="msg-chip" data-href="scrawl:item/card/sp-acme/Roadmap.board.json?id=c1" data-kind="card">');
    expect(chip).toContain('<b>SCR-41 Agent guide</b><small>Roadmap · Review</small></button>');
    expect(messageHtml('[See this](scrawl:chat/localhost%3A8080/ch-1/m-1)')).toContain('<a class="msg-chat" href="#" data-href="scrawl:chat/localhost%3A8080/ch-1/m-1">See this</a>');
  });
});

describe('a web address written as it is', () => {
  it('shows short: its site without www, its path cut after forty characters, nothing after ? or #', () => {
    const long = 'https://www.teamgram.com/blog/tr/crminizle-konusun-teamgram-crmde-asistan-ve-mcp/?utm_source=tgmailer&utm_medium=email';
    const html = messageHtml(`Look ${long}`);
    expect(html).toContain(`href="${long.replace(/&/g, '&amp;')}"`);
    expect(html).toContain(`title="${long.replace(/&/g, '&amp;')}"`);
    expect(html).toContain('>teamgram.com/blog/tr/crminizle-konusun-teamgram-crmd…</a>');
    expect(shortLink('https://example.com/')).toBe('example.com');
    expect(shortLink('http://localhost:8080/a%C4%B1/b#x')).toBe('localhost:8080/aı/b');
  });

  it('leaves a link written with its words, and a mail address, as they are', () => {
    expect(messageHtml('[the docs](https://scrawlnotes.com/a/very/long/path/that/goes/on/and/on/and/on/x)')).toContain('>the docs</a>');
    expect(messageHtml('mail me@example.com')).toContain('>me@example.com</a>');
  });
});
