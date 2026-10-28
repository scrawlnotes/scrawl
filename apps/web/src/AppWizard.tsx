import {
  APP_TEMPLATES,
  type AppFile,
  type AppInput,
  type AppPlan,
  AppProblems,
  apartProblem,
  type Answer,
  type AnswerRow,
  type Answers,
  askedQuestions,
  type Audience,
  audienceOf,
  dirname,
  fitsWith,
  localPath,
  PIECES,
  type Question,
  type QuestionColumn,
  readAnswers,
  readCurrencies,
  spaceOf,
  TEMPLATE_GROUPS,
  TEMPLATE_IDS,
  type TemplateId,
} from '@scrawlnotes/core';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { deviceRegion, isPhone, loadAppSide, saveAppSide } from './device';
import { Dialog, type FolderChoice, FolderField } from './dialogs';
import { Icon, type IconName } from './Icon';
import { folderLabel } from './items';
import { Sheet } from './sheets';

// New app (design/scrawl-apps.md 2): a window that goes in steps. The templates, chosen as cards
// by group, for a business or for a person (design/more-apps.md 1); the app's name, its place and
// its currencies; a page of questions for each template chosen, every answer ready; a summary of
// what will be set up; then Create. On a phone the same pages in a sheet, its bar going back and
// on. The plan is worked out by core, which writes nothing until Create.

/** The sides that have templates, Business first. */
const SIDES = (['business', 'personal'] as const).filter((side) => TEMPLATE_IDS.some((id) => audienceOf(APP_TEMPLATES[id].group) === side));

/** The kind of a piece as an icon. */
const PIECE_ICON: Record<string, IconName> = { collection: 'collection', board: 'board', folder: 'folder', note: 'note' };

/** A list in words, as this language joins it: "Companies and Products". */
const listed = (items: string[]) => new Intl.ListFormat(locale(), { type: 'conjunction' }).format(items);

/** The currency of the place this device is set to, for a new app's first; dollars where it is not known. */
function localCurrency(): string {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  const own: Record<string, string> = { TR: 'TRY', US: 'USD', GB: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', IN: 'INR', BR: 'BRL', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', MX: 'MXN', CN: 'CNY', KR: 'KRW' };
  const euro = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
  return own[region] ?? (euro.includes(region) ? 'EUR' : 'USD');
}

const COMMON_CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'AED', 'SAR', 'INR', 'CNY', 'BRL', 'MXN'];

type Step = 'templates' | 'app' | TemplateId | 'summary';

/** A piece's name and kind, by its role. */
const pieceOf = (role: string) => PIECES[role]!;

