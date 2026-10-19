-- One row per signed-in device, so signing in on a phone no longer signs the PC out.
CREATE TABLE traveler_session (
  token_hash VARCHAR(64) PRIMARY KEY,
  traveler_id UUID NOT NULL REFERENCES traveler(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX traveler_session_traveler ON traveler_session(traveler_id);

-- The age of a migrated token is unknown, so it gets a full 30 days; its browser cookie expires no later than that.
-- Anonymous rows from before accounts were required move too, so registering from them still keeps their records.
INSERT INTO traveler_session(token_hash, traveler_id, expires_at)
SELECT access_token_hash, id, now() + interval '30 days' FROM traveler WHERE access_token_hash IS NOT NULL;

-- The old column is retired but kept nullable so the previous backend image still starts after a rollback.
-- It is emptied, otherwise a rollback would revive tokens that were signed out or revoked by a password reset.
ALTER TABLE traveler ALTER COLUMN access_token_hash DROP NOT NULL;
UPDATE traveler SET access_token_hash = NULL;
