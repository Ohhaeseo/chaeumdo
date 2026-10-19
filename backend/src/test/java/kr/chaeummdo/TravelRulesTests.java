package kr.chaeummdo;
import org.junit.jupiter.api.Test;
import java.awt.image.BufferedImage;
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
  @Test void thumbnailFitsLongEdgeWithoutEnlarging() {
    var landscape=TravelController.thumbnail(new BufferedImage(2048,1536,BufferedImage.TYPE_3BYTE_BGR),320);
    assertEquals(320,landscape.getWidth()); assertEquals(240,landscape.getHeight());
    var portrait=TravelController.thumbnail(new BufferedImage(1536,2048,BufferedImage.TYPE_3BYTE_BGR),320);
    assertEquals(240,portrait.getWidth()); assertEquals(320,portrait.getHeight());
    var small=TravelController.thumbnail(new BufferedImage(200,100,BufferedImage.TYPE_3BYTE_BGR),320);
    assertEquals(200,small.getWidth()); assertEquals(100,small.getHeight());
    var sliver=TravelController.thumbnail(new BufferedImage(20000,10,BufferedImage.TYPE_3BYTE_BGR),320);
    assertEquals(320,sliver.getWidth()); assertEquals(1,sliver.getHeight());
  }
  @Test void thumbnailKeepsTransparencyAndColor() {
    var source=new BufferedImage(640,640,BufferedImage.TYPE_INT_ARGB);
    for(int y=0;y<640;y++) for(int x=0;x<640;x++) source.setRGB(x,y,x<320?0x00000000:0xFFCC3311);
    var result=TravelController.thumbnail(source,320);
    assertTrue(result.getColorModel().hasAlpha());
    assertEquals(0,result.getRGB(10,160)>>>24);
    assertEquals(0xFFCC3311,result.getRGB(310,160));
  }
}
