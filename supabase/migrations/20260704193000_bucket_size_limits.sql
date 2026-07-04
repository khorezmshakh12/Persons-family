-- Enforce file size/type limits at the storage bucket level. This is now the
-- authoritative check: uploads go directly from the browser to Storage via a
-- signed upload URL, bypassing our Next.js server (and therefore Vercel's
-- serverless function body-size limit) entirely, so app-level validation
-- alone is no longer sufficient.
update storage.buckets
set
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'avatars';

update storage.buckets
set
  file_size_limit = 45 * 1024 * 1024,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
where id = 'lesson-files';
