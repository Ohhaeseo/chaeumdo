import { ImagePlus, MapPin, Pencil, UserRound } from "lucide-react";
import { regionById, regionIdsForTrip, type Region, type Trip } from "../data";
import { dateRange, dayDate } from "../dates.mjs";
import PlaceMap from "../PlaceMap";
import { Header } from "../ui";

export default function TripDetailScreen({ trip, region, onBack, onMenu, onEdit }: {
  trip: Trip;
  region: Region;
  onBack: () => void;
  onMenu: () => void;
  onEdit: () => void;
}) {
  const regionIds = regionIdsForTrip(trip);
  // Places with a searched location get numbered pins, in visiting order, on the map and in the itinerary.
  const mappedPlaces = trip.days.flatMap((places, day) => places.flatMap((name, index) => {
    const location = trip.placeLocations?.[day]?.[index];
    return location ? [{ key: `${day}-${index}`, name, location }] : [];
  }));
  const pinNumbers = new Map(mappedPlaces.map((place, index) => [place.key, index + 1]));
  const companions = trip.companion ? trip.companion.split(",").map(name => name.trim()).filter(Boolean) : ["나"];
  return <>
    <Header back={onBack} title={regionIds.length > 1 ? `여행 지역 ${regionIds.length}곳` : regionById.get(trip.regionId)?.fullName || region.fullName} menu={onMenu} />
    <div className="detail-hero"><img src={trip.photoUrl} alt="여행 대표 사진" /></div>
    <section className="trip-route">
      <h2>여행 지역</h2>
      <div>{regionIds.map((id, index) => <span key={id}><i>{index + 1}</i>{regionById.get(id)?.fullName || id}</span>)}</div>
    </section>
    {mappedPlaces.length > 0 && <PlaceMap places={mappedPlaces.map(({ name, location }) => ({ name, location }))} />}
    <section className="companions">
      <h2>동행자</h2>
      <div className="companion-row">
        {companions.map((name, index) => <div className="companion" key={index}><span><UserRound size={20} /></span><small>{name}</small></div>)}
      </div>
    </section>
    <section className="itinerary">
      <h2>여행 기록 <small>{dateRange(trip.startDate, trip.endDate)}</small></h2>
      {trip.days.map((places, day) => <div className="day" key={day}>
        <div className="day-title"><span className="day-dot" /> DAY {day + 1} <small>{dayDate(trip.startDate, day)}</small></div>
        {places.length ? places.map((place, index) => {
          const photo = trip.placePhotoUrls?.[day]?.[index];
          const pin = pinNumbers.get(`${day}-${index}`);
          return <div className="place-card" key={index}>
            <span className={pin ? "place-icon mapped" : "place-icon"}>{pin || <MapPin size={15} fill="currentColor" />}</span>
            <b>{place}</b>
            <span className="place-photo">{photo ? <img src={trip.placePhotoThumbnailUrls?.[day]?.[index] || photo} alt={`${place} 사진`} /> : <ImagePlus size={17} />}</span>
          </div>;
        }) : <p className="day-empty">기록한 장소가 없어요.</p>}
      </div>)}
    </section>
    <button className="edit-fab" onClick={onEdit} aria-label="여행 기록 수정"><Pencil size={20} /></button>
  </>;
}
