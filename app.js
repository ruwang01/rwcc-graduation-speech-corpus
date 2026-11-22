"use strict";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const isEnglish = params.get("lang") === "en";
const language = isEnglish ? "en" : "zh-CN";
const listParams = new URLSearchParams(params);
listParams.delete("doc");
listParams.delete("view");
const fragmentMode = params.get("mode") === "fragments";
const view = params.get("view");
const textFormat = new Intl.NumberFormat(language);
const pageSize = 20;
const catalog = window.corpus;
window.speechData = Object.create(null);

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(value => value !== null && value !== undefined));
  return node;
}

function link(text, href, css, external = false) {
  return element("a", {text, href, class: css, target: external ? "_blank" : null,
    rel: external ? "noopener noreferrer" : null});
}

function listUrl(search = listParams, locale = language) {
  const query = new URLSearchParams(search);
  if (locale === "en") query.set("lang", "en");
  else query.delete("lang");
  const encoded = query.toString();
  return encoded ? "?" + encoded : "index.html";
}

function configureInterface() {
  document.documentElement.lang = language;
  document.title = t("siteName") + " · R.W.CC";
  document.querySelector('meta[name="description"]').content = t("siteDescription");
  document.querySelector(".skip-link").textContent = t("skipLink");
  document.querySelector(".project-mark").href = listUrl({});
  const brand = document.querySelector(".brand");
  brand.href = listUrl({});
  if (isEnglish) brand.replaceChildren(element("span", {class: "english-brand", text: t("siteName")}));
  document.querySelector(".top-nav").setAttribute("aria-label", t("mainNav"));
  for (const page of ["home", "about", "help"]) {
    const nav = document.querySelector("#" + page + "-nav");
    nav.textContent = t(page);
    nav.href = listUrl(page === "home" ? {} : {view: page});
  }
  document.querySelector(".copyright").textContent = t("copyright");

  const toggle = document.querySelector("#language-toggle");
  const targetLanguage = isEnglish ? "zh-CN" : "en";
  toggle.textContent = isEnglish ? "中文" : "English";
  toggle.lang = targetLanguage;
  toggle.hreflang = targetLanguage;
  toggle.title = t("changeLanguage");
  function updateLanguageLink() {
    toggle.href = listUrl(params, targetLanguage) + location.hash;
  }
  updateLanguageLink();
  window.addEventListener("hashchange", updateLanguageLink);
}

function speechUrl(id, anchor) {
  const search = new URLSearchParams(listParams);
  search.set("doc", id);
  return listUrl(search) + (anchor ? "#" + anchor : "");
}

function label(text, child) {
  return element("div", {class: "field"}, [element("label", {for: child.id, text}), child]);
}

function selectOption(value, text) {
  return element("option", {value, text});
}

function notice(text) {
  return element("p", {class: "notice", text, role: "status"});
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const node = element("script", {src});
    node.addEventListener("load", resolve, {once: true});
    node.addEventListener("error", reject, {once: true});
    document.head.append(node);
  });
}

function yearField() {
  const year = element("select", {id: "year", name: "year"});
  const basis = element("input", {name: "basis", type: "hidden", value: params.get("basis") === "speech" ? "speech" : ""});
  const labelNode = element("label", {for: "year"});
  const switchYear = element("button", {type: "button"});
  function updateYear(selected) {
    const actual = basis.value === "speech";
    labelNode.textContent = actual ? t("speechYear") : t("cohort");
    switchYear.textContent = actual ? t("byCohort") : t("bySpeechYear");
    switchYear.setAttribute("aria-label", actual ? t("switchToCohort") : t("switchToSpeechYear"));
    const years = [...new Set(catalog.documents.map(record => actual ? record.year : record.cohort).filter(Boolean))]
      .sort((a, b) => b - a);
    year.replaceChildren(selectOption("", actual ? t("allYears") : t("allCohorts")),
      ...years.map(n => selectOption(n, t(actual ? "speechYearOption" : "cohortOption", n))));
    year.value = years.includes(Number(selected)) ? selected : "";
  }
  switchYear.addEventListener("click", () => {
    basis.value = basis.value === "speech" ? "" : "speech";
    updateYear(year.value);
  });
  updateYear(params.get("year"));
  return element("div", {class: "field"}, [
    element("div", {class: "year-control"}, [labelNode, switchYear]), year, basis,
  ]);
}

