package kr.chaeummdo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

// Photo rows and the files they point at. Trip covers, place photos and 시·도 map photos all share the
// photo table, so ownership checks, uploads and cleanup live here rather than in each controller.
@Component
public class PhotoStore {
  static final int THUMBNAIL_EDGE = 320;
  static final long MAX_BYTES = 15_728_640;
  // A decoded photo takes 3–4 bytes per pixel, so this keeps one upload under about 100 MB of memory.
  // The web app shrinks photos to a 2048px long edge (about 3 million pixels) before uploading.
  static final long MAX_PIXELS = 25_000_000;

  public record StoredFile(Path path, String contentType) {}

  private final JdbcClient db;
  private final TransactionTemplate tx;
  private final Path root;
  // Uploads beyond this many wait for a decoder instead of all holding full-size images at once.
  private final Semaphore decoders;

  public PhotoStore(JdbcClient db, TransactionTemplate tx, @Value("${app.media-root}") String root,
                    @Value("${app.photo-decode-concurrency:2}") int decodeConcurrency) throws IOException {
    this.db = db;
    this.tx = tx;
    this.root = Path.of(root).toAbsolutePath().normalize();
    this.decoders = new Semaphore(Math.max(1, decodeConcurrency), true);
    Files.createDirectories(this.root);
    // Fail at start, with the reason in the log, rather than on the first upload.
    if (!Files.isWritable(this.root))
      throw new IllegalStateException("The media folder " + this.root + " is not writable by this process; check the owner of the volume.");
  }

  Path root() {
    return root;
  }

  // A photo can be linked only by its owner, and only once it is fully stored.
  public void requireUsable(UUID photo, UUID owner, String message) {
    boolean usable = db.sql("SELECT count(*) FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'")
      .param("id", photo).param("owner", owner).query(Integer.class).single() == 1;
    if (!usable) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  // Verifies and re-encodes the upload (dropping EXIF/location metadata) and stores it with its 320px thumbnail.
  public UUID save(MultipartFile file, UUID owner) throws IOException {
    if (file.isEmpty() || file.getSize() > MAX_BYTES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진은 15MB 이하로 선택해 주세요.");
    String format;
    int width;
    int height;
    try (var stream = ImageIO.createImageInputStream(file.getInputStream())) {
      var readers = ImageIO.getImageReaders(stream);
      if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPEG 또는 PNG 사진을 선택해 주세요.");
      var reader = readers.next();
      try {
        reader.setInput(stream);
        format = reader.getFormatName().toLowerCase(Locale.ROOT);
        width = reader.getWidth(0);
        height = reader.getHeight(0);
      } finally {
        reader.dispose();
      }
    }
    if (!Set.of("jpeg", "png").contains(format) || width < 1 || height < 1 || (long) width * height > MAX_PIXELS)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPEG·PNG, 2,500만 화소 이하 사진을 선택해 주세요.");
    try {
      if (!decoders.tryAcquire(30, TimeUnit.SECONDS))
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "사진을 처리하는 중이에요. 잠시 후 다시 시도해 주세요.");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "사진을 처리하는 중이에요. 잠시 후 다시 시도해 주세요.");
    }
    try {
      return store(file, owner, format, width, height);
    } finally {
      decoders.release();
    }
  }

  private UUID store(MultipartFile file, UUID owner, String format, int width, int height) throws IOException {
    UUID id = UUID.randomUUID();
    String key = owner + "/" + id + "." + format;
    String thumbnailKey = owner + "/" + id + "-thumbnail." + format;
    Path path = root.resolve(key);
    Path thumbnailPath = root.resolve(thumbnailKey);
    Files.createDirectories(path.getParent());
    try {
      var decoded = ImageIO.read(file.getInputStream());
      if (decoded == null || !ImageIO.write(decoded, format, path.toFile())) throw new IOException("사진을 읽을 수 없습니다.");
      long size = Files.size(path);
      if (size > MAX_BYTES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "처리된 사진이 15MB를 넘습니다. 크기를 줄여 주세요.");
      // The thumbnail keeps the original's format, so both files share the photo's content type.
      var small = thumbnail(decoded, THUMBNAIL_EDGE);
      if (!ImageIO.write(small, format, thumbnailPath.toFile())) throw new IOException("썸네일을 만들 수 없습니다.");
      long thumbnailSize = Files.size(thumbnailPath);
      tx.executeWithoutResult(status -> {
        db.sql("INSERT INTO photo(id,owner_id,object_key,content_type,byte_size,width,height) VALUES(:id,:owner,:key,:type,:size,:width,:height)")
          .param("id", id).param("owner", owner).param("key", key).param("type", "image/" + format)
          .param("size", size).param("width", width).param("height", height).update();
        db.sql("INSERT INTO photo_variant(photo_id,kind,object_key,width,height,byte_size) VALUES(:id,'THUMBNAIL',:key,:width,:height,:size)")
          .param("id", id).param("key", thumbnailKey).param("width", small.getWidth()).param("height", small.getHeight())
          .param("size", thumbnailSize).update();
      });
    } catch (Exception e) {
      Files.deleteIfExists(path);
      Files.deleteIfExists(thumbnailPath);
      throw e;
    }
    return id;
  }

