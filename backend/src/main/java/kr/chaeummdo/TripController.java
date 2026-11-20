package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class TripController {
  public record Region(String id, String name, boolean recommended, String introduction, String parentId, String level) {}
  public record Trip(UUID id, String regionId, List<String> regionIds, String photoUrl, String thumbnailUrl, LocalDate startDate, LocalDate endDate,
    String companion, List<List<String>> days, List<List<String>> placePhotoUrls, List<List<String>> placePhotoThumbnailUrls, List<List<PlaceLocation>> placeLocations) {}
  public record PlaceLocation(Double latitude, Double longitude, String address, String source, String sourceId) {}
  public record TripInput(@NotNull UUID requestId, @NotBlank @Size(max=10) String regionId, @Size(max=10) List<@NotBlank @Size(max=10) String> regionIds, @NotNull UUID photoId,
    @NotNull LocalDate startDate, @NotNull LocalDate endDate, @Size(max=200) String companion,
    @NotNull @Size(max=366) List<@NotNull @Size(max=50) List<@NotBlank @Size(max=200) String>> days,
    List<List<UUID>> placePhotoIds, List<List<PlaceLocation>> placeLocations) {}
  public record TripUpdate(@NotBlank @Size(max=10) String regionId, @Size(max=10) List<@NotBlank @Size(max=10) String> regionIds, UUID photoId,
    @NotNull LocalDate startDate, @NotNull LocalDate endDate, @Size(max=200) String companion,
    @NotNull @Size(max=366) List<@NotNull @Size(max=50) List<@NotBlank @Size(max=200) String>> days,
    List<List<UUID>> placePhotoIds, List<List<PlaceLocation>> placeLocations) {}
  private record RegionLink(UUID trip, String region) {}
  private record PlaceRow(UUID trip, int day, int position, String name, UUID photo, PlaceLocation location) {}

  private final JdbcClient db;
  private final TransactionTemplate tx;
  private final TravelerSession session;
  private final PhotoStore photos;

  public TripController(JdbcClient db, TransactionTemplate tx, TravelerSession session, PhotoStore photos) {
    this.db = db;
    this.tx = tx;
    this.session = session;
    this.photos = photos;
  }

  public static int duration(LocalDate start, LocalDate end) {
    long n = ChronoUnit.DAYS.between(start, end) + 1;
    if (n < 1 || n > 366) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "여행 기간은 1~366일로 입력해 주세요.");
    return (int) n;
  }

  // Region data is public reference data; reading it does not create a session.
  @GetMapping("/regions")
  public List<Region> regions() {
    return db.sql("SELECT id,name,recommended,introduction,parent_id,level FROM region ORDER BY level DESC,parent_id NULLS FIRST,name").query(Region.class).list();
  }

  // Three queries for the whole list. Reading regions per trip and places per DAY grew with every record.
  @GetMapping("/trips")
  public List<Trip> trips(HttpServletRequest req) {
    UUID owner = session.require(req);
    Map<UUID, List<String>> regions = db.sql("""
        SELECT link.trip_id,link.region_id FROM trip_region link JOIN trip ON trip.id=link.trip_id
        WHERE trip.owner_id=:owner ORDER BY link.trip_id,link.position
        """).param("owner", owner)
      .query((rs, n) -> new RegionLink(rs.getObject("trip_id", UUID.class), rs.getString("region_id"))).list().stream()
      .collect(Collectors.groupingBy(RegionLink::trip, Collectors.mapping(RegionLink::region, Collectors.toList())));
    Map<UUID, List<PlaceRow>> places = db.sql("""
        SELECT place.* FROM trip_place place JOIN trip ON trip.id=place.trip_id
        WHERE trip.owner_id=:owner ORDER BY place.trip_id,place.day_number,place.position
        """).param("owner", owner).query((rs, n) -> placeRow(rs)).list().stream()
      .collect(Collectors.groupingBy(PlaceRow::trip));
    return db.sql("SELECT id,region_id,cover_photo_id,start_date,end_date,companion FROM trip WHERE owner_id=:owner ORDER BY start_date DESC,created_at DESC")
      .param("owner", owner).query((rs, n) -> {
        UUID id = rs.getObject("id", UUID.class);
        return trip(id, rs.getString("region_id"), rs.getObject("cover_photo_id", UUID.class), rs.getDate("start_date").toLocalDate(),
          rs.getDate("end_date").toLocalDate(), rs.getString("companion"), regions.getOrDefault(id, List.of()), places.getOrDefault(id, List.of()));
      }).list();
  }

  private static Trip trip(UUID id, String region, UUID cover, LocalDate start, LocalDate end, String companion, List<String> regionIds, List<PlaceRow> places) {
    int length = duration(start, end);
    List<List<String>> days = emptyDays(length);
    List<List<String>> photoUrls = emptyDays(length);
    List<List<String>> thumbnailUrls = emptyDays(length);
    List<List<PlaceLocation>> locations = emptyDays(length);
    for (PlaceRow place : places) {
      int day = place.day() - 1;
      if (day >= length) continue;
      days.get(day).add(place.name());
      photoUrls.get(day).add(place.photo() == null ? null : "/api/photos/" + place.photo());
      thumbnailUrls.get(day).add(place.photo() == null ? null : "/api/photos/" + place.photo() + "/thumbnail");
      locations.get(day).add(place.location());
    }
    // Trips from before multi-region records have no link rows; their single region stands in.
    return new Trip(id, region, regionIds.isEmpty() ? List.of(region) : regionIds, "/api/photos/" + cover, "/api/photos/" + cover + "/thumbnail",
      start, end, companion, days, photoUrls, thumbnailUrls, locations);
  }

  private static <T> List<List<T>> emptyDays(int length) {
    List<List<T>> days = new ArrayList<>(length);
    for (int i = 0; i < length; i++) days.add(new ArrayList<>());
    return days;
  }

  private static PlaceRow placeRow(ResultSet rs) throws SQLException {
    Object latitude = rs.getObject("latitude");
    Object longitude = rs.getObject("longitude");
    PlaceLocation location = latitude == null || longitude == null ? null : new PlaceLocation(
      ((Number) latitude).doubleValue(), ((Number) longitude).doubleValue(),
      Objects.toString(rs.getString("place_address"), ""), Objects.toString(rs.getString("place_source"), "OpenStreetMap"),
      Objects.toString(rs.getString("place_source_id"), ""));
    return new PlaceRow(rs.getObject("trip_id", UUID.class), rs.getInt("day_number"), rs.getInt("position"), rs.getString("name"),
      rs.getObject("photo_id", UUID.class), location);
  }

  @GetMapping("/stats")
  public Map<String, Object> stats(HttpServletRequest req) {
    return db.sql("SELECT (SELECT count(DISTINCT linked.region_id) FROM trip_region linked JOIN trip linked_trip ON linked_trip.id=linked.trip_id WHERE linked_trip.owner_id=:owner) AS regions,count(*) AS trips,coalesce(sum(end_date-start_date+1),0) AS days FROM trip WHERE owner_id=:owner")
      .param("owner", session.require(req)).query().singleRow();
  }

  @PostMapping("/trips")
  public Map<String, UUID> create(@Valid @RequestBody TripInput input, HttpServletRequest req) {
    UUID owner = session.require(req);
    List<String> regionIds = normalizedRegions(input.regionId(), input.regionIds());
    requireDayCount(input.days(), input.startDate(), input.endDate());
    validatePlacePhotos(input.days(), input.placePhotoIds(), owner);
    validatePlaceLocations(input.days(), input.placeLocations());
    validateRegions(regionIds);
    return tx.execute(status -> {
      // Serialize retries for the same traveler, keeping the idempotency check atomic.
      db.sql("SELECT id FROM traveler WHERE id=:id FOR UPDATE").param("id", owner).query(UUID.class).single();
      var existing = db.sql("SELECT id FROM trip WHERE owner_id=:owner AND request_id=:request")
        .param("owner", owner).param("request", input.requestId()).query(UUID.class).optional();
      if (existing.isPresent()) return Map.of("id", existing.get());
      photos.requireUsable(input.photoId(), owner, "사진을 다시 선택해 주세요.");
      UUID id = UUID.randomUUID();
      db.sql("INSERT INTO trip(id,owner_id,region_id,cover_photo_id,start_date,end_date,companion,request_id) VALUES(:id,:owner,:region,:photo,:start,:end,:companion,:request)")
        .param("id", id).param("owner", owner).param("region", input.regionId()).param("photo", input.photoId())
        .param("start", input.startDate()).param("end", input.endDate())
        .param("companion", Objects.requireNonNullElse(input.companion(), "")).param("request", input.requestId()).update();
      saveRegions(id, regionIds);
      saveDays(id, owner, input.days(), input.placePhotoIds(), input.placeLocations());
      return Map.of("id", id);
    });
  }

  @PatchMapping("/trips/{id}")
  public Map<String, UUID> update(@PathVariable UUID id, @Valid @RequestBody TripUpdate input, HttpServletRequest req) {
    UUID owner = session.require(req);
    List<String> regionIds = normalizedRegions(input.regionId(), input.regionIds());
    requireDayCount(input.days(), input.startDate(), input.endDate());
    List<String> files = tx.execute(status -> {
      if (db.sql("SELECT count(*) FROM trip WHERE id=:id AND owner_id=:owner").param("id", id).param("owner", owner).query(Integer.class).single() != 1)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
      // Omitted place photos or locations mean "keep what each position had".
      List<PlaceRow> saved = (input.placePhotoIds() == null || input.placeLocations() == null) ? savedPlaces(id) : List.of();
      List<List<UUID>> placePhotos = input.placePhotoIds() == null ? keptByPosition(saved, input.days(), PlaceRow::photo) : input.placePhotoIds();
      List<List<PlaceLocation>> placeLocations = input.placeLocations() == null ? keptByPosition(saved, input.days(), PlaceRow::location) : input.placeLocations();
      validatePlacePhotos(input.days(), placePhotos, owner);
      validatePlaceLocations(input.days(), placeLocations);
      validateRegions(regionIds);
      if (input.photoId() != null) photos.requireUsable(input.photoId(), owner, "사진을 다시 선택해 주세요.");
      List<UUID> before = photosOf(id, owner);
      db.sql("UPDATE trip SET region_id=:region,cover_photo_id=coalesce(:photo,cover_photo_id),start_date=:start,end_date=:end,companion=:companion WHERE id=:id AND owner_id=:owner")
        .param("region", input.regionId()).param("photo", input.photoId()).param("start", input.startDate()).param("end", input.endDate())
        .param("companion", Objects.requireNonNullElse(input.companion(), "")).param("id", id).param("owner", owner).update();
      db.sql("DELETE FROM trip_region WHERE trip_id=:id").param("id", id).update();
      saveRegions(id, regionIds);
      db.sql("DELETE FROM trip_day WHERE trip_id=:id").param("id", id).update();
      saveDays(id, owner, input.days(), placePhotos, placeLocations);
      // A replaced cover or a removed place photo would otherwise stay on disk until the account is deleted.
      return photos.deleteIfUnused(before, owner);
    });
    photos.deleteFiles(files);
    return Map.of("id", id);
  }

  @DeleteMapping("/trips/{id}")
  public void delete(@PathVariable UUID id, HttpServletRequest req) {
    UUID owner = session.require(req);
    List<String> files = tx.execute(status -> {
      List<UUID> linked = photosOf(id, owner);
      if (db.sql("DELETE FROM trip WHERE id=:id AND owner_id=:owner").param("id", id).param("owner", owner).update() != 1)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
      return photos.deleteIfUnused(linked, owner);
    });
    photos.deleteFiles(files);
  }

  private List<UUID> photosOf(UUID trip, UUID owner) {
    return db.sql("""
      SELECT cover_photo_id FROM trip WHERE id=:id AND owner_id=:owner
      UNION
      SELECT photo_id FROM trip_place WHERE trip_id=:id AND owner_id=:owner AND photo_id IS NOT NULL
      """).param("id", trip).param("owner", owner).query(UUID.class).list();
  }

  private List<PlaceRow> savedPlaces(UUID trip) {
    return db.sql("SELECT * FROM trip_place WHERE trip_id=:id ORDER BY day_number,position").param("id", trip).query((rs, n) -> placeRow(rs)).list();
  }

  private static <T> List<List<T>> keptByPosition(List<PlaceRow> saved, List<List<String>> days, Function<PlaceRow, T> value) {
    List<List<T>> result = new ArrayList<>();
    for (List<String> day : days) result.add(new ArrayList<>(Collections.nCopies(day.size(), null)));
    for (PlaceRow place : saved) {
      int day = place.day() - 1;
      if (day < result.size() && place.position() < result.get(day).size()) result.get(day).set(place.position(), value.apply(place));
    }
    return result;
  }

  private static void requireDayCount(List<List<String>> days, LocalDate start, LocalDate end) {
    if (days.size() != duration(start, end)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "여행 일수와 DAY 수가 일치하지 않습니다.");
  }

  private List<String> normalizedRegions(String primary, List<String> input) {
    List<String> result = (input == null || input.isEmpty()) ? List.of(primary) : input.stream().map(String::trim).toList();
    if (result.isEmpty() || result.size() > 10 || result.stream().anyMatch(String::isBlank) || new HashSet<>(result).size() != result.size() || !result.get(0).equals(primary))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "여행 지역과 순서를 확인해 주세요.");
    return result;
  }

  private void validateRegions(List<String> regionIds) {
    var placeholders = regionIds.stream().map(id -> "?").collect(Collectors.joining(","));
    if (db.sql("SELECT count(*) FROM region WHERE id IN (" + placeholders + ")").params(regionIds.toArray()).query(Integer.class).single() != regionIds.size())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지역을 확인해 주세요.");
  }

  private void saveRegions(UUID tripId, List<String> regionIds) {
    for (int i = 0; i < regionIds.size(); i++)
      db.sql("INSERT INTO trip_region(trip_id,region_id,position) VALUES(:trip,:region,:position)")
        .param("trip", tripId).param("region", regionIds.get(i)).param("position", i).update();
  }

  private void validatePlacePhotos(List<List<String>> days, List<List<UUID>> photoIds, UUID owner) {
    if (photoIds == null) return;
    if (photoIds.size() != days.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "장소 사진과 DAY 수가 일치하지 않습니다.");
    for (int i = 0; i < days.size(); i++) {
      if (photoIds.get(i) == null || photoIds.get(i).size() != days.get(i).size())
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "장소와 사진 수가 일치하지 않습니다.");
      for (UUID photo : photoIds.get(i)) if (photo != null) photos.requireUsable(photo, owner, "장소 사진을 다시 선택해 주세요.");
    }
  }

  private void validatePlaceLocations(List<List<String>> days, List<List<PlaceLocation>> locations) {
    if (locations == null) return;
    if (locations.size() != days.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "장소와 지도 위치의 DAY 수가 일치하지 않습니다.");
    for (int i = 0; i < days.size(); i++) {
      if (locations.get(i) == null || locations.get(i).size() != days.get(i).size())
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "장소와 지도 위치 수가 일치하지 않습니다.");
      for (PlaceLocation location : locations.get(i)) if (location != null && !validLocation(location))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "장소의 지도 위치를 다시 선택해 주세요.");
    }
  }

  private static boolean validLocation(PlaceLocation location) {
    return location.latitude() != null && location.longitude() != null && Double.isFinite(location.latitude()) && Double.isFinite(location.longitude())
      && location.latitude() >= -90 && location.latitude() <= 90 && location.longitude() >= -180 && location.longitude() <= 180
      && location.address() != null && location.address().length() <= 500 && "OpenStreetMap".equals(location.source())
      && location.sourceId() != null && !location.sourceId().isBlank() && location.sourceId().length() <= 120;
  }

  private void saveDays(UUID tripId, UUID owner, List<List<String>> days, List<List<UUID>> photoIds, List<List<PlaceLocation>> locations) {
    for (int i = 0; i < days.size(); i++) {
      db.sql("INSERT INTO trip_day(trip_id,day_number) VALUES(:id,:day)").param("id", tripId).param("day", i + 1).update();
      for (int j = 0; j < days.get(i).size(); j++) {
        UUID photo = photoIds == null ? null : photoIds.get(i).get(j);
        PlaceLocation location = locations == null ? null : locations.get(i).get(j);
        db.sql("INSERT INTO trip_place(trip_id,day_number,position,name,owner_id,photo_id,latitude,longitude,place_address,place_source,place_source_id) VALUES(:id,:day,:position,:name,:owner,:photo,:latitude,:longitude,:address,:source,:sourceId)")
          .param("id", tripId).param("day", i + 1).param("position", j).param("name", days.get(i).get(j).trim())
          .param("owner", owner).param("photo", photo)
          .param("latitude", location == null ? null : location.latitude()).param("longitude", location == null ? null : location.longitude())
          .param("address", location == null ? null : location.address()).param("source", location == null ? null : location.source())
          .param("sourceId", location == null ? null : location.sourceId()).update();
      }
    }
  }
}