function searchForm() {
  const school = element("input", {id: "school", name: "school", list: "schools", placeholder: t("schoolPlaceholder"),
    value: params.get("school") || ""});
  const choices = [...new Set(catalog.documents.map(record => record.school))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const datalist = element("datalist", {id: "schools"}, choices.map(name => selectOption(name, name)));
  const speaker = element("input", {id: "speaker", name: "speaker", placeholder: t("speakerPlaceholder"), value: params.get("speaker") || ""});
  const limit = element("input", {id: "limit", name: "limit", type: "number", min: "1", step: "1", inputmode: "numeric",
    placeholder: t("noLimit"), value: params.get("limit") || ""});
  const children = [searchModeNavigation()];

  if (fragmentMode) {
    const query = element("input", {id: "query", name: "q", type: "search", placeholder: t("keywordPlaceholder"),
      value: params.get("q") || ""});
    const code = element("select", {id: "code", name: "code"}, [selectOption("", t("allCodes"))]);
    const steps = element("optgroup", {label: t("movesAndSteps")});
    for (const move of Object.keys(catalog.moves)) {
      steps.append(selectOption(move, move + " " + codeLabel(move)));
      for (const step of Object.keys(catalog.codes)) {
        if (step.startsWith(move + "S")) steps.append(selectOption(step, "　" + step + " " + codeLabel(step)));
      }
    }
    code.append(steps, element("optgroup", {label: t("organizationMarkers")}, Object.keys(catalog.codes)
      .filter(id => id.startsWith("ORG_")).map(id => selectOption(id, id + " " + codeLabel(id)))));
    code.value = params.get("code") || "";
    children.push(element("input", {type: "hidden", name: "mode", value: "fragments"}),
      element("div", {class: "fragment-fields"}, [label(t("keyword"), query), label(t("code"), code)]));
  }

  children.push(element("div", {class: "filter-grid"}, [yearField(), label(t("school"), school), label(t("speaker"), speaker), label(t("maxCharacters"), limit)]), datalist);
  const actions = element("div", {class: "search-actions"}, [
    element("button", {type: "submit", class: "primary", text: t("search")}),
    link(t("clear"), listUrl(fragmentMode ? {mode: "fragments"} : {}), "secondary"),
  ]);
  const form = element("form", {class: "panel search-panel", "aria-label": t("searchFilters")}, [...children, actions,
    element("p", {class: "search-hint", text: t("searchHint")}),
  ]);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (value.trim()) query.set(name, value.trim());
    }
    location.href = listUrl(query);
  });
  return form;
}

function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

function filteredCatalog() {
  const year = params.get("year");
  const field = params.get("basis") === "speech" ? "year" : "cohort";
  const school = normalized(params.get("school"));
  const speaker = normalized(params.get("speaker"));
  const limit = Number(params.get("limit"));
  return catalog.documents.filter(record => {
    return (!year || String(record[field] ?? "") === year) &&
      (!school || normalized(record.school).includes(school)) &&
      (!speaker || normalized(record.speaker).includes(speaker)) &&
      (!limit || (record.count !== null && record.count <= limit));
  });
}

function speechName(record) {
  const form = record.status === "supplement" ? t("graduationLetter") : t("commencementSpeech");
  return t("documentTitle", record.school, t("cohortOption", record.cohort), form);
}

function tableHead(cells) {
  return element("thead", {}, [element("tr", {}, cells.map(([text, classes]) =>
    element("th", {scope: "col", text, class: classes})))]);
}

function pageOf(rows) {
  const last = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(last, Math.max(1, Math.trunc(Number(params.get("page"))) || 1));
  const start = (page - 1) * pageSize;
  return {rows: rows.slice(start, start + pageSize), page, last};
}

function pager(page, last) {
  const href = target => {
    const query = new URLSearchParams(listParams);
    target > 1 ? query.set("page", target) : query.delete("page");
    return listUrl(query) + "#results";
  };
  const control = (text, target, enabled) => enabled ? link(text, href(target), "secondary") :
    element("span", {class: "secondary disabled", "aria-disabled": "true", text});
  if (last <= 1) return null;
  return element("nav", {class: "pager", "aria-label": t("pagination")}, [
    control(t("previousPage"), page - 1, page > 1),
    element("span", {class: "page-count", text: page + " / " + last}),
    control(t("nextPage"), page + 1, page < last),
  ]);
}

