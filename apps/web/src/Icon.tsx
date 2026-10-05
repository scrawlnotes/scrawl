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
};

export type IconName = keyof typeof shapes;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}
