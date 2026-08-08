import type { ReactNode } from 'react'

export default function Modal({
  title,
  onClose,
  children,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={wide ? 'modal-box modal-box-wide' : 'modal-box'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
