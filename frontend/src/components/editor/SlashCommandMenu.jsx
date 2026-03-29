import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import tippy from 'tippy.js';
import { SLASH_COMMANDS, filterCommands } from './slashCommands';

// ── Icon helper ─────────────────────────────────────
function CommandIcon({ type }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

  switch (type) {
    case 'h1':
      return <span className="slash-cmd-icon-text">H1</span>;
    case 'h2':
      return <span className="slash-cmd-icon-text">H2</span>;
    case 'h3':
      return <span className="slash-cmd-icon-text">H3</span>;
    case 'list':
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case 'ordered-list':
      return (
        <svg {...common}>
          <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="9" fontSize="9" fill="currentColor" fontFamily="sans-serif" fontWeight="700" stroke="none">1</text>
          <text x="2" y="15" fontSize="9" fill="currentColor" fontFamily="sans-serif" fontWeight="700" stroke="none">2</text>
          <text x="2" y="21" fontSize="9" fill="currentColor" fontFamily="sans-serif" fontWeight="700" stroke="none">3</text>
        </svg>
      );
    case 'quote':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case 'divider':
      return (
        <svg {...common}>
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    default:
      return null;
  }
}

// ── Command List Component ──────────────────────────
function CommandList({ items, command }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef(null);

  // Reset index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
  useLayoutEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const upHandler = useCallback(() => {
    setSelectedIndex((i) => (i + items.length - 1) % items.length);
  }, [items.length]);

  const downHandler = useCallback(() => {
    setSelectedIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  const enterHandler = useCallback(() => {
    const item = items[selectedIndex];
    if (item) command(item);
  }, [items, selectedIndex, command]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowUp') { upHandler(); e.preventDefault(); return true; }
      if (e.key === 'ArrowDown') { downHandler(); e.preventDefault(); return true; }
      if (e.key === 'Enter') { enterHandler(); e.preventDefault(); return true; }
      return false;
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [upHandler, downHandler, enterHandler]);

  if (items.length === 0) {
    return (
      <div className="slash-cmd-menu">
        <div className="slash-cmd-empty">No results</div>
      </div>
    );
  }

  return (
    <div className="slash-cmd-menu" ref={listRef}>
      {items.map((item, i) => (
        <button
          key={item.title}
          className={`slash-cmd-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <div className="slash-cmd-icon">
            <CommandIcon type={item.icon} />
          </div>
          <div className="slash-cmd-text">
            <span className="slash-cmd-title">{item.title}</span>
            <span className="slash-cmd-desc">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Tiptap Extension ────────────────────────────────
export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// ── Suggestion config (to pass to the extension) ────
export function createSlashSuggestion() {
  return {
    char: '/',
    items: ({ query }) => filterCommands(query),
    render: () => {
      let component;
      let popup;

      return {
        onStart: (props) => {
          component = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            animation: false,
            offset: [0, 4],
          });
        },

        onUpdate(props) {
          component?.updateProps(props);

          if (!props.clientRect) return;

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          // Let CommandList handle arrow keys and Enter
          return false;
        },

        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}
