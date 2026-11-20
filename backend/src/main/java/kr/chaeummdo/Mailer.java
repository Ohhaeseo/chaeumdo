package kr.chaeummdo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import java.util.UUID;

// Sends account mail through SMTP when app.mail.host is set (docs/DEPLOYMENT.md).
// Without SMTP, mail can be written to app.mail.outbox (tests) or, in development only, to the log.
// Production with neither has no mail, and email recovery answers 503.
@Component
public class Mailer {
  private static final Logger log = LoggerFactory.getLogger(Mailer.class);

  private final JavaMailSenderImpl smtp;
  private final String from;
  private final Path outbox;
  private final boolean logOnly;

  public Mailer(@Value("${app.mail.host:}") String host, @Value("${app.mail.port:587}") int port,
                @Value("${app.mail.username:}") String username, @Value("${app.mail.password:}") String password,
                @Value("${app.mail.starttls:true}") boolean starttls, @Value("${app.mail.from:}") String from,
                @Value("${app.mail.outbox:}") String outbox, @Value("${app.mail.log-only:false}") boolean logOnly,
                @Value("${app.public-url:}") String publicUrl) {
    // Without a sender address, mail comes from no-reply at the site's own domain.
    String domain = publicUrl.replaceFirst("^https?://", "").replaceFirst("[:/].*$", "");
    this.from = !from.isBlank() ? from : "no-reply@" + (domain.isBlank() ? "chaeummdo.local" : domain);
    this.outbox = outbox.isBlank() ? null : Path.of(outbox).toAbsolutePath().normalize();
    this.logOnly = logOnly;
    if (host.isBlank()) {
      this.smtp = null;
      return;
    }
    smtp = new JavaMailSenderImpl();
    smtp.setHost(host);
    smtp.setPort(port);
    smtp.setDefaultEncoding("UTF-8");
    if (!username.isBlank()) {
      smtp.setUsername(username);
      smtp.setPassword(password);
    }
    Properties properties = smtp.getJavaMailProperties();
    properties.put("mail.smtp.auth", String.valueOf(!username.isBlank()));
    properties.put("mail.smtp.starttls.enable", String.valueOf(starttls));
    properties.put("mail.smtp.connectiontimeout", "10000");
    properties.put("mail.smtp.timeout", "10000");
    properties.put("mail.smtp.writetimeout", "10000");
  }

  public boolean available() {
    return smtp != null || outbox != null || logOnly;
  }

  public void send(String to, String subject, String body) throws IOException {
    if (smtp != null) {
      var message = new SimpleMailMessage();
      message.setFrom(from);
      message.setTo(to);
      message.setSubject(subject);
      message.setText(body);
      smtp.send(message);
    } else if (outbox != null) {
      Files.createDirectories(outbox);
      Files.writeString(outbox.resolve(System.currentTimeMillis() + "-" + UUID.randomUUID() + ".txt"),
        "To: " + to + "\nSubject: " + subject + "\n\n" + body, StandardCharsets.UTF_8);
    } else if (logOnly) {
      log.info("Mail (not sent, development only) to {}: {}\n{}", to, subject, body);
    } else {
      throw new IllegalStateException("No mail transport configured");
    }
  }
}
