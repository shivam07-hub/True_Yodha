-- A CV is taken in whatever form the person keeps it (2026-11-22): PDF, Word,
-- PowerPoint, plain text, a phone photo or a screenshot. The upload reads the
-- bytes, not the name (`cv_parser.read_cv_file`); this list is the storage-side
-- gate the browser's resumable upload meets first, so it has to say the same.
--
-- Additive. Reverse: set the array back to the first two entries.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'cv-uploads';
