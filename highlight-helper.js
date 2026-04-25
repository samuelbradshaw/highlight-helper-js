/**
 * HighlightHelper.js
 * https://github.com/samuelbradshaw/highlight-helper-js
 */

'use strict';

/********************** Highlighter Initialization **********************/

function Highlighter(options = _defaultOptions) {
  for (const key of Object.keys(_defaultOptions)) {
    options[key] = options[key] ?? _defaultOptions[key];
  }
  this._options = options;

  // DOM references
  this._annotatableContainer = null;
  this._relativeAncestorElement = null;
  this._annotatableParagraphs = null;
  this._svgBackground = null;
  this._svgActiveOverlay = null;
  this._selectionHandles = null;

  // Stylesheets
  this._stylesheets = null;
  this._generalStylesheet = null;
  this._appearanceStylesheet = null;
  this._highlightApiStylesheet = null;
  this._selectionStylesheet = null;

  // Data and state
  this._annotatableParagraphIds = null;
  this._hyperlinkElements = null;
  this._hyperlinksByPosition = null;
  this._highlightsById = null;

  // Abort controller
  this._controller = null;

  const isInitialized = this._initializeHighlighter();
  if (!isInitialized) return;

  // Interaction state
  this._activeHighlightId = undefined;
  this._previousSelectionRange = undefined;
  this._activeSelectionHandle = undefined;
  this._dragAnchorNode = undefined;
  this._dragAnchorOffset = undefined;
  this._pointerType = undefined;
  this._tapResult = undefined;
  this._doubleTapTimeoutId = undefined;
  this._longPressTimeoutId = undefined;
  this._allowHyperlinkClick = false;

  this._loadStyles();
  this._loadEventListeners();

  this._updateAppearanceStylesheet();
  this._updateSelectionUi('appearance');
  this.setOptions({ selectionHandles: this._options.selectionHandles });
}

Highlighter.prototype._initializeHighlighter = function (previousContainerSelector = null) {
  const options = this._options;
  if (!options.paragraphSelector.includes(options.containerSelector)) {
    const paragraphSelectorList = options.paragraphSelector.split(',').map(selector => `${options.containerSelector} ${selector}`);
    options.paragraphSelector = paragraphSelectorList.join(',');
  }
  this._annotatableContainer = document.querySelector(options.containerSelector);
  this._annotatableParagraphs = this._annotatableContainer.querySelectorAll(options.paragraphSelector);
  this._annotatableParagraphIds = Array.from(this._annotatableParagraphs, paragraph => paragraph.id);

  // Handle cases where a highlighter already exists for the container, or one of its children or ancestors
  const previousContainer = document.querySelector(previousContainerSelector) ?? this._annotatableContainer;
  if (previousContainer.highlighter) {
    previousContainer.highlighter.removeHighlighter();
  } else if (this._annotatableContainer.closest('[data-hh-container]') || this._annotatableContainer.querySelector('[data-hh-container]')) {
    console.error(`Unable to create Highlighter with container selector "${options.containerSelector}" (annotatable container can't be an child or ancestor of another annotatable container).`);
    return false;
  }

  // Get the closest ancestor element with `position: relative`, or the root element (this is used to calculate the position of selection handles and SVG highlights)
  let ancestorElement = this._annotatableContainer;
  while (ancestorElement) {
    if (ancestorElement === document.documentElement || globalThis.getComputedStyle(ancestorElement).position === 'relative') {
      this._relativeAncestorElement = ancestorElement;
      break;
    }
    ancestorElement = ancestorElement.parentElement;
  }

  // Abort controller can be used to cancel event listeners if the highlighter is removed
  this._controller = new AbortController;

  // Setting tabIndex -1 on <body> allows focus to be set programmatically (needed to initialize text selection in iOS Safari). It also prevents "tap to search" from interfering with text selection in Android Chrome.
  document.body.tabIndex = -1;

  // Set up SVG background and selection handles
  this._svgBackground = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  this._svgActiveOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  this._svgActiveOverlay.dataset.activeOverlay = '';
  this._svgBackground.appendChild(this._svgActiveOverlay);
  this._svgBackground.classList.add('hh-svg-background');
  this._annotatableContainer.appendChild(this._svgBackground);
  this._annotatableContainer.insertAdjacentHTML('beforeend', `
    <div class="hh-selection-handle" data-side="left" data-position="start" data-hh-ignore=""><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
    <div class="hh-selection-handle" data-side="right" data-position="end" data-hh-ignore=""><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
  `);
  this._selectionHandles = this._annotatableContainer.getElementsByClassName('hh-selection-handle');

  // Check for hyperlinks on the page
  this._hyperlinkElements = this._annotatableContainer.getElementsByTagName('a');
  this._hyperlinksByPosition = {}
  for (let hyp = 0; hyp < this._hyperlinkElements.length; hyp++) {
    const hyperlink = this._hyperlinkElements[hyp];
    hyperlink.dataset.hhPosition = hyp;
    this._hyperlinksByPosition[hyp] = {
      'position': hyp,
      'text': hyperlink.innerHTML,
      'url': hyperlink.href,
      'hyperlinkElement': hyperlink,
    }
  }

  this._highlightsById = {};
  this._annotatableContainer.dataset.hhContainer = '';
  this._annotatableContainer.highlighter = this;
  _highlighters.push(this);

  return true;
}

Highlighter.prototype._loadStyles = function () {
  const options = this._options;

  // Set up stylesheets
  this._stylesheets = {}
  this._generalStylesheet = addStylesheet(this._stylesheets, 'general');
  this._appearanceStylesheet = addStylesheet(this._stylesheets, 'appearance');
  this._highlightApiStylesheet = addStylesheet(this._stylesheets, 'highlight-api');
  this._selectionStylesheet = addStylesheet(this._stylesheets, 'selection');
  this._generalStylesheet.replaceSync(`
    ${options.containerSelector} {
      -webkit-tap-highlight-color: transparent;
    }
    .hh-wrapper-start, .hh-wrapper-end, .hh-selection-handle {
      -webkit-user-select: none;
      user-select: none;
    }
    .hh-selection-handle {
      position: absolute;
      width: 0px;
      visibility: hidden;
    }
    [data-hh-pointer-down="true"] .hh-selection-handle {
      visibility: hidden !important;
    }
    .hh-selection-handle-content {
      position: absolute;
      height: 100%;
    }
    .hh-selection-handle [draggable] {
      position: absolute;
      top: -0.3em;
      width: 3.2em;
      height: calc(100% + 1.3em);
      background-color: transparent;
      z-index: 1;
    }
    .hh-selection-handle[data-side="left"] [draggable] { right: -2em; }
    .hh-selection-handle[data-side="right"] [draggable] { left: -2em; }
    .hh-default-handle {
      position: absolute;
      width: 0.8em;
      height: min(1.2em, 100%);
      background-color: hsl(from var(--hh-color) h 80% 40% / 1);
      outline: 0.1em solid hsla(0, 0%, 100%, 0.8);
      outline-offset: -0.05em;
      bottom: -0.2em;
    }
    .hh-selection-handle[data-side="left"] .hh-default-handle {
      right: 0;
      border-radius: 1em 0 0.6em 0.6em;
    }
    .hh-selection-handle[data-side="right"] .hh-default-handle {
      left: 0;
      border-radius: 0 1em 0.6em 0.6em;
    }
    .hh-svg-background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      overflow: visible;
      z-index: -1;
    }
    .hh-svg-background g {
      fill: transparent;
      stroke: none;
    }
    mark[data-highlight-id] {
      background-color: transparent;
      color: inherit;
    }
  `);
}

