-- Store the served path of the OGP image saved locally (for example
-- "/ogp/<uuid>.png"). Fetching an og:image is best-effort, so an empty string
-- means the page had no og:image or the download failed.
-- Rows saved before this column existed (and the seed data) have no image, so
-- the empty-string default is correct for them: the list screen simply shows no
-- thumbnail.
ALTER TABLE bookmarks ADD COLUMN ogp_image_url TEXT NOT NULL DEFAULT '';