function catalogTable(records) {
  const page = pageOf(records);
  const rows = page.rows.map(record => {
    const title = speechName(record);
    const available = record.status !== "missing";
    const textCell = available ? link(title, speechUrl(record.id), "title-link") :
      element("span", {class: "title-label", text: title});
    const labelText = [audienceLabel(record.audience), record.status === "supplement" ? t("supplement") : null]
      .filter(Boolean).join(" · ");
    const action = available ? link(t("readFullText"), speechUrl(record.id), "row-action") :
      element("div", {}, [
        element("span", {class: "status-missing row-action", text: t("fullTextUnavailable")}), " ",
        link(t("universityWebsite"), record.schoolUrl, "row-action", true),
      ]);
    return element("tr", {}, [
      element("td", {}, [textCell, labelText ? element("p", {class: "result-meta", text: labelText}) : null]),
      element("td", {text: record.id, class: "id-cell mono hide-narrow"}),
      element("td", {text: record.cohort, class: "number hide-narrow"}),
      element("td", {text: record.speaker || "—", class: "hide-narrow"}),
      element("td", {text: record.count === null ? "—" : textFormat.format(record.count), class: "number hide-narrow"}),
      element("td", {}, [action]),
    ]);
  });
  return element("div", {class: "panel"}, [
    element("div", {class: "table-wrap"}, [
      element("table", {class: "catalog-table", "aria-label": t("directoryResults")}, [
        tableHead([[t("universityAndSpeech")], [t("gtId"), "hide-narrow"], [t("cohortShort"), "number hide-narrow"], [t("speaker"), "hide-narrow"],
          [t("characters"), "number hide-narrow"], [t("textAndSource")]]),
        element("tbody", {}, rows),
      ]),
    ]),
    pager(page.page, page.last),
  ]);
}

function matchedCode(candidate, sought) {
  if (!sought) return true;
  if (!candidate) return false;
  if (/^M\d$/.test(sought)) return candidate.startsWith(sought + "S");
  return candidate.split(/[\s,，、/]+/).includes(sought);
}

function fragmentTable(rows, docIndex, keyword) {
  const page = pageOf(rows);
  const contextText = chars => chars.join("").replace(/\s+/g, " ");
  const body = page.rows.map(([key, id, code, text]) => {
    const record = docIndex.get(key);
    const found = keyword ? text.indexOf(keyword) : 0;
    const left = Array.from(text.slice(0, found));
    const hit = keyword ? keyword : contextText(Array.from(text).slice(0, 14));
    const right = keyword ? Array.from(text.slice(found + keyword.length)) : Array.from(text).slice(14);
    const name = t("fragmentTitle", record.school, t("cohortOption", record.cohort));
    return element("tr", {}, [
      element("td", {class: "source-cell"}, [link(name, speechUrl(key, id), "title-link"), element("small", {class: "result-meta", text: [record.speaker, key, id].filter(Boolean).join(" · ")})]),
      element("td", {class: "mono code-cell", text: code || "—"}),
      element("td", {class: "left-context context", lang: "zh-CN", text: (left.length > 34 ? "…" : "") + contextText(left.slice(-34))}),
      element("td", {class: "key-cell", lang: "zh-CN"}, [link(hit, speechUrl(key, id), "title-link")]),
      element("td", {class: "context", lang: "zh-CN", text: contextText(right.slice(0, 40)) + (right.length > 40 ? "…" : "")}),
    ]);
  });
  return element("div", {class: "panel"}, [
    element("div", {class: "table-wrap", tabindex: "0", role: "region", "aria-label": t("scrollableFragments")}, [
      element("table", {class: "kwic", "aria-label": t("fragmentResults")}, [
        tableHead([[t("speechAndPassage"), "source-cell"], [t("code"), "code-cell"], [t("leftContext"), "left-context"], [t("matchedPassage"), "key-cell"], [t("rightContext")]]),
        element("tbody", {}, body),
      ]),
    ]),
    pager(page.page, page.last),
  ]);
}

function searchModeNavigation() {
  const search = new URLSearchParams(listParams);
  for (const key of ["mode", "page", "q", "code"]) search.delete(key);
  const directoryLink = link(t("directory"), listUrl(search), "mode-link");
  search.set("mode", "fragments");
  const fragmentLink = link(t("fragmentSearch"), listUrl(search), "mode-link");
  (fragmentMode ? fragmentLink : directoryLink).setAttribute("aria-current", "page");
  return element("nav", {class: "search-modes", "aria-label": t("searchModes")}, [directoryLink, fragmentLink]);
}