Highlighter.prototype._loadEventListeners = function () {
  const options = this._options;

  // Selection change in document (new selection, change in selection range, or selection collapsing to a caret)
  const respondToSelectionChange = (event) => {
    const selection = this._getRestoredSelectionOrCaret(globalThis.getSelection());
    const selectionRange = selection.type === 'None' ? null : selection.getRangeAt(0);

    // In "Mac (Designed for iPad)" apps (iPad app running on macOS – most recently tested with macOS Sequoia 15.3.1), in-app webviews have several quirks related to text selection. One of these is text selection collapsing to a caret more often than expected. This code attempts to restore the previous selection range if it unexpectedly collapses to a caret in these scenarios:
    // 1. While dragging custom selection handles (happens randomly). TODO: Dragging custom selection handles in this environment is still sometimes a little jumpy.
    // 2. Just after clicking to activate a highlight (happens if it's the first click after the page loads).
    if (isWKWebView && !isTouchDevice && selection.type !== 'Range' && this._previousSelectionRange && (this._activeSelectionHandle || (this._previousSelectionRange.compareBoundaryPoints(Range.END_TO_START, selectionRange) <= 0 && this._previousSelectionRange.compareBoundaryPoints(Range.END_TO_END, selectionRange) >= 0))) {
      selection.setBaseAndExtent(this._previousSelectionRange.startContainer, this._previousSelectionRange.startOffset, this._previousSelectionRange.endContainer, this._previousSelectionRange.endOffset);
    }

    // Deactivate highlights when tapping or creating a selection outside of the previous selection range
    if (!this._activeSelectionHandle && this._previousSelectionRange && (selection.type !== 'Range' || this._previousSelectionRange.comparePoint(selectionRange.startContainer, selectionRange.startOffset) === 1 || this._previousSelectionRange.comparePoint(selectionRange.endContainer, selectionRange.endOffset) === -1)) {
      this.deactivateHighlights(false);
    }

    if (selection.type === 'Range') {
      // Clear tap result (prevents hh:tap event from being sent when long-pressing or dragging to select text)
      this._tapResult = null;

      if (this._annotatableContainer.contains(selection.anchorNode)) {
        if (this._activeHighlightId || (options.pointerMode === 'live' || (options.pointerMode === 'auto' && this._pointerType === 'pen'))) {
          this.createOrUpdateHighlight({ highlightId: this._activeHighlightId, });
        }
        this._previousSelectionRange = selectionRange.cloneRange();
      }
    }

    this._updateSelectionUi('bounds');
  }
  document.addEventListener('selectionchange', (event) => respondToSelectionChange(event), { signal: this._controller.signal });

  // Pointer down in annotatable container
  const respondToPointerDown = (event) => {
    const isSecondaryClick = (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
    if (!isSecondaryClick) this._annotatableContainer.dataset.hhPointerDown = 'true';
    this._pointerType = event.pointerType;

    // Pointer down on a selection handle
    if (event.target?.closest('.hh-selection-handle')) {
      if (!isSecondaryClick) {
        this._activeSelectionHandle = event.target.parentElement.closest('.hh-selection-handle');
        const selectionHandleClientRect = this._activeSelectionHandle.getBoundingClientRect();
        const lineHeight = selectionHandleClientRect.bottom - selectionHandleClientRect.top;
        this._activeSelectionHandle.dataset.dragYOffset = Math.max(0, event.clientY - selectionHandleClientRect.bottom + (lineHeight / 6));
        const selectionRange = globalThis.getSelection().getRangeAt(0);
        this._dragAnchorNode = this._activeSelectionHandle.dataset.position === 'start' ? selectionRange.endContainer : selectionRange.startContainer;
        this._dragAnchorOffset = this._activeSelectionHandle.dataset.position === 'start' ? selectionRange.endOffset : selectionRange.startOffset;
        this._annotatableContainer.addEventListener('pointermove', respondToSelectionHandleDrag, { signal: this._controller.signal });
        this._updateSelectionUi('bounds');
      }
      // Prevent default drag interaction (which would show a thumbnail and drag selected text)
      return event.preventDefault();
    }

    // Deactivate highlights and return on double-tap. This fixes a bug where double-tapping and holding a word in a highlight in iOS Safari caused the highlight to activate then shrink to the selected word.
    if (this._doubleTapTimeoutId) {
      return this.deactivateHighlights();
    } else {
      this._doubleTapTimeoutId = setTimeout(() => this._doubleTapTimeoutId = clearTimeout(this._doubleTapTimeoutId), 500);
    }

    // Return if it's not a regular click, or if the user is tapping away from an existing selection
    if (this._previousSelectionRange || isSecondaryClick) return;

    // Trigger a long-press event if the user doesn't lift their finger within the specified time
    if (options.longPressTimeout) this._longPressTimeoutId = setTimeout(() => respondToLongPress(event), options.longPressTimeout);

    this._tapResult = this._checkForTapTargets(event);
  }
  this._annotatableContainer.addEventListener('pointerdown', (event) => respondToPointerDown(event), { signal: this._controller.signal });

  // Selection handle drag (this function is added as an event listener on pointerdown, and removed on pointerup)
  const respondToSelectionHandleDrag = (event) => {
    this._activeSelectionHandle.dataset.pointerXPosition = event.clientX;
    this._activeSelectionHandle.dataset.pointerYPosition = event.clientY;
    const selection = globalThis.getSelection();
    const selectionRange = selection.getRangeAt(0);
    const dragCaret = this._getCaretFromCoordinates(event.clientX, event.clientY - this._activeSelectionHandle.dataset.dragYOffset, true, false, true);

    // Return if there's no drag caret, if the drag caret is invalid, or if the drag caret and anchor caret have the same position
    if (!dragCaret || dragCaret.startContainer.nodeType !== Node.TEXT_NODE || dragCaret.endContainer.nodeType !== Node.TEXT_NODE || (this._dragAnchorNode === dragCaret.endContainer && this._dragAnchorOffset === dragCaret.endOffset)) return;

    // Check if start and end selection handles switched positions
    const dragPositionRelativeToSelectionStart = dragCaret.compareBoundaryPoints(Range.START_TO_END, selectionRange);
    const dragPositionRelativeToSelectionEnd = dragCaret.compareBoundaryPoints(Range.END_TO_END, selectionRange);
    if (this._activeSelectionHandle.dataset.position === 'start' && dragPositionRelativeToSelectionEnd === 1 || this._activeSelectionHandle.dataset.position === 'end' && dragPositionRelativeToSelectionStart === -1) {
      for (const selectionHandle of this._selectionHandles) {
        selectionHandle.dataset.position = selectionHandle.dataset.position === 'start' ? 'end' : 'start';
      }
    }

    // Update selection
    selection.setBaseAndExtent(this._dragAnchorNode, this._dragAnchorOffset, dragCaret.endContainer, dragCaret.endOffset);
  }

  // Long press in annotatable container (triggered by setTimeout() in pointerdown event)
  const respondToLongPress = (event) => {
    respondToPointerUp(event, true);
    this._tapResult = null;
  }

  // Pointer up in annotatable container
  const respondToPointerUp = (event, isLongPress = false) => {
    if (this._tapResult) {
      this._tapResult.isLongPress = isLongPress;
      this._annotatableContainer.dispatchEvent(new CustomEvent('hh:tap', { detail: this._tapResult, }));
      if (options.autoTapToActivate && this._tapResult?.targetFound && !isLongPress) {
        if (this._tapResult.targetCount > 1) {
          return this._annotatableContainer.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: this._tapResult, }));
        } else if (this._tapResult.highlights.length === 1) {
          return this.activateHighlight(this._tapResult.highlights[0].highlightId);
        } else if (this._tapResult.hyperlinks.length === 1) {
          return this.activateHyperlink(this._tapResult.hyperlinks[0].position);
        }
      }
    }
  }
  this._annotatableContainer.addEventListener('pointerup', (event) => respondToPointerUp(event), { signal: this._controller.signal });

  // Pointer up or cancel in window
  const respondToWindowPointerUp = (event) => {
    const selection = globalThis.getSelection();
    if (selection.type === 'Range' && this._activeHighlightId && this._annotatableContainer.contains(selection.anchorNode)) {
      const adjustedSelectionRange = this._snapRangeToBoundaries(selection.getRangeAt(0), selection.anchorNode);

      // Update the selection range if needed
      // In Android Chrome, sometimes selection handles don't show when a selection is updated programmatically, so it's best to only update the selection if needed.
      const selectionRange = selection.getRangeAt(0);
      if (!(
        adjustedSelectionRange.startContainer === selectionRange.startContainer &&
        adjustedSelectionRange.startOffset === selectionRange.startOffset &&
        adjustedSelectionRange.endContainer === selectionRange.endContainer &&
        adjustedSelectionRange.endOffset === selectionRange.endOffset)
      ) {
        selection.setBaseAndExtent(adjustedSelectionRange.startContainer, adjustedSelectionRange.startOffset, adjustedSelectionRange.endContainer, adjustedSelectionRange.endOffset);
      }
    }
    this._tapResult = null;
    this._longPressTimeoutId = clearTimeout(this._longPressTimeoutId);
    this._annotatableContainer.dataset.hhPointerDown = 'false';
    if (this._activeSelectionHandle) {
      this._activeSelectionHandle = null;
      this._updateSelectionUi('bounds');
      this._annotatableContainer.removeEventListener('pointermove', respondToSelectionHandleDrag);
    }
  }
  globalThis.addEventListener('pointerup', (event) => respondToWindowPointerUp(event), { signal: this._controller.signal });
  globalThis.addEventListener('pointercancel', (event) => respondToWindowPointerUp(event), { signal: this._controller.signal });

  // Hyperlink click (for each hyperlink in annotatable container)
  for (const hyperlinkElement of this._hyperlinkElements) {
    hyperlinkElement.addEventListener('click', (event) => {
      this.deactivateHighlights();
      if (!this._allowHyperlinkClick) event.preventDefault();
    }, { signal: this._controller.signal });
  }

  // Annotatable container resize (debounced)
  let computedStyle = globalThis.getComputedStyle(this._annotatableContainer);
  let previousWidth = Math.round(this._annotatableContainer.clientWidth - Number.parseInt(computedStyle.getPropertyValue('padding-left')) - Number.parseInt(computedStyle.getPropertyValue('padding-right')));
  this._resizeObserver = new ResizeObserver(debounce((entries) => {
    for (const entry of entries) {
      const width = Math.round(entry.contentBoxSize[0].inlineSize);
      // Only respond if the annotatable content width changed
      if (width !== previousWidth) {
        if (options.drawingMode === 'svg') this.drawHighlights();
        if (this._previousSelectionRange) this._updateSelectionUi('bounds');
        previousWidth = width;
      }
    }
  }, Math.floor(Object.keys(this._highlightsById).length / 20)));
  this._resizeObserver.observe(this._annotatableContainer);
}


/********************** Public Methods **********************/

