import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AuthScreen } from "./AuthView";
import { regionById } from "./data";
import { MAP, navFromLocation, parentOf, pathFor, sameNav, type Nav } from "./navigation.mjs";

export type { Nav };
export type Overlay = "menu" | "search" | "cover" | "deleteTrip" | "deleteAccount";

// One browser history entry. depth counts the app's entries behind it: 0 means going back would leave the app.
type Entry = { app: "chaeummdo"; depth: number; nav: Nav; overlay?: Overlay; auth?: AuthScreen; scrollY?: number };

const isEntry = (value: unknown): value is Entry => (value as Entry | null)?.app === "chaeummdo";
const current = () => history.state as Entry;
const fromUrl = () => navFromLocation(location.pathname, location.search, regionById);

// Screens, open sheets and the sign-in sub-screens all live in browser history, so the phone's back button,
// the app's ← and refresh agree. Back closes an open sheet before it leaves a screen.
export function useNavigation() {
  const [nav, setNav] = useState<Nav>(() => isEntry(history.state) ? history.state.nav : fromUrl());
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const authRef = useRef<AuthScreen>("login");
  const scrollTarget = useRef<number | null>(null);

  useEffect(() => {
    history.scrollRestoration = "manual";
    // A refresh keeps the screen but not an open sheet or a half-done sign-up.
    const state: unknown = history.state;
    history.replaceState({ app: "chaeummdo", depth: isEntry(state) ? state.depth : 0, nav } satisfies Entry, "", pathFor(nav));
    const onPop = (event: PopStateEvent) => {
      // The recovery code is shown only once; stepping back would lose it, so the screen stays until it is confirmed.
      if (authRef.current === "recovery-code") {
        const below = isEntry(event.state) ? event.state : current();
        history.pushState({ ...below, depth: below.depth + 1, auth: "recovery-code" } satisfies Entry, "");
        return;
      }
      if (!isEntry(event.state)) {
        const next = fromUrl();
        history.replaceState({ app: "chaeummdo", depth: 0, nav: next } satisfies Entry, "", pathFor(next));
        show(next, 0);
        setOverlay(null);
        setAuth("login");
        return;
      }
      show(event.state.nav, event.state.scrollY ?? 0);
      setOverlay(event.state.overlay ?? null);
      setAuth(event.state.auth ?? "login");
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // A new screen starts at the top; one reached by going back returns to where it was left.
  useLayoutEffect(() => {
    window.scrollTo({ top: scrollTarget.current ?? 0, behavior: "auto" });
    scrollTarget.current = null;
  }, [nav]);

  function show(next: Nav, scrollY: number) {
    setNav(previous => {
      if (sameNav(previous, next)) return previous;
      scrollTarget.current = scrollY;
      return next;
    });
  }
  function setAuth(next: AuthScreen) {
    authRef.current = next;
    setAuthScreen(next);
  }

  function go(kind: "push" | "replace", next: Nav) {
    const entry = current();
    if (kind === "push" && !entry.overlay) {
      history.replaceState({ ...entry, scrollY: window.scrollY } satisfies Entry, "");
      history.pushState({ app: "chaeummdo", depth: entry.depth + 1, nav: next } satisfies Entry, "", pathFor(next));
    } else {
      // Leaving from an open sheet puts the new screen in the sheet's place, so back skips the closed sheet.
      history.replaceState({ app: "chaeummdo", depth: entry.depth, nav: next } satisfies Entry, "", pathFor(next));
    }
    setOverlay(null);
    show(next, 0);
  }

  return {
    nav,
    overlay,
    authScreen,
    push: (next: Nav) => go("push", next),
    replace: (next: Nav) => go("replace", next),
    // The app's ← steps back like the browser does, closing an open sheet on the way. A screen opened from
    // a link has nothing of ours behind it, so ← goes one level up instead of leaving the app.
    back() {
      const entry = current();
      const steps = entry.overlay ? 2 : 1;
      if (entry.depth >= steps) history.go(-steps);
      else go("replace", parentOf(nav, regionById));
    },
    // Goes back `steps` entries and resolves once the screen there is shown, e.g. to leave a deleted trip.
    // Without enough entries behind, it shows `fallback` in place of the current one.
    leave(steps: number, fallback: Nav) {
      if (current().depth < steps) {
        go("replace", fallback);
        return Promise.resolve();
      }
      return new Promise<void>(resolve => {
        addEventListener("popstate", () => resolve(), { once: true });
        history.go(-steps);
      });
    },
    openOverlay(next: Overlay) {
      const entry = current();
      if (entry.overlay) history.replaceState({ ...entry, overlay: next } satisfies Entry, "");
      else {
        history.replaceState({ ...entry, scrollY: window.scrollY } satisfies Entry, "");
        history.pushState({ app: "chaeummdo", depth: entry.depth + 1, nav: entry.nav, overlay: next } satisfies Entry, "");
      }
      setOverlay(next);
    },
    closeOverlay() {
      if (current().overlay) history.back();
      else setOverlay(null);
    },
    // Sign-in sub-screens: register and recovery open over login, so back returns to login.
    showAuth(next: AuthScreen) {
      const entry = current();
      if (next === "login") {
        authRef.current = "login";
        if (entry.auth) history.back();
        else setAuth("login");
        return;
      }
      if (next === "recovery-code" || entry.auth) history.replaceState({ ...entry, auth: next } satisfies Entry, "");
      else history.pushState({ ...entry, depth: entry.depth + 1, auth: next } satisfies Entry, "");
      setAuth(next);
    },
    // Signed in from a sub-screen: drop its entry so back from the map does not land on the old form.
    finishAuth() {
      const entry = current();
      authRef.current = "login";
      setAuthScreen("login");
      if (entry.auth) history.back();
    },
  };
}

export { MAP };
