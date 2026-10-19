package kr.chaeummdo;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

// Each signed-in device holds its own traveler_session row, so one account can stay signed in on several devices.
@Component
public class TravelerSession {
  static final Duration LIFETIME = Duration.ofDays(30);
  private final JdbcClient db;
  private final SecureRandom random = new SecureRandom();
  // Behind a TLS-terminating proxy the request itself may look like plain HTTP, so production forces Secure.
  private final boolean secureCookies;
  public TravelerSession(JdbcClient db, @Value("${app.secure-cookies:false}") boolean secureCookies) {
    this.db = db; this.secureCookies = secureCookies;
  }

  public void checkMutation(HttpServletRequest req) {
    if (!"chaeummdo".equals(req.getHeader("X-Requested-With")))
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "허용되지 않은 요청입니다.");
  }
  private String token(HttpServletRequest req) {
    return req.getCookies() == null ? null : Arrays.stream(req.getCookies())
      .filter(c -> c.getName().equals("traveler")).map(Cookie::getValue).findFirst().orElse(null);
  }
  // Expiry is checked here too: a cookie kept past its Max-Age, or copied elsewhere, must not outlive 30 days.
  private Optional<UUID> lookup(HttpServletRequest req, boolean accountOnly) {
    String token = token(req);
    if (token == null) return Optional.empty();
    String hash = hash(token);
    var row = db.sql("SELECT s.traveler_id, s.last_used_at < now() - interval '1 hour' AS stale FROM traveler_session s"
        + " JOIN traveler t ON t.id=s.traveler_id WHERE s.token_hash=:hash AND s.expires_at > now()"
        + (accountOnly ? " AND t.username IS NOT NULL" : ""))
      .param("hash", hash).query().listOfRows().stream().findFirst();
    // last_used_at is coarse on purpose: photo reads would otherwise turn every GET into a write.
    row.filter(r -> Boolean.TRUE.equals(r.get("stale"))).ifPresent(r ->
      db.sql("UPDATE traveler_session SET last_used_at=now() WHERE token_hash=:hash").param("hash", hash).update());
    return row.map(r -> (UUID) r.get("traveler_id"));
  }
  // Any live session, including anonymous ones from before accounts were required.
  public Optional<UUID> existing(HttpServletRequest req) {
    return lookup(req, false);
  }
  // Travel data belongs to accounts only, so anonymous callers cannot upload photos or create records.
  public UUID require(HttpServletRequest req) {
    if (!req.getMethod().equals("GET")) checkMutation(req);
    return lookup(req, true).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }
  // Starts a new session on this device. Other devices keep theirs; the session this browser presented is replaced.
  public void rotate(UUID owner, HttpServletRequest req, HttpServletResponse res) {
    String current = token(req);
    if (current != null) db.sql("DELETE FROM traveler_session WHERE token_hash=:hash").param("hash", hash(current)).update();
    db.sql("DELETE FROM traveler_session WHERE traveler_id=:id AND expires_at <= now()").param("id", owner).update();
    String token = newToken();
    db.sql("INSERT INTO traveler_session(token_hash,traveler_id,expires_at) VALUES(:hash,:id,now()+make_interval(days=>:days))")
      .param("hash", hash(token)).param("id", owner).param("days", (int) LIFETIME.toDays()).update();
    setCookie(req, res, token);
  }
  // Signs out this device only.
  public void clear(HttpServletRequest req, HttpServletResponse res) {
    String current = token(req);
    if (current != null) db.sql("DELETE FROM traveler_session WHERE token_hash=:hash").param("hash", hash(current)).update();
    res.addHeader("Set-Cookie", ResponseCookie.from("traveler", "").httpOnly(true)
      .sameSite("Strict").secure(secureCookies || req.isSecure()).path("/api").maxAge(Duration.ZERO).build().toString());
  }
  // Signs the account out everywhere, e.g. after a password reset.
  public void revokeAll(UUID owner) {
    db.sql("DELETE FROM traveler_session WHERE traveler_id=:id").param("id", owner).update();
  }
  private void setCookie(HttpServletRequest req, HttpServletResponse res, String token) {
    res.addHeader("Set-Cookie", ResponseCookie.from("traveler", token).httpOnly(true)
      .sameSite("Strict").secure(secureCookies || req.isSecure()).path("/api").maxAge(LIFETIME).build().toString());
  }
  public String newToken() {
    byte[] bytes = new byte[32]; random.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }
  public static String hash(String value) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    catch (Exception e) { throw new IllegalStateException(e); }
  }
}
