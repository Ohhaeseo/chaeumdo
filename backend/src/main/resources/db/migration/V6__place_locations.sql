ALTER TABLE trip_place ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE trip_place ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE trip_place ADD COLUMN place_address VARCHAR(500);
ALTER TABLE trip_place ADD COLUMN place_source VARCHAR(30);
ALTER TABLE trip_place ADD COLUMN place_source_id VARCHAR(120);

ALTER TABLE trip_place ADD CONSTRAINT trip_place_coordinates_complete CHECK (
  (latitude IS NULL AND longitude IS NULL AND place_source IS NULL AND place_source_id IS NULL)
  OR
  (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND place_source = 'OpenStreetMap' AND length(trim(place_source_id)) > 0)
);
