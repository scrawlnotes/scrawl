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
  ),  settings: (
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
