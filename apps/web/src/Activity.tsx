import { dayOf, type PersonRef, type Task, workerKey, workersOf } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import type { ReactNode } from 'react';
import { Dialog } from './dialogs';
import { assigneeLabel, firstName, NameOf, type SpacePeople, WhoOf } from './People';
import { clockTime, pastDayLabel } from './text';

// Who did what on a card or a task (design/activity.md 4): a line for each thing that mattered,
// with the face and the name of who did it; and a task's activity in a window of its own, after
// the Task activity view of design/mockups.html, opened from its ··· menu, and on a phone under
// its sheet.

/** A moment on a timeline: the time of day today, else the day. */
export function when(iso: string, today: string): string {
  const day = dayOf(new Date(iso));
  return day === today ? clockTime(iso) : pastDayLabel(day, today);
}

/** Who wrote an entry of a timeline: the person or the agent its id is, with the name it was written under; null when nothing says. */
export const writerOf = (entry: { by?: string; byId?: string }): PersonRef | null => (entry.byId ? { id: entry.byId, ...(entry.by && { name: entry.by }) } : entry.by ? { name: entry.by } : null);

/** Who did something, as words: a person's first name, an agent's name and whose it is; with none, You in the personal space, where there is only you, else Someone. */
export const writerText = (who: PersonRef | null, team: SpacePeople | null) => (who ? firstName(who, team?.people) : team ? t('card.someone') : t('card.you'));

/** Who did something, as it shows: an agent's whose faint after its name. */
export function Writer({ who, team }: { who: PersonRef | null; team: SpacePeople | null }) {
  return who ? <NameOf who={who} people={team?.people} first /> : <>{writerText(null, team)}</>;
}

/** One thing that mattered, on one short line: the face and the name of who did it, what they did, and when. */
export function ActivityLine({ who, team, at, today, children }: { who: PersonRef | null; team: SpacePeople | null; at: string; today: string; children: ReactNode }) {
  return (
    <div className="tl-ev">
      <WhoOf who={who ?? {}} people={team?.people} />
      <span className="tx">
        <b>
          <Writer who={who} team={team} />
        </b>{' '}
        {children}
      </span>
      <span className="t">{when(at, today)}</span>
    </div>
  );
}

/** Who it was given to, as a line says it: "gave it to Kaan", "gave it to nobody". */
export function GaveTo({ given, team }: { given: PersonRef | undefined; team: SpacePeople | null }) {
  if (!given) return <>{t('card.gaveToNobody')}</>;
  return (
    <>
      {t('card.gaveTo')}{' '}
      <b>
        <NameOf who={given} people={team?.people} first />
      </b>
    </>
  );
}

/** The entries of a task's timeline its activity shows: those of a kind this version knows. */
const taskEntries = (task: Task) => (task.timeline ?? []).filter((entry) => entry.kind !== 'unknown');

/** Whether a task has anything for its activity: who made it, or an entry. */
export const hasTaskActivity = (task: Task) => (!!task.author && !!task.created) || taskEntries(task).length > 0;

/** What mattered on a task, one line each: who made it, who it was given to, done and opened again. */
export function TaskEntries({ task, team, today }: { task: Task; team: SpacePeople | null; today: string }) {
  return (
    <>
      {task.author && task.created && (
        <ActivityLine who={task.author} team={team} at={task.created} today={today}>
          {t('card.createdThis')}
        </ActivityLine>
      )}
      {taskEntries(task).map((entry) => (
        <ActivityLine key={entry.id} who={writerOf(entry)} team={team} at={entry.at} today={today}>
          {entry.kind === 'assign' ? <GaveTo given={entry.given} team={team} /> : entry.kind === 'done' ? t('tasks.finishedIt') : t('tasks.reopenedIt')}
        </ActivityLine>
      ))}
    </>
  );
}

/**
 * A task's activity, in a window: who worked on it, once each, then what mattered on it, one
 * line each: who made it, who it was given to, done and opened again. Close ends it.
 */
export function TaskActivity({ task, team, today, onClose }: { task: Task; team: SpacePeople | null; today: string; onClose: () => void }) {
  const workers = workersOf(task);
  return (
    <Dialog label={t('tasks.activity')} className="task-activity" onClose={onClose}>
      <h2>{t('tasks.activity')}</h2>
      <p className="what">{task.title}</p>
      {workers.length > 0 && (
        <>
          <div className="wl">{t('card.workedOn')}</div>
          <div className="ac-chips">
            {workers.map((worker) => {
              const who = { ...(worker.id && { id: worker.id }), ...(worker.name && { name: worker.name }) };
              return (
                <span key={workerKey(worker)} className="ac-chip" title={assigneeLabel(who, team?.people)}>
                  <WhoOf who={who} people={team?.people} />
                  <NameOf who={who} people={team?.people} first />
                </span>
              );
            })}
          </div>
        </>
      )}
      <div className="tlog ac-log">
        <TaskEntries task={task} team={team} today={today} />
        {!hasTaskActivity(task) && <p className="none">{t('tasks.noActivity')}</p>}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.close')}
        </button>
      </div>
    </Dialog>
  );
}
