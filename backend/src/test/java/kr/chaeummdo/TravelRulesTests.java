package kr.chaeummdo;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;
class TravelRulesTests {
  @Test void inclusiveDaysAndLeapYear() {
    assertEquals(3,TravelController.duration(LocalDate.of(2024,2,28),LocalDate.of(2024,3,1)));
    assertEquals(1,TravelController.duration(LocalDate.of(2026,9,10),LocalDate.of(2026,9,10)));
  }
  @Test void reversedAndExcessiveDatesAreRejected() {
    assertThrows(org.springframework.web.server.ResponseStatusException.class,()->TravelController.duration(LocalDate.of(2026,9,12),LocalDate.of(2026,9,10)));
    assertThrows(org.springframework.web.server.ResponseStatusException.class,()->TravelController.duration(LocalDate.of(2025,1,1),LocalDate.of(2026,1,2)));
  }
}
