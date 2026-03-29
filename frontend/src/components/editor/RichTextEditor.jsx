import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useImperativeHandle, forwardRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import BubbleToolbar from './BubbleToolbar';
import { SlashCommandExtension, createSlashSuggestion } from './SlashCommandMenu';
import { prepareContent } from './editorUtils';
import './editor-styles.css';

const RichTextEditor = forwardRef(function RichTextEditor(
  { content, onUpdate, placeholder = 'Start writing...' },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      SlashCommandExtension.configure({
        suggestion: createSlashSuggestion(),
      }),
    ],
    content: prepareContent(content),
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
    },
  });

  // Expose editor instance to parent
  useImperativeHandle(ref, () => ({
    getEditor: () => editor,
    setContent: (newContent) => {
      if (editor && !editor.isDestroyed) {
        const prepared = prepareContent(newContent);
        // Only update if content actually changed (avoid cursor jump)
        if (editor.getHTML() !== prepared) {
          editor.commands.setContent(prepared, false);
        }
      }
    },
    getHTML: () => editor?.getHTML() || '',
  }), [editor]);

  // Update content when prop changes from external source (initial load)
  useEffect(() => {
    if (editor && content !== undefined && !editor.isFocused) {
      const prepared = prepareContent(content);
      if (editor.getHTML() !== prepared) {
        editor.commands.setContent(prepared, false);
      }
    }
  }, [content]);

  if (!editor) return null;

  return (
    <div className="rich-editor-wrapper">
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="rich-editor-hint">
        Type <kbd>/</kbd> for commands
      </div>
    </div>
  );
});

export default RichTextEditor;
