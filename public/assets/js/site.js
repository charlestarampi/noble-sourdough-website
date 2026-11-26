// Noble Sourdough: motion and small interactions. No libraries.
// The site is complete without this file; it only adds movement and filters.
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Split headings into words (for the rising reveal) ---------- */
  const splitWords = (el) => {
    let w = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const outer = document.createElement("span"); outer.className = "w";
            const inner = document.createElement("span"); inner.textContent = part;
            inner.style.setProperty("--w", w++);
            outer.append(inner); frag.append(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
  };
  $$("[data-split]").forEach(splitWords);

  /* ---------- Reveal on scroll ----------
     A position check rather than IntersectionObserver: masked elements start
     fully clipped, and the observer treats a fully clipped element as never
     visible. Elements hidden by the catalogue filter (no size) are skipped. */
  let pending = $$("[data-reveal], [data-split]");
  const reveal = () => {
    if (!pending.length) return;
    const line = innerHeight * 0.92;
    pending = pending.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) return true;
      if (r.top < line && r.bottom > 0) { el.classList.add("is-in"); return false; }
      if (r.bottom <= 0) { el.classList.add("is-in"); return false; } // jumped past it
      return true;
    });
  };
  if (reduce) { pending.forEach((el) => el.classList.add("is-in")); pending = []; }

  /* ---------- Statement text that fills in as you scroll ---------- */
  const scrubs = $$("[data-scrub]").map((el) => {
    const words = [];
    const walk = (node) => [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement("span"); s.className = "word"; s.textContent = part;
          words.push(s); frag.append(s);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    });
    walk(el);
    return { el, words };
  });

  /* ---------- Parallax ---------- */
  const parallax = $$("[data-parallax]").map((el) => ({ el, speed: parseFloat(el.dataset.parallax) || 0.1 }));
  const patterns = $$(".pattern");

  /* ---------- Header: solid after the top, hides while scrolling down ---------- */
  const header = $("[data-header]");
  let lastY = scrollY;

  let ticking = false;
  const onScroll = () => {
    const y = scrollY;
    if (header) {
      header.classList.toggle("is-solid", y > 40);
      const goingDown = y > lastY + 4, goingUp = y < lastY - 4;
      if (!document.body.classList.contains("menu-open")) {
        if (goingDown && y > 400) header.classList.add("is-hidden");
        else if (goingUp || y < 400) header.classList.remove("is-hidden");
      }
      document.body.classList.toggle("header-visible", !header.classList.contains("is-hidden") && y > 40);
    }
    lastY = y;
    if (!reduce) {
      parallax.forEach(({ el, speed }) => {
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2 - innerHeight / 2;
        el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(1)}px, 0)`;
      });
      patterns.forEach((el) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--pattern-y", `${(r.top * -0.08).toFixed(1)}px`);
      });
    }
    reveal();
    scrubs.forEach(({ el, words }) => {
      const r = el.getBoundingClientRect();
      const progress = reduce ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
      const on = Math.round(progress * words.length);
      words.forEach((w, i) => w.classList.toggle("is-on", i < on));
    });
    ticking = false;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  /* ---------- Phone menu ---------- */
  const toggle = $(".menu-toggle");
  if (toggle) {
    const setMenu = (open) => {
      document.body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector(".visually-hidden").textContent = open ? "Close menu" : "Menu";
    };
    toggle.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
    addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    $$(".site-nav a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  }

  /* ---------- Horizontal rail (category cards) ---------- */
  $$("[data-rail]").forEach((rail) => {
    const track = $(".rail-track", rail);
    const prev = $("[data-rail-prev]", rail), next = $("[data-rail-next]", rail);
    const step = () => track.clientWidth * 0.8;
    const update = () => {
      prev.disabled = track.scrollLeft < 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: reduce ? "auto" : "smooth" }));
    next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: reduce ? "auto" : "smooth" }));
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    addEventListener("resize", update); update();
  });

  /* ---------- Reels: play in place ---------- */
  $$("[data-reel]").forEach((reel) => {
    const video = $("video", reel), button = $(".reel-play", reel);
    button.addEventListener("click", () => {
      $$("[data-reel] video").forEach((v) => { if (v !== video) { v.pause(); v.closest("[data-reel]").classList.remove("is-playing"); v.controls = false; } });
      reel.classList.add("is-playing"); video.controls = true; video.play();
    });
    video.addEventListener("ended", () => { reel.classList.remove("is-playing"); video.controls = false; });
  });

  /* ---------- Catalogue: category chips + search ---------- */
  const cat = $("[data-catalogue]");
  if (cat) {
    const chips = $$(".chip");
    const search = $("[data-catalogue-search]");
    const count = $("[data-catalogue-count]");
    const empty = $("[data-catalogue-empty]");
    const products = $$(".product", cat);
    const categories = $$("[data-category]", cat);
    const groups = $$("[data-group]", cat);
    let filter = "all";

    const apply = (animate = true) => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      products.forEach((p) => {
        const inCat = filter === "all" || p.closest("[data-category]").dataset.category === filter;
        const match = !q || q.split(/\s+/).every((t) => p.dataset.search.includes(t));
        const show = inCat && match;
        if (show && p.hidden && animate && !reduce) {
          p.animate([{ opacity: 0, transform: "translateY(16px) scale(0.98)" }, { opacity: 1, transform: "none" }],
                    { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)", delay: Math.min(shown, 12) * 30, fill: "backwards" });
        }
        p.hidden = !show;
        if (show) { shown++; p.classList.add("is-in"); }
      });
      categories.forEach((c) => { c.hidden = !$$(".product", c).some((p) => !p.hidden); });
      groups.forEach((g) => { g.hidden = !$$("[data-category]", g).some((c) => !c.hidden); });
      requestAnimationFrame(onScroll); // reveal headings that just came into view
      empty.hidden = shown > 0;
      count.textContent = `${shown} product${shown === 1 ? "" : "s"}`;
    };

    chips.forEach((chip) => chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      chips.forEach((c) => { const on = c === chip; c.classList.toggle("is-active", on); c.setAttribute("aria-pressed", String(on)); });
      chip.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", filter === "all" ? location.pathname : `#${filter}`);
      apply();
      const top = $(".cat-body").getBoundingClientRect().top + scrollY - 140;
      if (scrollY > top) scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    }));
    search.addEventListener("input", () => apply());

    // Arriving from a category card (/catalogue#croissants) selects that category.
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const chip = chips.find((c) => c.dataset.filter === fromHash);
    if (chip) {
      filter = fromHash;
      chips.forEach((c) => { const on = c === chip; c.classList.toggle("is-active", on); c.setAttribute("aria-pressed", String(on)); });
      const row = chip.parentElement; // bring the chosen chip into view in the chip row only
      row.scrollLeft = chip.offsetLeft - row.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    }
    apply(false);
    initProductView(cat, products);
  }

  function initProductView(catalogue, products) {
    const dialog = $("[data-product-view]");
    if (!dialog || typeof dialog.showModal !== "function") return;

    const view = (part) => $(`[data-view-${part}]`, dialog);
    const stage = view("stage");
    const content = view("content");
    const gallery = view("gallery");
    const photoNav = view("photos");
    const previous = view("prev");
    const next = view("next");
    let items = [];
    let index = 0;
    let photos = [];
    let photoIndex = 0;
    let trigger;
    let swipe;

    const animate = (element, direction) => {
      if (reduce) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [{ opacity: 0, transform: `translateX(${direction * 18}px)` }, { opacity: 1, transform: "none" }],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    };

    const showPhoto = (direction = 0) => {
      const name = $("#product-view-name", dialog).textContent;
      if (photos.length) {
        const photo = document.createElement("img");
        photo.src = photos[photoIndex];
        photo.alt = photos.length === 1 ? name : `${name}, view ${photoIndex + 1} of ${photos.length}`;
        photo.draggable = false;
        stage.replaceChildren(photo);
      } else {
        const placeholder = $(".product-placeholder", items[index]).cloneNode(true);
        placeholder.removeAttribute("role");
        placeholder.removeAttribute("aria-label");
        stage.replaceChildren(placeholder);
      }
      photoNav.hidden = photos.length < 2;
      view("photo-count").textContent = `${photoIndex + 1} / ${photos.length}`;
      if (direction) animate(stage, direction);
    };

    const showItem = (direction = 0) => {
      const item = items[index];
      const [code, size] = $$(".product-meta span", item);
      $("#product-view-name", dialog).textContent = $("h4", item).textContent;
      view("category").textContent = $(".cat-category-head h3", item.closest("[data-category]")).textContent;
      view("description").textContent = item.dataset.description;
      view("weight").textContent = $(".product-weight", item).textContent;
      view("code").textContent = code.textContent;
      view("size").textContent = size.textContent;
      view("allergens").textContent = $(".product-allergens", item).textContent;
      view("count").textContent = `${index + 1} / ${items.length}`;
      previous.disabled = next.disabled = items.length < 2;
      photos = JSON.parse(item.dataset.photos);
      photoIndex = 0;
      showPhoto();
      if (direction) animate(content, direction);
    };

    const moveItem = (direction) => {
      if (items.length < 2) return;
      index = (index + direction + items.length) % items.length;
      showItem(direction);
    };
    const movePhoto = (direction) => {
      if (photos.length < 2) return;
      photoIndex = (photoIndex + direction + photos.length) % photos.length;
      showPhoto(direction);
    };

    products.forEach((item) => { $(".product-open", item).hidden = false; });
    catalogue.addEventListener("click", (event) => {
      const button = event.target.closest(".product-open");
      if (!button) return;
      trigger = button;
      items = products.filter((item) => !item.hidden);
      index = items.indexOf(button.closest(".product"));
      showItem();
      dialog.showModal();
    });
    view("close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
    dialog.addEventListener("close", () => trigger.focus({ preventScroll: true }));
    previous.addEventListener("click", () => moveItem(-1));
    next.addEventListener("click", () => moveItem(1));
    view("photo-prev").addEventListener("click", () => movePhoto(-1));
    view("photo-next").addEventListener("click", () => movePhoto(1));
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      if (photoNav.contains(event.target)) movePhoto(direction);
      else moveItem(direction);
    });
    content.addEventListener("pointerdown", (event) => {
      const onPhoto = gallery.contains(event.target);
      if (!event.isPrimary || event.button !== 0 || event.target.closest("button")) return;
      if (event.pointerType === "mouse" && !onPhoto) return;
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, onPhoto };
      content.setPointerCapture(event.pointerId);
    });
    content.addEventListener("lostpointercapture", () => { swipe = null; });
    content.addEventListener("pointerup", (event) => {
      if (swipe?.id !== event.pointerId) return;
      const { x, y, onPhoto } = swipe;
      swipe = null;
      const dx = event.clientX - x;
      const dy = event.clientY - y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      const direction = dx < 0 ? 1 : -1;
      if (onPhoto && photos.length > 1) movePhoto(direction);
      else moveItem(direction);
    });
  }
})();
