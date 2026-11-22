import { useMemo, useRef, useState } from 'react';

function getMentionQuery(text, caret) {
  const before = text.slice(0, caret);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  return {
    start: before.length - match[2].length - 1,
    query: match[2],
  };
}

export default function MentionTextarea({
  value,
  onChange,
  users = [],
  rows = 4,
  required = false,
  placeholder,
  autoFocus = false,
  onEnterSubmit,
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mention, setMention] = useState(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return users
      .filter((u) => {
        const name = (u.displayName || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const local = email.split('@')[0];
        if (!q) return true;
        return name.includes(q) || email.includes(q) || local.includes(q);
      })
      .slice(0, 8);
  }, [mention, users]);

  function updateFromEvent(e) {
    const next = e.target.value;
    const caret = e.target.selectionStart ?? next.length;
    onChange(next);
    const found = getMentionQuery(next, caret);
    setMention(found);
    setOpen(Boolean(found));
    setActive(0);
  }

  function insertUser(user) {
    if (!mention || !ref.current) return;
    const token = `@${user.email.split('@')[0]} `;
    const before = value.slice(0, mention.start);
    const after = value.slice(
      ref.current.selectionStart ?? mention.start + 1 + mention.query.length,
    );
    const next = `${before}${token}${after}`;
    onChange(next);
    setOpen(false);
    setMention(null);

    const caret = before.length + token.length;
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e) {
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertUser(suggestions[active]);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
    }

    // Enter sends (Shift+Enter = new line) when requested
    if (
      onEnterSubmit &&
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      onEnterSubmit();
    }
  }

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={updateFromEvent}
        onKeyDown={onKeyDown}
        onClick={updateFromEvent}
        onKeyUp={updateFromEvent}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="mention-suggest" role="listbox">
          {suggestions.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertUser(u);
                }}
              >
                <span className="suggest-name">{u.displayName}</span>
                <span className="suggest-email">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
