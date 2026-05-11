import { createPortal } from 'react-dom'
import type { UseResizable } from '../../hooks/useResizable'

interface Props {
  axis: 'x' | 'y'
  /** Aria-label for screen readers, e.g. "Resize chat panel". */
  label: string
  /** The full hook return — spread its `gutterProps` onto the gutter element. */
  resizer: UseResizable
  className?: string
}

/**
 * 6 px draggable hit zone. Idle-invisible; on hover/focus shows a 1 px vermilion
 * hairline + two `··` grip dots. While dragging, renders a live readout pill
 * near the pointer via a portal to <body> so it can escape any overflow:hidden
 * ancestors.
 */
export function ResizeGutter({ axis, label, resizer, className }: Props) {
  const { gutterProps, isResizing, readout, pointer } = resizer
  const cls = axis === 'x' ? 'resize-gutter-x' : 'resize-gutter-y'

  return (
    <>
      <div
        {...gutterProps}
        aria-label={label}
        data-resizing={isResizing || undefined}
        className={className ? `${cls} ${className}` : cls}
      />
      {isResizing && pointer && readout
        ? createPortal(
            <div
              className="resize-readout"
              style={{
                // Offset slightly so the pill doesn't sit under the cursor.
                left: axis === 'x' ? pointer.x + 12 : pointer.x + 12,
                top: axis === 'x' ? pointer.y + 12 : pointer.y + 12,
              }}
            >
              {axis === 'x' ? '┃' : '▬'} {readout}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
