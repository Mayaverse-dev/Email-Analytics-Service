-- Add email content columns to analytics_broadcasts
ALTER TABLE analytics_broadcasts ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE analytics_broadcasts ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE analytics_broadcasts ADD COLUMN IF NOT EXISTS preview_text TEXT;
ALTER TABLE analytics_broadcasts ADD COLUMN IF NOT EXISTS reply_to TEXT;
