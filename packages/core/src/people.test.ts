import { describe, expect, it } from 'vitest';
import { MemoryFs } from './fs';
import { agentId, isAgent, loadPeople, mergePeople, ownerOf, parsePeople, sameAgent, samePerson, savePeople, serializePeople, setActive, withAgent, withPerson } from './people';

const at = (day: string) => new Date(`2026-10-${day}T10:00:00Z`);

describe('people', () => {
  it('is nobody until someone opens the space', async () => {
    expect(await loadPeople(new MemoryFs())).toEqual([]);
    expect(parsePeople('{')).toEqual([]);
    expect(parsePeople('{ "people": [{ "name": "no id" }] }')).toEqual([]);
  });

  it('adds the person who opens it, by id, and brings their row up to date', async () => {
    const fs = new MemoryFs();
    let people = withPerson([], { id: 'k', name: 'Kaan' }, at('12'));
    expect(people).toEqual([{ id: 'k', name: 'Kaan', seen: '2026-10-12T10:00:00.000Z', active: true }]);
    people = withPerson(people, { id: 'l' }, at('13'));
    expect(people.map((p) => p.id)).toEqual(['l', 'k']);
    expect(people[0]).toEqual({ id: 'l', seen: '2026-10-13T10:00:00.000Z', active: true });
    // Unnamed sets a name and opens again: the same row, named now.
    people = withPerson(people, { id: 'l', name: 'Lena', email: 'lena@acme.example' }, at('14'));
    expect(people.find((p) => p.id === 'l')).toEqual({ id: 'l', name: 'Lena', email: 'lena@acme.example', seen: '2026-10-14T10:00:00.000Z', active: true });
    await savePeople(fs, people);
    expect(await loadPeople(fs)).toEqual(people);
    expect(await fs.readText('.scrawl/people.json')).toBe(serializePeople(people));
  });

  it('makes one inactive, and active again when they open the space', () => {
    let people = withPerson([], { id: 'j', name: 'Jonas' }, at('01'));
    people = setActive(people, 'j', false);
    expect(people[0]?.active).toBe(false);
    expect(samePerson(people, { id: 'j', name: 'Jonas' }, at('01'))).toBe(false);
    people = withPerson(people, { id: 'j', name: 'Jonas' }, at('12'));
    expect(people[0]?.active).toBe(true);
    expect(samePerson(people, { id: 'j', name: 'Jonas' }, at('12'))).toBe(true);
    expect(samePerson(people, { id: 'j', name: 'Jonas W.' }, at('12'))).toBe(false);
    // Seen once a day: the next day's opening writes again.
    expect(samePerson(people, { id: 'j', name: 'Jonas' }, at('13'))).toBe(false);
  });

  it('merges two devices by id, the later opening winning', () => {
    const base = serializePeople(withPerson([], { id: 'k', name: 'Kaan' }, at('01')));
    const local = serializePeople(withPerson(parsePeople(base), { id: 'k', name: 'Kaan A.' }, at('12')));
    const remote = serializePeople(withPerson(parsePeople(base), { id: 'l', name: 'Lena' }, at('11')));
    const merged = parsePeople(mergePeople(base, local, remote));
    expect(merged.map((p) => [p.id, p.name])).toEqual([['k', 'Kaan A.'], ['l', 'Lena']]);
  });

  it('keeps what a newer version wrote in a row', () => {
    const people = parsePeople(JSON.stringify({ version: 1, people: [{ id: 'k', name: 'Kaan', seen: '', active: true, role: 'lead' }] }));
    expect(people[0]).toEqual({ id: 'k', name: 'Kaan', seen: '', active: true, role: 'lead' });
    expect(parsePeople(serializePeople(people))).toEqual(people);
  });

  it('has an agent write itself in once a day, by an id that says whose it is', () => {
    const id = agentId('k', '4f2a9c1e');
    expect(id).toBe('k:4f2a9c1e');
    expect(ownerOf(id)).toBe('k');
    expect(ownerOf('k')).toBe('k');
    const agent = { id, name: 'Claude Code (KAAN-PC)', client: 'Claude Code', place: 'KAAN-PC' };
    let people = withPerson([], { id: 'k', name: 'Kaan' }, at('12'));
    expect(sameAgent(people, agent, at('12'))).toBe(false);
    people = withAgent(people, agent, at('12'));
    expect(people.find(isAgent)).toEqual({ id, name: 'Claude Code (KAAN-PC)', agent: { client: 'Claude Code', place: 'KAAN-PC' }, seen: '2026-10-12T10:00:00.000Z', active: true });
    expect(people.filter((p) => !isAgent(p)).map((p) => p.id)).toEqual(['k']);
    expect(sameAgent(people, agent, at('12'))).toBe(true);
    // Renamed, or the next day: written again.
    expect(sameAgent(people, { ...agent, name: 'Laptop agent' }, at('12'))).toBe(false);
    expect(sameAgent(people, agent, at('13'))).toBe(false);
    // Made inactive, it is active again the next time it changes something.
    people = setActive(people, id, false);
    expect(sameAgent(people, agent, at('12'))).toBe(false);
    people = withAgent(people, agent, at('12'));
    expect(people.find(isAgent)?.active).toBe(true);
    expect(parsePeople(serializePeople(people))).toEqual(people);
  });
});