// Load highlights
Highlighter.prototype.loadHighlights = function (highlights) {
  // Don't load highlights until the document is ready (otherwise, highlights may be offset)
  if (document.readyState !== 'complete') return setTimeout(this.loadHighlights.bind(this), 10, highlights);
  const startTimestamp = Date.now();

  // Hide container (repeated DOM manipulations are faster if the container is hidden)
  if (highlights.length > 1) {
    let containerToHide = this._options.drawingMode === 'svg' ? this._svgBackground : this._annotatableContainer;
    containerToHide.style.display = 'none';
  }

  // Load read-only highlights first (read-only highlights change the DOM, affecting other highlights' ranges)
  const sortedHighlights = highlights.sort((a,b) => a.readOnly === b.readOnly ? 0 : a.readOnly ? -1 : 1);

  const knownHighlightIds = Object.keys(this._highlightsById);
  let addedCount = 0, updatedCount = 0;
  for (const highlight of sortedHighlights) {
    const highlightInfo = this._diffHighlight(highlight, this._highlightsById[highlight.highlightId]);
    highlightInfo.highlightId = highlight.highlightId;
    const knownHighlightIndex = knownHighlightIds.indexOf(highlightInfo.highlightId);
    if (knownHighlightIndex > -1) {
      knownHighlightIds.splice(knownHighlightIndex, 1);
      if (Object.keys(highlightInfo).length > 1) {
        this.createOrUpdateHighlight(highlightInfo, false); updatedCount++;
      }
    } else {
      this.createOrUpdateHighlight(highlightInfo, false); addedCount++;
    }
  }
  if (knownHighlightIds.length > 0) this.removeHighlights(knownHighlightIds);

  (this._options.drawingMode === 'svg' ? this._svgBackground : this._annotatableContainer).style.display = '';
  this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: {
    addedCount: addedCount, removedCount: knownHighlightIds.length, updatedCount: updatedCount,
    totalCount: Object.keys(this._highlightsById).length,
    timeToLoad: Date.now() - startTimestamp,
  } }));
}

// Draw (or redraw) specified highlights, or all highlights on the page
Highlighter.prototype.drawHighlights = function (highlightIds = Object.keys(this._highlightsById)) {
  const options = this._options;

  // Hide container (repeated DOM manipulations is faster if the container is hidden)
  if (highlightIds.length > 1) {
    let containerToHide = options.drawingMode === 'svg' ? this._svgBackground : this._annotatableContainer;
    containerToHide.style.display = 'none';
  }

  for (const highlightId of highlightIds) {
    const highlightInfo = this._highlightsById[highlightId];
    let range = this._getCorrectedRangeObj(highlightId);
    const rangeParagraphs = this._annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
    const wasDrawnAsReadOnly = this._annotatableContainer.querySelector(`[data-highlight-id="${highlightId}"][data-read-only]`);

    // Don't redraw a read-only highlight that's already drawn
    if (wasDrawnAsReadOnly && highlightInfo.readOnly) continue;

    // Remove old highlight and wrapper elements
    const existingStartWrapper = this._annotatableContainer.querySelector(`.hh-wrapper-start[data-highlight-id="${highlightId}"]`);
    const existingEndWrapper = this._annotatableContainer.querySelector(`.hh-wrapper-end[data-highlight-id="${highlightId}"]`);
    existingStartWrapper?.remove();
    existingEndWrapper?.remove();
    this._undrawHighlight(highlightInfo);

    // Insert wrappers before drawing highlights, so any layout shift from wrapper content is reflected in drawing positions
    if (highlightInfo.wrapper && (options.wrappers[highlightInfo.wrapper]?.start || options.wrappers[highlightInfo.wrapper]?.end)) {
      const insertWrapper = (position, range, existingEl, innerHtml) => {
        const serializedWrapperVariables = JSON.stringify(highlightInfo.wrapperVariables);
        for (const key of Object.keys(highlightInfo.wrapperVariables)) {
          innerHtml = innerHtml.replaceAll(`{${key}}`, highlightInfo.wrapperVariables[key]);
        }
        let htmlElement;
        if (existingEl) {
          existingEl.dataset.color = highlightInfo.color;
          existingEl.dataset.style = highlightInfo.style;
          const wrapperContentChanged = existingEl.dataset.wrapper !== highlightInfo.wrapper || existingEl.dataset.wrapperVariables !== serializedWrapperVariables;
          if (wrapperContentChanged) {
            existingEl.dataset.wrapper = highlightInfo.wrapper;
            existingEl.dataset.wrapperVariables = serializedWrapperVariables;
            existingEl.innerHTML = innerHtml;
          }
          htmlElement = existingEl;
        } else {
          const template = document.createElement('template');
          template.innerHTML = `<span class="hh-wrapper-${position}" data-highlight-id="${highlightId}" data-color="${highlightInfo.color}" data-style="${highlightInfo.style}" data-wrapper="${highlightInfo.wrapper}" data-wrapper-variables='${serializedWrapperVariables}' data-hh-ignore="">${innerHtml}</span>`;
          htmlElement = template.content.firstChild;
        }
        range.insertNode(htmlElement);
        return htmlElement;
      }
      const startRange = highlightInfo.rangeObj;
      const endRange = document.createRange();
      endRange.setStart(highlightInfo.rangeObj.endContainer, highlightInfo.rangeObj.endOffset);
      const wrapperInfo = options.wrappers[highlightInfo.wrapper];
      insertWrapper('start', startRange, existingStartWrapper, wrapperInfo.start);
      insertWrapper('end', endRange, existingEndWrapper, wrapperInfo.end);
      range = this._getCorrectedRangeObj(highlightId);

      // If current highlight is active, update selection range to match highlight range
      const selection = window.getSelection();
      const selectionRange = selection.type !== 'None' ? selection.getRangeAt(0) : null;
      if (highlightId === this._activeHighlightId && selectionRange && !(selectionRange.compareBoundaryPoints(Range.START_TO_START, range) === 0 && selectionRange.compareBoundaryPoints(Range.END_TO_END, range) === 0)) {
        window.getSelection().setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
      }
    }

    // Draw highlights with mark elements
    if (highlightInfo.readOnly || options.drawingMode === 'mark-elements') {
      // Inject HTML <mark> elements
      if (range.startOffset < range.startContainer.length) range.startContainer.splitText(range.startOffset);
      if (range.endOffset > 0 && range.endOffset < range.endContainer.length) range.endContainer.splitText(range.endOffset);
      const walker = this._getTextNodeWalker(range.commonAncestorContainer);
      walker.currentNode = range.startContainer;
      const relevantTextNodes = [];
      let node;
      while (node = walker.nextNode()) {
        if (node === range.endContainer && range.endOffset === 0) break;
        if (!node.parentElement.closest('rt, rp')) relevantTextNodes.push(node);
        if (node === range.endContainer) break;
      }
      const overlappingHighlightIds = new Set();
      const createStyledMark = () => {
        const mark = document.createElement('mark');
        mark.dataset.highlightId = highlightId;
        if (highlightInfo.readOnly) mark.dataset.readOnly = '';
        mark.dataset.color = highlightInfo.color;
        mark.dataset.style = highlightInfo.style;
        return mark;
      };
      for (let tn = 0; tn < relevantTextNodes.length; tn++) {
        const textNode = relevantTextNodes[tn];
        if (textNode.parentElement.dataset.highlightId) overlappingHighlightIds.add(textNode.parentElement.dataset.highlightId);
        const styledMark = createStyledMark();
        if (tn === 0) styledMark.dataset.start = '';
        if (tn === relevantTextNodes.length - 1) styledMark.dataset.end = '';
        textNode.before(styledMark);
        styledMark.appendChild(textNode);
        // Absorb adjacent elements without text into the mark element. This prevents unstyled gaps around CSS-rendered pseudoelement content (such as superscript footnote markers).
        let prev = styledMark.previousSibling;
        while (prev && prev.nodeType === Node.ELEMENT_NODE && prev.textContent === '' && !prev.hasAttribute('data-hh-ignore')) {
          const toAbsorb = prev; prev = prev.previousSibling;
          styledMark.prepend(toAbsorb);
        }
        if (tn < relevantTextNodes.length - 1) {
          let next = styledMark.nextSibling;
          while (next && next.nodeType === Node.ELEMENT_NODE && next.textContent === '' && !next.hasAttribute('data-hh-ignore')) {
            const toAbsorb = next; next = next.nextSibling;
            styledMark.appendChild(toAbsorb);
          }
        }
      }

      // Update highlight ranges that were invalidated by the DOM change
      this._getCorrectedRangeObj(highlightId);
      for (const overlappingHighlightId of overlappingHighlightIds) {
        this._getCorrectedRangeObj(overlappingHighlightId);
      }

    // Draw highlights with Custom Highlight API
    } else if (options.drawingMode === 'highlight-api' && supportsHighlightApi) {
      let highlightObj;
      if (CSS.highlights.has(highlightId)) {
        highlightObj = CSS.highlights.get(highlightId);
        highlightObj.clear();
      } else {
        highlightObj = new Highlight();
        CSS.highlights.set(highlightId, highlightObj);
      }
      highlightObj.add(range);
      const styleTemplate = this._getStyleTemplate(highlightInfo.style, 'css', null);
      const colorString = options.colors[highlightInfo.color];
      this._highlightApiStylesheet.insertRule(`${options.containerSelector} ::highlight(${highlightInfo.escapedHighlightId}) { --hh-color: ${colorString}; ${styleTemplate} }`);
      this._highlightApiStylesheet.insertRule(`${options.containerSelector} rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
      this._highlightApiStylesheet.insertRule(`${options.containerSelector} img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);

    // Draw highlights with SVG shapes
    } else if (options.drawingMode === 'svg') {
      const clientRects = this._getMergedClientRects(range, rangeParagraphs);
      let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.highlightId = highlightId;
      group.dataset.color = highlightInfo.color;
      group.dataset.style = highlightInfo.style;
      let svgContent = '';
      for (const clientRect of clientRects) {
        svgContent += this._getStyleTemplate(highlightInfo.style, 'svg', clientRect);
      }
      group.innerHTML = svgContent;
      this._svgBackground.appendChild(group);
    }
  }

  // Show container
  (options.drawingMode === 'svg' ? this._svgBackground : this._annotatableContainer).style.display = '';
}