function renderAbout() {
  document.title = t("about") + " · " + t("siteName");
  const schools = new Map();
  let fullTexts = 0;
  let characters = 0;
  for (const record of catalog.documents) {
    const schoolCount = schools.get(record.school) ?? 0;
    const hasText = record.status !== "missing";
    schools.set(record.school, schoolCount + Number(hasText));
    if (hasText) {
      fullTexts += 1;
      characters += record.count ?? 0;
    }
  }
  const stats = [[t("universitiesCount"), schools.size], [t("fullTextsCount"), fullTexts], [t("totalCharacters"), characters]];
  const schoolCounts = [...schools].sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([name, count]) => element("li", {}, [
      element("span", {text: name, lang: "zh-CN"}),
      element("span", {text: t("schoolCount", textFormat.format(count))}),
    ]));
  app.append(element("article", {class: "info-page panel", "aria-labelledby": "about-heading"}, [
    element("h1", {id: "about-heading", text: t("aboutHeading")}),
    element("p", {class: "intro", text: t("intro")}),
    element("dl", {class: "author-details"}, [
      element("dt", {text: t("maintainedBy")}), element("dd", {text: "R.W."}),
      element("dt", {text: t("affiliation")}), element("dd", {}, [
        link(t("affiliationName"), isEnglish ? "https://gjzw.bnu.edu.cn/EN/" : "https://gjzw.bnu.edu.cn/", null, true),
      ]),
    ]),
    element("h2", {text: t("coverage")}),
    element("p", {text: t("coverageDescription")}),
    element("dl", {class: "info-stats"}, stats.map(([name, n]) => element("div", {}, [
      element("dt", {text: name}), element("dd", {text: textFormat.format(n)}),
    ]))),
    element("p", {text: t("countMethod")}),
    element("h2", {text: t("searchAndReading")}),
    element("ul", {class: "about-list"}, [
      element("li", {text: t("readFullAbout")}),
      element("li", {text: t("passageSearchAbout")}),
      element("li", {text: t("verifyAbout")}),
    ]),
    element("h2", {text: t("researchAndTeaching")}),
    element("p", {text: t("researchAbout")}),
    element("h2", {text: t("versionAndCitation")}),
    element("p", {text: t("citationAbout", catalog.version)}),
    element("h2", {id: "schools-heading", text: t("byUniversity")}),
    element("ul", {class: "school-counts", role: "list", "aria-labelledby": "schools-heading"}, schoolCounts),
  ]));
}

function renderHelp() {
  document.title = t("help") + " · " + t("siteName");
  const examples = [
    [t("helpFindSpeeches"), t("helpFindSpeechesDetail")],
    [t("helpSpeechYear"), t("helpSpeechYearDetail")],
    [t("helpOpenPassage"), t("helpOpenPassageDetail")],
    [t("helpVerify"), t("helpVerifyDetail")],
    [t("helpCharacterLimit"), t("helpCharacterLimitDetail")],
  ];
  app.append(element("article", {class: "info-page panel", "aria-labelledby": "help-heading"}, [
    element("h1", {id: "help-heading", text: t("helpHeading")}),
    ...examples.flatMap(([title, description]) => [
      element("h2", {text: title}), element("p", {text: description}),
    ]),
    element("p", {class: "info-reference"}, [
      link(t("exampleSearch"), listUrl({school: "复旦大学", year: "2021"})),
    ]),
  ]));
}

function resultsHeader(title, summary) {
  return element("div", {class: "result-bar"}, [element("h2", {text: title}), element("p", {text: summary, role: "status"})]);
}