  public Optional<StoredFile> original(UUID photo, UUID owner) {
    return file(db.sql("SELECT object_key,content_type FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'")
      .param("id", photo).param("owner", owner));
  }

  // Photos uploaded before thumbnails existed have no variant, so the original stands in for them.
  public Optional<StoredFile> thumbnail(UUID photo, UUID owner) {
    return file(db.sql("""
      SELECT coalesce(variant.object_key,photo.object_key) AS object_key,photo.content_type FROM photo
      LEFT JOIN photo_variant variant ON variant.photo_id=photo.id AND variant.kind='THUMBNAIL'
      WHERE photo.id=:id AND photo.owner_id=:owner AND photo.status='READY'
      """).param("id", photo).param("owner", owner));
  }

  private Optional<StoredFile> file(JdbcClient.StatementSpec query) {
    return query.query().listOfRows().stream().findFirst()
      .map(row -> new StoredFile(root.resolve((String) row.get("object_key")), (String) row.get("content_type")));
  }

  // Removes the photo unless a trip, a place or a map photo still uses it. Call inside the transaction that
  // dropped the reference; it returns the file keys to delete once that transaction has committed.
  public List<String> deleteIfUnused(UUID photo, UUID owner) {
    List<String> variants = db.sql("SELECT object_key FROM photo_variant WHERE photo_id=:id").param("id", photo).query(String.class).list();
    var deleted = db.sql("""
      DELETE FROM photo WHERE id=:id AND owner_id=:owner
      AND NOT EXISTS (SELECT 1 FROM trip WHERE cover_photo_id=:id)
      AND NOT EXISTS (SELECT 1 FROM trip_place WHERE photo_id=:id)
      AND NOT EXISTS (SELECT 1 FROM region_cover WHERE photo_id=:id)
      RETURNING object_key
      """).param("id", photo).param("owner", owner).query(String.class).optional();
    List<String> keys = new ArrayList<>();
    deleted.ifPresent(key -> {
      keys.add(key);
      keys.addAll(variants);
    });
    return keys;
  }

  public List<String> deleteIfUnused(Collection<UUID> photos, UUID owner) {
    List<String> keys = new ArrayList<>();
    for (UUID photo : new LinkedHashSet<>(photos)) keys.addAll(deleteIfUnused(photo, owner));
    return keys;
  }

  // Every original and variant file of the owner, collected before account deletion removes the rows.
  public List<String> fileKeysOf(UUID owner) {
    return db.sql("""
      SELECT object_key FROM photo WHERE owner_id=:id
      UNION ALL
      SELECT variant.object_key FROM photo_variant variant JOIN photo ON photo.id=variant.photo_id WHERE photo.owner_id=:id
      """).param("id", owner).query(String.class).list();
  }

  // Best effort after commit: a file left behind holds no data the app can still reach.
  public void deleteFiles(Collection<String> keys) {
    for (String key : keys) {
      try {
        Files.deleteIfExists(root.resolve(key));
      } catch (IOException ignored) {
        // A later media reconciliation can remove it.
      }
    }
  }

  // Shrinks to fit maxEdge without enlarging. Halving in steps keeps bilinear scaling from skipping pixels.
  static BufferedImage thumbnail(BufferedImage source, int maxEdge) {
    double scale = Math.min(1d, (double) maxEdge / Math.max(source.getWidth(), source.getHeight()));
    int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
    int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
    int type = source.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
    BufferedImage current = source;
    do {
      var next = new BufferedImage(Math.max(width, current.getWidth() / 2), Math.max(height, current.getHeight() / 2), type);
      var graphics = next.createGraphics();
      try {
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(current, 0, 0, next.getWidth(), next.getHeight(), null);
      } finally {
        graphics.dispose();
      }
      current = next;
    } while (current.getWidth() != width || current.getHeight() != height);
    return current;
  }
}
