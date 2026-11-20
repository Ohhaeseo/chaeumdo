package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AccountController {
  private static final Logger log = LoggerFactory.getLogger(AccountController.class);
  static final int RESET_LINK_MINUTES = 30;
  // One recovery mail per account in this window, so the form cannot be used to flood an inbox.
  static final int RESET_MAIL_COOLDOWN_MINUTES = 5;

  private final JdbcClient db;
  private final TravelerSession session;
  private final TransactionTemplate tx;
  private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
  private final PhotoStore photos;
  private final Mailer mailer;
  private final String publicUrl;
  private final String termsVersion;

  public AccountController(JdbcClient db, TravelerSession session, TransactionTemplate tx, PhotoStore photos, Mailer mailer,
                           @Value("${app.public-url:}") String publicUrl, @Value("${app.terms-version:draft-2026-11}") String termsVersion) {
    this.db = db; this.session = session; this.tx = tx; this.photos = photos; this.mailer = mailer;
    this.publicUrl = publicUrl.replaceAll("/+$", ""); this.termsVersion = termsVersion;
  }
  public record Account(String username, String displayName, String email) {}
  public record Registration(@NotBlank @Pattern(regexp="[a-zA-Z0-9_]{4,32}") String username,
    @NotBlank @Size(min=1,max=30) String displayName,
    @NotBlank @Size(min=8,max=72) String password,
    @Email @Size(max=254) String email,
    // The sign-up form asks for the terms, the privacy policy and being 14 or older in one required box.
    @AssertTrue boolean agreedToTerms) {}
  public record Credentials(@NotBlank String username, @NotBlank String password) {}
  public record Recovery(@NotBlank String recoveryCode) {}
  public record Reset(@NotBlank String username, @NotBlank String recoveryCode,
    @NotBlank @Size(min=8,max=72) String newPassword) {}
  public record PasswordInput(@NotBlank String password) {}
  public record EmailChange(@Email @Size(max=254) String email, @NotBlank String password) {}
  public record EmailRecovery(@NotBlank @Email @Size(max=254) String email) {}
  public record EmailReset(@NotBlank @Size(max=128) String token, @NotBlank @Size(min=8,max=72) String newPassword) {}

  private static String normalizedEmail(String email) {
    return email == null || email.isBlank() ? null : email.trim();
  }
  private Account account(UUID id) {
    return db.sql("SELECT username,display_name,email FROM traveler WHERE id=:id AND username IS NOT NULL")
      .param("id",id).query((rs,n)->new Account(rs.getString(1),rs.getString(2),rs.getString(3)))
      .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }

  @GetMapping("/me") public Account me(HttpServletRequest req) {
    return account(session.existing(req).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED)));
  }
  @PostMapping("/register") public Map<String,String> register(@Valid @RequestBody Registration input,
                                          HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    var anonymous = session.existing(req);
    String username = input.username().toLowerCase(java.util.Locale.ROOT);
    String email = normalizedEmail(input.email());
    String code = session.newToken();
    try {
      if(anonymous.isPresent()) {
        // Sessions from before accounts were required keep their records by upgrading in place.
        int updated = db.sql("UPDATE traveler SET username=:username,display_name=:name,password_hash=:password,recovery_code_hash=:recovery,email=:email,terms_agreed_at=now(),terms_version=:terms WHERE id=:id AND username IS NULL")
          .param("username",username).param("name",input.displayName().trim())
          .param("password",passwords.encode(input.password()))
          .param("recovery",TravelerSession.hash(code)).param("email",email).param("terms",termsVersion).param("id",anonymous.get()).update();
        if(updated==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 계정에 연결된 기록입니다.");
      } else {
        // The account and its first session commit together, so the app can go straight to the map.
        UUID id = UUID.randomUUID();
        String password = passwords.encode(input.password());
        tx.executeWithoutResult(status -> {
          db.sql("INSERT INTO traveler(id,username,display_name,password_hash,recovery_code_hash,email,terms_agreed_at,terms_version) VALUES(:id,:username,:name,:password,:recovery,:email,now(),:terms)")
            .param("id",id).param("username",username).param("name",input.displayName().trim())
            .param("password",password).param("recovery",TravelerSession.hash(code)).param("email",email).param("terms",termsVersion).update();
          session.rotate(id,req,res);
        });
      }
    } catch(DuplicateKeyException e) { throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 사용 중인 아이디입니다."); }
    return Map.of("username",username,"displayName",input.displayName().trim(),"recoveryCode",code);
  }
  @PostMapping("/login") public Account login(@Valid @RequestBody Credentials input,
                                       HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    // The lock is compared in SQL: the JDBC row holds a java.sql.Timestamp, and the lock math uses the DB clock too.
    var rows=db.sql("SELECT id,username,display_name,email,password_hash,coalesce(locked_until > now(),false) AS locked FROM traveler WHERE lower(username)=lower(:username)")
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
    return new Account((String)row.get("username"),(String)row.get("display_name"),(String)row.get("email"));
  }
  @PostMapping("/logout") public void logout(HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
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
    return Map.of("recoveryCode",resetPassword(id,input.newPassword(),req,res));
  }
  // A reset may follow a leaked password, so every device is signed out; only this one gets a new session.
  // The recovery code changes too, and the new one is shown once.
  private String resetPassword(UUID id,String newPassword,HttpServletRequest req,HttpServletResponse res) {
    String newCode=session.newToken();
    String password=passwords.encode(newPassword);
    tx.executeWithoutResult(status->{
      db.sql("UPDATE traveler SET password_hash=:password,recovery_code_hash=:recovery,failed_attempts=0,locked_until=NULL WHERE id=:id")
        .param("password",password).param("recovery",TravelerSession.hash(newCode)).param("id",id).update();
      db.sql("DELETE FROM password_reset WHERE traveler_id=:id").param("id",id).update();
      session.revokeAll(id);
      session.rotate(id,req,res);
    });
    return newCode;
  }
  // Changing the address needs the password, so a borrowed signed-in device cannot redirect recovery mail.
  @PutMapping("/email") public Account changeEmail(@Valid @RequestBody EmailChange input,HttpServletRequest req) {
    UUID id=session.require(req);
    String saved=db.sql("SELECT password_hash FROM traveler WHERE id=:id").param("id",id).query(String.class).single();
    if(!passwords.matches(input.password(),saved)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"비밀번호를 확인해 주세요.");
    db.sql("UPDATE traveler SET email=:email WHERE id=:id").param("email",normalizedEmail(input.email())).param("id",id).update();
    return account(id);
  }
  // Always answers the same way, so the form does not tell whether an address belongs to an account.
  @PostMapping("/email-recovery") public Map<String,String> emailRecovery(@Valid @RequestBody EmailRecovery input,HttpServletRequest req) {
    session.checkMutation(req);
    if(!mailer.available() || publicUrl.isBlank())
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"지금은 이메일로 계정을 찾을 수 없어요. 복구 코드로 찾아 주세요.");
    String email=input.email().trim();
    db.sql("DELETE FROM password_reset WHERE expires_at <= now()").update();
    var accounts=db.sql("""
      SELECT id,username FROM traveler t WHERE lower(email)=lower(:email) AND username IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM password_reset r WHERE r.traveler_id=t.id AND r.created_at > now() - make_interval(mins => :cooldown))
      ORDER BY username
      """).param("email",email).param("cooldown",RESET_MAIL_COOLDOWN_MINUTES).query().listOfRows();
    List<String> lines=new ArrayList<>();
    for(var row:accounts) {
      String token=session.newToken();
      db.sql("INSERT INTO password_reset(token_hash,traveler_id,expires_at) VALUES(:hash,:id,now()+make_interval(mins => :minutes))")
        .param("hash",TravelerSession.hash(token)).param("id",row.get("id")).param("minutes",RESET_LINK_MINUTES).update();
      // The token travels after "#", so it never reaches a server log or a Referer header.
      lines.add("아이디: "+row.get("username")+"\n비밀번호 다시 정하기: "+publicUrl+"/reset-password#token="+token);
    }
    if(!lines.isEmpty()) {
      String body="채움도 계정 찾기를 요청하셨어요.\n\n"+String.join("\n\n",lines)
        +"\n\n링크는 "+RESET_LINK_MINUTES+"분 동안, 한 번만 쓸 수 있어요. 요청하지 않으셨다면 이 메일은 무시하셔도 됩니다.";
      try { mailer.send(email,"[채움도] 계정 찾기 안내",body); }
      catch(Exception e) { log.error("Could not send the recovery mail", e); }
    }
    return Map.of("message","입력한 주소로 계정이 있으면 안내 메일을 보냈어요.");
  }
  @PostMapping("/email-reset") public Map<String,String> emailReset(@Valid @RequestBody EmailReset input,
                                                         HttpServletRequest req,HttpServletResponse res) {
    session.checkMutation(req);
    // Consumed on first use: the row is deleted as it is read.
    UUID id=db.sql("DELETE FROM password_reset WHERE token_hash=:hash AND expires_at > now() RETURNING traveler_id")
      .param("hash",TravelerSession.hash(input.token())).query(UUID.class).optional()
      .orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"링크가 만료되었거나 이미 쓰였어요. 다시 요청해 주세요."));
    String code=resetPassword(id,input.newPassword(),req,res);
    return Map.of("recoveryCode",code,"username",account(id).username());
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
      // Variant and map photo rows go with their photo by cascade, so the files are collected first.
      List<String> objects=photos.fileKeysOf(id);
      db.sql("DELETE FROM trip WHERE owner_id=:id").param("id",id).update();
      db.sql("DELETE FROM photo WHERE owner_id=:id").param("id",id).update();
      // traveler_session and password_reset rows cascade, so the account is signed out on every device.
      db.sql("DELETE FROM traveler WHERE id=:id").param("id",id).update();
      return objects;
    });
    session.clear(req,res);
    photos.deleteFiles(keys);
  }
}