export function NewAppDialog({ folders, folder, adding, editing, onPlan, onCreate, onClose }: {
  /** Every place, the personal space's top first. */
  folders: string[];
  /** The place it starts in. */
  folder: string;
  /** Templates added to an app set up before (Add to app): its `_app.json`. Its templates are shown faint, its name and currencies are not asked. */
  adding?: AppFile;
  /** An app whose answers are changed (Edit app, design/edit-app.md): its templates' questions with the answers they have, then what changes. */
  editing?: AppFile;
  /** The plan of what was chosen; throws AppProblems for what is wrong with it. */
  onPlan: (input: AppInput, place: FolderChoice) => Promise<AppPlan>;
  /** Sets it up; a message when it could not be. */
  onCreate: (plan: AppPlan, place: FolderChoice) => Promise<string | null>;
  onClose: () => void;
}) {
  const phone = isPhone();
  const [at, setAt] = useState(0);
  // Added to an app, its own side; else as the device keeps it, by the space it is made in.
  const personal = spaceOf(folder) === null;
  const app = adding ?? editing;
  const appSide = (app?.templates ?? []).map((x) => APP_TEMPLATES[x.id]).find(Boolean);
  const [side, setSide] = useState<Audience>(() => (appSide ? audienceOf(appSide.group) : loadAppSide(personal)));
  const shownSide = SIDES.includes(side) ? side : SIDES[0]!;
  const [chosen, setChosen] = useState<TemplateId[]>([]);
  // An app of no template (design/app-home.md 5.5): named, and its folder made, nothing else asked.
  const [blank, setBlank] = useState(false);
  const [name, setName] = useState('');
  // The name is its templates' names until one is typed, at a free name where it is made: a business's
  // short, CRM, Sales and Stock; a person's whole, Personal finance, Habits and goals 2.
  const [nameTyped, setNameTyped] = useState(false);
  const freeName = (folder: string) => {
    const base = listed(chosen.map((id) => t(audienceOf(APP_TEMPLATES[id].group) === 'personal' ? APP_TEMPLATES[id].name : APP_TEMPLATES[id].short)));
    const taken = (n: string) => folders.some((f) => f.toLowerCase() === (folder ? `${folder}/${n}` : n).toLowerCase());
    let free = base;
    for (let i = 2; taken(free); i++) free = `${base} ${i}`;
    return free;
  };
  const [place, setPlace] = useState<FolderChoice>(() => ({ folder: folders.includes(folder) ? folder : (folders[0] ?? ''), create: false }));
  const [currencies, setCurrencies] = useState<string[]>(() => [localCurrency()]);
  // An app's own templates are read with the answers they were set up with.
  const [given, setGiven] = useState<Partial<Record<TemplateId, Answers>>>(() => Object.fromEntries((app?.templates ?? []).map((x) => [x.id, x.answers])));
  // Editing, where each item of a list answer came from: its place in the list as it was, null for one added.
  const [origins, setOrigins] = useState<Record<string, (number | null)[]>>({});
  const [plan, setPlan] = useState<AppPlan | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const busy = useRef(false);

  const installed = new Set<TemplateId>((app?.templates ?? []).map((x) => x.id));
  // What the questions and the pieces are worked out with: the app's templates and the ones chosen.
  const chosenSet = new Set<TemplateId>([...installed, ...chosen]);
  // An answer not given is the template's default for where the device is: its own channels and carriers.
  const answersOf = (id: TemplateId): Answers => readAnswers(APP_TEMPLATES[id], chosenSet, given[id] ?? {}, deviceRegion()).answers;
  const view = { has: (id: TemplateId) => chosenSet.has(id), answers: answersOf };
  const rolesOf = (id: TemplateId) => APP_TEMPLATES[id].pieces(answersOf(id), view);
  // Its currencies are asked when what is chosen holds money: added to an app, only when the app has none yet.
  // Editing, the app's templates that ask something, in their order.
  const edited = editing ? TEMPLATE_IDS.filter((id) => installed.has(id) && askedQuestions(APP_TEMPLATES[id], chosenSet, answersOf(id)).length > 0) : [];
  const money = (editing ? edited : chosen).some((id) => APP_TEMPLATES[id].money(answersOf(id))) && (!app || app.currencies.length === 0);
  const steps: Step[] = editing
    ? [...(money ? (['app'] as const) : []), ...edited, 'summary']
    : adding
      ? ['templates', ...(money ? (['app'] as const) : []), ...chosen, 'summary']
      : blank
        ? ['templates', 'app']
        : ['templates', 'app', ...chosen, 'summary'];
  const step = steps[Math.min(at, steps.length - 1)]!;
  const stepLabel = (s: Step) =>
    s === 'templates' ? t('apps.step.templates') : s === 'app' ? t(app ? 'apps.currencies' : 'apps.step.app') : s === 'summary' ? t(editing ? 'apps.step.changes' : 'apps.step.summary') : t(APP_TEMPLATES[s].name);
  // A phone's back button says where it goes in a word.
  const backLabel = (s: Step) => (s === 'templates' || s === 'app' || s === 'summary' ? stepLabel(s) : t(APP_TEMPLATES[s].short));

  /** The pieces a chosen template takes from the app or from the ones chosen before it. */
  const borrowed = (id: TemplateId): Set<string> => {
    if (!chosenSet.has(id) || installed.has(id)) return new Set();
    const before = [...installed, ...chosen.filter((other) => TEMPLATE_IDS.indexOf(other) < TEMPLATE_IDS.indexOf(id))];
    return new Set(rolesOf(id).filter((role) => before.some((other) => rolesOf(other).includes(role))));
  };
  /** What a chosen template shares, in a line: "Uses Companies with CRM"; added to an app, "Uses Products and Companies, in the app". */
  const sharedLine = (id: TemplateId): string | null => {
    if (!chosenSet.has(id) || installed.has(id)) return null;
    const inApp = rolesOf(id).filter((role) => [...installed].some((other) => rolesOf(other).includes(role)));
    const withNew = sharedOf(id).filter((_, i) => !inApp.includes(newShared(id)[i]!));
    const parts = [inApp.length > 0 ? t('apps.usesInApp', { pieces: listed(inApp.map((r) => pieceOf(r).name)) }) : null, withNew.length > 0 ? t('apps.uses', { pieces: withNew.join(', ') }) : null];
    return parts.filter(Boolean).join(' · ') || null;
  };
  /** The roles of what a chosen template shares with the new ones chosen before it, in the order sharedOf says them. */
  const newShared = (id: TemplateId): string[] => {
    const before = chosen.filter((other) => TEMPLATE_IDS.indexOf(other) < TEMPLATE_IDS.indexOf(id));
    const said: string[] = [];
    for (const other of before) for (const role of rolesOf(id)) if (rolesOf(other).includes(role) && !said.includes(role)) said.push(role);
    return said;
  };
  /** What a chosen template shares with the new ones chosen before it: "Companies with CRM". */
  const sharedOf = (id: TemplateId): string[] => {
    if (!chosenSet.has(id) || installed.has(id)) return [];
    const before = chosen.filter((other) => TEMPLATE_IDS.indexOf(other) < TEMPLATE_IDS.indexOf(id));
    const said = new Set<string>();
    const out: string[] = [];
    for (const other of before) {
      const theirs = new Set(rolesOf(other));
      for (const role of rolesOf(id)) {
        if (!theirs.has(role) || said.has(role)) continue;
        said.add(role);
        out.push(t('apps.pieceWith', { piece: pieceOf(role).name, template: t(APP_TEMPLATES[other].name) }));
      }
    }
    return out;
  };
  const sharedPieces = [...new Set(chosen.flatMap((id) => rolesOf(id)).filter((role, _, all) => chosen.filter((id) => rolesOf(id).includes(role)).length > 1))].map((r) => pieceOf(r).name);
  const sharedNames = [...new Set(sharedPieces)];

  // Editing: the answers as they were, and the items of a list typed anew, each with its new name.
  const wasOf = (id: TemplateId): Answers => readAnswers(APP_TEMPLATES[id], chosenSet, editing?.templates.find((x) => x.id === id)?.answers ?? {}).answers;
  const listOf = (value: Answer | undefined): string[] => (Array.isArray(value) ? (value as string[]) : []);
  const fromOf = (id: TemplateId, key: string): (number | null)[] => origins[`${id}.${key}`] ?? listOf(wasOf(id)[key]).map((_, i) => i);
  const renamesOf = (id: TemplateId): { [question: string]: { [from: string]: string } } => {
    const out: { [question: string]: { [from: string]: string } } = {};
    for (const q of APP_TEMPLATES[id].questions) {
      if (q.kind !== 'list') continue;
      const was = (wasOf(id)[q.key] as string[] | undefined) ?? [];
      const items = (given[id]?.[q.key] as string[] | undefined) ?? was;
      fromOf(id, q.key).forEach((f, i) => {
        const now = items[i]?.trim();
        if (f !== null && now && now !== was[f]) (out[q.key] ??= {})[was[f]!] = now;
      });
    }
    return out;
  };
  /** How many items of a list answer are added, typed anew or taken off. */
  const listChangesOf = (id: TemplateId, key: string) => {
    const was = (wasOf(id)[key] as string[] | undefined) ?? [];
    const from = fromOf(id, key);
    const items = (given[id]?.[key] as string[] | undefined) ?? was;
    const gone = was.filter((_, i) => !from.includes(i)).length;
    return gone + from.filter((f, i) => items[i]?.trim() && (f === null || items[i]!.trim() !== was[f])).length;
  };
  const changedOf = (id: TemplateId) => askedQuestions(APP_TEMPLATES[id], chosenSet, answersOf(id)).filter((q) => JSON.stringify(answersOf(id)[q.key]) !== JSON.stringify(wasOf(id)[q.key])).length;

  const input = (): AppInput =>
    editing
      ? { name: editing.name, currencies, templates: edited.map((id) => ({ id, answers: answersOf(id), renames: renamesOf(id) })) }
      : blank
        ? { name, currencies: [], templates: [], menu: { modules: [{ name: '', screens: [] }] } }
        : { name: adding?.name ?? name, currencies, templates: chosen.map((id) => ({ id, answers: answersOf(id) })) };
  const answer = (id: TemplateId, key: string, value: Answer) => setGiven((now) => ({ ...now, [id]: { ...answersOf(id), ...now[id], [key]: value } }));
  const toggle = (id: TemplateId) => {
    setBlank(false);
    setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : TEMPLATE_IDS.filter((x) => x === id || now.includes(x))));
  };
  const pickBlank = () => {
    setBlank((now) => !now);
    setChosen([]);
  };
  // An app is of one side: the other lets go of what was chosen.
  const pickSide = (to: Audience) => {
    if (to === shownSide) return;
    setSide(to);
    saveAppSide(personal, to);
    setChosen([]);
    setProblems([]);
  };

  /** Works the plan out: on the app's page for its name and currencies, before the summary for all of it. */
  const planned = async (): Promise<AppPlan | null> => {
    try {
      const made = await onPlan(input(), place);
      setProblems([]);
      return made;
    } catch (error) {
      setProblems(error instanceof AppProblems ? error.problems : [error instanceof Error ? error.message : String(error)]);
      return null;
    }
  };
  const next = async () => {
    if (busy.current) return;
    if (step === 'templates' && chosen.length === 0 && !blank) return;
    // An app of no template is made from its name: there is no summary to show.
    if (blank && step === 'app') {
      busy.current = true;
      const made = await planned();
      const failed = made ? await onCreate(made, place) : null;
      busy.current = false;
      if (failed) setProblems([failed]);
      return;
    }
    if (step === 'summary') {
      if (!plan) return;
      busy.current = true;
      const failed = await onCreate(plan, place);
      busy.current = false;
      if (failed) setProblems([failed]);
      return;
    }
    busy.current = true;
    const ahead = steps[at + 1];
    if (ahead === 'app' && !app && !nameTyped && chosen.length > 0) setName(freeName(place.folder));
    // The name and the currencies are checked on their page; everything before the summary.
    if (step === 'app' || ahead === 'summary') {
      const made = await planned();
      busy.current = false;
      if (!made) return;
      setPlan(made);
    } else busy.current = false;
    setProblems([]);
    setAt(at + 1);
  };
  const back = () => {
    setProblems([]);
    if (at === 0) onClose();
    else setAt(at - 1);
  };
  // A person's templates chosen apart from each other, a tick taken off between them: said, and not set up.
  const apart = step === 'templates' && !blank && chosen.length > 0 ? apartProblem(chosen, installed) : null;
  const ready = step === 'templates' ? (chosen.length > 0 && !apart) || blank : step === 'app' ? (!!app || name.trim() !== '') && (!money || currencies.length > 0) : step === 'summary' ? !!plan && !plan.blocked?.length && !plan.edit?.same : true;
  const title = editing ? t('apps.edit', { name: editing.name }) : adding ? t('apps.addTo', { name: adding.name }) : t('apps.title');
  const go = editing ? t('apps.save') : adding ? t('apps.add') : t('apps.create');

  const foot = (): string => {
    if (step === 'templates') {
      if (adding) {
        const has = t('apps.has', { name: adding.name, templates: listed([...installed].map((id) => t(APP_TEMPLATES[id].name))) });
        return chosen.length === 0 ? has : `${t('apps.toAdd', { count: chosen.length })} · ${has}`;
      }
      if (blank) return t('apps.blank');
      if (chosen.length === 0) return t('apps.pickOne');
      const count = t('apps.chosen', { count: chosen.length });
      return sharedNames.length > 0 ? `${count} · ${t('apps.shared', { count: sharedNames.length, pieces: listed(sharedNames) })}` : count;
    }
    if (step === 'app') return [name.trim(), money ? currencies.join(', ') : ''].filter(Boolean).join(' · ');
    if (step === 'summary') return plan ? (plan.blocked?.length ? t('apps.cantAdd') : plan.edit ? (plan.edit.same ? t('apps.noneChanged') : editCounts(plan)) : adding ? addedCounts(plan) : counts(plan)) : '';
    const asked = askedQuestions(APP_TEMPLATES[step], chosenSet, answersOf(step));
    const changed = editing ? changedOf(step) : 0;
    return changed > 0 ? t('apps.answersChanged', { template: t(APP_TEMPLATES[step].name), count: changed }) : t('apps.questions', { template: t(APP_TEMPLATES[step].name), count: asked.length });
  };

  const page = () => {
    if (step === 'templates') {
      return (
        <TemplatesPage
          phone={phone}
          side={shownSide}
          onSide={adding || SIDES.length < 2 ? undefined : pickSide}
          chosen={chosenSet}
          installed={installed}
          fits={(id) => fitsWith(id, chosenSet)}
          rolesOf={(id) => rolesOf(id).filter((role) => !borrowed(id).has(role))}
          sharedLine={sharedLine}
          onToggle={toggle}
          blank={adding ? undefined : { on: blank, pick: pickBlank }}
        />
      );
    }
    if (step === 'app') {
      return (
        <AppPage
          phone={phone}
          side={shownSide}
          adding={!!app}
          name={name}
          onName={(value) => {
            setName(value);
            setNameTyped(true);
            setProblems([]);
          }}
          folders={folders}
          place={place}
          onPlace={(to) => {
            setPlace(to);
            if (!nameTyped && chosen.length > 0) setName(freeName(to.folder));
          }}
          money={money}
          currencies={currencies}
          onCurrencies={setCurrencies}
          problems={problems}
        />
      );
    }
    if (step === 'summary') return plan && (plan.edit ? <EditSummary phone={phone} plan={plan} /> : adding ? <AddSummary phone={phone} plan={plan} installed={installed} place={place} /> : <SummaryPage phone={phone} plan={plan} place={place} />);
    return (
      <QuestionsPage
        id={step}
        chosen={chosenSet}
        installed={installed}
        answers={answersOf(step)}
        onAnswer={(key, value) => answer(step, key, value)}
        was={editing ? wasOf(step) : undefined}
        from={(key) => fromOf(step, key)}
        onFrom={(key, from) => setOrigins((now) => ({ ...now, [`${step}.${key}`]: from }))}
        changes={(key) => listChangesOf(step, key)}
        typed={(key) => given[step]?.[key] as string[] | undefined}
      />
    );
  };
  const shownProblems = step === 'app' ? [] : apart ? [apart] : problems;

  if (phone) {
    return (
      <Sheet label={title} className="mb-create na-sheet" onClose={onClose} onEscape={back}>
        <div className="mb-sh three">
          <button type="button" className={at > 0 ? 'cancel back' : 'cancel'} onClick={back}>
            {at > 0 && <Icon name="back" />}
            {at > 0 ? backLabel(steps[at - 1]!) : t('dialog.cancel')}
          </button>
          <b>{at === 0 ? title : stepLabel(step)}</b>
          {step === 'summary' ? (
            <span />
          ) : (
            <button type="button" className={ready ? 'ok' : 'ok off'} disabled={!ready} onClick={() => void next()}>
              {blank && step === 'app' ? go : t('apps.next')}
            </button>
          )}
        </div>
        <div className="na-msteps" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s} className={i <= at ? 'on' : undefined} />
          ))}
        </div>
        <div className="na-mbody">
          {page()}
          {shownProblems.map((p) => (
            <p key={p} className="na-bad" role="alert">
              {p}
            </p>
          ))}
          {step === 'summary' && (
            <button type="button" className="na-mbtn" disabled={!ready} onClick={() => void next()}>
              {go}
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Dialog label={title} className="new-app" onClose={onClose} onEscape={back}>
      <h2>{title}</h2>
      <div className="na-steps">
        {steps.map((s, i) => (
          <span key={s} className={i === at ? 'on' : i < at ? 'done' : undefined}>
            {stepLabel(s)}
          </span>
        ))}
      </div>
      <div className="dialog-body">
        {page()}
        {shownProblems.map((p) => (
          <p key={p} className="na-bad" role="alert">
            {p}
          </p>
        ))}
      </div>
      <div className="dialog-actions">
        <span className="na-count">{foot()}</span>
        <button type="button" onClick={back}>
          {at === 0 ? t('dialog.cancel') : t('dialog.back')}
        </button>
        <button type="button" className="primary" disabled={!ready} onClick={() => void next()}>
          {step === 'summary' || (blank && step === 'app') ? go : t('apps.next')}
        </button>
      </div>
    </Dialog>
  );
}

