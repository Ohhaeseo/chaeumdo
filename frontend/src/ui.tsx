import { ArrowLeft, MapPin, MoreHorizontal } from "lucide-react";

export function Header({ back, title, menu }: { back: () => void; title?: string; menu?: () => void }) {
  return <header className="inner-header">
    <button aria-label="뒤로" onClick={back}><ArrowLeft size={22} strokeWidth={1.3} /></button>
    <h1>{title}</h1>
    {menu ? <button aria-label="더보기" onClick={menu}><MoreHorizontal size={22} /></button> : <span />}
  </header>;
}

export function Attribution() {
  return <p className="attribution">지도 경계: 국가공간정보포털 · V-World　|　글꼴: S-Core 에스코어 드림</p>;
}

export function SplashView() {
  return <div className="page-canvas">
    <div className="phone splash-phone">
      <div className="splash-brand">
        <h1>채움도</h1>
        <div className="splash-icon" aria-hidden="true"><MapPin size={38} strokeWidth={1.15} /></div>
      </div>
      <Attribution />
    </div>
  </div>;
}
