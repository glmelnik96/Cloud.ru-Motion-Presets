// The lines of a refusal, a warning or a problem: the Russian text, and the code beside it for whoever is sent the
// diagnostics (spec 8.2).
import type { IssueText } from './issues';

export function IssueList({ lines }: { lines: IssueText[] }) {
  if (lines.length === 0) return null;
  return (
    <ul class="issues">
      {lines.map((line, i) => (
        <li key={line.code + i} class={'issue ' + line.level}>
          <span class="issue-text">{line.text}</span> <code class="code">{line.code}</code>
          {line.detail ? <div class="detail">{line.detail}</div> : null}
        </li>
      ))}
    </ul>
  );
}