/** What the app will hold, in words: "12 collections, 1 board, 1 note". */
export function counts(plan: AppPlan): string {
  const by = (kind: string) => plan.created.filter((c) => c.kind === kind).length;
  const parts: [MessageKey, number][] = [
    ['apps.collections', by('collection')],
    ['apps.boards', by('board')],
    ['apps.folders', by('folder')],
    ['apps.notes', by('note')],
  ];
  return parts
    .filter(([, n]) => n > 0)
    .map(([key, n]) => t(key, { count: n }))
    .join(', ');
}

function TemplatesPage({ phone, side, onSide, chosen, installed, fits, rolesOf, sharedLine, onToggle, blank }: {
  phone: boolean;
  /** Whose templates are shown: a business's or a person's. */
  side: Audience;
  /** Shows the other side's; unset where there is no choosing, adding to an app. */
  onSide?: (side: Audience) => void;
  chosen: ReadonlySet<TemplateId>;
  /** The templates the app has already: faint, and not to be picked. */
  installed: ReadonlySet<TemplateId>;
  /** Whether a template goes in one app with those chosen and the app's: one that does not is faint, its own app. */
  fits: (id: TemplateId) => boolean;
  rolesOf: (id: TemplateId) => string[];
  sharedLine: (id: TemplateId) => string | null;
  onToggle: (id: TemplateId) => void;
  /** A new app may come from no template, at the end: chosen, the templates are not. */
  blank?: { on: boolean; pick: () => void };
}) {
  return (
    <>
      {onSide && (
        <div className="na-side">
          <span className="na-seg" role="radiogroup" aria-label={t('apps.side')}>
            {SIDES.map((each) => (
              <button key={each} type="button" role="radio" aria-checked={each === side} onClick={() => onSide(each)}>
                {t(`apps.side.${each}`)}
              </button>
            ))}
          </span>
          {!phone && <small>{t(`apps.side.${side}Help`)}</small>}
        </div>
      )}
      {TEMPLATE_GROUPS[side].map((group) => {
        const ids = TEMPLATE_IDS.filter((id) => APP_TEMPLATES[id].group === group);
        if (ids.length === 0) return null;
        return (
          <div key={group} className="na-group">
            <div className="na-label">{t(`apps.group.${group}`)}</div>
            <div className={phone ? 'na-mgroup' : 'na-cards'}>
              {ids.map((id) => {
                const template = APP_TEMPLATES[id];
                const there = installed.has(id);
                const on = chosen.has(id) && !there;
                const off = !there && !fits(id);
                const shared = sharedLine(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={there || off || undefined}
                    className={[phone ? 'na-mcard' : 'na-card', there && 'in', off && 'off'].filter(Boolean).join(' ')}
                    onClick={() => !there && !off && onToggle(id)}
                  >
                    {there && !phone ? <span className="na-in">{t('apps.inTheApp')}</span> : <span className="tick">{on && <Icon name="check" />}</span>}
                    <span className="hd">
                      {!phone && <Icon name={template.icon as IconName} />}
                      {t(template.name)}
                    </span>
                    <span className="what">{there && phone ? t('apps.inTheApp') : off ? t('apps.ownApp') : t(template.what)}</span>
                    {!phone && (
                      <span className="sets">
                        {rolesOf(id).map((role) => (
                          <span key={role}>
                            <Icon name={PIECE_ICON[pieceOf(role).kind]!} />
                            {pieceOf(role).name}
                          </span>
                        ))}
                      </span>
                    )}
                    {shared && (
                      <span className="shared">
                        {!phone && <Icon name="link" />}
                        {shared}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {blank && (
        <div className="na-group">
          <div className="na-label">{t('apps.blankGroup')}</div>
          <div className={phone ? 'na-mgroup' : 'na-cards'}>
            <button type="button" role="checkbox" aria-checked={blank.on} className={phone ? 'na-mcard' : 'na-card'} onClick={blank.pick}>
              <span className="tick">{blank.on && <Icon name="check" />}</span>
              <span className="hd">
                {!phone && <Icon name="app" />}
                {t('apps.blank')}
              </span>
              <span className="what">{t('apps.blankText')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AppPage({ phone, side, adding, name, onName, folders, place, onPlace, money, currencies, onCurrencies, problems }: {
  phone: boolean;
  /** Whose app it is: its currencies are said for a business's orders or a person's accounts. */
  side: Audience;
  /** Added to an app that has no currencies yet: only they are asked. */
  adding: boolean;
  name: string;
  onName: (name: string) => void;
  folders: string[];
  place: FolderChoice;
  onPlace: (place: FolderChoice) => void;
  money: boolean;
  currencies: string[];
  onCurrencies: (codes: string[]) => void;
  problems: string[];
}) {
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState<string | null>(null);
  const dragged = useRef<number | null>(null);
  const add = () => {
    const code = readCurrencies([typed]);
    if (!code || code.length === 0) {
      if (typed.trim()) setWrong(t('apps.notCurrency', { code: typed.trim() }));
      return;
    }
    if (!currencies.includes(code[0]!)) onCurrencies([...currencies, code[0]!]);
    setTyped('');
    setWrong(null);
  };
  const drop = (to: number) => {
    const from = dragged.current;
    dragged.current = null;
    if (from === null || from === to) return;
    const next = [...currencies];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onCurrencies(next);
  };
  const help = t(side === 'personal' ? 'apps.currenciesHelpPersonal' : 'apps.currenciesHelp');
  return (
    <div className={phone ? 'na-mapp' : 'na-fields'}>
      {adding && <p className="na-lead wide">{t('apps.currenciesFirst')}</p>}
      {!adding && (
        <>
          <label className="na-field">
            <span>{t('apps.name')}</span>
            <input id="app-name" autoFocus value={name} aria-invalid={problems.length > 0 || undefined} onChange={(event) => onName(event.target.value)} />
            {/* What keeps the app from being made here is said where it is mended: its name, mostly. */}
            {problems.length > 0 ? (
              problems.map((p) => (
                <small key={p} className="na-help na-bad" role="alert">
                  {p}
                </small>
              ))
            ) : (
              <small className="na-help">{t('apps.nameHelp')}</small>
            )}
          </label>
          <div className="na-field">
            <span>{t('apps.in')}</span>
            <FolderField folders={folders} value={place} onChange={onPlace} />
            <small className="na-help">{t('apps.inHelp')}</small>
          </div>
        </>
      )}
      {money && (
        <div className="na-field wide">
          <span>{t('apps.currencies')}</span>
          <div className="na-curs">
            {currencies.map((code, i) => (
              <span
                key={code}
                className="na-cur"
                draggable
                onDragStart={() => (dragged.current = i)}
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDrop={() => drop(i)}
              >
                {code}
                {i === 0 && <small>{t('apps.main')}</small>}
                <button type="button" className="x" aria-label={t('apps.removeCurrency', { code })} title={t('apps.removeCurrency', { code })} onClick={() => onCurrencies(currencies.filter((c) => c !== code))}>
                  <Icon name="close" />
                </button>
              </span>
            ))}
            <input
              className="na-add"
              autoFocus={adding}
              list="app-currencies"
              aria-label={t('apps.addCurrency')}
              placeholder={t('apps.addCurrency')}
              value={typed}
              maxLength={3}
              onChange={(event) => {
                setTyped(event.target.value.toUpperCase());
                setWrong(null);
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                add();
              }}
            />
            {typed.trim() && (
              <button type="button" className="na-addbtn" onClick={add}>
                <Icon name="plus" />
              </button>
            )}
            <datalist id="app-currencies">
              {COMMON_CURRENCIES.filter((c) => !currencies.includes(c)).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {/* Added to an app, what keeps it from being added is said here: its currencies are all that is asked. */}
          <small className={wrong || (adding && problems.length > 0) ? 'na-help na-bad' : 'na-help'} role={adding && problems.length > 0 ? 'alert' : undefined}>
            {wrong ?? (adding && problems[0]) ?? help}
          </small>
        </div>
      )}
    </div>
  );
}

function QuestionsPage({ id, chosen, installed, answers, onAnswer, was, from, onFrom, changes, typed }: {
  id: TemplateId;
  chosen: ReadonlySet<TemplateId>;
  installed: ReadonlySet<TemplateId>;
  answers: Answers;
  onAnswer: (key: string, value: Answer) => void;
  /** Editing: the answers as they were; a question answered otherwise has a dot and what it was. */
  was?: Answers;
  /** Editing: where each item of a list came from, its place in the list as it was. */
  from?: (key: string) => (number | null)[];
  onFrom?: (key: string, from: (number | null)[]) => void;
  /** Editing: how many items of a list are added, typed anew or taken off. */
  changes?: (key: string) => number;
  /** A list's items as they are typed, an empty one too: + Add's new one shows to be typed in, and editing, where each came from keeps to them. */
  typed?: (key: string) => string[] | undefined;
}) {
  const asked = askedQuestions(APP_TEMPLATES[id], chosen, answers);
  const keys = new Set(asked.map((q) => q.key));
  return (
    <div className="na-qs">
      <p className="na-lead">{t(was ? 'apps.editLead' : 'apps.ready')}</p>
      {asked.map((q) => {
        const before = was?.[q.key] ?? q.default;
        const changed = !!was && JSON.stringify(answers[q.key] ?? q.default) !== JSON.stringify(before);
        const origin = was && q.kind === 'list' && from ? { was: (Array.isArray(before) ? (before as string[]) : []), from: from(q.key), items: typed?.(q.key) ?? (Array.isArray(before) ? (before as string[]) : []) } : undefined;
        return (
        <div key={q.key} className={q.under && keys.has(q.under) ? 'na-q sub' : 'na-q'}>
          {q.because && chosen.has(q.because) && (
            <span className="na-why">
              <Icon name="link" />
              {t(installed.has(q.because) ? 'apps.becauseInApp' : 'apps.because', { template: t(APP_TEMPLATES[q.because].name) })}
            </span>
          )}
          <span className="ql" id={`q-${q.key}`}>
            {changed && <i className="na-dot" aria-hidden="true" />}
            {t(q.label)}
            {changed && <small className="na-was">{wasSaid(q, before, q.kind === 'list' ? (changes?.(q.key) ?? 0) : 0)}</small>}
          </span>
          <Control
            question={q}
            // A list as it is typed: its answer leaves an empty item out, which + Add has just put there.
            value={q.kind === 'list' ? (typed?.(q.key) ?? answers[q.key] ?? q.default) : (answers[q.key] ?? q.default)}
            onChange={(value, moved) => {
              if (moved) onFrom?.(q.key, moved);
              onAnswer(q.key, value);
            }}
            origin={origin}
          />
          {q.help && <small className="na-help">{t(q.help)}</small>}
        </div>
        );
      })}
    </div>
  );
}

/** Editing, a list as it was, where each item now came from in it (null for one added), and the items as typed. */
interface ListOrigin {
  was: string[];
  from: (number | null)[];
  items: string[];
}

/** What a changed answer was, in a few words: "was Yes"; for a list, how many of its items changed. */
function wasSaid(q: Question, before: Answer, listChanges: number): string {
  if (q.kind === 'yesno') return t('apps.was', { answer: t(before === true ? 'apps.yes' : 'apps.no') });
  const label = (v: string) => t(q.options?.find((o) => o.value === v)?.label ?? ('' as MessageKey)) || v;
  if (q.kind === 'choice') return t('apps.was', { answer: label(String(before)) });
  if (q.kind === 'multi') return t('apps.was', { answer: listed((before as string[]).map(label)) });
  if (q.kind === 'list') return t('apps.listChanges', { count: Math.max(1, listChanges) });
  if (q.kind === 'rows') return t('apps.listChanges', { count: Math.max(1, listChanges) });
  return t('apps.was', { answer: String(before) });
}

/** A question's answer as it is asked: a pair or a few short choices as a row of buttons, longer ones as a list, a list of items to change. */
function Control({ question: q, value, onChange, origin }: {
  question: Question;
  value: Answer;
  /** With where each item of a list came from, when an edit keeps it. */
  onChange: (value: Answer, from?: (number | null)[]) => void;
  origin?: ListOrigin;
}) {
  const label = `q-${q.key}`;
  if (q.kind === 'yesno') {
    return (
      <span className="na-seg" role="radiogroup" aria-labelledby={label}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
            {t(v ? 'apps.yes' : 'apps.no')}
          </button>
        ))}
      </span>
    );
  }
  const options = q.options ?? [];
  if (q.kind === 'choice') {
    const short = options.length <= 3 && options.every((o) => t(o.label).length <= 14);
    return (
      <span className={short ? 'na-seg' : 'na-radio'} role="radiogroup" aria-labelledby={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
            {t(o.label)}
          </button>
        ))}
      </span>
    );
  }
  if (q.kind === 'multi') {
    const on = (Array.isArray(value) ? (value as string[]) : []);
    return (
      <span className="na-seg many" role="group" aria-labelledby={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={on.includes(o.value)} onClick={() => onChange(on.includes(o.value) ? on.filter((x) => x !== o.value) : [...on, o.value])}>
            {t(o.label)}
          </button>
        ))}
      </span>
    );
  }
  if (q.kind === 'list') return <ListControl question={q} items={origin?.items ?? (Array.isArray(value) ? (value as string[]) : [])} onChange={onChange} origin={origin} />;
  if (q.kind === 'rows') return <RowsControl question={q} rows={Array.isArray(value) ? (value as AnswerRow[]) : []} onChange={onChange} />;
  return <input aria-labelledby={label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />;
}

/**
 * The rows of a rows question (design/more-apps.md 4.1): a line each, a box for each of its
 * question's columns, a line of text, a number, a choice or a day of the month; × takes a row away,
 * a button adds one. A row left with no name is not kept.
 */
/** A column's width: the name takes what is left, a choice as wide as its longest option or its heading. */
function widthOf(c: QuestionColumn): string {
  if (c.type === 'text') return 'minmax(72px, 1fr)';
  if (c.type === 'day') return '46px';
  const longest = c.type === 'choice' ? Math.max(0, ...(c.options ?? []).map((o) => o.length)) : (c.placeholder ? t(c.placeholder) : '').length;
  return `${Math.round(Math.max(t(c.label).length * 6.8, longest * 6.6) + (c.type === 'choice' ? 24 : 12))}px`;
}

function RowsControl({ question: q, rows, onChange }: { question: Question; rows: AnswerRow[]; onChange: (rows: AnswerRow[]) => void }) {
  const columns = q.columns ?? [];
  const set = (i: number, key: string, value: string) => onChange(rows.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="na-rows" aria-labelledby={`q-${q.key}`} style={{ gridTemplateColumns: `${columns.map(widthOf).join(' ')} 22px` }}>
      {columns.map((c) => (
        <span key={c.key} className="h">
          {t(c.label)}
        </span>
      ))}
      <span className="h" />
      {rows.map((row, i) => (
        <div key={i} className="row">
          {columns.map((c) => {
            const v = row[c.key];
            const label = `${t(c.label)}${typeof row[columns[0]!.key] === 'string' ? ` · ${row[columns[0]!.key]}` : ''}`;
            // Its column's name over it on a phone, where the row is a card and has no heading.
            return (
              <label key={c.key} className="cell">
                {c !== columns[0] && <span className="cap">{t(c.label)}</span>}
                {c.type === 'choice' ? (
                  <select aria-label={label} value={typeof v === 'string' ? v : ''} onChange={(event) => set(i, c.key, event.target.value)}>
                    <option value="">–</option>
                    {(c.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={label}
                    inputMode={c.type === 'text' ? undefined : 'numeric'}
                    placeholder={t(c.placeholder ?? c.label)}
                    value={v === undefined ? '' : String(v)}
                    onChange={(event) => set(i, c.key, event.target.value)}
                  />
                )}
              </label>
            );
          })}
          <button type="button" className="x" aria-label={t('apps.removeItem', { item: String(row[columns[0]!.key] ?? '') })} title={t('apps.removeItem', { item: String(row[columns[0]!.key] ?? '') })} onClick={() => remove(i)}>
            <Icon name="close" />
          </button>
        </div>
      ))}
      {q.add && (
        <button type="button" className="na-add" onClick={() => onChange([...rows, {}])}>
          <Icon name="plus" />
          {t(q.add)}
        </button>
      )}
    </div>
  );
}

/**
 * A list's items, each typed in its own box; dragged by its grip to move it, × to take it away, a
 * button to add one. Editing an app (`origin`), each item keeps where it came from: one typed anew
 * says what it was, one added says so, one taken off stays struck through with Put back.
 */
function ListControl({ question: q, items, onChange, origin }: { question: Question; items: string[]; onChange: (items: string[], from?: (number | null)[]) => void; origin?: ListOrigin }) {
  const dragged = useRef<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const hints = q.hints?.(items.filter((i) => i.trim())) ?? [];
  // Where each item came from goes with it, as it moves, goes or comes.
  const from = origin ? items.map((_, i) => origin.from[i] ?? null) : null;
  const change = (next: string[], nextFrom?: (number | null)[]) => onChange(next, from ? nextFrom : undefined);
  // A hint goes by the item's place among the ones written.
  let written = -1;
  const drop = (to: number) => {
    const at = dragged.current;
    dragged.current = null;
    if (at === null || at === to) return;
    const move = <T,>(list: T[]) => {
      const next = [...list];
      const [moved] = next.splice(at, 1);
      next.splice(to, 0, moved!);
      return next;
    };
    change(move(items), from ? move(from) : undefined);
  };
  // The box to type in next: one just added, or the one before one taken off with Backspace.
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (focus === null) return;
    boxes.current[focus]?.focus();
    setFocus(null);
  }, [focus, items]);
  /** A new empty item, under the one at `after` (at the end with none), the keyboard in it. */
  const add = (after = items.length - 1) => {
    const at = after + 1;
    change([...items.slice(0, at), '', ...items.slice(at)], from ? [...from.slice(0, at), null, ...from.slice(at)] : undefined);
    setFocus(at);
  };
  const remove = (i: number) => change(items.filter((_, j) => j !== i), from?.filter((_, j) => j !== i));
  /** Puts an item taken off back, after the last one that was before it. */
  const putBack = (was: number) => {
    const at = from!.reduce<number>((place, f, i) => (f !== null && f < was ? i + 1 : place), 0);
    change([...items.slice(0, at), origin!.was[was]!, ...items.slice(at)], [...from!.slice(0, at), was, ...from!.slice(at)]);
  };
  return (
    <div className="na-list" aria-labelledby={`q-${q.key}`}>
      {items.map((item, i) => {
        if (item.trim()) written++;
        const hint = item.trim() ? hints[written] : null;
        const f = from?.[i];
        const said = !from || !item.trim() ? null : f === null || f === undefined ? t('apps.newItem') : item.trim() !== origin!.was[f] ? t('apps.wasItem', { item: origin!.was[f]! }) : null;
        return (
          <div key={i} className={said ? 'it edited' : 'it'} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => drop(i)}>
            <span className="gr" draggable title={t('apps.moveItem')} onDragStart={() => (dragged.current = i)}>
              ⋮⋮
            </span>
            <input
              ref={(box) => {
                boxes.current[i] = box;
              }}
              value={item}
              aria-label={item || t(q.label)}
              onChange={(event) => change(items.map((x, j) => (j === i ? event.target.value : x)), from ?? undefined)}
              // An item left empty is not kept: it goes as the keyboard leaves it.
              onBlur={(event) => event.currentTarget.value === '' && items[i] === '' && remove(i)}
              onKeyDown={(event) => {
                // Enter adds one under it; in an empty one it is done, and the empty one goes. Backspace in an empty one takes it off.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (item.trim()) add(i);
                  else event.currentTarget.blur();
                } else if (event.key === 'Backspace' && item === '') {
                  event.preventDefault();
                  remove(i);
                  setFocus(Math.max(0, i - 1));
                }
              }}
            />
            {said ? <small className="was">{said}</small> : hint && <small>{t(hint)}</small>}
            <button
              type="button"
              className="x"
              aria-label={t('apps.removeItem', { item })}
              title={t('apps.removeItem', { item })}
              onClick={() => remove(i)}
            >
              <Icon name="close" />
            </button>
          </div>
        );
      })}
      {origin?.was.map((item, was) =>
        from!.includes(was) ? null : (
          <div key={`gone-${was}`} className="it gone">
            <span className="gr" aria-hidden="true">
              ⋮⋮
            </span>
            <span className="t">{item}</span>
            <button type="button" className="put" onClick={() => putBack(was)}>
              {t('apps.putBack')}
            </button>
          </div>
        ),
      )}
      {q.add && (
        <button type="button" className="na-add" onClick={() => add()}>
          <Icon name="plus" />
          {t(q.add)}
        </button>
      )}
    </div>
  );
}

function SummaryPage({ phone, plan, place }: { phone: boolean; plan: AppPlan; place: FolderChoice }) {
  const about = plan.created.find((c) => c.kind === 'note');
  const where = folderLabel(place.folder);
  const shortOf = (ids: TemplateId[]) => listed(ids.map((id) => t(APP_TEMPLATES[id].short)));
  if (phone) {
    return (
      <>
        <div className="na-label">{`${plan.app.name}, ${t('apps.inPlace', { place: where })}`}</div>
        <div className="na-mgroup">
          {plan.templates.map((s) => (
            <div key={s.id} className="na-mrow">
              {s.title}
              <small>{s.pieces.map((p) => p.name).join(', ')}</small>
            </div>
          ))}
          {about && (
            <div className="na-mrow">
              {about.path.split('/').at(-1)!.replace(/\.md$/, '')}
              <small>{t('apps.notes', { count: 1 })}</small>
            </div>
          )}
        </div>
        <p className="na-help">{counts(plan)}</p>
      </>
    );
  }
  return (
    <>
      <div className="na-where">
        <Icon name="folder" />
        <b>{plan.app.name}</b>
        <small>{t('apps.inPlace', { place: where })}</small>
        {about && (
          <span className="note">
            <Icon name="note" />
            {t('apps.aboutSays', { name: about.path.split('/').at(-1)!.replace(/\.md$/, '') })}
          </span>
        )}
      </div>
      <div className="na-sum">
        {plan.templates.map((s) => (
          <div key={s.id} className="col">
            <h4>
              <Icon name={APP_TEMPLATES[s.id].icon as IconName} />
              {s.title}
            </h4>
            {s.pieces.map((p) => (
              <div key={p.name} className="pc">
                <Icon name={PIECE_ICON[p.kind]!} />
                {p.name}
                {p.with.length > 0 ? <small>{t('apps.with', { templates: shortOf(p.with) })}</small> : p.records > 0 ? <small>{t('apps.records', { count: p.records })}</small> : null}
              </div>
            ))}
            {s.buttons.length > 0 && (
              <>
                <span className="hd">{t('apps.buttons')}</span>
                <ul>
                  <li>{s.buttons.join(', ')}</li>
                </ul>
              </>
            )}
            {s.glance.length > 0 && (
              <>
                <span className="hd">{t('apps.byItself')}</span>
                <ul>
                  {s.glance.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** What adding templates does, in words: "5 collections set up, 5 added to". */
export function addedCounts(plan: AppPlan): string {
  const made = counts(plan);
  return [made ? t('apps.setUpWhat', { what: made }) : '', plan.added.length > 0 ? t('apps.addedTo', { count: plan.added.length }) : ''].filter(Boolean).join(', ');
}

/**
 * The summary of templates added to an app: what is set up, what is added to what is there, and
 * what is left as it is; or, where what is added would not work with what is there, what to change.
 */
function AddSummary({ phone, plan, installed, place }: { phone: boolean; plan: AppPlan; installed: ReadonlySet<TemplateId>; place: FolderChoice }) {
  const blocked = plan.blocked ?? [];
  const has = listed([...installed].map((id) => t(APP_TEMPLATES[id].name)));
  // The app's folder is in another; it is said where.
  const where = t('apps.inPlace', { place: folderLabel(dirname(place.folder)) });
  const boxes = (
    <>
      {blocked.length > 0 && (
        <div className="na-box bad" role="alert">
          <Icon name="warn" />
          <span>
            <b>{t('apps.cantAdd')}</b> {blocked.join(' ')}
          </span>
        </div>
      )}
      {blocked.length === 0 &&
        plan.notes.map((note) => (
          <div key={note} className="na-box">
            <Icon name="info" />
            <span>{note}</span>
          </div>
        ))}
    </>
  );
  if (phone) {
    return (
      <>
        <div className={blocked.length > 0 ? 'na-off' : undefined}>
          <div className="na-label">{t('apps.setUpTitle')}</div>
          <div className="na-mgroup">
            {plan.templates.map((s) => (
              <div key={s.id} className="na-mrow">
                {s.title}
                <small>{s.pieces.map((p) => p.name).join(', ')}</small>
              </div>
            ))}
          </div>
          {plan.added.length > 0 && (
            <>
              <div className="na-label">{t('apps.addedTitle')}</div>
              <div className="na-mgroup">
                {plan.added.map((a) => (
                  <div key={a.name} className="na-mrow">
                    {a.name}
                    <small>{a.what}</small>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="na-help">{t('apps.onlyMissing')}</p>
        </div>
        {boxes}
      </>
    );
  }
  return (
    <>
      <div className="na-where">
        <Icon name="folder" />
        <b>{plan.app.name}</b>
        <small>{[where, has].filter(Boolean).join(' · ')}</small>
      </div>
      <div className={blocked.length > 0 ? 'na-add2 off' : 'na-add2'}>
        <div className="col">
          <h4>{t('apps.setUpTitle')}</h4>
          {plan.templates.map((s) => (
            <div key={s.id} className="na-one">
              {plan.templates.length > 1 && <span className="hd">{s.title}</span>}
              {s.pieces.map((p) => (
                <div key={p.name} className="pc">
                  <Icon name={PIECE_ICON[p.kind]!} />
                  {p.name}
                  {p.records > 0 && <small>{t('apps.records', { count: p.records })}</small>}
                </div>
              ))}
              {s.buttons.length > 0 && (
                <>
                  <span className="hd">{t('apps.buttons')}</span>
                  <ul>
                    <li>{s.buttons.join(', ')}</li>
                  </ul>
                </>
              )}
              {s.glance.length > 0 && (
                <>
                  <span className="hd">{t('apps.byItself')}</span>
                  <ul>
                    {s.glance.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="col">
          <h4>{t('apps.addedTitle')}</h4>
          {plan.added.map((a) => (
            <div key={a.name} className="pc">
              <Icon name={PIECE_ICON[a.kind]!} />
              {a.name}
              <small>{a.what}</small>
            </div>
          ))}
          <span className="hd">{t('apps.nothingChanged')}</span>
          <ul>
            <li>{t('apps.onlyMissing')}</li>
          </ul>
        </div>
      </div>
      {boxes}
    </>
  );
}

/** What an edit adds: the pieces set up anew and what is added to what is there. */
const editAdded = (plan: AppPlan) => [...plan.created.filter((c) => c.kind !== 'note').map((c) => ({ kind: c.kind, name: c.path.split('/').at(-1)!.replace(/\.board\.json$/, ''), what: t('apps.newPiece') })), ...plan.added];

/** What changing answers does, in words: "1 added, 2 changed, 1 kept". */
export function editCounts(plan: AppPlan): string {
  const edit = plan.edit;
  if (!edit) return '';
  const parts: [MessageKey, number][] = [
    ['apps.countAdded', editAdded(plan).length],
    ['apps.countChanged', edit.changed.length],
    ['apps.countTakenOff', edit.takenOff.length],
    ['apps.countKept', edit.kept.length],
  ];
  return parts
    .filter(([, n]) => n > 0)
    .map(([key, n]) => t(key, { count: n }))
    .join(', ');
}

/**
 * Changes (design/edit-app.md 3): what changing answers adds, changes in place, takes off and
 * keeps, only the parts that have something; under them, that records are never deleted. With no
 * answer changed, that nothing changes.
 */
function EditSummary({ phone, plan }: { phone: boolean; plan: AppPlan }) {
  const edit = plan.edit!;
  const templates = listed(plan.app.templates.map((x) => t(APP_TEMPLATES[x.id].name)));
  if (edit.same) {
    return (
      <div className="na-none">
        <b>{t('apps.nothingChanges')}</b>
        {t('apps.nothingChangesMore')}
      </div>
    );
  }
  const parts: [MessageKey, { kind: string; name: string; what: string }[]][] = [
    ['apps.editAdded', editAdded(plan)],
    ['apps.editChanged', edit.changed],
    ['apps.editTakenOff', edit.takenOff],
    ['apps.editKept', edit.kept],
  ];
  const shown = parts.filter(([, items]) => items.length > 0);
  const never = (
    <div className="na-box">
      <Icon name="info" />
      <span>
        <b>{t('apps.neverDeleted')}</b> {t('apps.neverDeletedMore')}
      </span>
    </div>
  );
  if (phone) {
    return (
      <>
        {shown.map(([title, items]) => (
          <div key={title}>
            <div className="na-label">{t(title)}</div>
            <div className="na-mgroup">
              {items.map((a, i) => (
                <div key={i} className="na-mrow">
                  {a.name}
                  <small>{a.what}</small>
                </div>
              ))}
            </div>
          </div>
        ))}
        {plan.blocked?.length ? null : never}
      </>
    );
  }
  return (
    <>
      <div className="na-where">
        <Icon name="folder" />
        <b>{plan.app.name}</b>
        <small>{templates}</small>
      </div>
      <div className="na-edit">
        {shown.map(([title, items], i) => (
          <div key={title} className={shown.length % 2 === 1 && i === shown.length - 1 ? 'col wide' : 'col'}>
            <h4>{t(title)}</h4>
            {items.map((a, j) => (
              <div key={j} className="pc">
                <Icon name={PIECE_ICON[a.kind] ?? 'collection'} />
                {a.name}
                <small>{a.what}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
      {plan.blocked?.length ? (
        <div className="na-box bad" role="alert">
          <Icon name="warn" />
          <span>{plan.blocked.join(' ')}</span>
        </div>
      ) : (
        never
      )}
    </>
  );
}