// Create a new highlight, or update an existing highlight when it changes
Highlighter.prototype.createOrUpdateHighlight = function (attributes = {}, triggeredByUserAction = true) {
  const options = this._options;
  let highlightId = attributes.highlightId ?? this._activeHighlightId ?? options.highlightIdFunction();
  const appearanceChanges = [];
  const boundsChanges = [];

  const oldHighlightInfo = this._highlightsById[highlightId];
  const isNewHighlight = !oldHighlightInfo;

  // If a different highlight is active, deactivate it
  if (this._activeHighlightId && highlightId !== this._activeHighlightId && triggeredByUserAction) {
    this.deactivateHighlights();
  }

  // If the highlight is currently activate, ignore bounds changes that weren't initiated by the user
  if (highlightId === this._activeHighlightId && !triggeredByUserAction) {
    attributes.startParagraphId = null;
    attributes.startParagraphOffset = null;
    attributes.endParagraphId = null;
    attributes.endParagraphOffset = null;
  }

  // Warn if color, style, or wrapper attributes are invalid
  if (attributes.color && !Object.hasOwn(options.colors, attributes.color)) {
    console.warn(`Highlight color "${attributes.color}" is not defined in options (highlightId: ${highlightId}).`);
  }
  if (attributes.style && !Object.hasOwn(options.styles, attributes.style)) {
    console.warn(`Highlight style "${attributes.style}" is not defined in options (highlightId: ${highlightId}).`);
  }
  if (attributes.wrapper && !Object.hasOwn(options.wrappers, attributes.wrapper)) {
    console.warn(`Highlight wrapper "${attributes.wrapper}" is not defined in options (highlightId: ${highlightId}).`);
  }

  // Update defaults
  if (options.rememberStyle && triggeredByUserAction) {
    if (attributes.color) options.defaultColor = attributes.color;
    if (attributes.style) options.defaultStyle = attributes.style;
    if (attributes.wrapper) options.defaultWrapper = attributes.wrapper;
  }

  // Check which appearance properties changed
  for (const key of ['color', 'style', 'wrapper', 'wrapperVariables', 'readOnly']) {
    if (isNewHighlight || (attributes[key] != null && attributes[key] !== oldHighlightInfo[key])) appearanceChanges.push(key);
  }

  // If the highlight was and still is read-only, return
  if (oldHighlightInfo?.readOnly && (attributes.readOnly == null || attributes.readOnly === true)) return this.deactivateHighlights();

  // Calculate the bounds of the highlight range, if it's changed
  let adjustedSelectionRange, highlightRange;
  let rangeText, rangeHtml, rangeParagraphIds;
  let startParagraphId, startParagraphOffset, endParagraphId, endParagraphOffset;
  const selection = this._getRestoredSelectionOrCaret(globalThis.getSelection());
  if (selection.type === 'Range') adjustedSelectionRange = this._snapRangeToBoundaries(selection.getRangeAt(0));
  if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) || (adjustedSelectionRange && !adjustedSelectionRange.collapsed)) {
    let startNode, startOffset, endNode, endOffset;
    if (attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) {
      startParagraphId = attributes.startParagraphId ?? oldHighlightInfo?.startParagraphId;
      startParagraphOffset = Number.parseInt(attributes.startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset);
      endParagraphId = attributes.endParagraphId ?? oldHighlightInfo?.endParagraphId;
      endParagraphOffset = Number.parseInt(attributes.endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset);
      ([ startNode, startOffset ] = this._getTextNodeAndOffset(document.getElementById(startParagraphId), startParagraphOffset, 'start'));
      ([ endNode, endOffset ] = this._getTextNodeAndOffset(document.getElementById(endParagraphId), endParagraphOffset, 'end'));
    } else if (adjustedSelectionRange) {
      startNode = adjustedSelectionRange.startContainer;
      startOffset = adjustedSelectionRange.startOffset;
      endNode = adjustedSelectionRange.endContainer;
      endOffset = adjustedSelectionRange.endOffset;
      ([ startParagraphId, startParagraphOffset ] = this._getParagraphOffset(startNode, startOffset));
      ([ endParagraphId, endParagraphOffset ] = this._getParagraphOffset(endNode, endOffset));
    }

    // Create a new highlight range
    highlightRange = document.createRange();
    highlightRange.setStart(startNode, startOffset);
    highlightRange.setEnd(endNode, endOffset);

    // Check which bounds properties changed
    const boundsValues = { startParagraphId, startParagraphOffset, endParagraphId, endParagraphOffset };
    for (const key of Object.keys(boundsValues)) {
      if (isNewHighlight || boundsValues[key] !== oldHighlightInfo[key]) boundsChanges.push(key);
    }

    // Set variables that depend on the range
    const temporaryHtmlElement = document.createElement('div');
    temporaryHtmlElement.appendChild(highlightRange.cloneContents());
    for (const element of temporaryHtmlElement.querySelectorAll(`a, [data-highlight-id]:not([data-highlight-id="${highlightId}"])`)) element.outerHTML = element.innerHTML;
    for (const element of temporaryHtmlElement.querySelectorAll(`[data-hh-ignore]`)) element.remove();
    rangeText = temporaryHtmlElement.textContent;
    rangeHtml = temporaryHtmlElement.innerHTML;
    let startParagraphIndex = this._annotatableParagraphIds.indexOf(startParagraphId);
    let endParagraphIndex = this._annotatableParagraphIds.indexOf(endParagraphId);
    if (startParagraphIndex === -1) startParagraphIndex = 0;
    if (endParagraphIndex === -1) endParagraphIndex = this._annotatableParagraphIds.length - 1;
    rangeParagraphIds = this._annotatableParagraphIds.slice(startParagraphIndex, endParagraphIndex + 1);
  }

  // If there are no valid changes, return
  if (!highlightRange || highlightRange.toString() === '' || appearanceChanges.length + boundsChanges.length === 0) return;

  // Update saved highlight info
  const newHighlightInfo = {
    highlightId: highlightId,
    color: attributes.color ?? oldHighlightInfo?.color ?? options.defaultColor,
    style: attributes.style ?? oldHighlightInfo?.style ?? options.defaultStyle,
    wrapper: attributes.wrapper ?? oldHighlightInfo?.wrapper ?? options.defaultWrapper,
    wrapperVariables: attributes.wrapperVariables ?? oldHighlightInfo?.wrapperVariables ?? {},
    readOnly: attributes.readOnly ?? oldHighlightInfo?.readOnly ?? false,
    startParagraphId: startParagraphId ?? oldHighlightInfo?.startParagraphId,
    startParagraphOffset: startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset,
    endParagraphId: endParagraphId ?? oldHighlightInfo?.endParagraphId,
    endParagraphOffset: endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset,
    // Read-only properties
    escapedHighlightId: CSS.escape(highlightId),
    rangeText: rangeText ?? oldHighlightInfo?.rangeText,
    rangeHtml: rangeHtml ?? oldHighlightInfo?.rangeHtml,
    rangeParagraphIds: rangeParagraphIds ?? oldHighlightInfo?.rangeParagraphIds,
    rangeObj: highlightRange ?? oldHighlightInfo?.rangeObj,
  };
  this._highlightsById[highlightId] = newHighlightInfo;

  const detail = {
    highlight: newHighlightInfo,
    changes: appearanceChanges.concat(boundsChanges),
  }

  if (triggeredByUserAction && !this._activeHighlightId) {
    this.activateHighlight(highlightId);
  } else if (this._activeHighlightId && highlightId === this._activeHighlightId && appearanceChanges.length > 0) {
    this._updateSelectionUi('appearance');
  }

  // Queue highlights to be redrawn
  const highlightsToRedraw = [];
  const wrapperChanged = appearanceChanges.some(k => k.startsWith('wrapper'));
  if (wrapperChanged) {
    highlightsToRedraw.push(highlightId);
    if (options.drawingMode === 'mark-elements') {
      // In mark elements drawing mode, deactivate before redrawing (prevents an invalid selection range when the DOM changes)
      this.deactivateHighlights();
    } else if (options.drawingMode === 'svg') {
      // In SVG drawing mode, redraw all highlights after the current highlight (wrapper change may reflow text, causing misaligned highlights)
      const allHighlights = this.getHighlightInfo();
      const currentIndex = allHighlights.findIndex(h => h.highlightId === highlightId);
      highlightsToRedraw.push(...allHighlights.slice(currentIndex + 1).map(h => h.highlightId));
    }
  } else if (highlightId !== this._activeHighlightId) {
    highlightsToRedraw.push(highlightId);
  }

  // Redraw highlights if needed
  if (highlightsToRedraw.length > 0) {
    this.drawHighlights(highlightsToRedraw);
  }

  if (isNewHighlight) {
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
  } else {
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
  }
}

// Activate a highlight by ID
Highlighter.prototype.activateHighlight = function (highlightId) {
  const highlightToActivate = this._highlightsById[highlightId];
  if (highlightToActivate.readOnly) {
    // If the highlight is read-only, return events, but don't actually activate it
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: { highlight: highlightToActivate } }));
    return;
  }
  const selection = globalThis.getSelection();
  const highlightRange = highlightToActivate.rangeObj.cloneRange();
  this._activeHighlightId = highlightId;
  this._updateSelectionUi('appearance');
  this._updateSelectionUi('bounds');

  // Update the selection range if needed
  // In Android Chrome, sometimes selection handles don't show when a selection is updated programmatically, so it's best to only update the selection if needed.
  let selectionRange = selection.type === 'Range' ? selection.getRangeAt(0) : null;
  if (!selectionRange || !(
    selectionRange.startContainer === highlightRange.startContainer &&
    selectionRange.startOffset === highlightRange.startOffset &&
    selectionRange.endContainer === highlightRange.endContainer &&
    selectionRange.endOffset === highlightRange.endOffset)
  ) {
    selection.setBaseAndExtent(highlightRange.startContainer, highlightRange.startOffset, highlightRange.endContainer, highlightRange.endOffset);
  }

  this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
}

