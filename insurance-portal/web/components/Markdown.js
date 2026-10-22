/** Minimal, safe Markdown for help articles: headings, lists, bold, paragraphs. No HTML is rendered. */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

export default function Markdown({ text }) {
  const blocks = String(text || '').split(/\n{2,}/);
  return (
    <div className="stack-sm">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (/^#{1,3} /.test(b)) {
          const level = b.match(/^#+/)[0].length;
          const H = level === 1 ? 'h2' : 'h3';
          const [head, ...rest] = lines;
          return <div key={i} className="stack-sm"><H>{head.replace(/^#+ /, '')}</H>{rest.length ? <Markdown text={rest.join('\n')} /> : null}</div>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i} style={{ margin: 0, paddingInlineStart: 22 }}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>;
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i} style={{ margin: 0, paddingInlineStart: 22 }}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        return <p key={i}>{inline(b.replace(/\n/g, ' '))}</p>;
      })}
    </div>
  );
}
