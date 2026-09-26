import Modal from "@/ui/Modal.jsx";
import Button from "@/ui/Button.jsx";

// "Are you sure?" for a destructive or hard-to-undo action. The caller owns
// the mutation: it passes `loading` while it runs and `error` if it failed,
// and closes the dialog itself on success.
export default function ConfirmModal({ title, children, confirmLabel = "Confirm", tone = "danger", loading = false, error, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-ink-soft">{children}</div>
        {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "solid"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
