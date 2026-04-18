-- Rich attachments: users can attach Twenty CRM records (companies, people,
-- opportunities, tasks, notes) and arbitrary links/files to a message. Stored
-- as JSONB for forward-compat.
--
-- Shape: [{ "type": "twenty_record", "objectName": "company", "id": "uuid",
--           "label": "Acme Corp", "subtitle": "acme.com", "url": "/object/company/uuid" },
--        { "type": "link",          "url": "...", "label": "..." }]
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Loosen body NOT NULL so attachment-only messages are allowed. Keep the
-- column but default it to empty string for old clients.
ALTER TABLE messages ALTER COLUMN body SET DEFAULT '';

-- Make sure at least one of (body, attachments, image_url) is present.
-- Drop-if-exists so re-runs work; then re-add.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_has_content_check;
ALTER TABLE messages ADD CONSTRAINT messages_has_content_check CHECK (
  length(trim(body)) > 0
  OR image_url IS NOT NULL
  OR jsonb_array_length(attachments) > 0
);
