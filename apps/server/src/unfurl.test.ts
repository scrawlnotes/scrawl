import { describe, expect, it } from 'vitest';
import { pageText, previewLink, reachable, readHead } from './unfurl';

// What the server reads of a link (design/chat.md 29): only addresses on the internet, and what a
// page's head says it is.

describe('reachable', () => {
  it('is the internet, never this machine, its networks or what is reserved', () => {
    for (const address of ['93.184.215.14', '1.1.1.1', '2606:4700::1111', '::ffff:93.184.215.14']) expect(reachable(address)).toBe(true);
    for (const address of ['127.0.0.1', '10.1.239.4', '172.18.0.2', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not an address'])
      expect(reachable(address)).toBe(false);
    // On a server tried on this computer, this computer, and nothing else inside.
    expect(reachable('127.0.0.1', { loopback: true })).toBe(true);
    expect(reachable('::1', { loopback: true })).toBe(true);
    expect(reachable('10.0.0.1', { loopback: true })).toBe(false);
  });
});

describe('readHead', () => {
  const url = new URL('https://www.example.com/blog/post');

  it('takes Open Graph first, then Twitter, then the title and description', () => {
    expect(readHead('<head><meta content="Og" property="og:title"><meta name="twitter:title" content="Tw"><title>T</title></head>', url)).toEqual({ site: 'example.com', title: 'Og' });
    expect(readHead("<head><meta name='twitter:title' content='Tw'><title>T</title><meta name=description content='About &quot;it&quot;'></head>", url)).toEqual({
      site: 'example.com',
      title: 'Tw',
      description: 'About "it"',
    });
    expect(readHead('<head><title>\n  Just   a title </title></head>', url)).toEqual({ site: 'example.com', title: 'Just a title' });
  });

  it('gives the picture as an address of its own, and nothing for a page that says nothing', () => {
    expect(readHead('<head><meta property="og:title" content="A"><meta property="og:image" content="/i.png?a=1&amp;b=2"></head>', url)?.image).toBe('https://www.example.com/i.png?a=1&b=2');
    expect(readHead('<head><meta property="og:title" content="A"><meta property="og:image" content="javascript:alert(1)"></head>', url)?.image).toBeUndefined();
    expect(readHead('<html><body><title>In the body</title></body></html>', url)).toEqual({ site: 'example.com', title: 'In the body' });
    expect(readHead('<head></head><body>nothing</body>', url)).toBeNull();
  });

  it('cuts a long description, and reads a page in the characters it says it is in', () => {
    expect(readHead(`<head><meta property="og:title" content="A"><meta property="og:description" content="${'word '.repeat(100)}"></head>`, url)!.description).toHaveLength(300);
    expect(pageText(Buffer.from([0x3c, 0x74, 0x3e, 0xfd]), 'windows-1254')).toBe('<t>ı');
    expect(pageText(Buffer.from('<meta charset="iso-8859-9"><t>ý', 'latin1'), null)).toContain('ı');
  });
});

describe('previewLink', () => {
  it('is the first web address', () => {
    expect(previewLink([{ url: 'https://a.com/x' }, { url: 'https://b.com' }])).toBe('https://a.com/x');
    expect(previewLink([])).toBeNull();
  });
});
