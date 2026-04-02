import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { chatAPI } from '../api';

function renderMarkdown(text) {
  if (!text) return '';
  // Escape HTML first
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Note links: [Title](aether://note/ID) → clickable
  html = html.replace(/\[([^\]]+)\]\(aether:\/\/note\/([a-f0-9-]+)\)/g,
    '<a class="aether-note-link" data-note-id="$2" href="#">$1</a>');
  // Standard markdown links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Bold, italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // List items
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
  // Newlines
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function AetherChat({ user, onClose, panelRef, expanded, setExpanded }) {
  const navigate = useNavigate();
  const { t, lang, aiLang } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [showChips, setShowChips] = useState(true);
  const sessionIdRef = useRef(crypto.randomUUID());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const chatLang = aiLang || lang || 'en';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText]);

  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming) return;

    const userMsg = { id: Date.now(), role: 'user', content: text.trim(), feedback: 0 };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowChips(false);
    setIsStreaming(true);
    setStreamText('');

    let fullText = '';
    let assistantId = null;

    await chatAPI.send(
      text.trim(),
      sessionIdRef.current,
      chatLang,
      (token) => {
        fullText += token;
        setStreamText(fullText);
      },
      (id) => {
        assistantId = id;
      },
      (error) => {
        console.error('Chat error:', error);
        fullText = t('chat_error');
      }
    );

    setIsStreaming(false);
    setStreamText('');
    setMessages(prev => [
      ...prev,
      { id: assistantId || Date.now() + 1, role: 'assistant', content: fullText, feedback: 0 }
    ]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleChip = (text) => {
    sendMessage(text);
  };

  const handleFeedback = async (msgId, value) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, feedback: m.feedback === value ? 0 : value } : m
    ));
    try {
      await chatAPI.feedback(msgId, value);
    } catch {}
  };

  const handleInputFocus = () => {
    setExpanded(true);
    const panel = panelRef.current;
    if (panel) {
      panel.style.height = '92vh';
      panel.style.transition = 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  };

  return (
    <>
      <div className="aether-chat-header">
        <div className="aether-chat-brand">
          <span className="aether-chat-logo">A</span>
          <span className="aether-chat-version">Aether AI</span>
        </div>
        <button className="aether-chat-history-btn" onClick={() => {}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            <polyline points="12 7 12 12 16 14" />
          </svg>
        </button>
      </div>

      <div className="aether-chat-messages" onClick={(e) => {
        const link = e.target.closest('.aether-note-link');
        if (link) {
          e.preventDefault();
          const noteId = link.dataset.noteId;
          if (noteId) {
            onClose();
            navigate(`/vault/${noteId}`);
          }
        }
      }}>
        {messages.length === 0 && !isStreaming && (
          <div className="aether-chat-bubble">
            <p>{lang === 'tr'
              ? `Merhaba ${user?.displayName?.split(' ')[0] || ''}, kasandaki i\u00e7erikleri ke\u015ffetmene yard\u0131mc\u0131 olabilirim. Ne sormak istersin?`
              : `Hey ${user?.displayName?.split(' ')[0] || 'there'}, I can help you explore your vault. What would you like to know?`
            }</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`aether-chat-msg ${msg.role}`}>
            <div className={`aether-chat-bubble ${msg.role}`}>
              {msg.role === 'assistant'
                ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                : <p>{msg.content}</p>
              }
            </div>
            {msg.role === 'assistant' && (
              <div className="aether-chat-feedback">
                <button
                  className={`aether-feedback-btn ${msg.feedback === 1 ? 'active' : ''}`}
                  onClick={() => handleFeedback(msg.id, 1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                </button>
                <button
                  className={`aether-feedback-btn ${msg.feedback === -1 ? 'active' : ''}`}
                  onClick={() => handleFeedback(msg.id, -1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="aether-chat-msg assistant">
            <div className="aether-chat-bubble assistant streaming">
              {streamText ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }} /> : (
                <div className="aether-typing-dots">
                  <span /><span /><span />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showChips && messages.length === 0 && (
        <div className="aether-chat-suggestions">
          <button className="aether-suggestion-chip" onClick={() => handleChip(t('chat_chip_summarize'))}>
            {t('chat_chip_summarize')}
          </button>
          <button className="aether-suggestion-chip" onClick={() => handleChip(t('chat_chip_connections'))}>
            {t('chat_chip_connections')}
          </button>
          <button className="aether-suggestion-chip" onClick={() => handleChip(t('chat_chip_recent'))}>
            {t('chat_chip_recent')}
          </button>
        </div>
      )}

      <form className="aether-chat-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="aether-chat-input"
          placeholder={t('chat_placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={handleInputFocus}
          disabled={isStreaming}
        />
        <button type="submit" className="aether-chat-send-btn" disabled={!input.trim() || isStreaming}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </>
  );
}
