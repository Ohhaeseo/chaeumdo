package kr.chaeummdo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Stream;

// Removes what uploads leave behind when nothing ever links them: a photo uploaded for a trip that was
// never saved, and files on disk whose photo row is gone (e.g. a crash between writing and committing).
// Uploads always come before the trip or map photo that links them, so only things older than the grace
// period are touched.
@Component
public class PhotoJanitor {
  private static final Logger log = LoggerFactory.getLogger(PhotoJanitor.class);
  private static final Pattern STORED_FILE = Pattern.compile("([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-thumbnail)?\\.(jpeg|png)");
  private static final int BATCH = 500;

  private final JdbcClient db;
  private final TransactionTemplate tx;
  private final PhotoStore photos;
  private final Duration grace;

  public PhotoJanitor(JdbcClient db, TransactionTemplate tx, PhotoStore photos, @Value("${app.orphan-photos.grace:PT24H}") Duration grace) {
    this.db = db;
    this.tx = tx;
    this.photos = photos;
    this.grace = grace;
  }

  @Scheduled(initialDelayString = "${app.orphan-photos.initial-delay:PT10M}", fixedDelayString = "${app.orphan-photos.interval:PT6H}")
  public void sweep() {
    int rows = removeUnlinkedPhotos();
    int files = removeStrayFiles();
    if (rows + files > 0) log.info("Removed {} unlinked photos and {} stray media files", rows, files);
  }

  // At most one batch per sweep, so a large backlog is worked off over a few runs.
  int removeUnlinkedPhotos() {
    record Unlinked(UUID photo, UUID owner) {}
    List<Unlinked> batch = db.sql("""
      SELECT id,owner_id FROM photo
      WHERE created_at < now() - make_interval(secs => :grace)
      AND NOT EXISTS (SELECT 1 FROM trip WHERE cover_photo_id=photo.id)
      AND NOT EXISTS (SELECT 1 FROM trip_place WHERE photo_id=photo.id)
      AND NOT EXISTS (SELECT 1 FROM region_cover WHERE photo_id=photo.id)
      ORDER BY created_at LIMIT :limit
      """).param("grace", grace.toSeconds()).param("limit", BATCH)
      .query((rs, n) -> new Unlinked(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class))).list();
    int removed = 0;
    for (Unlinked item : batch) {
      // deleteIfUnused checks the links again, so a photo linked since the query above stays.
      List<String> keys = tx.execute(status -> photos.deleteIfUnused(item.photo(), item.owner()));
      photos.deleteFiles(keys);
      if (!keys.isEmpty()) removed++;
    }
    return removed;
  }

  // Files are stored as {owner}/{photo}.{format} and {owner}/{photo}-thumbnail.{format}; anything else is left alone.
  int removeStrayFiles() {
    Instant cutoff = Instant.now().minus(grace);
    Map<UUID, List<Path>> byPhoto = new HashMap<>();
    try (Stream<Path> files = Files.walk(photos.root(), 2)) {
      files.filter(Files::isRegularFile).filter(path -> olderThan(path, cutoff)).forEach(path -> {
        var name = STORED_FILE.matcher(path.getFileName().toString());
        if (name.matches()) byPhoto.computeIfAbsent(UUID.fromString(name.group(1)), id -> new ArrayList<>()).add(path);
      });
    } catch (IOException e) {
      log.warn("Could not scan the media folder for stray files", e);
      return 0;
    }
    Set<UUID> known = new HashSet<>();
    List<UUID> ids = new ArrayList<>(byPhoto.keySet());
    for (int from = 0; from < ids.size(); from += BATCH)
      known.addAll(db.sql("SELECT id FROM photo WHERE id IN (:ids)").param("ids", ids.subList(from, Math.min(ids.size(), from + BATCH))).query(UUID.class).list());
    int removed = 0;
    for (var entry : byPhoto.entrySet()) {
      if (known.contains(entry.getKey())) continue;
      for (Path path : entry.getValue()) {
        try {
          if (Files.deleteIfExists(path)) removed++;
        } catch (IOException e) {
          log.warn("Could not delete stray media file {}", path, e);
        }
      }
    }
    removeEmptyOwnerFolders(cutoff);
    return removed;
  }

  // Account deletion removes the files but leaves the owner's folder.
  private void removeEmptyOwnerFolders(Instant cutoff) {
    try (Stream<Path> folders = Files.list(photos.root())) {
      folders.filter(Files::isDirectory).filter(folder -> olderThan(folder, cutoff)).forEach(folder -> {
        try (Stream<Path> inside = Files.list(folder)) {
          if (inside.findAny().isEmpty()) Files.delete(folder);
        } catch (IOException ignored) {
          // Not empty after all, or in use; the next sweep looks again.
        }
      });
    } catch (IOException e) {
      log.warn("Could not list the media folder", e);
    }
  }

  private static boolean olderThan(Path path, Instant cutoff) {
    try {
      return Files.getLastModifiedTime(path).toInstant().isBefore(cutoff);
    } catch (IOException e) {
      return false;
    }
  }
}
