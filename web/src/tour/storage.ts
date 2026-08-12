export const TOUR_FLAG_KEY = "grat_tour";

export function isTourPending() {
  try {
    return sessionStorage.getItem(TOUR_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTourPending(on: boolean) {
  try {
    if (on) sessionStorage.setItem(TOUR_FLAG_KEY, "1");
    else sessionStorage.removeItem(TOUR_FLAG_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
