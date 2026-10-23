import { describe, expect, it } from 'vitest';
import { agentOn, loadAgents, mergeAgents, parseAgents, renameAgent, saveAgents, seenAgent, serializeAgents, withComputerAgent } from './agents';
import { MemoryFs } from './fs';
import { mergeFile, mergeKindOf } from './sync/merge-files';

const at = (day: string) => new Date(`2026-10-${day}T10:00:00Z`);

describe('agents on the computers', () => {
  it('makes an agent the first time, and finds it after', async () => {
    const fs = new MemoryFs();
    expect(await loadAgents(fs)).toEqual([]);
    const first = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), '4f2a9c1e');
    expect(first.made).toBe(true);
    expect(first.agent).toEqual({ id: 'k:4f2a9c1e', name: 'Claude Code (KAAN-PC)', client: 'Claude Code', machine: 'KAAN-PC', created: '2026-10-15T10:00:00.000Z' });
    await saveAgents(fs, first.agents);
    const again = withComputerAgent(await loadAgents(fs), 'k', 'claude code', 'kaan-pc', at('16'), 'ffffffff');
    expect(again.made).toBe(false);
    expect(again.agent.id).toBe('k:4f2a9c1e');
  });

  it('tells apart a client on another computer, and another client', () => {
    let agents = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), 'aaaaaaaa').agents;
    agents = withComputerAgent(agents, 'k', 'Claude Code', 'MAC-MINI', at('16'), 'bbbbbbbb').agents;
    agents = withComputerAgent(agents, 'k', 'Cursor', 'KAAN-PC', at('16'), 'cccccccc').agents;
    expect(agents.map((a) => a.name)).toEqual(['Claude Code (KAAN-PC)', 'Claude Code (MAC-MINI)', 'Cursor (KAAN-PC)']);
  });

  it('takes the one made first when two were made at once', () => {
    const one = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('16'), 'bbbbbbbb').agent;
    const other = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), 'aaaaaaaa').agent;
    expect(agentOn([one, other], 'Claude Code', 'KAAN-PC')?.id).toBe('k:aaaaaaaa');
  });

  it('is seen once a day', () => {
    const agents = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), 'aaaaaaaa').agents;
    const seen = seenAgent(agents, 'k:aaaaaaaa', at('15'))!;
    expect(seen[0]?.seen).toBe('2026-10-15T10:00:00.000Z');
    expect(seenAgent(seen, 'k:aaaaaaaa', at('15'))).toBeNull();
    expect(seenAgent(seen, 'k:aaaaaaaa', at('16'))![0]?.seen).toBe('2026-10-16T10:00:00.000Z');
    expect(parseAgents(serializeAgents(seen))).toEqual(seen);
  });

  it('renames one; an empty name keeps it', () => {
    const agents = withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), 'aaaaaaaa').agents;
    expect(renameAgent(agents, 'k:aaaaaaaa', ' Laptop ')[0]?.name).toBe('Laptop');
    expect(renameAgent(agents, 'k:aaaaaaaa', ' ')[0]?.name).toBe('Claude Code (KAAN-PC)');
  });

  it('reads what is there and leaves out what is not an agent', () => {
    expect(parseAgents('{')).toEqual([]);
    expect(parseAgents(JSON.stringify({ agents: [{ id: 'k:1', client: 'Claude Code' }, { id: 'k:2', client: 'Cursor', machine: 'PC', extra: 1 }] }))).toEqual([
      { id: 'k:2', name: 'Cursor', client: 'Cursor', machine: 'PC', created: '', extra: 1 },
    ]);
  });

  it('merges two computers that each made one', () => {
    const base = serializeAgents([]);
    const local = serializeAgents(withComputerAgent([], 'k', 'Claude Code', 'KAAN-PC', at('15'), 'aaaaaaaa').agents);
    const remote = serializeAgents(withComputerAgent([], 'k', 'Claude Code', 'MAC-MINI', at('15'), 'bbbbbbbb').agents);
    expect(mergeKindOf('.scrawl/agents.json')).toBe('agents');
    expect(parseAgents(mergeAgents(base, local, remote)).map((a) => a.id)).toEqual(['k:aaaaaaaa', 'k:bbbbbbbb']);
    expect(parseAgents(mergeFile('agents', base, local, remote).text)).toHaveLength(2);
  });
});
