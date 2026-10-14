-- A place photo belongs to the same traveler as its trip.
ALTER TABLE trip ADD CONSTRAINT trip_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE trip_place ADD COLUMN owner_id UUID;
UPDATE trip_place AS place SET owner_id = trip.owner_id FROM trip WHERE place.trip_id = trip.id;
ALTER TABLE trip_place ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE trip_place ADD COLUMN photo_id UUID;
ALTER TABLE trip_place ADD CONSTRAINT trip_place_trip_owner
  FOREIGN KEY (trip_id, owner_id) REFERENCES trip(id, owner_id) ON DELETE CASCADE;
ALTER TABLE trip_place ADD CONSTRAINT trip_place_photo_owner
  FOREIGN KEY (photo_id, owner_id) REFERENCES photo(id, owner_id);
CREATE INDEX trip_place_photo_id ON trip_place(photo_id);
