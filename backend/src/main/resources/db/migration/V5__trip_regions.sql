CREATE TABLE trip_region (
  trip_id UUID NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  region_id VARCHAR(5) NOT NULL REFERENCES region(id),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  PRIMARY KEY (trip_id, region_id),
  UNIQUE (trip_id, position)
);

INSERT INTO trip_region(trip_id, region_id, position)
SELECT id, region_id, 0 FROM trip;

CREATE INDEX trip_region_region_trip ON trip_region(region_id, trip_id);
