import { createViewer, type Heading, headingsOf, type ScrawlViewer } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { Fragment, type RefObject, useEffect, useRef, useState } from 'react';
import { HELP, HELP_PAGES, HELP_START, helpText, helpTopicOf, isHelpPage } from './help/index';
import { Icon } from './Icon';
import { useNarrow } from './narrow';

const OUTSIDE = /^(https?:|mailto:)/i;

/**
 * A Help note in `host`, as the app shows notes and read only. A link to another note of Help
 * opens it with `onPage`; a web address opens in the browser. Gives the note's `##` headings
 * once it is read.
 */
function useHelpNote(host: RefObject<HTMLDivElement | null>, id: string, phone: boolean, onPage: (id: string) => void) {
  const viewer = useRef<ScrawlViewer | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const go = useRef(onPage);
  go.current = onPage;
  const follow = (href: string) => {
    const to = href.trim();
    if (OUTSIDE.test(to)) window.open(to, '_blank', 'noopener');
    else if (isHelpPage(to)) go.current(to);
  };
  useEffect(() => {
    const made = createViewer({ parent: host.current!, doc: '', openLink: follow, ...(phone && { onLinkTap: ({ href }) => follow(href) }) });
    viewer.current = made;
    // The note is only read, so a plain click on a link follows it.
    const click = (event: MouseEvent) => {
      const href = event.target instanceof Element ? event.target.closest<HTMLElement>('.cm-sl-link')?.dataset.href : undefined;
      if (!href || phone) return;
      event.preventDefault();
      follow(href);
    };
    made.view.dom.addEventListener('click', click);
    return () => {
      made.view.dom.removeEventListener('click', click);
      made.destroy();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let stale = false;
    void helpText(id, phone).then((text) => {
      if (stale || !viewer.current) return;
      viewer.current.show(text);
      setHeadings(headingsOf(viewer.current.view.state));
    });
    return () => {
      stale = true;
    };
  }, [id, phone]);
  return { viewer, headings };
}

/** The pages' list: a topic with pages folds; the one whose page is open stays open. */
function HelpNav({ page, onPage }: { page: string; onPage: (id: string) => void }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([helpTopicOf(page)?.id ?? '']));
  // A page opened from elsewhere, a link or Next, opens its topic.
  useEffect(() => {
    const topic = helpTopicOf(page);
    if (topic) setOpen((now) => (now.has(topic.id) ? now : new Set([...now, topic.id])));
  }, [page]);
  const fold = (id: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const item = (id: string, label: string, sub: boolean) => (
    <button key={id} type="button" className={[sub && 'sub', id === page && 'on'].filter(Boolean).join(' ') || undefined} aria-current={id === page ? 'page' : undefined} onClick={() => onPage(id)}>
      {!sub && <span className="pad" />}
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="help-nav" aria-label={t('help.title')}>
      {HELP.map((topic) =>
        topic.pages ? (
          <Fragment key={topic.id}>
            <button type="button" aria-expanded={open.has(topic.id)} onClick={() => fold(topic.id)}>
              <span className={open.has(topic.id) ? 'chev open' : 'chev'}>
                <Icon name="chevron" />
              </span>
              <span>{t(topic.label)}</span>
            </button>
            {open.has(topic.id) &&
              topic.pages.map((each) => (
                <Fragment key={each.id}>
                  {each.group && <div className="help-cap">{t(each.group)}</div>}
                  {item(each.id, t(each.label), true)}
                </Fragment>
              ))}
          </Fragment>
        ) : (
          item(topic.id, t(topic.label), false)
        ),
      )}
    </nav>
  );
}

/** A page: its topic over it, the note, Previous and Next at its foot; its headings beside it. */
function HelpPageView({ page, onPage }: { page: string; onPage: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const { viewer, headings } = useHelpNote(host, page, false, onPage);
  const [reading, setReading] = useState(0);
  const at = HELP_PAGES.findIndex((each) => each.id === page);
  const previous = HELP_PAGES[at - 1];
  const next = HELP_PAGES[at + 1];
  const topic = helpTopicOf(page);

  /** Where a heading is on screen. */
  const topOf = (heading: Heading) => {
    const view = viewer.current!.view;
    return view.documentTop + view.lineBlockAt(heading.from).top;
  };
  // The heading being read is the last one that went over the top; at the foot, the last one.
  const spy = () => {
    const scroller = box.current;
    if (!scroller || !viewer.current || headings.length === 0) return;
    if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) return setReading(headings.length - 1);
    const line = scroller.getBoundingClientRect().top + 32;
    let found = 0;
    headings.forEach((heading, i) => {
      if (topOf(heading) <= line) found = i;
    });
    setReading(found);
  };
  useEffect(() => {
    box.current?.scrollTo({ top: 0 });
    setReading(0);
  }, [page]);
  const goTo = (heading: Heading) => {
    const scroller = box.current!;
    scroller.scrollTo({ top: scroller.scrollTop + topOf(heading) - scroller.getBoundingClientRect().top - 16, behavior: 'smooth' });
  };

  return (
    <>
      <div ref={box} className="help-page" onScroll={spy}>
        {topic && <div className="help-crumb">{t(topic.label)}</div>}
        <div ref={host} className="help-note" />
        {(previous || next) && (
          <div className="help-pn">
            {previous && (
              <button type="button" onClick={() => onPage(previous.id)}>
                <small>{t('help.previous')}</small>
                <b>← {t(previous.label)}</b>
              </button>
            )}
            {next && (
              <button type="button" className="next" onClick={() => onPage(next.id)}>
                <small>{t('help.next')}</small>
                <b>{t(next.label)} →</b>
              </button>
            )}
          </div>
        )}
      </div>
      {headings.length >= 2 && (
        <nav className="help-toc" aria-label={t('help.onThisPage')}>
          <div className="cap">{t('help.onThisPage')}</div>
          {headings.map((heading, i) => (
            <button key={heading.from} type="button" className={i === reading ? 'on' : undefined} onClick={() => goTo(heading)}>
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

/**
 * Help on a computer (design/help.md): a window like Settings, the topics on the left, the page in
 * the middle, its headings on the right. In a narrow window the topics are a list and a page is
 * its own, with a way back, as the settings are.
 */
export function Help({ onClose }: { onClose: () => void }) {
  const narrow = useNarrow();
  const [page, setPage] = useState(HELP_START);
  // In a narrow window it opens on the list, as the settings do.
  const [listing, setListing] = useState(true);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (narrow && !listing) setListing(true);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, listing, onClose]);
  const open = (id: string) => {
    setPage(id);
    setListing(false);
  };
  const showList = narrow && listing;
  return (
    <div className="backdrop settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={box} tabIndex={-1} className="settings help" role="dialog" aria-modal="true" aria-label={t('help.title')}>
        <div className="st-head">
          {narrow && !listing ? (
            <button type="button" className="st-back" title={t('help.back')} aria-label={t('help.back')} onClick={() => setListing(true)}>
              ‹
            </button>
          ) : (
            <Icon name="help" />
          )}
          <h2>{t('help.title')}</h2>
          <button type="button" className="x" title={t('help.close')} aria-label={t('help.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={narrow ? 'help-main narrow' : 'help-main'}>
          {(!narrow || showList) && <HelpNav page={page} onPage={open} />}
          {!showList && <HelpPageView page={page} onPage={open} />}
        </div>
      </section>
    </div>
  );
}

/** A Help note on a phone, as a page of its own; a link to another note opens it as the next page. */
export function HelpPhoneNote({ id, onPage, onScrolled }: { id: string; onPage: (id: string) => void; onScrolled: (scrolled: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  useHelpNote(host, id, true, onPage);
  return <div ref={host} className="mb-version" onScroll={(event) => onScrolled(event.currentTarget.scrollTop > 38)} />;
}
