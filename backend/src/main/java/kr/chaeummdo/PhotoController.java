package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/photos")
public class PhotoController {
  private final TravelerSession session;
  private final PhotoStore photos;

  public PhotoController(TravelerSession session, PhotoStore photos) {
    this.session = session;
    this.photos = photos;
  }

  @PostMapping
  public Map<String, UUID> upload(@RequestParam("file") MultipartFile file, HttpServletRequest req) throws IOException {
    return Map.of("id", photos.save(file, session.require(req)));
  }

  @GetMapping("/{id}")
  public ResponseEntity<Resource> original(@PathVariable UUID id, HttpServletRequest req) {
    return serve(photos.original(id, session.require(req)));
  }

  @GetMapping("/{id}/thumbnail")
  public ResponseEntity<Resource> thumbnail(@PathVariable UUID id, HttpServletRequest req) {
    return serve(photos.thumbnail(id, session.require(req)));
  }

  // A photo id never points at different bytes, so the owner's browser may keep it; Vary keeps it per session.
  // A thumbnail URL served from the original still shows the same picture, only larger.
  private ResponseEntity<Resource> serve(Optional<PhotoStore.StoredFile> found) {
    var file = found.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    return ResponseEntity.ok()
      .contentType(MediaType.parseMediaType(file.contentType()))
      .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable())
      .header("Vary", "Cookie")
      .header("X-Content-Type-Options", "nosniff")
      .body(new FileSystemResource(file.path()));
  }
}
