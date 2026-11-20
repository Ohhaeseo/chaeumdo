-- An optional email address, so an account whose recovery code is lost can still reset its password.
-- Several accounts may share one address; a recovery mail then lists each of them.
ALTER TABLE traveler ADD COLUMN email VARCHAR(254);
CREATE INDEX traveler_email ON traveler(lower(email)) WHERE email IS NOT NULL;

-- When and to which version of the terms and privacy policy the account agreed at sign-up.
-- Accounts from before the terms existed have neither.
ALTER TABLE traveler ADD COLUMN terms_agreed_at TIMESTAMPTZ;
ALTER TABLE traveler ADD COLUMN terms_version VARCHAR(40);

-- One-time password reset links sent by email. Only the SHA-256 hash of the token is stored.
CREATE TABLE password_reset (
  token_hash VARCHAR(64) PRIMARY KEY,
  traveler_id UUID NOT NULL REFERENCES traveler(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_traveler ON password_reset(traveler_id, created_at DESC);
