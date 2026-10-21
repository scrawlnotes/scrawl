import {
  APP_TEMPLATES,
  type AppInput,
  type AppPlan,
  AppProblems,
  type Answer,
  type Answers,
  askedQuestions,
  localPath,
  PIECES,
  type Question,
  readAnswers,
  readCurrencies,
  TEMPLATE_IDS,
  type TemplateGroup,
  type TemplateId,
} from '@scrawlnotes/core';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react';
import { isPhone } from './device';
import { Dialog, type FolderChoice, FolderField } from './dialogs';
import { Icon, type IconName } from './Icon';
import { folderLabel } from './items';
import { Sheet } from './sheets';

// New app (design/scrawl-apps.md 2): a window that goes in steps. The templates, chosen as cards
// by group; the app's name, its place and its currencies; a page of questions for each template
// chosen, every answer ready; a summary of what will be set up; then Create. On a phone the same
// pages in a sheet, its bar going back and on. The plan is worked out by core, which writes
// nothing until Create.

const GROUPS: { group: TemplateGroup; label: MessageKey }[] = [
  { group: 'customers', label: 'apps.group.customers' },
  { group: 'money', label: 'apps.group.money' },
  { group: 'work', label: 'apps.group.work' },
];

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

export function NewAppDialog({ folders, folder, onPlan, onCreate, onClose }: {
  /** Every place, the personal space's top first. */
  folders: string[];
  /** The place it starts in. */
  folder: string;
  /** The plan of what was chosen; throws AppProblems for what is wrong with it. */
  onPlan: (input: AppInput, place: FolderChoice) => Promise<AppPlan>;
  /** Sets it up; a message when it could not be. */
  onCreate: (plan: AppPlan, place: FolderChoice) => Promise<string | null>;
  onClose: () => void;
}) {
  const phone = isPhone();
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<TemplateId[]>([]);
  const [name, setName] = useState('');
  const [place, setPlace] = useState<FolderChoice>(() => ({ folder: folders.includes(folder) ? folder : (folders[0] ?? ''), create: false }));
  const [currencies, setCurrencies] = useState<string[]>(() => [localCurrency()]);
  const [given, setGiven] = useState<Partial<Record<TemplateId, Answers>>>({});
  const [plan, setPlan] = useState<AppPlan | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const busy = useRef(false);

  const chosenSet = new Set(chosen);
  const answersOf = (id: TemplateId): Answers => readAnswers(APP_TEMPLATES[id], chosenSet, given[id] ?? {}).answers;
  const view = { has: (id: TemplateId) => chosenSet.has(id), answers: answersOf };
  const rolesOf = (id: TemplateId) => APP_TEMPLATES[id].pieces(answersOf(id), view);
  const money = chosen.some((id) => APP_TEMPLATES[id].money(answersOf(id)));
  const steps: Step[] = ['templates', 'app', ...chosen, 'summary'];
  const step = steps[Math.min(at, steps.length - 1)]!;
  const stepLabel = (s: Step) => (s === 'templates' ? t('apps.step.templates') : s === 'app' ? t('apps.step.app') : s === 'summary' ? t('apps.step.summary') : t(APP_TEMPLATES[s].name));
  // A phone's back button says where it goes in a word.
  const backLabel = (s: Step) => (s === 'templates' || s === 'app' || s === 'summary' ? stepLabel(s) : t(APP_TEMPLATES[s].short));

  /** The pieces a chosen template takes from the ones chosen before it. */
  const borrowed = (id: TemplateId): Set<string> => {
    if (!chosenSet.has(id)) return new Set();
    const before = chosen.filter((other) => TEMPLATE_IDS.indexOf(other) < TEMPLATE_IDS.indexOf(id));
    return new Set(rolesOf(id).filter((role) => before.some((other) => rolesOf(other).includes(role))));
  };
  /** What a chosen template shares with the ones chosen before it: "Companies with CRM". */
  const sharedOf = (id: TemplateId): string[] => {
    if (!chosenSet.has(id)) return [];
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

  const input = (): AppInput => ({ name, currencies, templates: chosen.map((id) => ({ id, answers: answersOf(id) })) });
  const answer = (id: TemplateId, key: string, value: Answer) => setGiven((now) => ({ ...now, [id]: { ...answersOf(id), ...now[id], [key]: value } }));
  const toggle = (id: TemplateId) => setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : TEMPLATE_IDS.filter((x) => x === id || now.includes(x))));

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
    if (step === 'templates' && chosen.length === 0) return;
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
  const ready = step === 'templates' ? chosen.length > 0 : step === 'app' ? name.trim() !== '' && (!money || currencies.length > 0) : step === 'summary' ? !!plan : true;

  const foot = (): string => {
    if (step === 'templates') {
      if (chosen.length === 0) return t('apps.pickOne');
      const count = t('apps.chosen', { count: chosen.length });
      return sharedNames.length > 0 ? `${count} · ${t('apps.shared', { count: sharedNames.length, pieces: listed(sharedNames) })}` : count;
    }
    if (step === 'app') return [name.trim(), money ? currencies.join(', ') : ''].filter(Boolean).join(' · ');
    if (step === 'summary') return plan ? counts(plan) : '';
    const asked = askedQuestions(APP_TEMPLATES[step], chosenSet, answersOf(step));
    return t('apps.questions', { template: t(APP_TEMPLATES[step].name), count: asked.length });
  };

  const page = () => {
    if (step === 'templates') return <TemplatesPage phone={phone} chosen={chosenSet} rolesOf={(id) => rolesOf(id).filter((role) => !borrowed(id).has(role))} sharedOf={sharedOf} onToggle={toggle} />;
    if (step === 'app') {
      return (
        <AppPage
          phone={phone}
          name={name}
          onName={(value) => {
            setName(value);
            setProblems([]);
          }}
          folders={folders}
          place={place}
          onPlace={setPlace}
          money={money}
          currencies={currencies}
          onCurrencies={setCurrencies}
          problems={problems}
        />
      );
    }
    if (step === 'summary') return plan && <SummaryPage phone={phone} plan={plan} place={place} />;
    return <QuestionsPage id={step} chosen={chosenSet} answers={answersOf(step)} onAnswer={(key, value) => answer(step, key, value)} />;
  };
  const shownProblems = step === 'app' ? [] : problems;

  if (phone) {
    return (
      <Sheet label={t('apps.title')} className="mb-create na-sheet" onClose={onClose} onEscape={back}>
        <div className="mb-sh three">
          <button type="button" className={at > 0 ? 'cancel back' : 'cancel'} onClick={back}>
            {at > 0 && <Icon name="back" />}
            {at > 0 ? backLabel(steps[at - 1]!) : t('dialog.cancel')}
          </button>
          <b>{at === 0 ? t('apps.title') : stepLabel(step)}</b>
          {step === 'summary' ? (
            <span />
          ) : (
            <button type="button" className={ready ? 'ok' : 'ok off'} disabled={!ready} onClick={() => void next()}>
              {t('apps.next')}
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
              {t('apps.create')}
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Dialog label={t('apps.title')} className="new-app" onClose={onClose} onEscape={back}>
      <h2>{t('apps.title')}</h2>
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
          {step === 'summary' ? t('apps.create') : t('apps.next')}
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

function TemplatesPage({ phone, chosen, rolesOf, sharedOf, onToggle }: {
  phone: boolean;
  chosen: ReadonlySet<TemplateId>;
  rolesOf: (id: TemplateId) => string[];
  sharedOf: (id: TemplateId) => string[];
  onToggle: (id: TemplateId) => void;
}) {
  return (
    <>
      {GROUPS.map(({ group, label }) => {
        const ids = TEMPLATE_IDS.filter((id) => APP_TEMPLATES[id].group === group);
        return (
          <div key={group} className="na-group">
            <div className="na-label">{t(label)}</div>
            <div className={phone ? 'na-mgroup' : 'na-cards'}>
              {ids.map((id) => {
                const template = APP_TEMPLATES[id];
                const on = chosen.has(id);
                const shared = sharedOf(id);
                return (
                  <button key={id} type="button" role="checkbox" aria-checked={on} className={phone ? 'na-mcard' : 'na-card'} onClick={() => onToggle(id)}>
                    <span className="tick">{on && <Icon name="check" />}</span>
                    <span className="hd">
                      {!phone && <Icon name={template.icon as IconName} />}
                      {t(template.name)}
                    </span>
                    <span className="what">{t(template.what)}</span>
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
                    {shared.length > 0 && (
                      <span className="shared">
                        {!phone && <Icon name="link" />}
                        {t('apps.uses', { pieces: shared.join(', ') })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function AppPage({ phone, name, onName, folders, place, onPlace, money, currencies, onCurrencies, problems }: {
  phone: boolean;
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
  return (
    <div className={phone ? 'na-mapp' : 'na-fields'}>
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
          <small className={wrong ? 'na-help na-bad' : 'na-help'}>{wrong ?? t('apps.currenciesHelp')}</small>
        </div>
      )}
    </div>
  );
}

function QuestionsPage({ id, chosen, answers, onAnswer }: { id: TemplateId; chosen: ReadonlySet<TemplateId>; answers: Answers; onAnswer: (key: string, value: Answer) => void }) {
  const asked = askedQuestions(APP_TEMPLATES[id], chosen, answers);
  const keys = new Set(asked.map((q) => q.key));
  return (
    <div className="na-qs">
      <p className="na-lead">{t('apps.ready')}</p>
      {asked.map((q) => (
        <div key={q.key} className={q.under && keys.has(q.under) ? 'na-q sub' : 'na-q'}>
          {q.because && chosen.has(q.because) && (
            <span className="na-why">
              <Icon name="link" />
              {t('apps.because', { template: t(APP_TEMPLATES[q.because].name) })}
            </span>
          )}
          <span className="ql" id={`q-${q.key}`}>
            {t(q.label)}
          </span>
          <Control question={q} value={answers[q.key] ?? q.default} onChange={(value) => onAnswer(q.key, value)} />
          {q.help && <small className="na-help">{t(q.help)}</small>}
        </div>
      ))}
    </div>
  );
}

/** A question's answer as it is asked: a pair or a few short choices as a row of buttons, longer ones as a list, a list of items to change. */
function Control({ question: q, value, onChange }: { question: Question; value: Answer; onChange: (value: Answer) => void }) {
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
    const on = Array.isArray(value) ? value : [];
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
  if (q.kind === 'list') return <ListControl question={q} items={Array.isArray(value) ? value : []} onChange={onChange} />;
  return <input aria-labelledby={label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />;
}

/** A list's items, each typed in its own box; dragged by its grip to move it, × to take it away, a button to add one. */
function ListControl({ question: q, items, onChange }: { question: Question; items: string[]; onChange: (items: string[]) => void }) {
  const dragged = useRef<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const hints = q.hints?.(items.filter((i) => i.trim())) ?? [];
  // A hint goes by the item's place among the ones written.
  let written = -1;
  const drop = (to: number) => {
    const from = dragged.current;
    dragged.current = null;
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };
  return (
    <div className="na-list" aria-labelledby={`q-${q.key}`}>
      {items.map((item, i) => {
        if (item.trim()) written++;
        const hint = item.trim() ? hints[written] : null;
        return (
          <div key={i} className="it" onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => drop(i)}>
            <span className="gr" draggable title={t('apps.moveItem')} onDragStart={() => (dragged.current = i)}>
              ⋮⋮
            </span>
            <input
              value={item}
              autoFocus={focus === i}
              aria-label={item || t(q.label)}
              onChange={(event) => onChange(items.map((x, j) => (j === i ? event.target.value : x)))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                setFocus(items.length);
                onChange([...items, '']);
              }}
            />
            {hint && <small>{t(hint)}</small>}
            <button type="button" className="x" aria-label={t('apps.removeItem', { item })} title={t('apps.removeItem', { item })} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon name="close" />
            </button>
          </div>
        );
      })}
      {q.add && (
        <button
          type="button"
          className="na-add"
          onClick={() => {
            setFocus(items.length);
            onChange([...items, '']);
          }}
        >
          <Icon name="plus" />
          {t(q.add)}
        </button>
      )}
    </div>
  );
}

function SummaryPage({ phone, plan, place }: { phone: boolean; plan: AppPlan; place: FolderChoice }) {
  const about = plan.created.find((c) => c.kind === 'note');
  const where = localPath(place.folder) ? folderLabel(place.folder) : folderLabel(place.folder) || '';
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
                {p.with.length > 0 ? <small>{t('apps.with', { templates: shortOf(p.with) })}</small> : p.records > 0 ? <small>{p.records}</small> : null}
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
