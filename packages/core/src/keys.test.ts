import { describe, expect, it } from 'vitest';
import {
  addGroup,
  addKey,
  cleanKey,
  groupText,
  isSecret,
  keyCount,
  keysName,
  parseKeys,
  removeGroup,
  removeKey,
  renameGroup,
  updateKey,
  writeValue,
} from './keys';

const FILE = `# Production DB
DB_HOST=db.prod.example.com
DB_PORT=5432
DB_PASSWORD="c4mp f1re"

# OpenAI
# rotated in May
OPENAI_API_KEY=sk-proj-4f9a
`;

describe('keys files', () => {
  it('is named after its file', () => {
    expect(keysName('Scrawl/Production.env')).toBe('Production');
  });

  it('reads groups from headings, notes and quotes', () => {
    const groups = parseKeys(FILE);
    expect(groups.map((g) => [g.line, g.name, g.end])).toEqual([
      [0, 'Production DB', 4],
      [5, 'OpenAI', 8],
    ]);
    expect(groups[0]!.keys.map((k) => [k.line, k.key, k.value])).toEqual([
      [1, 'DB_HOST', 'db.prod.example.com'],
      [2, 'DB_PORT', '5432'],
      [3, 'DB_PASSWORD', 'c4mp f1re'],
    ]);
    // The second comment is a note of the group, not a group of its own.
    expect(groups[1]!.keys.map((k) => k.key)).toEqual(['OPENAI_API_KEY']);
    expect(keyCount(groups)).toBe(4);
  });

  it('reads keys before any heading, exported keys and keys put out of use', () => {
    const groups = parseKeys('export TOKEN=abc\nPLAIN = spaced  \n# OLD_KEY=gone\nEMPTY=\n');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBeNull();
    expect(groups[0]!.keys.map((k) => [k.key, k.value])).toEqual([
      ['TOKEN', 'abc'],
      ['PLAIN', 'spaced'],
      ['EMPTY', ''],
    ]);
    expect(parseKeys("A='it''s'\nB=\"a\\\"b\\nc\" # note\n")[0]!.keys.map((k) => k.value)).toEqual(['it', 'a"b\nc']);
    expect(parseKeys('')).toEqual([]);
  });

  it('adds a key at the end of its group, and the first key of a file', () => {
    const added = addKey(FILE, { line: 0, name: 'Production DB' }, 'db user', 'scrawl app');
    expect(added.text.split('\n')[4]).toBe("db_user='scrawl app'");
    expect(added.at).toEqual({ line: 4, key: 'db_user' });
    expect(parseKeys(added.text)[0]!.keys.map((k) => k.key)).toEqual(['DB_HOST', 'DB_PORT', 'DB_PASSWORD', 'db_user']);
    // After the group's notes, in a group of its own lines.
    expect(addKey('# A\n# note\n\n# B\n', { line: 0, name: 'A' }, 'K', 'v').text).toBe('# A\n# note\nK=v\n\n# B\n');
    expect(addKey('', { line: -1, name: null }, 'K', 'v').text).toBe('K=v\n');
    // The group is found by its name when lines moved meanwhile.
    expect(addKey(`X=1\n${FILE}`, { line: 5, name: 'OpenAI' }, 'ORG', 'o').text.split('\n')[9]).toBe('ORG=o');
  });

  it('adds keys in the order they are typed under the line they are typed in', () => {
    const group = { line: 5, name: 'OpenAI' };
    const first = addKey(FILE, group, 'ORG', 'o', 'first');
    expect(first.at).toEqual({ line: 7, key: 'ORG' });
    const second = addKey(first.text, group, 'PROJECT', 'p', first.at!);
    expect(parseKeys(second.text)[1]!.keys.map((k) => k.key)).toEqual(['ORG', 'PROJECT', 'OPENAI_API_KEY']);
    // A key of the same name in another group is not one to go after.
    const two = '# Prod\nHOST=a\n\n# Staging\nHOST=b\n';
    expect(addKey(two, { line: 3, name: 'Staging' }, 'PORT', '1', { line: 1, key: 'HOST' }).text).toBe('# Prod\nHOST=a\n\n# Staging\nHOST=b\nPORT=1\n');
  });

  it('changes and removes a key by its line, checked by its name', () => {
    const changed = updateKey(FILE, { line: 2, key: 'DB_PORT' }, 'DB_PORT', '6543');
    expect(changed.split('\n')[2]).toBe('DB_PORT=6543');
    expect(updateKey('export A=1\n', { line: 0, key: 'A' }, 'B', '2')).toBe('export B=2\n');
    // A line that holds another key now: the key is looked for.
    expect(removeKey(`NEW=1\n${FILE}`, { line: 2, key: 'DB_PORT' })).not.toContain('DB_PORT');
    expect(removeKey(FILE, { line: 2, key: 'MISSING' })).toBe(FILE);
  });

  it('adds, renames and removes groups, with the blank lines between them', () => {
    expect(addGroup(FILE, 'Stripe')).toBe(`${FILE}\n# Stripe\n`);
    expect(addGroup('', 'Stripe')).toBe('# Stripe\n');
    expect(renameGroup(FILE, { line: 5, name: 'OpenAI' }, 'OpenAI (prod)').split('\n')[5]).toBe('# OpenAI (prod)');
    expect(renameGroup('A=1\n', { line: -1, name: null }, 'Top')).toBe('# Top\nA=1\n');
    expect(removeGroup(FILE, { line: 0, name: 'Production DB' })).toBe('# OpenAI\n# rotated in May\nOPENAI_API_KEY=sk-proj-4f9a\n');
    expect(removeGroup(FILE, { line: 5, name: 'OpenAI' })).toBe('# Production DB\nDB_HOST=db.prod.example.com\nDB_PORT=5432\nDB_PASSWORD="c4mp f1re"\n');
  });

  it('copies a group as it is written', () => {
    expect(groupText(FILE, { line: 5, name: 'OpenAI' })).toBe('# OpenAI\n# rotated in May\nOPENAI_API_KEY=sk-proj-4f9a\n');
  });

  it('keeps Windows line ends', () => {
    const text = '# A\r\nK=1\r\n';
    expect(addKey(text, { line: 0, name: 'A' }, 'L', '2').text).toBe('# A\r\nK=1\r\nL=2\r\n');
  });

  it('writes values in quotes only when they need them', () => {
    expect(writeValue('plain#value')).toBe('plain#value');
    expect(writeValue('has space')).toBe("'has space'");
    expect(writeValue(' padded')).toBe("' padded'");
    expect(writeValue('a #b')).toBe("'a #b'");
    expect(writeValue("it's #1")).toBe('"it\'s #1"');
    expect(writeValue('two\nlines')).toBe('"two\\nlines"');
    for (const value of [' padded', 'a #b', "it's #1", 'two\nlines', 'back\\slash "q" #x']) {
      expect(parseKeys(`K=${writeValue(value)}`)[0]!.keys[0]!.value).toBe(value);
    }
    expect(cleanKey(' db host=x ')).toBe('db_hostx');
  });

  it('knows a secret by its name or by a password in an address', () => {
    expect(isSecret({ key: 'DB_PASSWORD', value: 'x' })).toBe(true);
    expect(isSecret({ key: 'OPENAI_API_KEY', value: 'x' })).toBe(true);
    expect(isSecret({ key: 'GITHUB_TOKEN', value: 'x' })).toBe(true);
    expect(isSecret({ key: 'DB_HOST', value: 'db.example.com' })).toBe(false);
    expect(isSecret({ key: 'DATABASE_URL', value: 'postgres://app:s3cret@db:5432/main' })).toBe(true);
    expect(isSecret({ key: 'SITE_URL', value: 'https://example.com/a:b@c' })).toBe(false);
  });
});