async function renderCatalog() {
  const list = filteredCatalog();
  const results = element("section", {id: "results", class: "results", "aria-label": t("results")});
  app.append(element("h1", {class: "sr-only", text: fragmentMode ? t("fragmentSearch") : t("directory")}), searchForm(), results);
  if (!fragmentMode) {
    const withText = list.filter(record => record.status !== "missing").length;
    const summary = t("catalogSummary", textFormat.format(list.length), textFormat.format(withText));
    results.append(resultsHeader(t("results"), summary),
      list.length ? catalogTable(list) : notice(t("catalogEmpty")));
    return;
  }

  const keyword = (params.get("q") || "").trim();
  const code = params.get("code");
  if (!keyword && !code) {
    results.append(notice(t("fragmentPrompt")));
    return;
  }

  results.append(notice(t("loadingFragments")));
  try {
    await loadScript("data/fragments.js");
    const docIndex = new Map(list.map(record => [record.id, record]));
    const matching = window.fragments.filter(([id, , candidate, text]) =>
      docIndex.has(id) && matchedCode(candidate, code) && (!keyword || text.includes(keyword)));
    const matches = new Set(matching.map(([id]) => id)).size;
    const summary = t("fragmentSummary", textFormat.format(matching.length), textFormat.format(matches));
    results.replaceChildren(resultsHeader(t("results"), summary),
      matching.length ? fragmentTable(matching, docIndex, keyword) : notice(t("fragmentEmpty")));
  } catch {
    results.replaceChildren(notice(t("fragmentError")));
  }
}

function annotationLink(id, text) {
  const a = link(text, "#" + id);
  a.dataset.jump = id;
  return a;
}

function annotationSection(labelText, children, open = false) {
  return element("details", {open: open ? "" : null}, [
    element("summary", {text: labelText}), element("div", {class: "inside"}, children),
  ]);
}

function annotationsList(items, emptyText) {
  return items.length ? element("ul", {class: "annotation-list"}, items.map(item => element("li", {}, [item]))) :
    element("p", {class: "evidence-note", text: emptyText || t("annotationsEmpty")});
}

function articleBody(detail, annotations) {
  const letters = Array.from(detail.text);
  const edges = new Set([0, letters.length]);
  const starts = new Map();
  for (const item of annotations.values()) {
    edges.add(item.start);
    edges.add(item.end);
    if (!starts.has(item.start)) starts.set(item.start, []);
    starts.get(item.start).push(item.id);
  }
  const points = [...edges].sort((a, b) => a - b);
  const body = element("div", {class: "speech", id: "speech-text", lang: "zh-CN"});
  const ranges = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    for (const id of starts.get(start) || []) body.append(element("span", {class: "text-anchor", id, tabindex: "-1"}));
    const chunk = element("span", {text: letters.slice(start, end).join("")});
    body.append(chunk);
    ranges.push({chunk, start, end});
  }
  return {body, letters, ranges};
}

function articleSidebar(detail, letters) {
  const excerpt = item => letters.slice(item.start, Math.min(item.end, item.start + 24)).join("").trim().replace(/\s+/g, " ");
  const seen = new Set();
  const moves = detail.segments.flatMap(item => {
    if (!item.instance || seen.has(item.instance)) return [];
    seen.add(item.instance);
    return [annotationLink(item.id, [item.move, codeLabel(item.move), item.id].filter(Boolean).join(" · "))];
  });
  const segments = detail.segments.map(item =>
    annotationLink(item.id, [item.id, item.code && codeLabel(item.code), excerpt(item)].filter(Boolean).join(" · ")));
  const markers = detail.markers.map(item =>
    annotationLink(item.id, [item.id, codeLabel(item.code) || item.code, item.quote].filter(Boolean).join(" · ")));
  const evidence = element("div", {id: "evidence"}, [
    element("p", {class: "evidence-note", text: t("selectAnnotation")}),
  ]);
  return {
    panel: element("aside", {class: "panel annotation-panel", "aria-label": t("speechAnnotations")}, [
      annotationSection(t("moveOutline"), [annotationsList(moves)]),
      annotationSection(t("functionalSegments"), [annotationsList(segments)]),
      annotationSection(t("organizationMarkers"), [annotationsList(markers)]),
      annotationSection(t("annotationRationale"), [evidence]),
    ]),
    evidence,
  };
}

function sourcePanel(detail) {
  const source = detail.source;
  const links = [];
  if (source.collectionUrl) links.push(link(t("collectionLink"), source.collectionUrl, null, true));
  if (source.verifiedUrl && source.verifiedUrl !== source.collectionUrl) links.push(link(t("verificationLink"), source.verifiedUrl, null, true));
  return element("section", {class: "panel doc-sources", "aria-label": t("sourceAndVerification")}, [
    element("h2", {text: t("sourceAndVerification")}),
    source.title ? element("p", {class: "source-note", text: source.title, lang: "zh-CN"}) : null,
    source.verification ? element("p", {class: "source-note", text: metadataLabel(source.verification)}) : null,
    links.length ? element("p", {class: "source-links"}, links) : null,
    source.basis ? element("p", {class: "source-note", text: source.basis, lang: "zh-CN"}) : null,
  ]);
}

