package kr.chaeummdo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.beans.factory.annotation.Value;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.io.*;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;

@RestController
@RequestMapping("/api")
public class TravelController {
  private final JdbcClient db;
  private final TransactionTemplate tx;
  private final TravelerSession session;
  private final Path root;
  public TravelController(JdbcClient db, TransactionTemplate tx, TravelerSession session, @Value("${app.media-root}") String root) throws IOException {
    this.db = db; this.tx = tx; this.session = session; this.root = Path.of(root).toAbsolutePath().normalize();
    Files.createDirectories(this.root);
  }
  private UUID owner(HttpServletRequest req) {
    return session.require(req);
  }
  public record Region(String id, String name, boolean recommended, String introduction, String parentId, String level) {}
  public record Trip(UUID id, String regionId, List<String> regionIds, String photoUrl, String thumbnailUrl, LocalDate startDate, LocalDate endDate,
    String companion, List<List<String>> days, List<List<String>> placePhotoUrls, List<List<PlaceLocation>> placeLocations) {}
  public record PlaceLocation(Double latitude, Double longitude, String address, String source, String sourceId) {}
  public record TripInput(@NotNull UUID requestId, @NotBlank @Size(max=10) String regionId, @Size(max=10) List<@NotBlank @Size(max=10) String> regionIds, @NotNull UUID photoId,
    @NotNull LocalDate startDate, @NotNull LocalDate endDate, @Size(max=200) String companion,
    @NotNull @Size(max=366) List<@NotNull @Size(max=50) List<@NotBlank @Size(max=200) String>> days,
    List<List<UUID>> placePhotoIds, List<List<PlaceLocation>> placeLocations) {}
  public record TripUpdate(@NotBlank @Size(max=10) String regionId, @Size(max=10) List<@NotBlank @Size(max=10) String> regionIds, UUID photoId,
    @NotNull LocalDate startDate, @NotNull LocalDate endDate, @Size(max=200) String companion,
    @NotNull @Size(max=366) List<@NotNull @Size(max=50) List<@NotBlank @Size(max=200) String>> days,
    List<List<UUID>> placePhotoIds, List<List<PlaceLocation>> placeLocations) {}
  public static int duration(LocalDate start, LocalDate end) {
    long n = ChronoUnit.DAYS.between(start, end) + 1;
    if (n < 1 || n > 366) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"여행 기간은 1~366일로 입력해 주세요.");
    return (int)n;
  }
  // Region data is public reference data; reading it no longer creates a session.
  @GetMapping("/regions") public List<Region> regions() {
    return db.sql("SELECT id,name,recommended,introduction,parent_id,level FROM region ORDER BY level DESC,parent_id NULLS FIRST,name").query(Region.class).list();
  }
  @GetMapping("/trips") public List<Trip> trips(HttpServletRequest req) {
    UUID user = owner(req);
    return db.sql("SELECT * FROM trip WHERE owner_id=:owner ORDER BY start_date DESC,created_at DESC")
      .param("owner",user).query((rs,n) -> readTrip(rs.getObject("id", UUID.class),rs.getString("region_id"),rs.getObject("cover_photo_id",UUID.class),rs.getDate("start_date").toLocalDate(),rs.getDate("end_date").toLocalDate(),rs.getString("companion"))).list();
  }
  private Trip readTrip(UUID id,String region,UUID photo,LocalDate start,LocalDate end,String companion) {
    List<String> regionIds=db.sql("SELECT region_id FROM trip_region WHERE trip_id=:id ORDER BY position")
      .param("id",id).query(String.class).list();
    if(regionIds.isEmpty()) regionIds=List.of(region);
    List<List<String>> days = new ArrayList<>();
    List<List<String>> placePhotoUrls = new ArrayList<>();
    List<List<PlaceLocation>> placeLocations = new ArrayList<>();
    for(int day=1;day<=duration(start,end);day++) {
      var rows=db.sql("SELECT name,photo_id,latitude,longitude,place_address,place_source,place_source_id FROM trip_place WHERE trip_id=:id AND day_number=:day ORDER BY position")
        .param("id",id).param("day",day).query().listOfRows();
      days.add(rows.stream().map(row->(String)row.get("name")).toList());
      placePhotoUrls.add(rows.stream().map(row->{
        UUID placePhoto=(UUID)row.get("photo_id");
        return placePhoto==null?null:"/api/photos/"+placePhoto;
      }).toList());
      placeLocations.add(rows.stream().map(row->{
        if(row.get("latitude")==null || row.get("longitude")==null) return null;
        return new PlaceLocation(((Number)row.get("latitude")).doubleValue(),((Number)row.get("longitude")).doubleValue(),
          Objects.toString(row.get("place_address"),""),Objects.toString(row.get("place_source"),"OpenStreetMap"),Objects.toString(row.get("place_source_id"),""));
      }).toList());
    }
    return new Trip(id,region,regionIds,"/api/photos/"+photo,"/api/photos/"+photo+"/thumbnail",start,end,companion,days,placePhotoUrls,placeLocations);
  }
  private List<String> normalizedRegions(String primary,List<String> input) {
    List<String> result=(input==null || input.isEmpty())?List.of(primary):input.stream().map(String::trim).toList();
    if(result.isEmpty() || result.size()>10 || result.stream().anyMatch(String::isBlank) || new HashSet<>(result).size()!=result.size() || !result.get(0).equals(primary))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"여행 지역과 순서를 확인해 주세요.");
    return result;
  }
  private void validateRegions(List<String> regionIds) {
    var placeholders=regionIds.stream().map(id->"?").collect(java.util.stream.Collectors.joining(","));
    if(db.sql("SELECT count(*) FROM region WHERE id IN ("+placeholders+")").params(regionIds.toArray()).query(Integer.class).single()!=regionIds.size())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"지역을 확인해 주세요.");
  }
  private void saveRegions(UUID tripId,List<String> regionIds) {
    for(int i=0;i<regionIds.size();i++) db.sql("INSERT INTO trip_region(trip_id,region_id,position) VALUES(:trip,:region,:position)")
      .param("trip",tripId).param("region",regionIds.get(i)).param("position",i).update();
  }
  private void validatePlacePhotos(List<List<String>> days,List<List<UUID>> photoIds,UUID owner) {
    if(photoIds==null) return;
    if(photoIds.size()!=days.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소 사진과 DAY 수가 일치하지 않습니다.");
    for(int i=0;i<days.size();i++) {
      if(photoIds.get(i)==null || photoIds.get(i).size()!=days.get(i).size())
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소와 사진 수가 일치하지 않습니다.");
      for(UUID photo:photoIds.get(i)) if(photo!=null && db.sql("SELECT count(*) FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'")
        .param("id",photo).param("owner",owner).query(Integer.class).single()!=1)
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소 사진을 다시 선택해 주세요.");
    }
  }
  private void validatePlaceLocations(List<List<String>> days,List<List<PlaceLocation>> locations) {
    if(locations==null) return;
    if(locations.size()!=days.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소와 지도 위치의 DAY 수가 일치하지 않습니다.");
    for(int i=0;i<days.size();i++) {
      if(locations.get(i)==null || locations.get(i).size()!=days.get(i).size())
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소와 지도 위치 수가 일치하지 않습니다.");
      for(PlaceLocation location:locations.get(i)) if(location!=null) {
        if(location.latitude()==null || location.longitude()==null || !Double.isFinite(location.latitude()) || !Double.isFinite(location.longitude())
          || location.latitude()<-90 || location.latitude()>90 || location.longitude()<-180 || location.longitude()>180
          || location.address()==null || location.address().length()>500 || !"OpenStreetMap".equals(location.source())
          || location.sourceId()==null || location.sourceId().isBlank() || location.sourceId().length()>120)
          throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"장소의 지도 위치를 다시 선택해 주세요.");
      }
    }
  }
  private void saveDays(UUID tripId,UUID owner,List<List<String>> days,List<List<UUID>> photoIds,List<List<PlaceLocation>> locations) {
    for(int i=0;i<days.size();i++) {
      db.sql("INSERT INTO trip_day(trip_id,day_number) VALUES(:id,:day)").param("id",tripId).param("day",i+1).update();
      for(int j=0;j<days.get(i).size();j++) {
        UUID photo=photoIds==null?null:photoIds.get(i).get(j);
        PlaceLocation location=locations==null?null:locations.get(i).get(j);
        db.sql("INSERT INTO trip_place(trip_id,day_number,position,name,owner_id,photo_id,latitude,longitude,place_address,place_source,place_source_id) VALUES(:id,:day,:position,:name,:owner,:photo,:latitude,:longitude,:address,:source,:sourceId)")
          .param("id",tripId).param("day",i+1).param("position",j).param("name",days.get(i).get(j).trim())
          .param("owner",owner).param("photo",photo).param("latitude",location==null?null:location.latitude()).param("longitude",location==null?null:location.longitude())
          .param("address",location==null?null:location.address()).param("source",location==null?null:location.source()).param("sourceId",location==null?null:location.sourceId()).update();
      }
    }
  }
  private List<List<UUID>> existingPlacePhotoIds(UUID tripId,List<List<String>> days) {
    List<List<UUID>> result=new ArrayList<>();
    for(int i=0;i<days.size();i++) {
      List<UUID> day=new ArrayList<>(Collections.nCopies(days.get(i).size(),null));
      for(var row:db.sql("SELECT position,photo_id FROM trip_place WHERE trip_id=:id AND day_number=:day")
        .param("id",tripId).param("day",i+1).query().listOfRows()) {
        int position=(Integer)row.get("position");
        if(position<day.size()) day.set(position,(UUID)row.get("photo_id"));
      }
      result.add(day);
    }
    return result;
  }
  private List<List<PlaceLocation>> existingPlaceLocations(UUID tripId,List<List<String>> days) {
    List<List<PlaceLocation>> result=new ArrayList<>();
    for(int i=0;i<days.size();i++) {
      List<PlaceLocation> day=new ArrayList<>(Collections.nCopies(days.get(i).size(),null));
      for(var row:db.sql("SELECT position,latitude,longitude,place_address,place_source,place_source_id FROM trip_place WHERE trip_id=:id AND day_number=:day")
        .param("id",tripId).param("day",i+1).query().listOfRows()) {
        int position=(Integer)row.get("position");
        if(position<day.size() && row.get("latitude")!=null && row.get("longitude")!=null) day.set(position,new PlaceLocation(
          ((Number)row.get("latitude")).doubleValue(),((Number)row.get("longitude")).doubleValue(),Objects.toString(row.get("place_address"),""),
          Objects.toString(row.get("place_source"),"OpenStreetMap"),Objects.toString(row.get("place_source_id"),"")));
      }
      result.add(day);
    }
    return result;
  }
  @GetMapping("/stats") public Map<String,Object> stats(HttpServletRequest req) {
    return db.sql("SELECT (SELECT count(DISTINCT linked.region_id) FROM trip_region linked JOIN trip linked_trip ON linked_trip.id=linked.trip_id WHERE linked_trip.owner_id=:owner) AS regions,count(*) AS trips,coalesce(sum(end_date-start_date+1),0) AS days FROM trip WHERE owner_id=:owner")
      .param("owner",owner(req)).query().singleRow();
  }
  @PostMapping("/trips") public Map<String,UUID> create(@Valid @RequestBody TripInput input,HttpServletRequest req) {
    UUID user = owner(req);
    List<String> regionIds=normalizedRegions(input.regionId(),input.regionIds());
    if(input.days().size()!=duration(input.startDate(),input.endDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"여행 일수와 DAY 수가 일치하지 않습니다.");
    validatePlacePhotos(input.days(),input.placePhotoIds(),user);
    validatePlaceLocations(input.days(),input.placeLocations());
    validateRegions(regionIds);
    return tx.execute(status -> {
      // Serialize retries for the same traveler, keeping the idempotency check atomic.
      db.sql("SELECT id FROM traveler WHERE id=:id FOR UPDATE").param("id",user).query(UUID.class).single();
      var existing=db.sql("SELECT id FROM trip WHERE owner_id=:owner AND request_id=:request").param("owner",user).param("request",input.requestId()).query(UUID.class).optional();
      if(existing.isPresent()) return Map.of("id",existing.get());
      if(db.sql("SELECT count(*) FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'").param("id",input.photoId()).param("owner",user).query(Integer.class).single()!=1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"사진을 다시 선택해 주세요.");
      UUID id=UUID.randomUUID();
      db.sql("INSERT INTO trip(id,owner_id,region_id,cover_photo_id,start_date,end_date,companion,request_id) VALUES(:id,:owner,:region,:photo,:start,:end,:companion,:request)")
        .param("id",id).param("owner",user).param("region",input.regionId()).param("photo",input.photoId()).param("start",input.startDate()).param("end",input.endDate()).param("companion",Objects.requireNonNullElse(input.companion(),"")).param("request",input.requestId()).update();
      saveRegions(id,regionIds);
      saveDays(id,user,input.days(),input.placePhotoIds(),input.placeLocations());
      return Map.of("id",id);
    });
  }
  @PatchMapping("/trips/{id}") public Map<String,UUID> update(@PathVariable UUID id,@Valid @RequestBody TripUpdate input,
      HttpServletRequest req) {
    UUID user=owner(req);
    List<String> regionIds=normalizedRegions(input.regionId(),input.regionIds());
    if(input.days().size()!=duration(input.startDate(),input.endDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"여행 일수와 DAY 수가 일치하지 않습니다.");
    return tx.execute(status->{
      if(db.sql("SELECT count(*) FROM trip WHERE id=:id AND owner_id=:owner").param("id",id).param("owner",user).query(Integer.class).single()!=1)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
      List<List<UUID>> placePhotos=input.placePhotoIds()==null?existingPlacePhotoIds(id,input.days()):input.placePhotoIds();
      List<List<PlaceLocation>> placeLocations=input.placeLocations()==null?existingPlaceLocations(id,input.days()):input.placeLocations();
      validatePlacePhotos(input.days(),placePhotos,user);
      validatePlaceLocations(input.days(),placeLocations);
      validateRegions(regionIds);
      if(input.photoId()!=null && db.sql("SELECT count(*) FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'").param("id",input.photoId()).param("owner",user).query(Integer.class).single()!=1)
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"사진을 다시 선택해 주세요.");
      db.sql("UPDATE trip SET region_id=:region,cover_photo_id=coalesce(:photo,cover_photo_id),start_date=:start,end_date=:end,companion=:companion WHERE id=:id AND owner_id=:owner")
        .param("region",input.regionId()).param("photo",input.photoId()).param("start",input.startDate()).param("end",input.endDate())
        .param("companion",Objects.requireNonNullElse(input.companion(),"")).param("id",id).param("owner",user).update();
      db.sql("DELETE FROM trip_region WHERE trip_id=:id").param("id",id).update();
      saveRegions(id,regionIds);
      db.sql("DELETE FROM trip_day WHERE trip_id=:id").param("id",id).update();
      saveDays(id,user,input.days(),placePhotos,placeLocations);
      return Map.of("id",id);
    });
  }
  @DeleteMapping("/trips/{id}") public void delete(@PathVariable UUID id,HttpServletRequest req) {
    UUID user=owner(req);
    List<String> objectKeys=tx.execute(status->{
      List<UUID> photos=db.sql("""
        SELECT cover_photo_id FROM trip WHERE id=:id AND owner_id=:owner
        UNION
        SELECT place.photo_id FROM trip_place place
        JOIN trip ON trip.id=place.trip_id
        WHERE trip.id=:id AND trip.owner_id=:owner AND place.photo_id IS NOT NULL
        """).param("id",id).param("owner",user).query(UUID.class).list();
      if(db.sql("DELETE FROM trip WHERE id=:id AND owner_id=:owner").param("id",id).param("owner",user).update()!=1)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
      List<String> keys=new ArrayList<>();
      for(UUID photo:photos) {
        List<String> variants=db.sql("SELECT object_key FROM photo_variant WHERE photo_id=:id").param("id",photo).query(String.class).list();
        var deleted=db.sql("""
          DELETE FROM photo WHERE id=:id AND owner_id=:owner
          AND NOT EXISTS (SELECT 1 FROM trip WHERE cover_photo_id=:id)
          AND NOT EXISTS (SELECT 1 FROM trip_place WHERE photo_id=:id)
          RETURNING object_key
          """).param("id",photo).param("owner",user).query(String.class).optional();
        deleted.ifPresent(key->{keys.add(key);keys.addAll(variants);});
      }
      return keys;
    });
    for(String key:objectKeys) {
      try { Files.deleteIfExists(root.resolve(key)); }
      catch(IOException ignored) { /* leftover file can be cleaned by media reconciliation */ }
    }
  }
  @PostMapping("/photos") public Map<String,UUID> upload(@RequestParam("file") MultipartFile file,HttpServletRequest req) throws IOException {
    UUID user=owner(req);
    if(file.isEmpty() || file.getSize()>15728640) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"사진은 15MB 이하로 선택해 주세요.");
    String format; int width; int height;
    try(var stream=ImageIO.createImageInputStream(file.getInputStream())) {
      var readers=ImageIO.getImageReaders(stream);
      if(!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"JPEG 또는 PNG 사진을 선택해 주세요.");
      var reader=readers.next();
      try { reader.setInput(stream); format=reader.getFormatName().toLowerCase(Locale.ROOT); width=reader.getWidth(0);height=reader.getHeight(0); }
      finally { reader.dispose(); }
    }
    if(!Set.of("jpeg","png").contains(format) || width<1 || height<1 || (long)width*height>40000000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"JPEG·PNG, 4천만 화소 이하 사진을 선택해 주세요.");
    UUID id=UUID.randomUUID(); String key=user+"/"+id+"."+format; Path path=root.resolve(key);
    String thumbnailKey=user+"/"+id+"-thumbnail."+format; Path thumbnailPath=root.resolve(thumbnailKey);
    Files.createDirectories(path.getParent());
    try {
      // Decode and re-encode: verify actual pixels and remove EXIF/location metadata.
      var decoded=ImageIO.read(file.getInputStream());
      if(decoded==null || !ImageIO.write(decoded,format,path.toFile())) throw new IOException("사진을 읽을 수 없습니다.");
      long size=Files.size(path);
      if(size>15728640) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"처리된 사진이 15MB를 넘습니다. 크기를 줄여 주세요.");
      // Maps and record cards read this small copy; it keeps the original's format, so it shares its content type.
      var thumbnail=thumbnail(decoded,THUMBNAIL_EDGE);
      if(!ImageIO.write(thumbnail,format,thumbnailPath.toFile())) throw new IOException("썸네일을 만들 수 없습니다.");
      long thumbnailSize=Files.size(thumbnailPath);
      tx.executeWithoutResult(status->{
        db.sql("INSERT INTO photo(id,owner_id,object_key,content_type,byte_size,width,height) VALUES(:id,:owner,:key,:type,:size,:width,:height)").param("id",id).param("owner",user).param("key",key).param("type","image/"+format).param("size",size).param("width",width).param("height",height).update();
        db.sql("INSERT INTO photo_variant(photo_id,kind,object_key,width,height,byte_size) VALUES(:id,'THUMBNAIL',:key,:width,:height,:size)")
          .param("id",id).param("key",thumbnailKey).param("width",thumbnail.getWidth()).param("height",thumbnail.getHeight()).param("size",thumbnailSize).update();
      });
    } catch(Exception e) { Files.deleteIfExists(path); Files.deleteIfExists(thumbnailPath); throw e; }
    return Map.of("id",id);
  }
  static final int THUMBNAIL_EDGE=320;
  // Shrinks to fit maxEdge without enlarging. Halving in steps keeps bilinear scaling from skipping pixels.
  static BufferedImage thumbnail(BufferedImage source,int maxEdge) {
    double scale=Math.min(1d,(double)maxEdge/Math.max(source.getWidth(),source.getHeight()));
    int width=Math.max(1,(int)Math.round(source.getWidth()*scale)), height=Math.max(1,(int)Math.round(source.getHeight()*scale));
    int type=source.getColorModel().hasAlpha()?BufferedImage.TYPE_INT_ARGB:BufferedImage.TYPE_INT_RGB;
    BufferedImage current=source;
    do {
      var next=new BufferedImage(Math.max(width,current.getWidth()/2),Math.max(height,current.getHeight()/2),type);
      var graphics=next.createGraphics();
      try {
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(current,0,0,next.getWidth(),next.getHeight(),null);
      } finally { graphics.dispose(); }
      current=next;
    } while(current.getWidth()!=width || current.getHeight()!=height);
    return current;
  }
  @GetMapping("/photos/{id}") public ResponseEntity<org.springframework.core.io.Resource> photo(@PathVariable UUID id,HttpServletRequest req) {
    return stored(db.sql("SELECT object_key,content_type FROM photo WHERE id=:id AND owner_id=:owner AND status='READY'").param("id",id).param("owner",owner(req)));
  }
  // Photos uploaded before thumbnails existed have no variant, so the original stands in for them.
  @GetMapping("/photos/{id}/thumbnail") public ResponseEntity<org.springframework.core.io.Resource> thumbnail(@PathVariable UUID id,HttpServletRequest req) {
    return stored(db.sql("""
      SELECT coalesce(variant.object_key,photo.object_key) AS object_key,photo.content_type FROM photo
      LEFT JOIN photo_variant variant ON variant.photo_id=photo.id AND variant.kind='THUMBNAIL'
      WHERE photo.id=:id AND photo.owner_id=:owner AND photo.status='READY'
      """).param("id",id).param("owner",owner(req)));
  }
  private ResponseEntity<org.springframework.core.io.Resource> stored(JdbcClient.StatementSpec query) {
    var photo=query.query().listOfRows().stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
    var resource=new org.springframework.core.io.FileSystemResource(root.resolve((String)photo.get("object_key")));
    // A photo id never points at different bytes, so the owner's browser may keep it; Vary keeps it per session.
    // A thumbnail URL served from the original still shows the same picture, only larger.
    return ResponseEntity.ok().contentType(MediaType.parseMediaType((String)photo.get("content_type")))
      .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable()).header("Vary","Cookie")
      .header("X-Content-Type-Options","nosniff").body(resource);
  }
}
