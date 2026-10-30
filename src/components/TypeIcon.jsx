import { memo } from 'react';

/*
 * Category icon: a tinted tile with a vector glyph, used wherever an expense
 * type is shown (tables, day panel, category list, picker, form, details).
 * Replaces the emoji icons, which render differently on every OS.
 */
const TYPE_ICON = {
  'Pooja':         { icon: 'i-t-pooja',   tone: 'amber' },
  'Food':          { icon: 'i-t-food',    tone: 'orange' },
  'Plan Trip':     { icon: 'i-t-plane',   tone: 'sky' },
  'Regional Trip': { icon: 'i-car',       tone: 'blue' },
  'Accommodation': { icon: 'i-t-hotel',   tone: 'violet' },
  'Inauguration':  { icon: 'i-t-event',   tone: 'rose' },
  'Couriers':      { icon: 'i-t-package', tone: 'teal' },
  'Gifts':         { icon: 'i-gift',      tone: 'pink' },
  'Miscellaneous': { icon: 'i-t-misc',    tone: 'slate' },
};

export const typeIconId = (type) => TYPE_ICON[type]?.icon || 'i-receipt';

function TypeIcon({ type, size = 'md', className = '' }) {
  const t = TYPE_ICON[type] || { icon: 'i-receipt', tone: 'slate' };
  return (
    <span className={`type-glyph type-glyph-${size} ${className}`} data-tone={t.tone} aria-hidden="true">
      <svg className="icon"><use href={`#${t.icon}`} /></svg>
    </span>
  );
}

export default memo(TypeIcon);