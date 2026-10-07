export const sampleDoc = `# Sync engine: open questions

Delta API returns a **cursor** per drive. Store it in \`sync-state.json\`, *never* in the vault.

## Decisions

- Notes conflict: 3-way merge, fall back to a copy
- Tasks merge per record, last write wins per field
- Deletes go to trash first
- ~~Poll every 5 s~~ use the delta link

Token refresh for SPAs is covered in the [MSAL browser docs](https://learn.microsoft.com/entra/identity-platform/msal-overview).

![Whiteboard sketch](/whiteboard.svg)

> If the merge fails we keep both versions. Losing text is never acceptable.

| Provider     | Change feed | Refresh token in browser |
| ------------ | ----------- | ------------------------ |
| OneDrive     | delta       | yes                      |
| Google Drive | changes     | no                       |

\`\`\`ts
async function pull(cursor: string): Promise<Change[]> {
  const res = await graph.get(\`/me/drive/root/delta?token=\${cursor}\`);
  return res.value.map(toChange); // 200 items per page
}
\`\`\`

---

Try it: select some text and use the format bar above the note. Paste or drop an image anywhere. Click an image to select it.
`;
