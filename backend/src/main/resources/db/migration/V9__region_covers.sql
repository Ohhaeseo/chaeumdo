-- A photo the traveler picked for a 시·도 on the national map. Without one the map keeps using the
-- most recent trip's cover. It is separate from trips, so a 시·도 with no trip may still carry a photo.
CREATE TABLE region_cover (
  owner_id UUID NOT NULL REFERENCES traveler(id) ON DELETE CASCADE,
  region_id VARCHAR(10) NOT NULL REFERENCES region(id),
  photo_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, region_id),
  -- Account deletion removes every photo of the traveler; the cover goes with its photo.
  FOREIGN KEY (photo_id, owner_id) REFERENCES photo(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX region_cover_photo ON region_cover(photo_id);
