ALTER TABLE traveler ADD COLUMN username VARCHAR(32);
ALTER TABLE traveler ADD COLUMN display_name VARCHAR(30);
ALTER TABLE traveler ADD COLUMN password_hash VARCHAR(100);
ALTER TABLE traveler ADD COLUMN recovery_code_hash VARCHAR(64);
ALTER TABLE traveler ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE traveler ADD COLUMN locked_until TIMESTAMPTZ;
CREATE UNIQUE INDEX traveler_username_unique ON traveler(lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX traveler_recovery_unique ON traveler(recovery_code_hash) WHERE recovery_code_hash IS NOT NULL;
