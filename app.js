"use strict";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const listParams = new URLSearchParams(params);
listParams.delete("doc");
listParams.delete("view");
const fragmentMode = params.get("mode") === "fragments";
const view = params.get("view");
const textFormat = new Intl.NumberFormat("zh-CN");
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

function listUrl(search = listParams) {
  const query = search.toString();
  return query ? "?" + query : "index.html";
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
    labelNode.textContent = actual ? "登记讲话年份" : "毕业届别";
    switchYear.textContent = actual ? "按届别" : "按讲话年";
    switchYear.setAttribute("aria-label", actual ? "切换为毕业届别" : "切换为登记讲话年份");
    const years = [...new Set(catalog.documents.map(record => actual ? record.year : record.cohort).filter(Boolean))]
      .sort((a, b) => b - a);
    year.replaceChildren(selectOption("", actual ? "所有年份" : "所有届别"),
      ...years.map(n => selectOption(n, n + (actual ? " 年" : " 届"))));
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
  const school = element("input", {id: "school", name: "school", list: "schools", placeholder: "输入或选择学校",
    value: params.get("school") || ""});
  const choices = [...new Set(catalog.documents.map(record => record.school))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const datalist = element("datalist", {id: "schools"}, choices.map(name => selectOption(name, name)));
  const speaker = element("input", {id: "speaker", name: "speaker", placeholder: "输入姓名", value: params.get("speaker") || ""});
  const limit = element("input", {id: "limit", name: "limit", type: "number", min: "1", step: "1", inputmode: "numeric",
    placeholder: "不限", value: params.get("limit") || ""});
  const children = [searchModeNavigation()];

  if (fragmentMode) {
    const query = element("input", {id: "query", name: "q", type: "search", placeholder: "例如 希望你们",
      value: params.get("q") || ""});
    const code = element("select", {id: "code", name: "code"}, [selectOption("", "所有语步、步骤及标记")]);
    const steps = element("optgroup", {label: "语步和功能步骤"});
    for (const [move, name] of Object.entries(catalog.moves)) {
      steps.append(selectOption(move, move + " " + name));
      for (const [step, stepName] of Object.entries(catalog.codes)) {
        if (step.startsWith(move + "S")) steps.append(selectOption(step, "　" + step + " " + stepName));
      }
    }
    code.append(steps, element("optgroup", {label: "篇章组织标记"}, Object.entries(catalog.codes)
      .filter(([id]) => id.startsWith("ORG_")).map(([id, name]) => selectOption(id, id + " " + name))));
    code.value = params.get("code") || "";
    children.push(element("input", {type: "hidden", name: "mode", value: "fragments"}),
      element("div", {class: "fragment-fields"}, [label("正文关键词", query), label("编码", code)]));
  }

  children.push(element("div", {class: "filter-grid"}, [yearField(), label("学校", school), label("致辞人", speaker), label("字数上限", limit)]), datalist);
  const actions = element("div", {class: "search-actions"}, [
    element("button", {type: "submit", class: "primary", text: "检索"}),
    link("清空", fragmentMode ? "?mode=fragments" : "index.html", "secondary"),
  ]);
  const form = element("form", {class: "panel search-panel", "aria-label": "检索条件"}, [...children, actions,
    element("p", {class: "search-hint", text: "字数按非空白字符计，含标点。"}),
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
  const form = record.status === "supplement" ? "毕业致信" : "毕业致辞";
  return record.school + " " + record.cohort + " 届" + form;
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
  return element("nav", {class: "pager", "aria-label": "结果分页"}, [
    control("上一页", page - 1, page > 1),
    element("span", {class: "page-count", text: page + " / " + last}),
    control("下一页", page + 1, page < last),
  ]);
}

function catalogTable(records) {
  const page = pageOf(records);
  const rows = page.rows.map(record => {
    const title = speechName(record);
    const available = record.status !== "missing";
    const textCell = available ? link(title, speechUrl(record.id), "title-link") :
      element("span", {class: "title-label", text: title});
    const labelText = [record.audience, record.status === "supplement" ? "补充材料" : null]
      .filter(Boolean).join(" · ");
    const action = available ? link("阅读全文", speechUrl(record.id), "row-action") :
      element("div", {}, [
        element("span", {class: "status-missing row-action", text: "暂缺全文"}), " ",
        link("学校官网", record.schoolUrl, "row-action", true),
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
      element("table", {class: "catalog-table", "aria-label": "致辞目录结果"}, [
        tableHead([["学校与致辞"], ["GT 编号", "hide-narrow"], ["届别", "number hide-narrow"], ["致辞人", "hide-narrow"],
          ["字数", "number hide-narrow"], ["全文与来源"]]),
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
    const name = record.school + " " + record.cohort + " 届";
    return element("tr", {}, [
      element("td", {class: "source-cell"}, [link(name, speechUrl(key, id), "title-link"), element("small", {class: "result-meta", text: [record.speaker, key, id].filter(Boolean).join(" · ")})]),
      element("td", {class: "mono code-cell", text: code || "—"}),
      element("td", {class: "left-context context", text: (left.length > 34 ? "…" : "") + contextText(left.slice(-34))}),
      element("td", {class: "key-cell"}, [link(hit, speechUrl(key, id), "title-link")]),
      element("td", {class: "context", text: contextText(right.slice(0, 40)) + (right.length > 40 ? "…" : "")}),
    ]);
  });
  return element("div", {class: "panel"}, [
    element("div", {class: "table-wrap", tabindex: "0", role: "region", "aria-label": "可横向滚动的片段结果"}, [
      element("table", {class: "kwic", "aria-label": "片段检索结果"}, [
        tableHead([["致辞与片段", "source-cell"], ["编码", "code-cell"], ["左侧语境", "left-context"], ["命中片段", "key-cell"], ["右侧语境"]]),
        element("tbody", {}, body),
      ]),
    ]),
    pager(page.page, page.last),
  ]);
}

function searchModeNavigation() {
  const search = new URLSearchParams(listParams);
  for (const key of ["mode", "page", "q", "code"]) search.delete(key);
  const directoryLink = link("致辞目录", listUrl(search), "mode-link");
  search.set("mode", "fragments");
  const fragmentLink = link("片段检索", listUrl(search), "mode-link");
  (fragmentMode ? fragmentLink : directoryLink).setAttribute("aria-current", "page");
  return element("nav", {class: "search-modes", "aria-label": "检索方式"}, [directoryLink, fragmentLink]);
}

function renderAbout() {
  document.title = "简介 · 高校毕业致辞语料库";
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
  const stats = [["所高校", schools.size], ["篇全文", fullTexts], ["字（全文总字数）", characters]];
  const schoolCounts = [...schools].sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([name, count]) => element("li", {}, [
      element("span", {text: name}),
      element("span", {text: textFormat.format(count) + " 篇"}),
    ]));
  app.append(element("article", {class: "info-page panel", "aria-labelledby": "about-heading"}, [
    element("h1", {id: "about-heading", text: "语料库简介"}),
    element("p", {class: "intro", text: "高校毕业致辞语料库是 R.W. Corpus Collection 的一个专题库，由 R.W. 个人建设和维护。它汇集高校毕业典礼及相关学位授予仪式上的中文致辞，支持全文阅读、片段检索和篇章结构比较。"}),
    element("dl", {class: "author-details"}, [
      element("dt", {text: "建库与维护"}), element("dd", {text: "R.W."}),
      element("dt", {text: "作者单位"}), element("dd", {}, [
        link("北京师范大学国际中文教育学院", "https://gjzw.bnu.edu.cn/", null, true),
      ]),
    ]),
    element("h2", {text: "收录范围"}),
    element("p", {text: "本库涵盖 2017—2026 届毕业生。每场致辞单独登记，以 GT 编号标识。同校同届的本科生场、研究生场等不同场次可以分别查阅。正文保留在研究中采用的文本版本，暂缺全文的条目提供学校官网。"}),
    element("dl", {class: "info-stats"}, stats.map(([name, n]) => element("div", {}, [
      element("dt", {text: name}), element("dd", {text: textFormat.format(n)}),
    ]))),
    element("p", {text: "各校篇数按已收录的全文统计。总字数按正文中的非空白字符计算，含标点。"}),
    element("h2", {text: "检索与阅读"}),
    element("ul", {class: "about-list"}, [
      element("li", {text: "查整篇致辞。可组合毕业届别、学校、致辞人和字数上限，找出同一学校或同一届次的多场致辞，逐篇阅读连续正文。"}),
      element("li", {text: "查片段与标记。可按关键词或编码检索功能片段和篇章组织标记。点击结果便可跳到全文的原位置，查看前后文。"}),
      element("li", {text: "核查标注和出处。全文页可展开语步目录、功能片段、篇章组织标记与判定依据，并查看原收集链接、核验链接与底本备注。"}),
    ]),
    element("h2", {text: "研究与教学用途"}),
    element("p", {text: "可以用本库分析毕业致辞怎样从问候过渡到主题、提出期待并加以论证，也可以比较不同学校、届别或场次在组织方式和表达策略上的差异。例如，先检索「希望你们」所在的片段，再查看同篇讲者怎样为期待提供理由。教学中可用整篇致辞开展体裁分析，或让学生尝试分段编码，再与现有判定依据对照讨论。"}),
    element("h2", {text: "版本与引用"}),
    element("p", {text: "当前语料版本为 v" + catalog.version + "。引用时请注明语料库名称、版本和 GT 编号，引用具体片段时附上片段号。进行历时比较时，请注明使用毕业届别还是登记讲话年份，并留意按届别暂记的年份。"}),
    element("h2", {id: "schools-heading", text: "各校收录篇数"}),
    element("ul", {class: "school-counts", role: "list", "aria-labelledby": "schools-heading"}, schoolCounts),
  ]));
}

function renderHelp() {
  document.title = "帮助 · 高校毕业致辞语料库";
  const examples = [
    ["查一场或同届多场致辞", "首页默认按毕业届别筛选，也可以填写学校、致辞人或字数上限。点击「阅读全文」查看整篇致辞。"],
    ["按讲话年份查找", "点击年份旁的「按讲话年」可以切换。全文页把暂按届别登记的年份明确标出，便于区分补办典礼和原毕业届别。"],
    ["从片段回到全文", "打开「片段检索」，输入关键词或选择编码，也可进一步限制学校和届别。点击命中结果会跳到全文并高亮对应位置。"],
    ["查看判定依据和出处", "在全文页展开语步目录、功能片段或篇章组织标记，再点击相关条目即可显示判定依据。原收集链接和核验链接位于全文下方。"],
    ["字数上限与缺全文登记", "字数按非空白字符计算，包含标点。设置字数上限时，无法统计字数的缺全文登记会从结果中略去。"],
  ];
  app.append(element("article", {class: "info-page panel", "aria-labelledby": "help-heading"}, [
    element("h1", {id: "help-heading", text: "检索帮助"}),
    ...examples.flatMap(([title, description]) => [
      element("h2", {text: title}), element("p", {text: description}),
    ]),
    element("p", {class: "info-reference"}, [
      link("试查复旦大学 2021 届", "?" + new URLSearchParams({school: "复旦大学", year: "2021"})),
    ]),
  ]));
}

function resultsHeader(title, summary) {
  return element("div", {class: "result-bar"}, [element("h2", {text: title}), element("p", {text: summary, role: "status"})]);
}

async function renderCatalog() {
  const list = filteredCatalog();
  const results = element("section", {id: "results", class: "results", "aria-label": "检索结果"});
  app.append(element("h1", {class: "sr-only", text: fragmentMode ? "片段检索" : "致辞目录"}), searchForm(), results);
  if (!fragmentMode) {
    const withText = list.filter(record => record.status !== "missing").length;
    const summary = textFormat.format(list.length) + " 条登记 · " + textFormat.format(withText) + " 篇有全文";
    results.append(resultsHeader("检索结果", summary),
      list.length ? catalogTable(list) : notice("没有匹配的登记。请调整学校、届别、致辞人或字数条件。"));
    return;
  }

  const keyword = (params.get("q") || "").trim();
  const code = params.get("code");
  if (!keyword && !code) {
    results.append(notice("输入关键词或选择一个编码，即可查看匹配片段及左右语境。"));
    return;
  }

  results.append(notice("正在读取片段索引…"));
  try {
    await loadScript("data/fragments.js");
    const docIndex = new Map(list.map(record => [record.id, record]));
    const matching = window.fragments.filter(([id, , candidate, text]) =>
      docIndex.has(id) && matchedCode(candidate, code) && (!keyword || text.includes(keyword)));
    const matches = new Set(matching.map(([id]) => id)).size;
    const summary = textFormat.format(matching.length) + " 条片段与标记 · " + textFormat.format(matches) + " 篇致辞";
    results.replaceChildren(resultsHeader("检索结果", summary),
      matching.length ? fragmentTable(matching, docIndex, keyword) : notice("没有找到匹配的片段或标记。"));
  } catch {
    results.replaceChildren(notice("片段索引未能加载。请解压完整文件夹后重新打开首页。"));
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
    element("p", {class: "evidence-note", text: emptyText || "这篇文本没有此类标注。"});
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
  const body = element("div", {class: "speech", id: "speech-text"});
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
    return [annotationLink(item.id, [item.move, catalog.moves[item.move], item.id].filter(Boolean).join(" · "))];
  });
  const segments = detail.segments.map(item =>
    annotationLink(item.id, [item.id, item.code && catalog.codes[item.code], excerpt(item)].filter(Boolean).join(" · ")));
  const markers = detail.markers.map(item =>
    annotationLink(item.id, [item.id, catalog.codes[item.code] || item.code, item.quote].filter(Boolean).join(" · ")));
  const evidence = element("div", {id: "evidence"}, [
    element("p", {class: "evidence-note", text: "选择一个功能片段或篇章标记，查看它的判定依据。"}),
  ]);
  return {
    panel: element("aside", {class: "panel annotation-panel", "aria-label": "致辞标注"}, [
      annotationSection("语步目录", [annotationsList(moves)]),
      annotationSection("功能片段", [annotationsList(segments)]),
      annotationSection("篇章组织标记", [annotationsList(markers)]),
      annotationSection("判定依据", [evidence]),
    ]),
    evidence,
  };
}

function sourcePanel(detail) {
  const source = detail.source;
  const links = [];
  if (source.collectionUrl) links.push(link("原收集链接", source.collectionUrl, null, true));
  if (source.verifiedUrl && source.verifiedUrl !== source.collectionUrl) links.push(link("核验链接", source.verifiedUrl, null, true));
  return element("section", {class: "panel doc-sources", "aria-label": "来源与核验"}, [
    element("h2", {text: "来源与核验"}),
    source.title ? element("p", {class: "source-note", text: source.title}) : null,
    source.verification ? element("p", {class: "source-note", text: source.verification}) : null,
    links.length ? element("p", {class: "source-links"}, links) : null,
    source.basis ? element("p", {class: "source-note", text: source.basis}) : null,
  ]);
}

function yearText(record) {
  if (!record.year) return "";
  const status = record.yearStatus === "provisional" ? "（暂按届别）" : "";
  return "登记讲话年份 " + record.year + status;
}

function articleHeading(record) {
  document.title = speechName(record) + " · 高校毕业致辞语料库";
  const values = [record.id, record.audience, record.speaker, yearText(record),
    record.count === null ? null : textFormat.format(record.count) + " 字"];
  return element("header", {class: "panel doc-head"}, [
    element("h1", {text: speechName(record)}),
    element("div", {class: "doc-meta"}, values.filter(Boolean).map(value => element("span", {text: value}))),
  ]);
}

async function renderSpeech(id) {
  const record = catalog.documents.find(entry => entry.id === id);
  app.append(element("p", {class: "breadcrumb"}, [link(fragmentMode ? "返回片段检索" : "返回致辞目录", listUrl())]));
  if (!record) {
    app.append(notice("没有找到该 GT 编号的登记。"));
    return;
  }
  app.append(articleHeading(record));
  if (record.status === "missing") {
    app.append(element("div", {class: "notice"}, [
      element("p", {text: "这条登记暂缺全文。"}), link("学校官网", record.schoolUrl, null, true),
    ]));
    return;
  }

  const loading = notice("正在读取整篇致辞…");
  app.append(loading);
  try {
    await loadScript("data/documents/" + record.id + ".js");
  } catch {
    loading.textContent = "正文未能加载。请解压完整文件夹后重新打开首页。";
    return;
  }
  const detail = window.speechData[record.id];
  if (!detail) {
    loading.textContent = "未能找到本篇正文。";
    return;
  }

  const annotations = new Map([...detail.segments, ...detail.markers].map(item => [item.id, item]));
  const {body, letters, ranges} = articleBody(detail, annotations);
  const {panel, evidence} = articleSidebar(detail, letters);
  const article = element("article", {class: "panel reader-body", "aria-labelledby": "speech-heading"}, [
    element("h2", {id: "speech-heading", text: "致辞全文"}), body,
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
    const code = [selected.code, catalog.codes[selected.code]].filter(Boolean).join(" · ");
    const title = [selected.id, code].filter(Boolean).join(" · ");
    const review = [selected.review, selected.scope, selected.scopeReview].filter(Boolean).join(" · ");
    const connected = detail.relations.filter(row => row.source === anchor || row.target === anchor).map(row => {
      const other = row.source === anchor ? row.target : row.source;
      const text = row.source + " → " + row.target + " · " + row.type;
      return other === "TEXT" ? element("span", {text}) : annotationLink(other, text);
    });
    evidence.replaceChildren(element("p", {class: "evidence-title", text: title}),
      element("p", {class: "evidence-meta", text: review}),
      element("p", {class: "evidence-note", text: selected.evidence || "这条标注未填写判定依据。"}),
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

if (!catalog) {
  app.append(notice("语料目录未能加载。请解压完整文件夹后打开 index.html。"));
} else {
  const id = params.get("doc");
  document.querySelector("#version").textContent = "语料版本 v" + catalog.version;
  const nav = view === "about" ? "#about-nav" : view === "help" ? "#help-nav" : "#home-nav";
  document.querySelector(nav).setAttribute("aria-current", "page");
  if (id) renderSpeech(id);
  else if (view === "about") renderAbout();
  else if (view === "help") renderHelp();
  else renderCatalog();
}