// Activate a link by position
Highlighter.prototype.activateHyperlink = function (position) {
  this.deactivateHighlights();
  this._allowHyperlinkClick = true;
  this._hyperlinksByPosition[position].hyperlinkElement.click();
  this._allowHyperlinkClick = false;
}

// Deactivate any highlights that are currently active/selected
Highlighter.prototype.deactivateHighlights = function (removeSelectionRanges = true) {
  const deactivatedHighlight = this._highlightsById[this._activeHighlightId];
  this._activeHighlightId = null;
  this._previousSelectionRange = null;
  const selection = globalThis.getSelection();
  if (removeSelectionRanges && selection.anchorNode && this._annotatableContainer.contains(selection.anchorNode)) {
    selection.collapseToStart();
  }
  this._updateSelectionUi('appearance');
  if (deactivatedHighlight) {
    this.drawHighlights([deactivatedHighlight.highlightId]);
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
      highlight: deactivatedHighlight,
    }}));
  }
}

// Remove the specified highlights, or all highlights on the page
Highlighter.prototype.removeHighlights = function (highlightIds = Object.keys(this._highlightsById)) {
  this.deactivateHighlights();
  for (const highlightId of highlightIds) {
    const highlightInfo = this._highlightsById[highlightId];
    if (highlightInfo) {
      delete this._highlightsById[highlightId];
      this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
        highlightId: highlightId,
      }}));
      this._undrawHighlight(highlightInfo);
    }
  }
}

// Get the active highlight ID (if there is one)
Highlighter.prototype.getActiveHighlightId = function () {
  return this._activeHighlightId;
}

// Get info for specified highlights, or all highlights on the page
Highlighter.prototype.getHighlightInfo = function (highlightIds = Object.keys(this._highlightsById), paragraphId = null) {
  let filteredHighlights = []
  for (const highlightId of highlightIds) {
    const highlightInfo = this._highlightsById[highlightId];
    if (!paragraphId || paragraphId === highlightInfo.startParagraphId) {
      filteredHighlights.push(highlightInfo);
    }
  }
  // Sort highlights based on their order on the page
  if (filteredHighlights.length > 0) {
    filteredHighlights.sort((a, b) => {
      return (this._annotatableParagraphIds.indexOf(a.startParagraphId) - this._annotatableParagraphIds.indexOf(b.startParagraphId)) || (a.startParagraphOffset - b.startParagraphOffset);
    });
  }
  return filteredHighlights;
}

// Update initialized options
Highlighter.prototype.setOptions = function (optionsToUpdate) {
  const options = this._options;
  for (const key in optionsToUpdate) {
    options[key] = optionsToUpdate[key] ?? options[key];
  }
  if ('containerSelector' in optionsToUpdate) {
    this.removeHighlighter();
    this._initializeHighlighter();
    this._loadStyles();
    this._loadEventListeners();
    this._updateAppearanceStylesheet();
    this._updateSelectionUi('appearance');
    for (const selectionHandle of this._selectionHandles) {
      selectionHandle.children[1].innerHTML = options.selectionHandles[selectionHandle.dataset.side] ?? '';
    }
  } else {
    if ('paragraphSelector' in optionsToUpdate) {
      this._initializeHighlighter();
    }
    if ('drawingMode' in optionsToUpdate || 'styles' in optionsToUpdate || 'colors' in optionsToUpdate) {
      this._updateAppearanceStylesheet();
    }
    if ('drawingMode' in optionsToUpdate || 'styles' in optionsToUpdate) {
      if (supportsHighlightApi) CSS.highlights.clear();
      this.drawHighlights();
    }
    if ('selectionHandles' in optionsToUpdate) {
      for (const selectionHandle of this._selectionHandles) {
        selectionHandle.children[1].innerHTML = options.selectionHandles[selectionHandle.dataset.side] ?? '';
      }
    }
  }
}

/** @deprecated Use setOptions({ key: value }) instead */
Highlighter.prototype.setOption = function (key, value) {
  console.warn('setOption() is deprecated. Use setOptions({ key: value }) instead.');
  this.setOptions({ [key]: value });
}

// Get all of the initialized options
Highlighter.prototype.getOptions = function () {
  return this._options;
}

// Remove this Highlighter instance and its highlights
Highlighter.prototype.removeHighlighter = function () {
  this.loadHighlights([]);
  this._annotatableContainer.querySelectorAll('.hh-svg-background, .hh-selection-handle').forEach(el => el.remove())
  removeStylesheets(this._stylesheets);
  this._resizeObserver.disconnect();
  this._controller.abort();

  this._annotatableContainer.highlighter = undefined;
  _highlighters = _highlighters.filter(h => h._annotatableContainer !== this._annotatableContainer);
}


/********************** Private Methods **********************/

// Check if the tap hits any highlights, wrappers, or links
Highlighter.prototype._checkForTapTargets = function (pointerEvent) {
  if (!pointerEvent) return;

  // Check for tapped highlights
  const tappedHighlightIds = [];
  if (!pointerEvent.target.closest('[data-hh-ignore]')) {
    for (const highlightId of Object.keys(this._highlightsById)) {
      const highlightInfo = this._highlightsById[highlightId];
      const highlightRange = highlightInfo.rangeObj;
      for (const rangeRect of highlightRange.getClientRects()) {
        if (this._isPointInRect(pointerEvent.clientX, pointerEvent.clientY, rangeRect, 5)) {
          tappedHighlightIds.push(highlightId);
          break;
        }
      }
    }
  }
  const tappedHighlights = this.getHighlightInfo(tappedHighlightIds);

  // Check for tapped wrappers and hyperlinks
  const tappedWrappers = [];
  const tappedHyperlinks = [];
  const tappedWrapperElements = new Set()
  const targetElements = document.elementsFromPoint(pointerEvent.clientX, pointerEvent.clientY);
  for (const element of targetElements) {
    const wrapper = element.closest('.hh-wrapper-start, .hh-wrapper-end');
    if (wrapper && !tappedWrapperElements.has(wrapper)) {
      tappedWrappers.push({
        position: wrapper.className.includes('hh-wrapper-start') ? 'start' : 'end',
        wrapperElement: wrapper,
        highlightInfo: this._highlightsById[wrapper.dataset.highlightId],
      });
      tappedWrapperElements.add(wrapper);
    } else if (element.matches('a') && element.dataset.hhPosition) {
      const hyperlinkInfo = this._hyperlinksByPosition[element.dataset.hhPosition];
      tappedHyperlinks.push(hyperlinkInfo);
    }
  }

  const targetCount = tappedHighlights.length + tappedWrappers.length + tappedHyperlinks.length;
  return {
    'targetCount': targetCount,
    'targetFound': targetCount > 0,
    'tapRange': this._getCaretFromCoordinates(pointerEvent.clientX, pointerEvent.clientY),
    'pointerEvent': pointerEvent,
    'highlights': tappedHighlights,
    'wrappers': tappedWrappers,
    'hyperlinks': tappedHyperlinks,
  }
}

// Compare new highlight information to old highlight information, returning an object with the properties that changed
Highlighter.prototype._diffHighlight = function (newHighlightInfo, oldHighlightInfo) {
  if (!oldHighlightInfo) return newHighlightInfo;
  const changedHighlightInfo = {}
  for (const key of Object.keys(newHighlightInfo)) {
    if (Object.hasOwn(oldHighlightInfo, key) && oldHighlightInfo[key] !== newHighlightInfo[key]) {
      changedHighlightInfo[key] = newHighlightInfo[key];
    }
  }
  return changedHighlightInfo;
}

