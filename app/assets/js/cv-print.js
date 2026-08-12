(function () {
  "use strict";

  const groupSelector = ".cv-publication-group, .cv-academic-activity-group, .cv-patent-group";

  function printEntries(content) {
    return Array.from(content.children).filter((node) => !node.hidden).flatMap((node) => {
      if (!node.matches(groupSelector)) return [{ node }];
      const list = node.querySelector(":scope > :is(.cv-publications, .cv-academic-activity-items)") || node;
      let number = 0;
      return Array.from(list.children).filter((child) => child.matches("article")).map((entry, index) => ({
        node: entry,
        group: node,
        list,
        heading: index === 0 ? node.querySelector(":scope > h3") : null,
        number: entry.querySelector(".cv-publication-number") ? ++number : null
      }));
    });
  }

  function sectionFragment(page, section, heading, content, continuation) {
    const element = section.cloneNode(false);
    const title = heading.cloneNode(true);
    const body = content.cloneNode(false);
    if (continuation) {
      element.classList.add("cv-section-continuation");
      const label = document.createElement("span");
      label.className = "cv-continuation-label";
      label.textContent = continuation;
      title.append(label);
    }
    element.append(title, body);
    page.append(element);
    return { element, body, lists: new Map() };
  }

  function appendEntry(fragment, entry, node, firstPart) {
    if (!entry.group) {
      fragment.body.append(node);
      return () => node.remove();
    }

    let list = fragment.lists.get(entry.group);
    if (list) {
      list.append(node);
      return () => node.remove();
    }

    const group = entry.group.cloneNode(false);
    list = entry.list === entry.group ? group : entry.list.cloneNode(false);
    if (firstPart && entry.heading) group.append(entry.heading.cloneNode(true));
    if (list !== group) group.append(list);
    list.append(node);
    fragment.body.append(group);
    fragment.lists.set(entry.group, list);
    return () => {
      group.remove();
      fragment.lists.delete(entry.group);
    };
  }

  function cloneRange(node, boundary, fromStart) {
    const range = document.createRange();
    range.selectNodeContents(node);
    if (fromStart) range.setEnd(boundary.node, boundary.offset);
    else range.setStart(boundary.node, boundary.offset);
    const clone = node.cloneNode(false);
    clone.append(range.cloneContents());
    return clone;
  }

  // Oversize entries can continue without discarding their text or inline links.
  function splitEntry(node, fits) {
    const breaks = [];
    const textNodes = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = textNodes.nextNode(); text; text = textNodes.nextNode()) {
      for (const word of text.data.matchAll(/\S+\s*/gu)) {
        breaks.push({ node: text, offset: word.index + word[0].length });
      }
    }

    let visible = node;
    let best = -1;
    let low = 0;
    let high = breaks.length - 2;
    while (low <= high) {
      const index = Math.floor((low + high) / 2);
      const prefix = cloneRange(node, breaks[index], true);
      visible.replaceWith(prefix);
      visible = prefix;
      if (fits()) {
        best = index;
        low = index + 1;
      } else {
        high = index - 1;
      }
    }
    if (best === -1) {
      visible.replaceWith(node);
      return null;
    }
    visible.replaceWith(cloneRange(node, breaks[best], true));
    return cloneRange(node, breaks[best], false);
  }

  function paginate(pages, header, sections, continuation, alignHeader) {
    const ruler = document.createElement("div");
    ruler.style.height = "var(--cv-print-page-height)";
    pages.append(ruler);
    const availableHeight = ruler.getBoundingClientRect().height;
    ruler.remove();
    if (!availableHeight) throw new Error("CV page dimensions could not be measured.");

    function newPage() {
      const element = document.createElement("div");
      element.className = "cv-print-page";
      pages.append(element);
      return element;
    }

    let page = newPage();
    const printHeader = header.cloneNode(true);
    page.append(printHeader);
    alignHeader(printHeader);
    const fits = () => page.getBoundingClientRect().height <= availableHeight;
    if (!fits()) throw new Error("The CV header is taller than the print area.");

    for (const section of sections) {
      const heading = section.querySelector(":scope > h2");
      const content = section.querySelector(":scope > .cv-section-content");
      let started = false;
      let fragment;

      for (const entry of printEntries(content)) {
        let node = entry.node.cloneNode(true);
        if (entry.number) node.querySelector(".cv-publication-number").textContent = `${entry.number}.`;
        let firstPart = true;
        while (node) {
          const occupied = page.childElementCount > 0;
          const needsFragment = !fragment;
          fragment ||= sectionFragment(page, section, heading, content, started ? continuation : "");
          const undo = appendEntry(fragment, entry, node, firstPart);
          if (fits()) {
            started = true;
            break;
          }

          const oversized = node.getBoundingClientRect().height > availableHeight;
          const rest = (!occupied || oversized) ? splitEntry(node, fits) : null;
          if (rest) {
            node = rest;
            started = true;
            firstPart = false;
          } else if (occupied) {
            undo();
            if (needsFragment) fragment.element.remove();
          } else {
            throw new Error("A CV entry could not be split within the page height.");
          }
          page = newPage();
          fragment = null;
        }
      }
    }
  }

  function withPrintStyles(measure) {
    if (window.matchMedia("print").matches) return measure();

    // Chromium dispatches beforeprint before switching the document to print media.
    const queries = new Map([["print", "all"], ["screen", "not all"], ["(max-width: 620px)", "not all"]]);
    const overrides = [];
    try {
      for (const sheet of document.styleSheets) {
        if (sheet.href && new URL(sheet.href).origin !== window.location.origin) continue;
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSMediaRule) || !queries.has(rule.media.mediaText)) continue;
          const original = rule.media.mediaText;
          overrides.push([rule, original]);
          rule.media.mediaText = queries.get(original);
        }
      }
      measure();
    } finally {
      overrides.forEach(([rule, original]) => { rule.media.mediaText = original; });
    }
  }

  function clear(paper) {
    paper.querySelector(":scope > .cv-print-pages")?.remove();
  }

  function prepare(paper, continuation, alignHeader) {
    clear(paper);
    const header = paper.querySelector(".cv-paper-header");
    if (!header) return;

    const sections = paper.querySelectorAll(".cv-section");
    const pages = document.createElement("div");
    pages.className = "cv-print-pages";
    paper.append(pages);
    paper.classList.add("cv-print-measuring");
    try {
      withPrintStyles(() => paginate(pages, header, sections, continuation, alignHeader));
    } catch (error) {
      pages.remove();
      console.error("CV print pagination:", error);
    } finally {
      paper.classList.remove("cv-print-measuring");
    }
  }

  window.SiteCVPrint = { prepare, clear };
}());
