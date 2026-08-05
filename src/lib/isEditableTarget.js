const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// True when a keystroke was aimed at somewhere text is being entered, so global shortcuts
// can stand aside. Checked centrally rather than having each editor stop propagation for
// whichever keys a shortcut happens to use, which silently breaks when those keys change.
export default function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;

  return EDITABLE_TAGS.has(target.tagName);
}