// Undraw the specified highlight
Highlighter.prototype._undrawHighlight = function (highlightInfo) {
  const highlightId = highlightInfo.highlightId;

  // Remove <mark> highlights and HTML wrappers
  const overlappingHighlightIds = new Set();
  this._annotatableContainer.querySelectorAll(`[data-highlight-id="${highlightId}"]:not(g)`).forEach(element => {
    if (element.parentElement.dataset.highlightId) {
      overlappingHighlightIds.add(element.parentElement.dataset.highlightId);
    }
    for (const childHighlight of element.querySelectorAll('[data-highlight-id]')) {
      overlappingHighlightIds.add(childHighlight.dataset.highlightId);
    }
    if (element.matches('mark')) {
      element.outerHTML = element.innerHTML;
    } else {
      element.remove();
    }
  });

  // Redraw overlapping highlights
  overlappingHighlightIds.delete(highlightId);
  if (overlappingHighlightIds.size > 0) {
    for (const overlappingHighlightId of overlappingHighlightIds) {
      this._undrawHighlight(this._highlightsById[overlappingHighlightId]);
    }
    this.drawHighlights(overlappingHighlightIds);
  }

  // Normalize text nodes
  const rangeParagraphs = this._annotatableContainer.querySelectorAll(`#${highlightInfo.startParagraphId}, #${highlightInfo.endParagraphId}`);
  rangeParagraphs.forEach(p => p.normalize());
  this._getCorrectedRangeObj(highlightId);

  // Remove SVG highlights
  this._svgBackground.querySelectorAll(`g[data-highlight-id="${highlightId}"]`).forEach(element => {
    element.remove();
  });

  // Remove Highlight API highlights
  if (supportsHighlightApi && CSS.highlights.has(highlightId)) {
    const ruleIndexesToDelete = [];
    for (let r = 0; r < this._highlightApiStylesheet.cssRules.length; r++) {
      if (this._highlightApiStylesheet.cssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`)) ruleIndexesToDelete.push(r);
    }
    for (const index of ruleIndexesToDelete.toReversed()) this._highlightApiStylesheet.deleteRule(index);
    CSS.highlights.delete(highlightId);
  }
}

// Update selection background and handles
Highlighter.prototype._updateSelectionUi = function (changeType = 'appearance') {
  const options = this._options;
  const selection = globalThis.getSelection();
  const selectionRange = selection.type === 'None' ? null : selection.getRangeAt(0);

  // If the selection starts in another annotatable container, let the other container handle it
  if (selection.anchorNode?.parentElement?.closest('[data-hh-container]') && !this._annotatableContainer.contains(selection.anchorNode)) return;

  const highlightInfo = this._highlightsById[this._activeHighlightId] ?? null;
  const color = highlightInfo?.color ?? null;
  const style = highlightInfo?.style ?? null;
  const colorString = options.colors[color] ?? (CSS.supports('color', 'AccentColor') ? 'AccentColor' : 'dodgerblue');

  // Draw SVG selection rects (SVG drawing mode only)
  this._svgActiveOverlay.innerHTML = '';
  if (this._activeHighlightId && options.drawingMode === 'svg') {
    let range = this._getCorrectedRangeObj(this._activeHighlightId);
    range = this._snapRangeToBoundaries(range);
    const rangeParagraphs = this._annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
    const clientRects = this._getMergedClientRects(range, rangeParagraphs);
    this._svgActiveOverlay.dataset.color = color;
    this._svgActiveOverlay.dataset.style = style;
    let svgContent = '';
    for (const clientRect of clientRects) {
      svgContent += this._getStyleTemplate(highlightInfo.style, 'svg', clientRect, true);
    }
    this._svgActiveOverlay.innerHTML = svgContent;

    // Bring active highlight to the front
    const svgHighlight = this._svgBackground.querySelector(`g[data-highlight-id="${this._activeHighlightId}"]`);
    if (svgHighlight) this._svgBackground.appendChild(svgHighlight);
    this._svgBackground.appendChild(this._svgActiveOverlay);
  }

  if (changeType === 'appearance') {
    this._annotatableContainer.style.setProperty('--hh-color', colorString);

    // Hide the active highlight (and wrappers), and set a selection style that mimics the highlight. This avoids the need to redraw the highlight while actively editing it (especially important for <mark> highlights, because DOM manipulation around the selection can make the selection UI unstable).
    if (this._activeHighlightId && options.drawingMode === 'svg') {
      this._selectionStylesheet.replaceSync(`
        ${options.containerSelector} g[data-highlight-id="${this._activeHighlightId}"][data-style] { display: none; }
        ${options.containerSelector} .hh-wrapper-start[data-highlight-id="${this._activeHighlightId}"], .hh-wrapper-end[data-highlight-id="${this._activeHighlightId}"] { visibility: hidden; }
        ${options.containerSelector} ::selection { background-color: transparent; }
      `);
    } else if (this._activeHighlightId) {
      const styleTemplate = this._getStyleTemplate(style, 'css', null, true);
      this._selectionStylesheet.replaceSync(`
        ${options.containerSelector} ::highlight(${highlightInfo.escapedHighlightId}) { all: unset; }
        ${options.containerSelector} mark[data-highlight-id="${this._activeHighlightId}"][data-style] { all: unset; }
        ${options.containerSelector} .hh-wrapper-start[data-highlight-id="${this._activeHighlightId}"], .hh-wrapper-end[data-highlight-id="${this._activeHighlightId}"] { visibility: hidden; }
        ${options.containerSelector} ::selection { --hh-color: ${colorString}; ${styleTemplate} }
        ${options.containerSelector} rt::selection, ${options.containerSelector} img::selection { background-color: transparent; }
      `);

    // No active highlight (show the regular selection UI)
    } else {
      this._selectionStylesheet.replaceSync(`
        ${options.containerSelector} ::selection { background-color: Highlight; color: inherit; }
        ${options.containerSelector} rt::selection, ${options.containerSelector} img::selection { background-color: transparent; }
      `);
    }

    // Send event
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: { color: color, style: style, }}));

  } else if (changeType === 'bounds') {
    // Update selection handle location and visibility
    if (selection.type === 'Range') {
      const selectionRangeRects = selectionRange.getClientRects();
      const startRect = selectionRangeRects[0];
      const endRect = selectionRangeRects[selectionRangeRects.length - 1];
      const relativeAncestorClientRect = this._relativeAncestorElement.getBoundingClientRect();
      const startNodeIsRtl = globalThis.getComputedStyle(selectionRange.startContainer.parentElement).direction === 'rtl';
      const endNodeIsRtl = globalThis.getComputedStyle(selectionRange.endContainer.parentElement).direction === 'rtl';

      if (
        (options.showCustomSelectionHandlesOnTouch || this._pointerType === 'mouse')
        && ((options.showCustomSelectionHandlesForActiveHighlights && this._activeHighlightId)
          || (options.showCustomSelectionHandlesForTextSelection && !this._activeHighlightId))
      ) {
        for (const selectionHandle of this._selectionHandles) {
          let side;
          if (selectionHandle.dataset.position === 'start') {
            side = startNodeIsRtl ? 'right' : 'left';
            selectionHandle.style.left = startRect[side] - relativeAncestorClientRect.left + 'px';
            selectionHandle.style.height = startRect.height + 'px';
            selectionHandle.style.top = startRect.top - relativeAncestorClientRect.top + 'px';
          } else {
            side = endNodeIsRtl ? 'left' : 'right';
            selectionHandle.style.left = endRect[side] - relativeAncestorClientRect.left + 'px';
            selectionHandle.style.height = endRect.height + 'px';
            selectionHandle.style.top = endRect.top - relativeAncestorClientRect.top + 'px';
          }
          if (selectionHandle.dataset.side !== side) {
            selectionHandle.dataset.side = side;
            this.setOptions({ selectionHandles: options.selectionHandles });
          }
        }
        this._setCustomSelectionHandleVisibility(true);
      }
    } else {
      this._setCustomSelectionHandleVisibility(false);
    }
  }
}

Highlighter.prototype._setCustomSelectionHandleVisibility = function (visible = this._selectionHandles[0].style.visibility === 'hidden') {
  for (const selectionHandle of this._selectionHandles) {
    selectionHandle.style.visibility = visible ? 'visible' : 'hidden';
  }
}

// Update the selection or highlight range to stay within the annotatable container
Highlighter.prototype._snapRangeToBoundaries = function (range, anchorNode = null) {
  const options = this._options;
  let startNode = range.startContainer;
  let endNode = range.endContainer;
  let startOffset = range.startOffset;
  let endOffset = range.endOffset;

  // Prevent the range from going outside of the annotatable container
  if (!this._annotatableContainer.contains(range.commonAncestorContainer)) {
    if (anchorNode && !this._annotatableContainer.contains(anchorNode)) {
      // Range is from a selection, and the selection anchor is outside of the container
      return range.cloneRange().collapse(true);
    } else if (anchorNode === startNode || this._annotatableContainer.contains(startNode)) {
      // Range starts in the container but ends outside
      endNode = this._getLastTextNode(this._annotatableParagraphs[this._annotatableParagraphs.length - 1]);
      endOffset = endNode.length;
    } else if (anchorNode === endNode || this._annotatableContainer.contains(endNode)) {
      // Range starts outside of the container but ends inside
      startNode = this._getFirstTextNode(this._annotatableParagraphs[0]);
      startOffset = 0;
    }
  }

  // If the range starts at the end of a text node, move it to start at the beginning of the following text node
  if (startOffset === startNode.textContent.length && this._activeHighlightId) {
    const walker = this._getTextNodeWalker(range.commonAncestorContainer);
    walker.currentNode = startNode;
    const nextTextNode = walker.nextNode();
    if (nextTextNode) {
      startNode = nextTextNode;
      startOffset = 0;
    }
  }

  // Prevent the range from starting or ending in an invalid text node
  if (this._annotatableContainer.contains(range.commonAncestorContainer) && (this._shouldSkipTextNode(startNode) || this._shouldSkipTextNode(endNode))) {
    if (this._shouldSkipTextNode(startNode)) {
      startNode = this._getNextValidTextNode(startNode);
      startOffset = 0;
    }
    if (this._shouldSkipTextNode(endNode)) {
      endNode = this._getPreviousValidTextNode(endNode);
      endOffset = endNode.length;
    }
    if (!startNode || !endNode || (startNode === endNode && startOffset === endOffset)) {
      return range.cloneRange().collapse(true);
    } else if (startNode === endNode && endOffset < startOffset) {
      [startOffset, endOffset] = [endOffset, startOffset];
    }
  }

  // Snap to the nearest word
  if (options.snapToWord && this._activeHighlightId) {
    // Trim whitespace and dashes at range start and end
    while (_reWhitespaceDash.test(startOffset < startNode.textContent.length && startNode.textContent[startOffset])) startOffset += 1;
    while (endOffset > 0 && _reWhitespaceDash.test(endNode.textContent[endOffset - 1])) endOffset -= 1;

    // Expand range to word boundaries
    while (startOffset > 0 && _reNonWhitespaceDash.test(startNode.textContent[startOffset - 1])) startOffset -= 1;
    while (endOffset < endNode.textContent.length && _reNonWhitespaceDash.test(endNode.textContent[endOffset])) endOffset += 1;
  }

  const newRange = document.createRange();
  newRange.setStart(startNode, startOffset);
  newRange.setEnd(endNode, endOffset);
  return newRange;
}

// Get the character offset relative to the annotatable paragraph
Highlighter.prototype._getParagraphOffset = function (referenceTextNode, referenceTextNodeOffset) {
  const paragraph = referenceTextNode.parentElement.closest(this._options.paragraphSelector);
  const walker = this._getTextNodeWalker(paragraph);
  let currentOffset = 0;
  let textNode;
  while (textNode = walker.nextNode()) {
    if (textNode === referenceTextNode) {
      currentOffset += referenceTextNodeOffset;
      break;
    }
    currentOffset += textNode.textContent.length;
  }
  return [ paragraph.id, currentOffset ];
}

// Get the character offset relative to the deepest relevant text node
Highlighter.prototype._getTextNodeAndOffset = function (parentElement, targetOffset, position) {
  let textNode, firstTextNode, currentOffset = 0;
  const walker = this._getTextNodeWalker(parentElement);
  while (textNode = walker.nextNode()) {
    if (!firstTextNode) firstTextNode = walker.currentNode;
    currentOffset += textNode.textContent.length;
    if (currentOffset >= targetOffset) {
      const relativeOffset = textNode.textContent.length - currentOffset + targetOffset;
      // If the start offset is at the end of a text node, move it to the beginning of the next text node
      if (position === 'start' && relativeOffset === textNode.textContent.length) {
        const nextTextNode = walker.nextNode();
        if (nextTextNode) return [ nextTextNode, 0 ];
      }
      return [ textNode, relativeOffset ];
    }
  }
  // TODO: Direction isn't always accurate (maybe it resets when selection is cleared and set to a new range programmatically?)
  const direction = globalThis.getSelection().direction;
  if (direction == 'backward') {
    return [ firstTextNode, 0 ];
  } else {
    const lastTextNode = walker.currentNode;
    return [ lastTextNode, lastTextNode.textContent.length ];
  }
}

// Get the first valid text node in an element
Highlighter.prototype._getFirstTextNode = function (element) {
  const walker = this._getTextNodeWalker(element);
  return walker.nextNode();
}

// Get the last valid text node in an element
Highlighter.prototype._getLastTextNode = function (element) {
  const walker = this._getTextNodeWalker(element);
  let lastNode = null, node;
  while (node = walker.nextNode()) lastNode = node;
  return lastNode;
}

// Get the previous valid text node in the annotatable container
Highlighter.prototype._getNextValidTextNode = function (currentNode) {
  const walker = this._getTextNodeWalker(this._annotatableContainer);
  walker.currentNode = currentNode;
  return walker.nextNode();
}

// Get the next valid text node in the annotatable container
Highlighter.prototype._getPreviousValidTextNode = function (currentNode) {
  const walker = this._getTextNodeWalker(this._annotatableContainer);
  walker.currentNode = currentNode;
  return walker.previousNode();
}

// Determine if text node should be skipped when snapping to word or calculating character offsets
Highlighter.prototype._shouldSkipTextNode = function (textNode) {
  const parentParagraph = textNode.parentNode.closest(this._options.paragraphSelector);
  const hhIgnore = textNode.parentNode.closest('[data-hh-ignore]');
  if (!parentParagraph || hhIgnore || textNode.textContent === '') return true;
  return false;
}

// Get text node walker
Highlighter.prototype._getTextNodeWalker = function (root) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (node) => this._shouldSkipTextNode(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT);
}

// Update appearance stylesheet (user-defined colors and styles)
Highlighter.prototype._updateAppearanceStylesheet = function () {
  const options = this._options;
  this._appearanceStylesheet.replaceSync('');
  for (const color of Object.keys(options.colors)) {
    this._appearanceStylesheet.insertRule(`[data-color="${color}"] { --hh-color: ${options.colors[color]}; }`);
  }
  for (const style of Object.keys(options.styles)) {
    const styleTemplate = this._getStyleTemplate(style, 'css', null);
    this._appearanceStylesheet.insertRule(`mark[data-highlight-id][data-style="${style}"] { ${styleTemplate} }`);
  }
}

// Get style template for a given highlight style
Highlighter.prototype._getStyleTemplate = function (style, type, clientRect = null, active = false) {
  const options = this._options;
  style = Object.hasOwn(options.styles, style) ? style : options.defaultStyle;
  let styleTemplate = options.styles[style]?.[type] ?? '';
  if (active) {
    styleTemplate = options.styles[style]?.[`${type}-active`] ?? styleTemplate;
  }
  if (!styleTemplate) {
    console.warn(`Highlight style "${style}" in options does not have a defined "${type}" value.`);
    return;
  }
  if (type === 'svg' && clientRect) {
    const relativeAncestorClientRect = this._relativeAncestorElement.getBoundingClientRect();
    styleTemplate = styleTemplate
      .replaceAll('{x}', clientRect.x - relativeAncestorClientRect.x)
      .replaceAll('{y}', clientRect.y - relativeAncestorClientRect.y)
      .replaceAll('{width}', clientRect.width)
      .replaceAll('{height}', clientRect.height)
      .replaceAll('{top}', clientRect.top - relativeAncestorClientRect.top)
      .replaceAll('{right}', clientRect.right - relativeAncestorClientRect.right)
      .replaceAll('{bottom}', clientRect.bottom - relativeAncestorClientRect.bottom)
      .replaceAll('{left}', clientRect.left - relativeAncestorClientRect.left);
  }
  return styleTemplate;
}

// Restore the previous selection range in case the browser clears the selection
Highlighter.prototype._getRestoredSelectionOrCaret = function (selection, pointerEvent = null) {
  if (selection.type === 'None') {
    if (this._previousSelectionRange) {
      // iOS Safari deselects text when a button is tapped. This restores the selection.
      selection.addRange(this._previousSelectionRange);
    } else if (pointerEvent) {
      // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type === "Caret"). iOS Safari instead clears the selection (selection.type === "None"). This restores a Caret selection if the selection type is None.
      let range = this._getCaretFromCoordinates(pointerEvent.clientX, pointerEvent.clientY);
      selection.addRange(range);
    }
  }
  return selection;
}

// Fix highlight range if the DOM changed and made the previous highlight range invalid
Highlighter.prototype._getCorrectedRangeObj = function (highlightId) {
  const highlightInfo = this._highlightsById[highlightId];
  const highlightRange = highlightInfo?.rangeObj;
  if (highlightRange && (
    highlightRange.startContainer.nodeType !== Node.TEXT_NODE || highlightRange.endContainer.nodeType !== Node.TEXT_NODE ||
    highlightRange.startOffset > highlightRange.startContainer.textContent.length - 1 ||
    highlightRange.endOffset > highlightRange.endContainer.textContent.length
  )) {
    const [ startNode, startOffset ] = this._getTextNodeAndOffset(document.getElementById(highlightInfo.startParagraphId), highlightInfo.startParagraphOffset, 'start');
    const [ endNode, endOffset ] = this._getTextNodeAndOffset(document.getElementById(highlightInfo.endParagraphId), highlightInfo.endParagraphOffset, 'end');
    highlightRange.setStart(startNode, startOffset);
    highlightRange.setEnd(endNode, endOffset);
  }
  return highlightRange;
}

// Convert tap or click to a selection range
// Adapted from https://stackoverflow.com/a/12924488/1349044
Highlighter.prototype._getCaretFromCoordinates = function (clientX, clientY, checkAnnotatable = false, checkXDistance = false, checkYDistance = false) {
  let range;
  if (supportsCaretPositionFromPoint) {
    let caretPosition = document.caretPositionFromPoint(clientX, clientY);
    if (caretPosition.offsetNode.parentElement?.closest('[data-hh-ignore]')) return;
    range = document.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
  } else if (supportsCaretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY);
    if (range?.startContainer.parentElement?.closest('[data-hh-ignore]')) return;
  }
  if (!range) return;
  if (checkXDistance || checkYDistance) {
    const maxDistance = 30;
    const caretClientRect = range.getBoundingClientRect();
    if (checkXDistance && Math.abs(clientX - caretClientRect.x) > maxDistance) return;
    if (checkYDistance && Math.abs(clientY - caretClientRect.top) > maxDistance && Math.abs(clientY - caretClientRect.bottom) > maxDistance) return;
  }
  if (checkAnnotatable && !range.startContainer.parentElement.closest(this._options.paragraphSelector)) return;
  return range;
}

// Check if a point is in a DOMRect
Highlighter.prototype._isPointInRect = function (x, y, rect, padding = 0) {
  return (
    x >= rect.x - padding && x <= rect.x + rect.width + padding &&
    y >= rect.y - padding && y <= rect.y + rect.height + padding
  )
}

// Get merged client rects from the highlight range
Highlighter.prototype._getMergedClientRects = function (range, paragraphs) {
  const unmergedRects = Array.from(range.getClientRects());
  const mergedRects = [];

  // Remove element rects (only text node rects are needed)
  const ancestorElementsInRange = new Set();
  for (const paragraph of paragraphs) {
    let element = paragraph;
    while (range.commonAncestorContainer.contains(element)) {
      ancestorElementsInRange.add(element);
      element = element.parentElement;
    }
  }
  for (let ur = unmergedRects.length - 1; ur >= 0; ur--) {
    const rect = unmergedRects[ur];
    if (rect.width === 0) {
      // Remove zero-width rects
      unmergedRects.splice(ur, 1);
      continue;
    }
    for (const element of ancestorElementsInRange) {
      // Remove element rects (only text node rects are needed)
      const elementRect = element.getBoundingClientRect();
      if (Math.round(elementRect.width) === Math.round(rect.width) && Math.round(elementRect.height) === Math.round(rect.height) && Math.round(elementRect.top) === Math.round(rect.top) && Math.round(elementRect.left) === Math.round(rect.left)) {
        unmergedRects.splice(ur, 1);
        break;
      }
    }
  }

  // Loop through the highlight's paragraphs
  for (const paragraph of paragraphs) {
    const paragraphRect = paragraph.getBoundingClientRect();
    const paragraphStyle = getComputedStyle(paragraph);
    const snapTolerance = Math.max(Number.parseInt(paragraphStyle.fontSize) / 2, 4);
    const topPadding = Number.parseInt(paragraphStyle.paddingTop);
    const textIndent = Number.parseInt(paragraphStyle.textIndent);

    // Build line positions from paragraph text nodes
    const linePositions = {};
    const lineBottomKeys = [];
    const walker = this._getTextNodeWalker(paragraph);
    const textNodeRange = document.createRange();
    let textNode;
    while (textNode = walker.nextNode()) {
      // Skip text nodes in elements that are higher or lower than surrounding text
      if (textNode.parentElement.closest('sup, sub, rt')) continue;
      textNodeRange.selectNode(textNode);
      for (const rect of textNodeRange.getClientRects()) {
        // Round to a nearby line position if close
        const lineBottom = lineBottomKeys.find(b => Math.abs(b - rect.bottom) < snapTolerance) ?? rect.bottom;
        if (!linePositions[lineBottom]) lineBottomKeys.push(lineBottom);
        const pos = linePositions[lineBottom] ??= {
          minLeft: rect.left, maxRight: rect.right,
          highlightLeft: null, highlightRight: null,
        };
        pos.minLeft = Math.min(pos.minLeft, rect.left);
        pos.maxRight = Math.max(pos.maxRight, rect.right);
      }
    }

    const lineBottoms = lineBottomKeys.sort((a, b) => a - b);

    // Assign highlight range rects to matching line positions
    for (const rect of unmergedRects) {
      const centerY = rect.y + rect.height / 2;
      for (let i = 0; i < lineBottoms.length; i++) {
        const pos = linePositions[lineBottoms[i]];
        // Skip rects that extend outside the line of text (such as absolutely-positioned elements)
        if (rect.left >= pos.minLeft && rect.right <= pos.maxRight
            && centerY > (lineBottoms[i - 1] ?? (paragraphRect.top + topPadding)) && centerY <= lineBottoms[i]) {
          pos.highlightLeft = Math.min(pos.highlightLeft ?? rect.left, rect.left);
          pos.highlightRight = Math.max(pos.highlightRight ?? rect.right, rect.right);
          break;
        }
      }
    }

    // Create a merged rect for each relevant line
    for (let i = 0; i < lineBottoms.length; i++) {
      const bottom = lineBottoms[i];
      const pos = linePositions[bottom];
      if (pos.highlightLeft == null) continue;
      const nearbyBottom = lineBottoms[i - 1] ?? lineBottoms[i + 1] ?? (paragraphRect.top + topPadding);
      const height = Math.abs(bottom - nearbyBottom);
      const top = bottom - height;
      let left = Math.max(pos.minLeft, pos.highlightLeft);
      let right = Math.min(pos.maxRight, pos.highlightRight);

      // Final adjustment to left and right bounds
      if (paragraphStyle.direction === 'ltr' && paragraphStyle.textAlign === 'start') {
        if (left - paragraphRect.left < snapTolerance) left = paragraphRect.left;
        if (textIndent < 0) left += textIndent;
      } else if (paragraphStyle.direction === 'rtl' && paragraphStyle.textAlign === 'start') {
        if (paragraphRect.right - right < snapTolerance) right = paragraphRect.right;
        if (textIndent < 0) right += textIndent;
      }

      const width = right - left;
      mergedRects.push(new DOMRect(left, top, width, height));
    }
  }

  return mergedRects;
}


/********************** Utilities **********************/

// Add a CSS stylesheet to the document
function addStylesheet(stylesheets, stylesheetKey) {
  let stylesheet = stylesheets[stylesheetKey];
  if (!stylesheet) {
    if (supportsCssStylesheetApi) {
      stylesheet = new CSSStyleSheet();
      document.adoptedStyleSheets.push(stylesheet);
    } else {
      // For browsers that don't fully support the CSSStyleSheet API, such as Safari < 16.4.
      // See https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet#browser_compatibility
      stylesheet = document.createElement('style');
      stylesheet.appendChild(document.createTextNode(''));
      stylesheet.replaceSync = (newContent) => {
        stylesheet.textContent = newContent;
      }
      stylesheet.insertRule = (newContent) => {
        stylesheet.textContent += newContent;
      }
      document.head.appendChild(stylesheet);
    }
    stylesheets[stylesheetKey] = stylesheet;
  }
  return stylesheet;
}

// Remove CSS stylesheets (only those from the current Highlighter instance)
function removeStylesheets(stylesheets) {
  for (const stylesheet of Object.values(stylesheets)) {
    if (supportsCssStylesheetApi) {
      const adoptedStylesheetIndex = document.adoptedStyleSheets.indexOf(stylesheet);
      document.adoptedStyleSheets.splice(adoptedStylesheetIndex, 1);
    } else {
      stylesheet.remove();
    }
  }
}

// Debounce a function to prevent it from being executed too frequently
// Adapted from https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Default function for generating a highlight ID
const _getNewHighlightId = () => {
  return 'hh-' + Date.now().toString();
}


/********************** Constants **********************/

// Keep track of all Highlighter instances
let _highlighters = [];

// Check browser type
const isTouchDevice = navigator.maxTouchPoints > 0;
const isWebKit = /^((?!Chrome|Firefox|Android|Samsung).)*AppleWebKit/i.test(navigator.userAgent);
const isWKWebView = isWebKit && globalThis.webkit?.messageHandlers;
const supportsCaretPositionFromPoint = document.caretPositionFromPoint;
const supportsCaretRangeFromPoint = document.caretRangeFromPoint;
const supportsCssStylesheetApi = CSSStyleSheet?.prototype?.replaceSync;
const supportsHighlightApi = CSS.highlights;

// Regex patterns for word boundary detection
const _reWhitespaceDash = /\s|\p{Pd}/u;
const _reNonWhitespaceDash = /[^\s|\p{Pd}]/u;

// Default options
const _defaultOptions = {
  containerSelector: 'body',
  paragraphSelector: 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id], p[id], ol[id], ul[id], dl[id], tr[id]',
  colors: {
    'red': 'hsl(360, 100%, 70%)',
    'orange': 'hsl(30, 100%, 60%)',
    'yellow': 'hsl(50, 100%, 60%)',
    'green': 'hsl(80, 100%, 45%)',
    'blue': 'hsl(180, 100%, 45%)',
  },
  styles: {
    'fill': {
      'css': 'background-color: hsl(from var(--hh-color) h s l / 50%);',
      'svg': '<rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 50%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />',
      'css-active': 'background-color: hsl(from var(--hh-color) h s l / 80%);',
      'svg-active': `
        <rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 80%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />
      `,
    },
    'single-underline': {
      'css': 'text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />',
      'css-active': 'background-color: hsl(from var(--hh-color) h s l / 25%); text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg-active': `
        <rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 25%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />
        <rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />
      `,
    },
    'double-underline': {
      'css': 'text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 0.9));" /><rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 1.05));" />',
      'css-active': 'background-color: hsl(from var(--hh-color) h s l / 25%); text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg-active': `
        <rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 25%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />
        <rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 0.9));" />
        <rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 1.05));" />
      `,
    },
    'colored-text': {
      'css': 'color: var(--hh-color);',
      'svg': '',
    },
    'redacted': {
      'css': 'background-color: transparent; color: transparent;',
      'svg': '',
    },
  },
  wrappers: {},
  selectionHandles: {
    'left': '<div class="hh-default-handle"></div>',
    'right': '<div class="hh-default-handle"></div>',
  },
  rememberStyle: true,
  snapToWord: false,
  autoTapToActivate: true,
  longPressTimeout: 500,
  pointerMode: 'auto',
  drawingMode: 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: _getNewHighlightId,
  showCustomSelectionHandlesForActiveHighlights: true,
  showCustomSelectionHandlesForTextSelection: false,
  showCustomSelectionHandlesOnTouch: false,
}

// Workaround to allow programmatic text selection on tap in iOS Safari
// See https://stackoverflow.com/a/79261423/1349044
if (isTouchDevice && isWebKit) {
  const tempInput = document.createElement('input');
  tempInput.style.position = 'fixed';
  tempInput.style.top = 0;
  tempInput.style.opacity = 0;
  tempInput.style.height = 0;
  tempInput.style.fontSize = '16px'; // Prevent page zoom on input focus
  tempInput.inputMode = 'none'; // Don't show keyboard
  tempInput.tabIndex = -1; // Prevent user from tabbing to input
  tempInput.ariaHidden = 'true'; // Hide from screen readers
  const initializeSelection = (event) => {
    if (document.readyState !== 'complete') return setTimeout(initializeSelection, 20);
    if (!tempInput.parentElement) document.body.append(tempInput);
    tempInput.focus();
    setTimeout(() => {
      tempInput.blur();
    }, 100);
  }
  initializeSelection();
  document.addEventListener('visibilitychange', (event) => {
    if (document.visibilityState === 'visible') initializeSelection();
  });
}

// Make Highlighter available to JavaScript module (highlight-helper.mjs)
globalThis.Highlighter = Highlighter;
