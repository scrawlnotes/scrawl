import { useEffect } from 'react';

// Rows chosen together, in the trash and in Files: on a computer a box at the row's left comes on
// hover, and once one is chosen every row has one; on a phone Select puts a circle on each row and
// a tap chooses it. After the Trash select and Files select views of design/mockups.html.

/** A row's box, or a group's, which is half filled while only some of the group are chosen. */
export function ChooseBox({ state, label, onChange }: { state: boolean | 'some'; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      className={`choose${state === true ? ' on' : state === 'some' ? ' some' : ''}`}
      aria-checked={state === 'some' ? 'mixed' : state}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(state !== true);
      }}
    />
  );
}

/** How a group of rows stands: all of them chosen, some, or none. */
export function groupState(paths: string[], chosen: ReadonlySet<string>): boolean | 'some' {
  const count = paths.filter((path) => chosen.has(path)).length;
  return count === 0 ? false : count === paths.length ? true : 'some';
}

/** Esc lets go of what is chosen, as an extra way beside ×. */
export function useLetGo(active: boolean, letGo: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      letGo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, letGo]);
}
