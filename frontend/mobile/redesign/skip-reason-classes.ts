/* The phone's dressing for the shared skip-reason chips.

   The chips themselves are one component (`components/jobs/skip-reasons`) so the
   question, the taxonomy and what happens on tap cannot drift between surfaces.
   Only the clothes differ: the desktop pair sit on the inverted undo toast, and
   these sit on the phone's raised snackbar. */
export const MOBILE_REASON_CLASSES = {
  rowClassName: "mm-reason-row",
  chipClassName: "mm-reason-chip",
  notedClassName: "mm-reason-noted",
} as const
