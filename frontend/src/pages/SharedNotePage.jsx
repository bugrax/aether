import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

function renderMarkdown(md) {
  const lines = md.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const cells = lines[i].trim().split('|').filter(c => c.trim() !== '');
        if (!cells.every(c => /^[\s-:]+$/.test(c))) {
          rows.push(cells.map(c => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        html.push('<div style="overflow-x:auto;margin:1rem 0"><table style="width:100%;border-collapse:collapse;font-size:0.8rem">');
        html.push('<tr>' + header.map(c => `<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #494847;color:#b79fff;font-family:Space Grotesk">${inline(c)}</th>`).join('') + '</tr>');
        body.forEach(row => {
          html.push('<tr>' + row.map(c => `<td style="padding:8px 12px;border-bottom:1px solid #2c2c2c;color:#adaaaa">${inline(c)}</td>`).join('') + '</tr>');
        });
        html.push('</table></div>');
      }
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      html.push(`<h4 style="font-family:Space Grotesk;font-size:1rem;font-weight:600;margin:1.5rem 0 0.4rem;color:#fff">${inline(trimmed.slice(4))}</h4>`);
      i++; continue;
    }
    if (trimmed.startsWith('## ')) {
      html.push(`<h3 style="font-family:Space Grotesk;font-size:1.1rem;font-weight:700;margin:1.8rem 0 0.5rem;color:#fff">${inline(trimmed.slice(3))}</h3>`);
      i++; continue;
    }
    if (trimmed.startsWith('# ')) {
      html.push(`<h2 style="font-family:Space Grotesk;font-size:1.4rem;font-weight:700;margin:0 0 0.75rem;color:#fff">${inline(trimmed.slice(2))}</h2>`);
      i++; continue;
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***') {
      html.push('<hr style="border:none;border-top:1px solid #494847;margin:1.5rem 0"/>');
      i++; continue;
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      html.push('<ul style="margin:0.5rem 0;padding-left:1.2rem">');
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        html.push(`<li style="margin:0.3rem 0;color:#e0e0e0">${inline(lines[i].trim().slice(2))}</li>`);
        i++;
      }
      html.push('</ul>');
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      html.push('<ol style="margin:0.5rem 0;padding-left:1.2rem">');
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        html.push(`<li style="margin:0.3rem 0;color:#e0e0e0">${inline(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      html.push('</ol>');
      continue;
    }

    // Paragraph
    html.push(`<p style="margin:0.5rem 0;color:#e0e0e0">${inline(trimmed)}</p>`);
    i++;
  }

  return html.join('\n');
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#262626;padding:1px 5px;border-radius:3px;font-size:0.85em">$1</code>');
}

export default function SharedNotePage() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/shared/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(data => {
        setNote(data);
        // Set browser tab title
        document.title = data.title ? `${data.title} — Aether` : 'Shared — Aether';
      })
      .catch(() => setError('This shared note does not exist or has been removed.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0e0e0e' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0e0e0e', color: '#fff', gap: '1rem' }}>
        <span style={{ fontSize: '3rem' }}>🔒</span>
        <p style={{ color: '#adaaaa' }}>{error}</p>
        <a href="https://aether.relayhaus.org" style={{ color: '#b79fff', textDecoration: 'none' }}>← Aether</a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', color: '#fff', fontFamily: "'Manrope', sans-serif" }}>
      <header style={{ borderBottom: '1px solid #494847', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://aether.relayhaus.org" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.1rem', color: '#b79fff', textDecoration: 'none' }}>
          Aether
        </a>
        <span style={{ fontSize: '0.75rem', color: '#777575', fontFamily: "'Space Grotesk', sans-serif" }}>Shared Insight</span>
      </header>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {note.thumbnail_url && !note.thumbnail_url.startsWith('data:') && (
          <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <img src={note.thumbnail_url} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        )}

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', lineHeight: 1.3 }}>
          {note.title}
        </h1>

        {note.labels && note.labels.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {note.labels.map(label => (
              <span key={label.id} style={{
                fontSize: '0.7rem', fontFamily: "'Space Grotesk', sans-serif",
                padding: '2px 10px', borderRadius: '4px',
                borderLeft: `3px solid ${label.color || '#8B5CF6'}`,
                background: '#1a1919', color: '#adaaaa',
              }}>
                {label.name}
              </span>
            ))}
          </div>
        )}

        {note.source_url && (
          <a href={note.source_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '0.8rem', color: '#62fae3', textDecoration: 'none', marginBottom: '1.5rem',
          }}>
            🔗 {(() => { try { return new URL(note.source_url).hostname.replace('www.', ''); } catch { return 'Source'; } })()}
          </a>
        )}

        {note.ai_insight && (
          <div style={{ background: '#131313', borderRadius: '12px', border: '1px solid #494847', padding: '1.5rem 2rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid #2c2c2c' }}>
              <span>✨</span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.9rem' }}>AI Insight</span>
            </div>
            <div
              style={{ fontSize: '0.875rem', lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(note.ai_insight) }}
            />
          </div>
        )}

        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #494847', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: '#777575' }}>
            Shared via <a href="https://aether.relayhaus.org" style={{ color: '#b79fff', textDecoration: 'none' }}>Aether</a> — Where links become knowledge
          </p>
        </div>
      </main>
    </div>
  );
}
