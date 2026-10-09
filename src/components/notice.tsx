import type { ReactNode } from "react";

type NoticeProps = {
  children: ReactNode;
  onDismiss: () => void;
  /** "alert" for failures; "status" (default) for confirmations. */
  tone?: "status" | "alert";
  /** Optional follow-up, such as Undo after archiving. */
  action?: { label: string; onClick: () => void };
  /** Lets a screen move focus here when the card that was acted on disappears. */
  id?: string;
  /** A brief check-mark flourish for a saved contribution. */
  celebrate?: boolean;
};

export function Notice({ children, onDismiss, tone = "status", action, id, celebrate }: NoticeProps) {
  return <div role={tone} className="notice" id={id} tabIndex={id ? -1 : undefined}>
    <span>{celebrate && <span className="celebration" aria-hidden="true">✓</span>}{children}</span>
    <div className="row">
      {action && <button className="text-button" onClick={action.onClick}>{action.label}</button>}
      <button className="text-button" onClick={onDismiss}>Dismiss</button>
    </div>
  </div>;
}
