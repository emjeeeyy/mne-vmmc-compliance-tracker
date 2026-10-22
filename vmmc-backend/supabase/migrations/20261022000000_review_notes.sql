-- The reviewer's own findings, recorded when a document is approved (the Document Verification
-- screen's "Radiology / Lab Finding Notes"). Separate from `notes` (written by the staff member who
-- uploaded the document) and from `rejection_reason` (shown to staff when a re-upload is requested).
alter table documents add column review_notes text;