function yearText(record) {
  if (!record.year) return "";
  const status = record.yearStatus === "provisional" ? t("yearProvisional") : "";
  return t("recordedYear", record.year, status);
}

function articleHeading(record) {
  document.title = speechName(record) + " · " + t("siteName");
  const values = [record.id, audienceLabel(record.audience), record.speaker, yearText(record),
    record.count === null ? null : t("characterCount", textFormat.format(record.count))];
  return element("header", {class: "panel doc-head"}, [
    element("h1", {text: speechName(record)}),
    element("div", {class: "doc-meta"}, values.filter(Boolean).map(value => element("span", {text: value}))),
  ]);
}

async function renderSpeech(id) {
  const record = catalog.documents.find(entry => entry.id === id);
  app.append(element("p", {class: "breadcrumb"}, [link(fragmentMode ? t("backToFragments") : t("backToDirectory"), listUrl())]));
  if (!record) {
    app.append(notice(t("idNotFound")));
    return;
  }
  app.append(articleHeading(record));
  if (record.status === "missing") {
    app.append(element("div", {class: "notice"}, [
      element("p", {text: t("missingSpeech")}), link(t("universityWebsite"), record.schoolUrl, null, true),
    ]));
    return;
  }

  const loading = notice(t("loadingSpeech"));
  app.append(loading);
  try {
    await loadScript("data/documents/" + record.id + ".js");
  } catch {
    loading.textContent = t("speechError");
    return;
  }
  const detail = window.speechData[record.id];
  if (!detail) {
    loading.textContent = t("noSpeech");
    return;
  }

  const annotations = new Map([...detail.segments, ...detail.markers].map(item => [item.id, item]));
  const {body, letters, ranges} = articleBody(detail, annotations);
  const {panel, evidence} = articleSidebar(detail, letters);
  const article = element("article", {class: "panel reader-body", "aria-labelledby": "speech-heading"}, [
    element("h2", {id: "speech-heading", text: t("fullSpeech")}), body,
  ]);
  loading.replaceWith(element("div", {class: "reader-grid"}, [article, panel]));
  app.append(sourcePanel(detail));

  function activate(shouldScroll) {
    const anchor = location.hash.slice(1);
    const selected = annotations.get(anchor);
    for (const row of ranges) {
      row.chunk.classList.toggle("is-marked", !!selected && row.start < selected.end && row.end > selected.start);
    }
    for (const link of panel.querySelectorAll("[data-jump]")) {
      if (link.dataset.jump === anchor) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    if (!selected) return;
    const code = [selected.code, codeLabel(selected.code)].filter(Boolean).join(" · ");
    const title = [selected.id, code].filter(Boolean).join(" · ");
    const review = [selected.review, selected.scope, selected.scopeReview].filter(Boolean).map(metadataLabel).join(" · ");
    const connected = detail.relations.filter(row => row.source === anchor || row.target === anchor).map(row => {
      const other = row.source === anchor ? row.target : row.source;
      const text = row.source + " → " + row.target + " · " + row.type;
      return other === "TEXT" ? element("span", {text}) : annotationLink(other, text);
    });
    evidence.replaceChildren(element("p", {class: "evidence-title", text: title}),
      element("p", {class: "evidence-meta", text: review}),
      element("p", {class: "evidence-note", text: selected.evidence || t("noRationale"),
        lang: selected.evidence ? "zh-CN" : null}),
      element("div", {class: "evidence-relations"}, connected));
    evidence.closest("details").open = true;
    if (shouldScroll) {
      const position = document.getElementById(anchor);
      position.focus({preventScroll: true});
      position.scrollIntoView({block: "center"});
    }
  }
  window.addEventListener("hashchange", () => activate(true));
  activate(true);
}

configureInterface();

if (!catalog) {
  app.append(notice(t("catalogError")));
} else {
  const id = params.get("doc");
  document.querySelector("#version").textContent = t("corpusVersion", catalog.version);
  const nav = view === "about" ? "#about-nav" : view === "help" ? "#help-nav" : "#home-nav";
  document.querySelector(nav).setAttribute("aria-current", "page");
  if (id) renderSpeech(id);
  else if (view === "about") renderAbout();
  else if (view === "help") renderHelp();
  else renderCatalog();
}
