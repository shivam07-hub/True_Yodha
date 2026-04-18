ALTER TABLE user_skills
  ADD COLUMN IF NOT EXISTS proficiency_title VARCHAR(30) DEFAULT 'Scout';
