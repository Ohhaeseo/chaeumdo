package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

// A 시·도 photo the traveler picked for the national map. It does not depend on trips, so any 시·도 may have one.
@RestController
@RequestMapping("/api/region-covers")
public class RegionCoverController {
  public record RegionCover(String regionId, String photoUrl, String thumbnailUrl) {}
  public record RegionCoverInput(@NotNull UUID photoId) {}

  private final JdbcClient db;
  private final TransactionTemplate tx;
  private final TravelerSession session;
  private final PhotoStore photos;

  public RegionCoverController(JdbcClient db, TransactionTemplate tx, TravelerSession session, PhotoStore photos) {
    this.db = db;
    this.tx = tx;
    this.session = session;
    this.photos = photos;
  }

  private static RegionCover cover(String region, UUID photo) {
    return new RegionCover(region, "/api/photos/" + photo, "/api/photos/" + photo + "/thumbnail");
  }

  @GetMapping
  public List<RegionCover> list(HttpServletRequest req) {
    return db.sql("SELECT region_id,photo_id FROM region_cover WHERE owner_id=:owner ORDER BY region_id")
      .param("owner", session.require(req))
      .query((rs, n) -> cover(rs.getString("region_id"), rs.getObject("photo_id", UUID.class))).list();
  }

  @PutMapping("/{regionId}")
  public RegionCover set(@PathVariable String regionId, @Valid @RequestBody RegionCoverInput input, HttpServletRequest req) {
    UUID owner = session.require(req);
    if (db.sql("SELECT count(*) FROM region WHERE id=:id AND level='province'").param("id", regionId).query(Integer.class).single() != 1)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시·도를 확인해 주세요.");
    List<String> files = tx.execute(status -> {
      // Serialize changes for the same traveler, so a replaced photo is always cleaned up.
      lockTraveler(owner);
      photos.requireUsable(input.photoId(), owner, "사진을 다시 선택해 주세요.");
      var previous = db.sql("SELECT photo_id FROM region_cover WHERE owner_id=:owner AND region_id=:region")
        .param("owner", owner).param("region", regionId).query(UUID.class).optional();
      db.sql("""
        INSERT INTO region_cover(owner_id,region_id,photo_id) VALUES(:owner,:region,:photo)
        ON CONFLICT (owner_id,region_id) DO UPDATE SET photo_id=EXCLUDED.photo_id,updated_at=now()
        """).param("owner", owner).param("region", regionId).param("photo", input.photoId()).update();
      return previous.filter(old -> !old.equals(input.photoId()))
        .map(old -> photos.deleteIfUnused(old, owner)).orElse(List.of());
    });
    photos.deleteFiles(files);
    return cover(regionId, input.photoId());
  }

  // Back to the most recent trip's photo. Removing a cover that is not there is not an error.
  @DeleteMapping("/{regionId}")
  public void remove(@PathVariable String regionId, HttpServletRequest req) {
    UUID owner = session.require(req);
    List<String> files = tx.execute(status -> {
      lockTraveler(owner);
      return db.sql("DELETE FROM region_cover WHERE owner_id=:owner AND region_id=:region RETURNING photo_id")
        .param("owner", owner).param("region", regionId).query(UUID.class).optional()
        .map(photo -> photos.deleteIfUnused(photo, owner)).orElse(List.of());
    });
    photos.deleteFiles(files);
  }

  private void lockTraveler(UUID owner) {
    db.sql("SELECT id FROM traveler WHERE id=:id FOR UPDATE").param("id", owner).query(UUID.class).single();
  }
}
