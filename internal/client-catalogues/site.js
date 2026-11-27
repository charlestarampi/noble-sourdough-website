(() => {
  const id = (name) => document.getElementById(name);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const dialog = id("product-detail");
  const detailScroll = id("detail-scroll");
  const detailCopy = dialog.querySelector(".detail-copy");
  const photoStage = id("detail-media");
  const photoControls = id("photo-controls");
  const previousItem = id("previous-item");
  const nextItem = id("next-item");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = matchMedia("(min-width: 761px)");
  const galleryEase = "cubic-bezier(.22, 1, .36, 1)";
  const grid = id("grid");
  const table = id("table-view");
  const rows = id("product-rows");
  const search = id("search");
  const searchPanel = id("catalogue-search");
  const sort = id("sort-products");
  const reset = id("reset-products");
  const sidebarToggle = id("sidebar-toggle");
  const overview = id("client-overview");
  const overviewTitle = id("client-overview-title");
  const overviewTab = id("overview-tab");
  const clientRangePicker = id("client-range-picker");
  const clientRangeOptions = id("client-range-picker-options");
  const catalogueContent = id("catalogue-content");
  const overviewHash = "#overview";
  const mobileSearch = id("mobile-search");
  const mobileAccount = id("mobile-account");
  const pageHeader = document.querySelector(".page-header");
  const profileActions = pageHeader.querySelector(".profile-actions");
  const feedback = id("item-feedback");
  const copySku = id("copy-customer-sku");
  const buttons = [...document.querySelectorAll("[data-filter]")];
  const viewButtons = [...document.querySelectorAll("[data-view]")];
  const select = id("range-select");
  const rangePriority = new Map([
    ["careem-moonshot", 0],
    ["talabat-ultra-fresh", 1],
    ["talabat-just-sourdough", 2]
  ]);
  const fullyBakedExceptions = new Set(["gmg-frozen", "eatx", "adnh", "dunkin", "thriv", "bando", "raiz"]);
  const missingSkuButton = id("missing-skus");
  const rangeButtons = new Map();
  const rangeScroll = new Map();
  const order = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const settingsKey = "noble-product-profile-settings";
  let settings = {};
  try {
    settings = JSON.parse(sessionStorage.getItem(settingsKey)) || {};
  } catch {
    // Browsing and filtering still work when storage is unavailable.
  }
  let view = settings.view === "table" ? "table" : "cards";
  let ranges = [];
  let productionDay;
  let active;
  let filter = "all";
  let visibleProducts = [];
  let detailProducts = [];
  let detailIndex;
  let detailPhoto = 0;
  let photoDrag;
  let itemAnimation;
  let opener;
  let searchTimer;
  let feedbackTimer;
  let loading = false;
  let shortcutTarget;

  const clientDisplayName = (range) => range.client.toUpperCase();
  const hasMissingSku = (product) => !product.internalSku || !product.customerSku;
  const rangeDisplayName = (range) => {
    const client = clientDisplayName(range);
    return range.client === range.label ? client : `${client} · ${range.label}`;
  };

  function productSpecs(product) {
    const size = product.dimensions?.valuesCm;
    const titleWeights = [...product.name.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
    const namedWeight = titleWeights.length === 1 ? `${titleWeights[0][1]} ${titleWeights[0][2].toLowerCase()}` : "";
    return {
      dimensions: size ? `${size.join(" × ")} cm` : "",
      dimensionLabel: product.dimensions?.estimated ? "Est. dimensions (L × W × H)" : "Dimensions (L × W × H)",
      weight: product.weightG ? `${product.weightG} g` : namedWeight
    };
  }

  function photoImage(photo, alt, lazy = false) {
    const img = element("img");
    img.src = photo;
    img.alt = alt;
    if (lazy) img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function productCard(product) {
    const card = id("product-card").content.firstElementChild.cloneNode(true);
    const button = card.querySelector("button");
    button.setAttribute("aria-label", `View ${product.name}`);
    if (product.photos.length) {
      card.querySelector(".card-media").replaceChildren(photoImage(product.photos[0], "", true));
    }
    card.querySelector(".card-title").textContent = product.name;
    const { dimensions, dimensionLabel, weight } = productSpecs(product);
    const rows = [["Internal SKU", product.internalSku], ["Customer SKU", product.customerSku]];
    if (weight) rows.push(["Weight", weight]);
    rows.push([dimensionLabel, dimensions || "—"]);
    const specs = rows.map(([label, value], index) => {
      const row = element("span");
      if (index === 1) row.className = "card-customer-sku";
      const field = element("strong");
      if (index < 2) {
        renderSku(field, value, index === 1);
      } else {
        field.textContent = value;
      }
      row.append(element("span", label), field);
      return row;
    });
    card.querySelector(".card-specs").replaceChildren(...specs);
    button.addEventListener("click", (event) => openProduct(product, button, event.detail > 0));
    return card;
  }

  function productRow(product) {
    const row = element("tr");
    const heading = element("th");
    heading.scope = "row";
    const button = element("button");
    button.type = "button";
    button.className = "row-product";
    button.setAttribute("aria-haspopup", "dialog");
    const thumbnail = element("span");
    thumbnail.className = "row-thumbnail";
    thumbnail.setAttribute("aria-hidden", "true");
    if (product.photos.length) thumbnail.append(photoImage(product.photos[0], "", true));
    else thumbnail.textContent = "—";
    button.append(thumbnail, element("span", product.name));
    button.addEventListener("click", (event) => openProduct(product, button, event.detail > 0));
    heading.append(button);
    const customerSku = element("td");
    const internalSku = element("td");
    const customerValue = element("span");
    renderSku(customerValue, product.customerSku, true);
    customerSku.append(customerValue);
    renderSku(internalSku, product.internalSku);
    const { weight, dimensions } = productSpecs(product);
    const size = dimensions && product.dimensions?.estimated ? `Est. ${dimensions}` : dimensions;
    row.append(heading, customerSku, internalSku, element("td", weight || "—"), element("td", size || "—"));
    return row;
  }

  function renderSku(field, value, customer = false) {
    field.textContent = value || "Missing";
    field.classList.toggle("sku-missing", !value);
    field.classList.toggle("customer-sku-box", customer && Boolean(value));
  }

  function saveSettings() {
    if (active) {
      settings.ranges ??= {};
      settings.ranges[active.id] = { search: search.value, filter, sort: sort.value };
    }
    settings.view = view;
    try {
      sessionStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      // The current session can still retain settings in memory.
    }
  }

  function syncControls() {
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
    viewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
  }

  function setMobileSearch(open) {
    searchPanel.toggleAttribute("data-mobile-open", open);
    mobileSearch.setAttribute("aria-expanded", String(open));
  }

  function syncSidebar() {
    const collapsed = desktop.matches && Boolean(settings.sidebarCollapsed);
    document.querySelector(".workspace").classList.toggle("sidebar-collapsed", collapsed);
    id("catalogue-nav").inert = collapsed;
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? "Show client catalogues" : "Hide client catalogues";
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
    if (profileActions) {
      const container = desktop.matches ? pageHeader : mobileAccount;
      if (profileActions.parentElement !== container) container.append(profileActions);
      mobileAccount.hidden = desktop.matches;
      if (desktop.matches) mobileAccount.open = false;
    }
    renderFilterPhotos();
  }

  function matchesFilter(product, selectedFilter) {
    if (selectedFilter === "missing-sku") return hasMissingSku(product);
    if (selectedFilter === "with") return product.photos.length > 0;
    if (selectedFilter === "review") {
      return hasMissingSku(product) || !product.photos.length || product.photoReview ||
        !product.skuSource || (!product.productionSku && product.duplicateCustomerSku) || Boolean(product.skuNote) ||
        Boolean(product.dimensions?.note);
    }
    return true;
  }

  function renderFilterPhotos() {
    if (desktop.matches || !active) return;
    const photos = active.products.filter((product) => product.photos.length);
    const used = new Set();
    for (const button of buttons) {
      const matching = photos.filter((product) => matchesFilter(product, button.dataset.filter));
      const product = matching.find((entry) => !used.has(entry)) || matching[0];
      const target = button.querySelector(".filter-photo");
      if (product) {
        target.replaceChildren(photoImage(product.photos[0], "", true));
        used.add(product);
      } else {
        target.replaceChildren();
      }
    }
  }

  function renderProducts(animate = true) {
    if (!active) return;
    const query = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = active.products.filter((product) => {
      const reference = [product.name, product.internalSku, product.customerSku, product.productionSku]
        .join(" ").toLowerCase();
      return query.every((word) => reference.includes(word));
    });
    missingSkuButton.querySelector(".filter-label").textContent = `Missing SKUs (${matches.filter(hasMissingSku).length})`;
    const products = matches.filter((product) => matchesFilter(product, filter));
    if (sort.value === "name-asc") products.sort((a, b) => order.compare(a.name, b.name));
    if (sort.value === "name-desc") products.sort((a, b) => order.compare(b.name, a.name));
    if (sort.value === "customer-sku") products.sort((a, b) =>
      Number(!a.customerSku) - Number(!b.customerSku) || order.compare(a.customerSku || "", b.customerSku || ""));
    const hasProducts = products.length > 0;
    const showTable = view === "table";
    const viewChanged = (showTable ? table : grid).hidden;
    const productsChanged = products.length !== visibleProducts.length || products.some((product, index) => product !== visibleProducts[index]);
    visibleProducts = products;
    grid.hidden = !hasProducts || showTable;
    table.hidden = !hasProducts || !showTable;
    if (hasProducts && (viewChanged || productsChanged)) {
      const target = showTable ? rows : grid;
      target.replaceChildren(...products.map(showTable ? productRow : productCard));
      if (!reducedMotion.matches && animate) (showTable ? table : grid).animate([{ opacity: .62 }, { opacity: 1 }], { duration: 170, easing: galleryEase });
    }
    const empty = id("empty");
    empty.hidden = hasProducts;
    empty.firstElementChild.textContent = active.products.length
      ? "No products match your search or filters."
      : "This catalogue has no products yet.";
    reset.hidden = !search.value && filter === "all" && sort.value === "source";
    const count = `${products.length} of ${active.products.length} items`;
    if (id("results").textContent !== count) id("results").textContent = count;
  }

  function selectRange(range) {
    if (active === range) return false;
    if (dialog.open) dialog.close();
    if (active) {
      clearTimeout(searchTimer);
      saveSettings();
      if (overview.hidden) rangeScroll.set(active.id, window.scrollY);
    }
    active = range;
    const hasRangeName = range.client !== range.label;
    id("client-label").textContent = hasRangeName ? clientDisplayName(range) : "Client catalogue";
    id("range-title").textContent = hasRangeName ? range.label : clientDisplayName(range);
    const fromBom = range.source === "bom";
    const additions = range.products.filter((product) => product.catalogueOnly).length;
    const additionalItems = additions ? ` + ${additions} catalogue item${additions === 1 ? "" : "s"}` : "";
    id("catalogue-source").textContent = fromBom
      ? `BOM reference · No allocation shown for this range on ${productionDay}`
      : `Production sheet · ${productionDay}${additionalItems}`;
    id("total").textContent = range.products.length;
    id("photos-total").textContent = range.products.filter((product) => product.photos.length).length;
    const saved = settings.ranges?.[range.id];
    search.value = saved?.search || "";
    setMobileSearch(Boolean(search.value));
    filter = buttons.some((button) => button.dataset.filter === saved?.filter) ? saved.filter : "all";
    sort.value = saved?.sort || "source";
    if (!sort.value) sort.value = "source";
    syncControls();
    rangeButtons.forEach((button, rangeId) => {
      if (rangeId === range.id) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    });
    select.value = range.id;
    renderProducts();
    renderFilterPhotos();
    return true;
  }

  function onRangeHash() {
    const overviewRequested = location.hash === overviewHash;
    const showOverview = overviewRequested && !desktop.matches && ranges.length > 0;
    const wasOverview = !overview.hidden;
    const range = (overviewRequested ? active : ranges.find((entry) => entry.id === location.hash.slice(1))) || ranges[0];
    const changed = range && selectRange(range);
    if (showOverview && !wasOverview && active) rangeScroll.set(active.id, window.scrollY);
    overview.hidden = !showOverview;
    catalogueContent.hidden = showOverview;
    if (showOverview) {
      overviewTab.setAttribute("aria-current", "page");
      select.value = "";
      if (!wasOverview) {
        window.scrollTo(0, 0);
        overviewTitle.focus({ preventScroll: true });
      }
      return;
    }
    if (clientRangePicker.open) clientRangePicker.close();
    overviewTab.removeAttribute("aria-current");
    if (active) select.value = active.id;
    if (shortcutTarget) {
      jumpTo(shortcutTarget);
      shortcutTarget = null;
    } else if (changed || wasOverview) {
      window.scrollTo(0, rangeScroll.get(range.id) || 0);
      if (wasOverview && !desktop.matches) id("range-title").focus({ preventScroll: true });
    }
  }

  function renderRangeOptions() {
    const placeholder = element("option", "Choose a client");
    placeholder.value = "";
    placeholder.disabled = true;
    select.replaceChildren(placeholder);
    const list = id("client-list");
    for (const [source, label] of [["production", "Production"], ["bom", "BOM reference"]]) {
      const group = ranges.filter((range) => range.source === source);
      if (!group.length) continue;
      const heading = element("h3", label);
      heading.className = "range-group-heading";
      const options = element("optgroup");
      options.label = label;
      list.append(heading);
      select.append(options);
      group.forEach((range) => {
        const link = element("a");
        link.href = `#${range.id}`;
        link.className = "range-button";
        link.append(element("strong", clientDisplayName(range)));
        if (range.label !== range.client) link.append(element("small", range.label));
        link.append(element("span", String(range.products.length)));
        list.append(link);
        rangeButtons.set(range.id, link);
        const option = element("option", rangeDisplayName(range));
        option.value = range.id;
        options.append(option);
      });
    }
  }

  function chooseClientCatalogue(company, catalogues) {
    id("client-range-picker-title").textContent = `${company} catalogues`;
    clientRangeOptions.replaceChildren(...catalogues.map((range) => {
      const row = element("li");
      const link = element("a");
      link.href = `#${range.id}`;
      const total = range.products.length;
      link.append(element("span", range.label), element("small", `${total} ${total === 1 ? "item" : "items"}`));
      row.append(link);
      return row;
    }));
    clientRangePicker.showModal();
  }

  const overviewBrandNames = new Map([
    ["ADNH", "ADNH"],
    ["DUNKIN", "Dunkin'"],
    ["EATX", "EATX"],
    ["GMG", "GMG"],
    ["Noble Cafe", "Noble Café"],
    ["WHFIT", "Warehouse Fitness"]
  ]);

  function overviewClientName(company) {
    return overviewBrandNames.get(company) ?? company.toLowerCase().replace(/(^|\s)\p{L}/gu, (first) => first.toUpperCase());
  }

  function renderClientOverview(logos) {
    const companies = new Map();
    for (const range of ranges) {
      if (!companies.has(range.client)) companies.set(range.client, []);
      companies.get(range.client).push(range);
    }
    const clients = [...companies.entries()].sort(([a], [b]) => order.compare(overviewClientName(a), overviewClientName(b)));
    const cards = clients.map(([company, catalogues]) => {
      const name = overviewClientName(company);
      const card = element("li");
      const [first] = catalogues;
      const tile = element(catalogues.length === 1 ? "a" : "button");
      tile.className = "client-tile";
      const art = element("span");
      art.className = "client-tile-photo";
      const logo = logos.get(company);
      if (logo) {
        const image = photoImage(`assets/client-logo-${logo}.webp`, "", true);
        image.className = "client-tile-logo";
        art.append(image);
      } else {
        const photo = catalogues.flatMap((range) => range.products).find((product) => product.photos.length)?.photos[0];
        if (photo) art.append(photoImage(photo, "", true));
      }
      const caption = element("span");
      caption.className = "client-tile-caption";
      caption.append(element("strong", name));
      if (catalogues.length === 1) {
        tile.href = `#${first.id}`;
      } else {
        tile.type = "button";
        tile.setAttribute("aria-haspopup", "dialog");
        caption.append(element("small", `${catalogues.length} catalogues`));
        tile.addEventListener("click", () => chooseClientCatalogue(name, catalogues));
      }
      tile.append(art, caption);
      card.append(tile);
      return card;
    });
    id("client-directory").replaceChildren(...cards);
    id("client-overview-count").textContent = `${companies.size} clients · ${ranges.length} catalogues`;
  }

  function renderPhoto(direction = 0) {
    const { photos, name } = detailProducts[detailIndex];
    const photo = photos[detailPhoto];
    const outgoing = photoStage.querySelector(".current-photo");
    const slide = photo ? photoImage(photo, name) : element("span", "Photo pending");
    slide.className = photo ? "current-photo" : "placeholder";
    slide.draggable = false;
    photoStage.replaceChildren(slide);
    photoControls.hidden = photos.length < 2;
    id("photo-index").textContent = photo ? `${detailPhoto + 1} / ${photos.length}` : "";
    if (!direction || reducedMotion.matches || !outgoing) return;

    outgoing.className = "outgoing-photo";
    outgoing.setAttribute("aria-hidden", "true");
    photoStage.prepend(outgoing);
    const options = { duration: 200, easing: galleryEase, fill: "both" };
    const departure = outgoing.animate([
      { opacity: 1, transform: outgoing.style.transform || "translateX(0)" },
      { opacity: 0, transform: `translateX(${direction * -22}%)` },
    ], options);
    departure.finished.then(() => outgoing.remove(), () => outgoing.remove());
    slide.animate([
      { opacity: 0, transform: `translateX(${direction * 20}%) scale(.98)` },
      { opacity: 1, transform: "translateX(0) scale(1)" },
    ], { ...options, fill: "none" });
  }

  function movePhoto(offset) {
    const total = detailProducts[detailIndex].photos.length;
    if (total < 2 || photoDrag) return;
    detailPhoto = (detailPhoto + offset + total) % total;
    renderPhoto(offset);
  }

  function moveItem(offset) {
    const index = detailIndex + offset;
    if (index < 0 || index >= detailProducts.length || photoDrag) return false;
    detailIndex = index;
    renderDetail();
    if (!reducedMotion.matches) {
      itemAnimation = detailCopy.animate([
        { opacity: .72, transform: `translateX(${offset * 8}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ], { duration: 180, easing: galleryEase });
    }
    return true;
  }

  function finishPhotoDrag(event, completed) {
    if (photoDrag?.id !== event.pointerId) return;
    const { startX, startY, slide } = photoDrag;
    photoDrag = null;
    photoStage.classList.remove("is-dragging");
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const swiped = completed && Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.35;
    if (swiped && moveItem(dx < 0 ? 1 : -1)) return;
    const offset = slide.style.transform;
    slide.style.transform = "";
    if (offset && !reducedMotion.matches) {
      slide.animate([{ transform: offset }, { transform: "translateX(0)" }],
                    { duration: 160, easing: galleryEase });
    }
  }

  function renderDetail() {
    itemAnimation?.cancel();
    const product = detailProducts[detailIndex];
    detailPhoto = 0;
    const rangeName = rangeDisplayName(active);
    id("detail-range").textContent = rangeName;
    id("mobile-detail-range").textContent = rangeName;
    id("detail-title").textContent = product.name;
    const { dimensions, weight } = productSpecs(product);
    const bakeStatus = fullyBakedExceptions.has(active.id) ? product.bakeStatus?.trim() : "Fully baked";
    const description = product.description?.trim();
    const allergens = Array.isArray(product.allergens)
      ? product.allergens.map((allergen) => allergen.trim()).filter(Boolean).join(", ")
      : product.allergens?.trim();
    const productCode = product.productCode?.trim();
    id("detail-bake-label").hidden = Boolean(bakeStatus);
    id("detail-bake-status").textContent = bakeStatus || "N/A";
    id("detail-description-label").hidden = Boolean(description);
    id("detail-description").textContent = description || "N/A";
    id("detail-weight").textContent = weight || "N/A";
    id("dimension-label").textContent = product.dimensions?.estimated ? "Estimated size" : "Size";
    id("dimension-value").textContent = dimensions || "N/A";
    id("detail-code-label").textContent = productCode ? "Product code" : "Product code (internal SKU)";
    id("internal-sku").textContent = productCode || product.internalSku || "N/A";
    id("detail-allergens").textContent = allergens || "N/A";
    id("client-sku").textContent = product.customerSku || "N/A";
    copySku.hidden = !product.customerSku;
    const skuNote = id("sku-note");
    skuNote.textContent = product.skuNote || "";
    skuNote.hidden = !product.skuNote;
    renderPhoto();
    const total = detailProducts.length;
    photoStage.classList.toggle("can-swipe", total > 1);
    id("item-controls").hidden = total < 2;
    id("item-index").textContent = `${detailIndex + 1} / ${total}`;
    previousItem.setAttribute("aria-disabled", String(detailIndex === 0));
    nextItem.setAttribute("aria-disabled", String(detailIndex === total - 1));
    detailScroll.scrollTop = 0;
  }

  function openProduct(product, button, fromPointer) {
    opener = button;
    detailProducts = visibleProducts;
    detailIndex = detailProducts.indexOf(product);
    renderDetail();
    // Keep pointer-triggered focus on the dialog instead of its close button.
    dialog.toggleAttribute("autofocus", fromPointer);
    dialog.showModal();
    if (fromPointer && document.activeElement !== dialog) dialog.focus({ preventScroll: true });
  }

  function closeProduct() {
    if (!dialog.open || dialog.hasAttribute("data-closing")) return;
    if (reducedMotion.matches) {
      dialog.close();
      return;
    }
    dialog.setAttribute("data-closing", "");
    const exit = dialog.getAnimations().find((animation) => animation.animationName === "modal-out");
    if (exit) exit.finished.then(() => dialog.close(), () => {});
    else dialog.close();
  }

  function showFeedback(message, type) {
    clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.dataset.type = type;
    feedback.dataset.visible = "true";
    feedbackTimer = setTimeout(() => delete feedback.dataset.visible, 3200);
  }

  function updateProducts() {
    clearTimeout(searchTimer);
    syncControls();
    renderProducts();
    saveSettings();
  }

  buttons.forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    updateProducts();
  }));
  viewButtons.forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view;
    updateProducts();
  }));
  sort.addEventListener("change", updateProducts);
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateProducts, 120);
  });
  reset.addEventListener("click", () => {
    filter = "all";
    sort.value = "source";
    search.value = "";
    updateProducts();
    const focusTarget = desktop.matches || searchPanel.hasAttribute("data-mobile-open") ? search : id("products-title");
    focusTarget.focus();
  });
  sidebarToggle.addEventListener("click", () => {
    settings.sidebarCollapsed = !settings.sidebarCollapsed;
    syncSidebar();
    saveSettings();
  });
  desktop.addEventListener("change", () => {
    syncSidebar();
    if (location.hash === overviewHash) onRangeHash();
  });
  syncSidebar();
  function jumpTo(target) {
    target.focus({ preventScroll: true });
    const behavior = reducedMotion.matches ? "auto" : "smooth";
    target.scrollIntoView({ block: "start", behavior });
  }
  function catalogueShortcut(target) {
    if (!active) return;
    if (overview.hidden) jumpTo(target);
    else {
      shortcutTarget = target;
      location.hash = active.id;
    }
  }
  overviewTab.addEventListener("click", () => {
    mobileAccount.open = false;
    if (location.hash === overviewHash) jumpTo(overviewTitle);
    else location.hash = overviewHash;
  });
  clientRangeOptions.addEventListener("click", (event) => {
    if (event.target.closest("a")) clientRangePicker.close();
  });
  mobileSearch.addEventListener("click", () => {
    mobileAccount.open = false;
    const open = !overview.hidden || !searchPanel.hasAttribute("data-mobile-open");
    setMobileSearch(open);
    if (open) catalogueShortcut(search);
  });
  search.addEventListener("keydown", (event) => {
    if (desktop.matches || event.key !== "Escape") return;
    event.preventDefault();
    setMobileSearch(false);
    mobileSearch.focus();
  });
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => catalogueShortcut(id(button.dataset.scrollTarget)));
  });
  mobileAccount.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !mobileAccount.open) return;
    mobileAccount.open = false;
    mobileAccount.querySelector("summary").focus();
  });
  document.querySelector(".skip").addEventListener("click", (event) => {
    event.preventDefault();
    id("main").focus();
  });
  select.addEventListener("change", () => { location.hash = select.value; });
  window.addEventListener("hashchange", onRangeHash);
  window.addEventListener("pagehide", saveSettings);
  id("close").addEventListener("click", closeProduct);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeProduct();
  });
  copySku.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(detailProducts[detailIndex].customerSku);
      if (dialog.open) showFeedback("Customer SKU copied", "success");
    } catch {
      if (dialog.open) showFeedback("Couldn’t copy the SKU. Select the code to copy it manually.", "error");
    }
  });
  id("previous-photo").addEventListener("click", () => movePhoto(-1));
  id("next-photo").addEventListener("click", () => movePhoto(1));
  previousItem.addEventListener("click", () => moveItem(-1));
  nextItem.addEventListener("click", () => moveItem(1));
  photoStage.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || detailProducts.length < 2) return;
    const slide = photoStage.querySelector(".current-photo, .placeholder");
    slide.getAnimations().forEach((animation) => animation.cancel());
    photoDrag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, slide };
    photoStage.classList.add("is-dragging");
    photoStage.setPointerCapture(event.pointerId);
  });
  photoStage.addEventListener("pointermove", (event) => {
    if (photoDrag?.id !== event.pointerId || reducedMotion.matches) return;
    const dx = event.clientX - photoDrag.startX;
    const dy = event.clientY - photoDrag.startY;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    const offset = Math.max(-84, Math.min(84, dx * .45));
    photoDrag.slide.style.transform = `translateX(${offset}px)`;
  });
  photoStage.addEventListener("pointerup", (event) => finishPhotoDrag(event, true));
  photoStage.addEventListener("pointercancel", (event) => finishPhotoDrag(event, false));
  photoStage.addEventListener("lostpointercapture", (event) => finishPhotoDrag(event, false));
  dialog.addEventListener("close", () => {
    itemAnimation?.cancel();
    photoDrag = null;
    photoStage.classList.remove("is-dragging");
    dialog.removeAttribute("data-closing");
    clearTimeout(feedbackTimer);
    delete feedback.dataset.visible;
    feedback.textContent = "";
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    if (photoControls.contains(event.target)) movePhoto(offset);
    else moveItem(offset);
  });

  const retry = id("retry-catalogue");
  async function loadCatalogue(restoreFocus = false) {
    if (loading) return;
    loading = true;
    id("product-results").setAttribute("aria-busy", "true");
    id("catalogue-loading").hidden = false;
    id("error").hidden = true;
    id("range-title").textContent = "Loading catalogue";
    id("results").textContent = "Loading products…";
    try {
      const response = await fetch("catalogues.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Catalogue data unavailable");
      const { date, ranges: clients, clientLogos = {} } = await response.json();
      const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
      productionDay = day.format(new Date(date));
      const priority = (range) => rangePriority.get(range.id) ?? rangePriority.size;
      ranges = clients.sort((a, b) => priority(a) - priority(b));
      renderRangeOptions();
      renderClientOverview(new Map(Object.entries(clientLogos)));
      onRangeHash();
      if (active) {
        id("catalogue-controls").hidden = false;
        search.disabled = false;
        mobileSearch.disabled = false;
        overviewTab.disabled = false;
        select.disabled = false;
        if (restoreFocus) search.focus();
      } else {
        id("range-title").textContent = "Client catalogues";
        id("results").textContent = "No client catalogues available";
      }
    } catch {
      id("range-title").textContent = "Catalogue unavailable";
      id("results").textContent = "";
      id("error").hidden = false;
      if (restoreFocus) retry.focus();
    } finally {
      loading = false;
      id("catalogue-loading").hidden = true;
      id("product-results").setAttribute("aria-busy", "false");
    }
  }

  retry.addEventListener("click", () => loadCatalogue(true));
  loadCatalogue();

  const signOut = document.querySelector('.profile-actions form[action="/sign-out"]');
  if (signOut) {
    const submit = signOut.querySelector('button[type="submit"]');
    signOut.addEventListener("submit", (event) => {
      if (submit.disabled) {
        event.preventDefault();
        return;
      }
      submit.disabled = true;
      submit.textContent = "Signing out…";
    });
    window.addEventListener("pageshow", () => {
      submit.disabled = false;
      submit.textContent = "Sign out";
    });
  }
})();
