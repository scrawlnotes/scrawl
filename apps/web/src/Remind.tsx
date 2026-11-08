import { isAgentId, lastReminded, type PersonRef, REMIND_EVERY_MS } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { firstName, NameOf, type SpacePeople } from './People';

// Remind (design/notifications.md 4): on a card or a task given to someone else, not finished,
// in a space on a server, a press tells them; it can be pressed again an hour later, and says
// meanwhile how long ago it was. Its line on the timeline: "Kaan reminded Mert".

export interface RemindState {
  /** Who it is given to, by their first name. */
  name: string;
  /** How long ago this person reminded them, while it is less than an hour; null when it can be pressed. */
  ago: number | null;
}

/** Remind on a card or a task, or null when it has none: given to no one, to this person, to an agent, finished, or not in a space on a server. */
export function remindOf(item: { assignee?: PersonRef | null; timeline?: readonly { kind: string }[] }, team: SpacePeople | null, finished: boolean, onServer: boolean, now = Date.now()): RemindState | null {
  const to = item.assignee?.id;
  const me = team?.me;
  if (!onServer || finished || !to || !me || to === me || isAgentId(to)) return null;
  const last = lastReminded(item.timeline, me, to);
  const ago = last ? now - Date.parse(last) : null;
  return { name: firstName(item.assignee!, team.people), ago: ago !== null && ago < REMIND_EVERY_MS ? Math.max(0, ago) : null };
}

/** What it says: Remind Mert, or how long ago it was pressed. */
export function remindLabel(state: RemindState): string {
  if (state.ago === null) return t('remind.button', { name: state.name });
  const minutes = Math.floor(state.ago / 60_000);
  return minutes < 1 ? t('remind.justNow') : t('remind.ago', { count: minutes });
}

/** A reminder's line on a timeline: "reminded Mert". */
export function Reminded({ to, team }: { to: PersonRef; team: SpacePeople | null }) {
  return (
    <>
      {t('remind.reminded')}{' '}
      <b>
        <NameOf who={to} people={team?.people} first />
      </b>
    </>
  );
}
