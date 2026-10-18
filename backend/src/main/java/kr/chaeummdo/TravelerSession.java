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

@Component
public class TravelerSession {
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
  public Optional<UUID> existing(HttpServletRequest req) {
    String token = token(req);
    return token == null ? Optional.empty() : db.sql("SELECT id FROM traveler WHERE access_token_hash=:hash")
      .param("hash", hash(token)).query(UUID.class).optional();
  }
  // Travel data belongs to accounts only, so anonymous callers cannot upload photos or create records.
  public UUID require(HttpServletRequest req) {
    if (!req.getMethod().equals("GET")) checkMutation(req);
    String token = token(req);
    if (token == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    return db.sql("SELECT id FROM traveler WHERE access_token_hash=:hash AND username IS NOT NULL")
      .param("hash", hash(token)).query(UUID.class).optional()
      .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }
  public void rotate(UUID owner, HttpServletRequest req, HttpServletResponse res) {
    String token = newToken();
    db.sql("UPDATE traveler SET access_token_hash=:hash WHERE id=:id")
      .param("id", owner).param("hash", hash(token)).update();
    setCookie(req, res, token);
  }
  public void clear(HttpServletRequest req, HttpServletResponse res) {
    res.addHeader("Set-Cookie", ResponseCookie.from("traveler", "").httpOnly(true)
      .sameSite("Strict").secure(secureCookies || req.isSecure()).path("/api").maxAge(Duration.ZERO).build().toString());
  }
  void setCookie(HttpServletRequest req, HttpServletResponse res, String token) {
    res.addHeader("Set-Cookie", ResponseCookie.from("traveler", token).httpOnly(true)
      .sameSite("Strict").secure(secureCookies || req.isSecure()).path("/api").maxAge(Duration.ofDays(30)).build().toString());
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
