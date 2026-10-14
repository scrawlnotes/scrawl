const shapes = {
  note: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9.5 12h6M9.5 16h6" />
    </>
  ),
  tasks: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6.5" />
    </>
  ),
  board: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9.5 4v16M14.5 4v10" />
    </>
  ),
  keys: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M10.9 12.6L19 4.5M15.5 8l3 3M13.5 10l2 2" />
    </>
  ),
  collection: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M4 14.5h16M10 10v9" />
    </>
  ),
  open: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M4 4l16 16" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  subtask: (
    <>
      <path d="M6 5v8a3 3 0 0 0 3 3h3" />
      <path d="M17 13v6M14 16h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2.5 4 2.5 4H6" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  /** A folder's arrow in the sidebar; it turns down as the folder opens. */
  chevron: <path d="M9 6l6 6-6 6" />,
  restore: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4v4.5H9" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4.5-4.5 3 3 2.5-2.5L20 18" />
    </>
  ),
  audio: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  /** The menu of a page on a phone. */
  more: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="M7 7l10 10M17 7L7 17" />,
  /** What is chosen in a list on a phone. */
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  /** A card's labels. */
  tag: (
    <>
      <path d="M3.5 12V4.5H11l9 9-7.5 7.5z" />
      <circle cx="7.5" cy="8.5" r="1.3" />
    </>
  ),
  /** Who a card is on. */
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z" />
    </>
  ),
  phone: <path d="M6.6 3.5h2.6l1.5 4-2 1.3a10.5 10.5 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  /** A phase of a board. */
  phase: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // The quick dates of a phone's date sheet.
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  rise: <path d="M3.5 18h17M7 18a5 5 0 0 1 10 0M12 5.5v3.5M5.2 10.6l1.6 1.2M18.8 10.6l-1.6 1.2" />,
  week: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 15h8M13.5 12.8L16 15l-2.5 2.2" />
    </>
  ),
  noDate: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  // The format bar of a phone.
  undo: (
    <>
      <path d="M9 6.5L4.5 11 9 15.5" />
      <path d="M5 11h9.5a5 5 0 0 1 0 10H12" />
    </>
  ),
  redo: (
    <>
      <path d="M15 6.5l4.5 4.5-4.5 4.5" />
      <path d="M19 11H9.5a5 5 0 0 0 0 10H12" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  list: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <circle cx="5" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  quote: (
    <>
      <path d="M5.5 5v14" />
      <path d="M10 8h9M10 12h9M10 16h6" />
    </>
  ),
  codeBlock: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 9.5L7 12l2.5 2.5M14.5 9.5L17 12l-2.5 2.5" />
    </>
  ),
  /** Renaming. */
  pen: <path d="M5 19l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L9 17.5z M13.5 7l3 3" />,
  /** A note's history. */
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  /** A note shown as its Markdown. */
  markdown: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M6.5 15V9l2.5 3 2.5-3v6M16 9v6M14 13l2 2 2-2" />
    </>
  ),
  /** Out to a file. */
  export: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  /** In from a file. */
  import: (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  cloud: <path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.06 4.5 4.5 0 0 0 7 18z" />,
  space: (
    <>
      <path d="M4 7.5 12 4l8 3.5-8 3.5z" />
      <path d="M4 12l8 3.5 8-3.5M4 16.5 12 20l8-3.5" />
    </>
  ),
  move: (
    <>
      <path d="M4 12h11M11 7l5 5-5 5" />
      <path d="M20 5v14" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />
      <path d="M10.5 10.5v5.5M13.5 10.5v5.5" />
    </>
  ),
  warn: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 3.5 5.2 3.5 8s-1 5.5-3.5 8c-2.5-2.5-3.5-5.2-3.5-8s1-5.5 3.5-8z" />
    </>
  ),
  /** A paperclip: the files attached to notes, cards and records. */
  clip: <path d="M19.5 11.5l-7.6 7.6a4.8 4.8 0 0 1-6.8-6.8l8.2-8.2a3.2 3.2 0 0 1 4.5 4.5l-8.1 8.1a1.6 1.6 0 0 1-2.3-2.3l7.4-7.4" />,
  share: (
    <>
      <path d="M12 14.5v-11M8 7l4-4 4 4" />
      <path d="M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5" />
    </>
  ),
  sort: <path d="M7.5 4.5v15M4 16l3.5 3.5L11 16M16.5 19.5v-15M13 8l3.5-3.5L20 8" />,
  /** Down from the cloud: a file that is not on this device yet. */
  download: (
    <>
      <path d="M7 18.5h-.5a4 4 0 0 1-.4-8A6 6 0 0 1 17.7 9a4.5 4.5 0 0 1-.2 9.5H17" />
      <path d="M12 11.5v9M9 17.5l3 3 3-3" />
    </>
  ),
  /** Half dark: the look of the app. */
  appearance: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
};

export type IconName = keyof typeof shapes;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}
