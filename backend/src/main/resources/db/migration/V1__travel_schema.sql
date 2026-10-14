CREATE TABLE traveler (
  id UUID PRIMARY KEY,
  access_token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE region (
  id VARCHAR(2) PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  map_key VARCHAR(40) NOT NULL UNIQUE,
  recommended BOOLEAN NOT NULL DEFAULT false,
  introduction TEXT NOT NULL DEFAULT ''
);
CREATE TABLE photo (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES traveler(id),
  object_key VARCHAR(300) NOT NULL UNIQUE,
  content_type VARCHAR(40) NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
  byte_size BIGINT NOT NULL CHECK(byte_size > 0 AND byte_size <= 15728640),
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'READY' CHECK(status IN ('UPLOADING','PROCESSING','READY','FAILED','DELETING')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, owner_id)
);
CREATE TABLE photo_variant (
  photo_id UUID NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK(kind IN ('THUMBNAIL','DISPLAY')),
  object_key VARCHAR(300) NOT NULL UNIQUE,
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  byte_size BIGINT NOT NULL CHECK(byte_size > 0),
  PRIMARY KEY(photo_id, kind)
);
CREATE TABLE trip (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES traveler(id),
  region_id VARCHAR(2) NOT NULL REFERENCES region(id),
  cover_photo_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK(end_date >= start_date),
  companion VARCHAR(200) NOT NULL DEFAULT '',
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(cover_photo_id, owner_id) REFERENCES photo(id, owner_id),
  UNIQUE(owner_id, request_id)
);
CREATE TABLE trip_day (
  trip_id UUID NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK(day_number > 0),
  PRIMARY KEY(trip_id, day_number)
);
CREATE TABLE trip_place (
  trip_id UUID NOT NULL,
  day_number INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  name VARCHAR(200) NOT NULL CHECK(length(trim(name)) > 0),
  PRIMARY KEY(trip_id, day_number, position),
  FOREIGN KEY(trip_id, day_number) REFERENCES trip_day(trip_id, day_number) ON DELETE CASCADE
);
CREATE INDEX trip_owner_region_recent ON trip(owner_id, region_id, start_date DESC, created_at DESC);
CREATE INDEX trip_owner_recent ON trip(owner_id, created_at DESC, id);
CREATE INDEX photo_owner_created ON photo(owner_id, created_at DESC);
CREATE INDEX photo_cleanup ON photo(status, created_at);
CREATE INDEX trip_cover_photo ON trip(cover_photo_id);
INSERT INTO region(id,name,map_key,recommended,introduction) VALUES
('11','서울','seoul',false,''),('26','부산','busan',true,'바다를 따라 걷고, 골목마다 새로운 풍경을 만나 보세요.'),
('27','대구','daegu',false,''),('28','인천','incheon',false,''),('29','광주','gwangju',false,''),
('30','대전','daejeon',false,''),('31','울산','ulsan',false,''),('36','세종','sejong',false,''),
('41','경기','gyeonggi',false,''),('42','강원','gangwon',true,'푸른 동해와 깊은 숲 사이, 잠깐 쉬어 가는 여행을 떠나 보세요.'),
('43','충북','chungbuk',false,''),('44','충남','chungnam',false,''),('45','전북','jeonbuk',false,''),
('46','전남','jeonnam',false,''),('47','경북','gyeongbuk',false,''),('48','경남','gyeongnam',false,''),
('50','제주','jeju',true,'오름을 오르고 바람을 따라 걸으며 나만의 섬 풍경을 담아 보세요.');
