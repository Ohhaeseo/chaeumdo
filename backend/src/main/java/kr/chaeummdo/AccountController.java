package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AccountController {
  private final JdbcClient db;
  private final TravelerSession session;
  private final TransactionTemplate tx;
  private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
  private final Path mediaRoot;

  public AccountController(JdbcClient db, TravelerSession session, TransactionTemplate tx,
                           @Value("${app.media-root}") String mediaRoot) {
    this.db = db; this.session = session; this.tx = tx;
    this.mediaRoot = Path.of(mediaRoot).toAbsolutePath().normalize();
  }
  public record Account(String username, String displayName) {}
  public record Registration(@NotBlank @Pattern(regexp="[a-zA-Z0-9_]{4,32}") String username,
    @NotBlank @Size(min=1,max=30) String displayName,
    @NotBlank @Size(min=8,max=72) String password) {}
  public record Credentials(@NotBlank String username, @NotBlank String password) {}
  public record Recovery(@NotBlank String recoveryCode) {}
  public record Reset(@NotBlank String username, @NotBlank String recoveryCode,
    @NotBlank @Size(min=8,max=72) String newPassword) {}
  public record PasswordInput(@NotBlank String password) {}

  @GetMapping("/me") public Account me(HttpServletRequest req) {
    UUID id = session.existing(req).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    return db.sql("SELECT username,display_name FROM traveler WHERE id=:id AND username IS NOT NULL")
      .param("id",id).query((rs,n)->new Account(rs.getString(1),rs.getString(2)))
      .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }
  @PostMapping("/register") public Map<String,String> register(@Valid @RequestBody Registration input,
                                          HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    var anonymous = session.existing(req);
    String username = input.username().toLowerCase(java.util.Locale.ROOT);
    String code = session.newToken();
    try {
      if(anonymous.isPresent()) {
        // Sessions from before accounts were required keep their records by upgrading in place.
        int updated = db.sql("UPDATE traveler SET username=:username,display_name=:name,password_hash=:password,recovery_code_hash=:recovery WHERE id=:id AND username IS NULL")
          .param("username",username).param("name",input.displayName().trim())
          .param("password",passwords.encode(input.password()))
          .param("recovery",TravelerSession.hash(code)).param("id",anonymous.get()).update();
        if(updated==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 계정에 연결된 기록입니다.");
      } else {
        String token = session.newToken();
        db.sql("INSERT INTO traveler(id,access_token_hash,username,display_name,password_hash,recovery_code_hash) VALUES(:id,:token,:username,:name,:password,:recovery)")
          .param("id",UUID.randomUUID()).param("token",TravelerSession.hash(token))
          .param("username",username).param("name",input.displayName().trim())
          .param("password",passwords.encode(input.password()))
          .param("recovery",TravelerSession.hash(code)).update();
        session.setCookie(req,res,token);
      }
    } catch(DuplicateKeyException e) { throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 사용 중인 아이디입니다."); }
    return Map.of("username",username,"displayName",input.displayName().trim(),"recoveryCode",code);
  }
  @PostMapping("/login") public Account login(@Valid @RequestBody Credentials input,
                                       HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    // The lock is compared in SQL: the JDBC row holds a java.sql.Timestamp, and the lock math uses the DB clock too.
    var rows=db.sql("SELECT id,username,display_name,password_hash,coalesce(locked_until > now(),false) AS locked FROM traveler WHERE lower(username)=lower(:username)")
      .param("username",input.username()).query().listOfRows();
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"아이디 또는 비밀번호를 확인해 주세요.");
    var row=rows.getFirst();
    UUID id=(UUID)row.get("id");
    if(Boolean.TRUE.equals(row.get("locked")))
      throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"잠시 후 다시 로그인해 주세요.");
    if(!passwords.matches(input.password(),(String)row.get("password_hash"))) {
      // SET expressions read the old row, so the lock decision repeats the new attempt count instead of reading failed_attempts.
      db.sql("""
        UPDATE traveler SET
          failed_attempts=CASE WHEN locked_until IS NOT NULL AND locked_until < now() THEN 1 ELSE failed_attempts+1 END,
          locked_until=CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until < now() THEN 1 ELSE failed_attempts+1 END)>=5
            THEN now()+interval '15 minutes' ELSE NULL END
        WHERE id=:id
        """).param("id",id).update();
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"아이디 또는 비밀번호를 확인해 주세요.");
    }
    db.sql("UPDATE traveler SET failed_attempts=0,locked_until=NULL WHERE id=:id").param("id",id).update();
    session.rotate(id,req,res);
    return new Account((String)row.get("username"),(String)row.get("display_name"));
  }
  @PostMapping("/logout") public void logout(HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    session.existing(req).ifPresent(id->session.rotate(id,req,res));
    session.clear(req,res);
  }
  @PostMapping("/recover-id") public Map<String,String> recoverId(@Valid @RequestBody Recovery input,HttpServletRequest req) {
    session.checkMutation(req);
    String username=db.sql("SELECT username FROM traveler WHERE recovery_code_hash=:hash AND username IS NOT NULL")
      .param("hash",TravelerSession.hash(input.recoveryCode())).query(String.class).optional()
      .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"복구 코드를 확인해 주세요."));
    return Map.of("username",username);
  }
  @PostMapping("/reset-password") public Map<String,String> reset(@Valid @RequestBody Reset input,
                                                       HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    var id=db.sql("SELECT id FROM traveler WHERE lower(username)=lower(:username) AND recovery_code_hash=:hash")
      .param("username",input.username()).param("hash",TravelerSession.hash(input.recoveryCode()))
      .query(UUID.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"아이디와 복구 코드를 확인해 주세요."));
    String newCode=session.newToken();
    db.sql("UPDATE traveler SET password_hash=:password,recovery_code_hash=:recovery,failed_attempts=0,locked_until=NULL WHERE id=:id")
      .param("password",passwords.encode(input.newPassword()))
      .param("recovery",TravelerSession.hash(newCode)).param("id",id).update();
    session.rotate(id,req,res);
    return Map.of("recoveryCode",newCode);
  }
  @PostMapping("/delete") public void delete(@Valid @RequestBody PasswordInput input,
                                      HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    UUID id=session.existing(req).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    var saved=db.sql("SELECT password_hash FROM traveler WHERE id=:id AND username IS NOT NULL")
      .param("id",id).query(String.class).optional()
      .orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    if(!passwords.matches(input.password(),saved)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"비밀번호를 확인해 주세요.");
    List<String> keys=tx.execute(status->{
      List<String> objects=db.sql("SELECT object_key FROM photo WHERE owner_id=:id")
        .param("id",id).query(String.class).list();
      db.sql("DELETE FROM trip WHERE owner_id=:id").param("id",id).update();
      db.sql("DELETE FROM photo WHERE owner_id=:id").param("id",id).update();
      db.sql("DELETE FROM traveler WHERE id=:id").param("id",id).update();
      return objects;
    });
    session.clear(req,res);
    for(String key:keys) {
      try { Files.deleteIfExists(mediaRoot.resolve(key)); }
      catch(java.io.IOException ignored) { /* leftover file can be cleaned by media reconciliation */ }
    }
  }
}
