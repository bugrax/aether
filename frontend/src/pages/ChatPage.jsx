import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { chatAPI, notesAPI } from '../api';
import { trackChatMessage, trackChatChipClick, trackAetherChatOpen, trackAetherChatHistory, trackNoteOpen, trackScreenView } from '../analytics';

function generateId() {
  try { return crypto.randomUUID(); } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\[([^\]]+)\]\(aether:\/\/note\/([a-f0-9-]+)\)/g,
    '<a class="aether-note-link" data-note-id="$2" href="#" style="color:#b79fff;text-decoration:underline">$1</a>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" style="color:#b79fff;text-decoration:underline">$1</a>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function groupByDate(sessions, lang) {
  const groups = {};
  for (const s of sessions) {
    const d = new Date(s.created_at);
    const key = d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
      weekday: 'short', month: 'long', day: 'numeric'
    }).toUpperCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return groups;
}

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, lang, aiLang } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [showChips, setShowChips] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const sessionIdRef = useRef(generateId());
  const messagesEndRef = useRef(null);
  const chatLang = aiLang || lang || 'en';

  useEffect(() => { trackScreenView('Chat'); trackAetherChatOpen(); }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, streamText]);

  const openHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    trackAetherChatHistory();
    try {
      const data = await chatAPI.sessions();
      setSessions(data.sessions || []);
    } catch {} finally { setLoadingHistory(false); }
  };

  const loadSession = async (sessionId) => {
    try {
      const data = await chatAPI.sessionMessages(sessionId);
      setMessages((data.messages || []).map(m => ({ id: m.id, role: m.role, content: m.content, feedback: m.feedback || 0 })));
      sessionIdRef.current = sessionId;
      setShowChips(false);
      setShowHistory(false);
    } catch {}
  };

  const startNewChat = () => {
    sessionIdRef.current = generateId();
    setMessages([]);
    setShowChips(true);
    setShowHistory(false);
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming) return;
    trackChatMessage(sessionIdRef.current);
    const userMsg = { id: Date.now(), role: 'user', content: text.trim(), feedback: 0 };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowChips(false);
    setIsStreaming(true);
    setStreamText('');

    let fullText = '';
    let assistantId = null;
    let hasError = false;

    try {
      await chatAPI.send(text.trim(), sessionIdRef.current, chatLang,
        (token) => { fullText += token; setStreamText(fullText); },
        (id) => { assistantId = id; },
        (error) => { hasError = true; fullText = fullText || t('chat_error'); }
      );
    } catch { hasError = true; fullText = t('chat_error'); }

    setIsStreaming(false);
    setStreamText('');
    if (fullText.trim()) {
      setMessages(prev => [...prev, { id: assistantId || Date.now() + 1, role: 'assistant', content: fullText, feedback: 0 }]);
    }
  };

  const handleSaveToVault = async (msg) => {
    try {
      const title = msg.content.split('\n')[0].replace(/[#*_\-|>]+/g, '').trim().substring(0, 100) || 'Chat Insight';
      await notesAPI.create({ title, content: msg.content, source_url: '' });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, saved: true } : m));
    } catch {}
  };

  const handleFeedback = async (msgId, value) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: m.feedback === value ? 0 : value } : m));
    try { await chatAPI.feedback(msgId, value); } catch {}
  };

  // History view
  if (showHistory) {
    const grouped = groupByDate(sessions, lang);
    return (
      <div className="main-content" style={{ gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <button className="editor-back" onClick={() => setShowHistory(false)} style={{ margin: 0 }}>
            ← {lang === 'tr' ? 'Geri' : 'Back'}
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600 }}>
            {lang === 'tr' ? 'Konuşma Geçmişi' : 'Conversation History'}
          </span>
          <button onClick={startNewChat} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '1.2rem' }}>+</button>
        </div>
        {loadingHistory ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="loading-spinner" /></div>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--outline)', textAlign: 'center', padding: '2rem' }}>{lang === 'tr' ? 'Henüz konuşma yok' : 'No conversations yet'}</p>
        ) : Object.entries(grouped).map(([date, items]) => (
          <div key={date} style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--outline)', borderBottom: '1px solid var(--outline-variant)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>{date}</div>
            {items.map(s => (
              <button key={s.session_id} onClick={() => loadSession(s.session_id)}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-3)', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-md)', color: 'var(--on-surface)', fontSize: '0.8125rem', cursor: 'pointer', textAlign: 'left', marginBottom: 'var(--space-2)' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', color: 'var(--primary)', flexShrink: 0 }}>A</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Chat view
  return (
    <div className="chat-page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--tertiary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>A</span>
          <span style={{ fontFamily: 'var(--font-label)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--on-surface-variant)' }}>Aether AI</span>
        </div>
        <button onClick={openHistory} style={{ background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /><polyline points="12 7 12 12 16 14" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
        onClick={(e) => {
          const link = e.target.closest('.aether-note-link');
          if (link) { e.preventDefault(); const noteId = link.dataset.noteId; if (noteId) { trackNoteOpen(noteId, 'chat'); navigate(`/vault/${noteId}`); } }
        }}>

        {messages.length === 0 && !isStreaming && (
          <div style={{ background: 'linear-gradient(135deg, rgba(183,159,255,0.06), rgba(144,147,255,0.03))', border: '1px solid rgba(183,159,255,0.1)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', maxWidth: '90%', fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--on-surface)' }}>
            {lang === 'tr' ? `Merhaba ${user?.displayName?.split(' ')[0] || ''}, kasandaki içerikleri keşfetmene yardımcı olabilirim.` : `Hey ${user?.displayName?.split(' ')[0] || 'there'}, I can help you explore your vault.`}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 'var(--space-3)', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: msg.role === 'user' ? '80%' : '90%',
              padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55,
              background: msg.role === 'user' ? 'var(--primary-container)' : 'linear-gradient(135deg, rgba(183,159,255,0.06), rgba(144,147,255,0.03))',
              border: msg.role === 'user' ? 'none' : '1px solid rgba(183,159,255,0.1)',
              color: msg.role === 'user' ? '#000' : 'var(--on-surface)',
            }}>
              {msg.role === 'assistant' ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} /> : <p style={{ margin: 0 }}>{msg.content}</p>}
            </div>
          </div>
        ))}

        {messages.map(msg => msg.role === 'assistant' && (
          <div key={`fb-${msg.id}`} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <button onClick={() => handleFeedback(msg.id, 1)} style={{ background: 'none', border: 'none', color: msg.feedback === 1 ? 'var(--primary)' : 'var(--outline)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}>👍</button>
            <button onClick={() => handleFeedback(msg.id, -1)} style={{ background: 'none', border: 'none', color: msg.feedback === -1 ? 'var(--error)' : 'var(--outline)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}>👎</button>
            <button onClick={() => !msg.saved && handleSaveToVault(msg)} disabled={msg.saved} style={{ background: 'none', border: 'none', color: msg.saved ? 'var(--secondary)' : 'var(--outline)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}>{msg.saved ? '💾✓' : '💾'}</button>
          </div>
        )).filter(Boolean)}

        {isStreaming && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ maxWidth: '90%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55, background: 'linear-gradient(135deg, rgba(183,159,255,0.06), rgba(144,147,255,0.03))', border: '1px solid var(--primary)', color: 'var(--on-surface)' }}>
              {streamText ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }} /> : <span style={{ color: 'var(--outline)' }}>...</span>}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chips */}
      {showChips && messages.length === 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: '0 var(--space-5)', flexShrink: 0, overflowX: 'auto' }}>
          {[t('chat_chip_summarize'), t('chat_chip_connections'), t('chat_chip_recent')].map(chip => (
            <button key={chip} onClick={() => { trackChatChipClick(chip); sendMessage(chip); }}
              style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 'var(--radius-full)', background: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', fontSize: '0.8125rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input — pinned to bottom */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-5)', borderTop: '1px solid var(--outline-variant)', flexShrink: 0, background: 'var(--surface)' }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)} disabled={isStreaming}
          placeholder={t('chat_placeholder')}
          style={{ flex: 1, background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-full)', padding: '12px 16px', color: 'var(--on-surface)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font-body)' }} />
        <button type="submit" disabled={!input.trim() || isStreaming}
          style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || isStreaming ? 0.3 : 1, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </form>
    </div>
  );
}
