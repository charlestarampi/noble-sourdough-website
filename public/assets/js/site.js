// Noble Sourdough: small enhancements. The site works without this file:
// the menu is shown and the range slider can be swiped/scrolled.
document.documentElement.classList.add("js");

// Phone menu
document.querySelectorAll(".nav-toggle").forEach((button) => {
  const nav = document.getElementById(button.getAttribute("aria-controls"));
  if (!nav) return;
  const set = (open) => {
    nav.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  button.addEventListener("click", () => set(!nav.classList.contains("is-open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
});

// Range slider: arrows and "01 /05" counter
document.querySelectorAll("[data-slider]").forEach((root) => {
  const track = root.querySelector(".slider-track");
  const cards = [...track.children];
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const current = root.querySelector("[data-current]");
  const pad = (n) => String(n).padStart(2, "0");

  const index = () => {
    const left = track.getBoundingClientRect().left;
    let best = 0, bestDist = Infinity;
    cards.forEach((card, i) => {
      const d = Math.abs(card.getBoundingClientRect().left - left);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  };
  const update = () => {
    const i = index();
    if (current) current.textContent = pad(i + 1);
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = atEnd;
  };
  const go = (step) => {
    const target = cards[Math.max(0, Math.min(cards.length - 1, index() + step))];
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  prev?.addEventListener("click", () => go(-1));
  next?.addEventListener("click", () => go(1));
  track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  addEventListener("resize", update);
  update();
});
