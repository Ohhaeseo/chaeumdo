package kr.chaeummdo;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

// Sends the Korean reason of a ResponseStatusException to the app as {status, message}.
// Other exceptions keep Spring's default error body, which hides internal messages.
@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String,Object>> status(ResponseStatusException e) {
    Map<String,Object> body = new LinkedHashMap<>();
    body.put("status", e.getStatusCode().value());
    if (e.getReason() != null) body.put("message", e.getReason());
    return ResponseEntity.status(e.getStatusCode()).headers(e.getHeaders()).body(body);
  }
}
