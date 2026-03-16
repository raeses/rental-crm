-- Ensure all user-facing text is stored in UTF-8 to avoid mojibake in PDF/JSON.
ALTER TABLE projects CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE estimates CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE estimate_items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
