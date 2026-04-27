/**
 * HighlightHelper.js
 * https://github.com/samuelbradshaw/highlight-helper-js
 */

'use strict';

/********************** Highlighter Initialization **********************/

function Highlighter(containerSelector, paragraphSelector) {
  this._containerSelector = containerSelector;
  const { highlightIdFunction, ...cloneableDefaults } = _defaultOptions;
  this._options = structuredClone(cloneableDefaults);
  this._options.highlightIdFunction = highlightIdFunction;

  // Qualify paragraph selector with the container selector if needed
  if (!paragraphSelector.includes(containerSelector)) {
    paragraphSelector = paragraphSelector.split(',').map(selector => `${containerSelector} ${selector}`).join(',');
  }
  this._paragraphSelector = paragraphSelector;
  this._annotatableContainer = document.querySelector(containerSelector);
  this._annotatableParagraphs = this._annotatableContainer.querySelectorAll(paragraphSelector);
  this._annotatableParagraphIds = Array.from(this._annotatableParagraphs, paragraph => paragraph.id);

  // Handle cases where a highlighter already exists for the container, or one of its children or ancestors
  if (this._annotatableContainer.highlighter) {
    this._annotatableContainer.highlighter.removeHighlighter();
  } else if (this._annotatableContainer.closest('[data-hh-container]') || this._annotatableContainer.querySelector('[data-hh-container]')) {
    console.error(`Unable to create Highlighter with container selector "${containerSelector}" (annotatable container can't be a child or ancestor of another annotatable container).`);
    return;
  }

  // Abort controller can be used to cancel event listeners if the highlighter is removed
  this._controller = new AbortController;

  // Setting tabIndex -1 on <body> allows focus to be set programmatically (needed to initialize text selection in iOS Safari). It also prevents "tap to search" from interfering with text selection in Android Chrome.
  document.body.tabIndex = -1;

  // Set up additions (SVG background and selection handles)
  this._annotatableContainer.insertAdjacentHTML('beforeend', `
    <div data-hh-additions="">
      <svg data-hh-svg-background=""><g data-hh-svg-active-overlay=""></g></svg>
      <div data-hh-handle="" data-hh-side="left" data-hh-position="start" data-hh-ignore=""><div draggable="true"></div><div data-hh-handle-content=""></div></div>
      <div data-hh-handle="" data-hh-side="right" data-hh-position="end" data-hh-ignore=""><div draggable="true"></div><div data-hh-handle-content=""></div></div>
    </div>
  `);
  this._additionsDiv = this._annotatableContainer.querySelector('[data-hh-additions]');
  this._svgBackground = this._additionsDiv.querySelector('[data-hh-svg-background]');
  this._svgActiveOverlay = this._additionsDiv.querySelector('[data-hh-svg-active-overlay]');
  this._customHandles = this._additionsDiv.querySelectorAll('[data-hh-handle]');

  // Check for hyperlinks on the page
  this._hyperlinkElements = this._annotatableContainer.getElementsByTagName('a');
  this._hyperlinksByIndex = {}
  for (let hyp = 0; hyp < this._hyperlinkElements.length; hyp++) {
    const hyperlink = this._hyperlinkElements[hyp];
    hyperlink.dataset.hhIndex = hyp;
    this._hyperlinksByIndex[hyp] = {
      'index': hyp,
      'text': hyperlink.innerHTML,
      'url': hyperlink.href,
      'hyperlinkElement': hyperlink,
    }
  }

  this._highlightsById = {};
  this._annotatableContainer.dataset.hhContainer = '';
  this._annotatableContainer.highlighter = this;

  this._loadStyles();
  this._loadEventListeners();
  this._updateAppearanceStylesheet();
  this._updateSelectionUi('appearance');
  for (const handle of this._customHandles) {
    handle.children[1].innerHTML = this._options.customHandles[handle.dataset.hhSide] ?? '';
  }
}

Highlighter.prototype._loadStyles = function () {
  const options = this._options;

  // Set up stylesheets
  this._stylesheets = {}
  this._generalStylesheet = _addStylesheet(this._stylesheets, 'general');
  this._appearanceStylesheet = _addStylesheet(this._stylesheets, 'appearance');
  this._highlightApiStylesheet = _addStylesheet(this._stylesheets, 'highlight-api');
  this._selectionStylesheet = _addStylesheet(this._stylesheets, 'selection');
  this._generalStylesheet.replaceSync(`
    ${this._containerSelector} {
      -webkit-tap-highlight-color: transparent;
    }
    [data-hh-wrapper], [data-hh-handle] {
      -webkit-user-select: none;
      user-select: none;
    }
    [data-hh-handle] {
      position: absolute;
      width: 0px;
      visibility: hidden;
    }
    [data-hh-pointer-down="true"] [data-hh-handle] {
      visibility: hidden !important;
    }
    [data-hh-handle-content] {
      position: absolute;
      height: 100%;
    }
    [data-hh-handle] [draggable] {
      position: absolute;
      top: -0.3em;
      width: 3.2em;
      height: calc(100% + 1.3em);
      background-color: transparent;
      z-index: 1;
    }
    [data-hh-handle][data-hh-side="left"] [draggable] { right: -2em; }
    [data-hh-handle][data-hh-side="right"] [draggable] { left: -2em; }
    [data-hh-default-handle] {
      position: absolute;
      width: 0.8em;
      height: min(1.2em, 100%);
      background-color: hsl(from var(--hh-color) h 80% 40% / 1);
      outline: 0.1em solid hsla(0, 0%, 100%, 0.8);
      outline-offset: -0.05em;
      bottom: -0.2em;
    }
    [data-hh-handle][data-hh-side="left"] [data-hh-default-handle] {
      right: 0;
      border-radius: 1em 0 0.6em 0.6em;
    }
    [data-hh-handle][data-hh-side="right"] [data-hh-default-handle] {
      left: 0;
      border-radius: 0 1em 0.6em 0.6em;
    }
    [data-hh-additions] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      overflow: visible;
    }
    [data-hh-svg-background] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      overflow: visible;
      z-index: -1;
    }
    [data-hh-svg-background] g {
      fill: transparent;
      stroke: none;
    }
    mark[data-hh-highlight-id] {
      background-color: transparent;
      color: inherit;
    }
    .sr-only {
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
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
    if (isWKWebView && !isTouchDevice && selection.type !== 'Range' && this._previousSelectionRange && (this._activeHandle || (this._previousSelectionRange.compareBoundaryPoints(Range.END_TO_START, selectionRange) <= 0 && this._previousSelectionRange.compareBoundaryPoints(Range.END_TO_END, selectionRange) >= 0))) {
      selection.setBaseAndExtent(this._previousSelectionRange.startContainer, this._previousSelectionRange.startOffset, this._previousSelectionRange.endContainer, this._previousSelectionRange.endOffset);
    }

    // Deactivate highlights when tapping or creating a selection outside of the previous selection range
    if (!this._activeHandle && this._previousSelectionRange && (selection.type !== 'Range' || this._previousSelectionRange.comparePoint(selectionRange.startContainer, selectionRange.startOffset) === 1 || this._previousSelectionRange.comparePoint(selectionRange.endContainer, selectionRange.endOffset) === -1)) {
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
    if (event.target?.closest('[data-hh-handle]')) {
      if (!isSecondaryClick) {
        this._activeHandle = event.target.parentElement.closest('[data-hh-handle]');
        const handleClientRect = this._activeHandle.getBoundingClientRect();
        const lineHeight = handleClientRect.bottom - handleClientRect.top;
        this._activeHandle.dataset.hhDragYOffset = Math.max(0, event.clientY - handleClientRect.bottom + (lineHeight / 6));
        const selectionRange = globalThis.getSelection().getRangeAt(0);
        this._dragAnchorNode = this._activeHandle.dataset.hhPosition === 'start' ? selectionRange.endContainer : selectionRange.startContainer;
        this._dragAnchorOffset = this._activeHandle.dataset.hhPosition === 'start' ? selectionRange.endOffset : selectionRange.startOffset;
        this._annotatableContainer.addEventListener('pointermove', respondToCustomHandleDrag, { signal: this._controller.signal });
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
  const respondToCustomHandleDrag = (event) => {
    this._activeHandle.dataset.hhPointerXPosition = event.clientX;
    this._activeHandle.dataset.hhPointerYPosition = event.clientY;
    const selection = globalThis.getSelection();
    const selectionRange = selection.getRangeAt(0);
    const dragCaret = this._getCaretFromCoordinates(event.clientX, event.clientY - this._activeHandle.dataset.hhDragYOffset, true, false, true);

    // Return if there's no drag caret, if the drag caret is invalid, or if the drag caret and anchor caret have the same position
    if (!dragCaret || dragCaret.startContainer.nodeType !== Node.TEXT_NODE || dragCaret.endContainer.nodeType !== Node.TEXT_NODE || (this._dragAnchorNode === dragCaret.endContainer && this._dragAnchorOffset === dragCaret.endOffset)) return;

    // Check if start and end selection handles switched positions
    const dragPositionRelativeToSelectionStart = dragCaret.compareBoundaryPoints(Range.START_TO_END, selectionRange);
    const dragPositionRelativeToSelectionEnd = dragCaret.compareBoundaryPoints(Range.END_TO_END, selectionRange);
    if (this._activeHandle.dataset.hhPosition === 'start' && dragPositionRelativeToSelectionEnd === 1 || this._activeHandle.dataset.hhPosition === 'end' && dragPositionRelativeToSelectionStart === -1) {
      for (const handle of this._customHandles) {
        handle.dataset.hhPosition = handle.dataset.hhPosition === 'start' ? 'end' : 'start';
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
          return this.activateHyperlink(this._tapResult.hyperlinks[0].index);
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
    if (this._activeHandle) {
      this._activeHandle = null;
      this._updateSelectionUi('bounds');
      this._annotatableContainer.removeEventListener('pointermove', respondToCustomHandleDrag);
    }
  }
  globalThis.addEventListener('pointerup', (event) => respondToWindowPointerUp(event), { signal: this._controller.signal });
  globalThis.addEventListener('pointercancel', (event) => respondToWindowPointerUp(event), { signal: this._controller.signal });

  // Mouse move in annotatable container (for hh:hover events)
  let rafId = null;
  let latestMoveEvent = null;
  const handleHoverEvent = (event) => {
    const targets = this._getTargetsAtPoint(event);
    const { highlights, wrappers, hyperlinks } = targets;
    const newHoverKey = [
      ...highlights.map(h => h.highlightId),
      ...wrappers.map(w => `${w.highlightInfo.highlightId}:${w.position}`),
      ...hyperlinks.map(h => h.index),
    ].sort().join('\x00');
    if (newHoverKey === this._hoverKey) return;
    this._hoverKey = newHoverKey;
    const targetCount = highlights.length + wrappers.length + hyperlinks.length;
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:hover', {
      detail: { targetCount, targetFound: targetCount > 0, ...targets, pointerEvent: event },
    }));
  };
  this._annotatableContainer.addEventListener('mousemove', (event) => {
    if (!options.hoverEnabled) return;
    latestMoveEvent = event;
    rafId ??= requestAnimationFrame(() => { rafId = null; handleHoverEvent(latestMoveEvent); });
  }, { signal: this._controller.signal });
  this._annotatableContainer.addEventListener('mouseleave', (event) => {
    if (!options.hoverEnabled) return;
    handleHoverEvent(event);
  }, { signal: this._controller.signal });

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
  this._resizeObserver = new ResizeObserver(_debounce((entries) => {
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

  const highlightIdsToRedraw = new Set();
  const knownHighlightIds = new Set(Object.keys(this._highlightsById));
  let addedCount = 0, updatedCount = 0;
  for (const highlight of highlights) {
    if (knownHighlightIds.has(highlight.highlightId)) {
      knownHighlightIds.delete(highlight.highlightId);
      const highlightInfo = this._diffHighlight(highlight, this._highlightsById[highlight.highlightId]);
      if (highlightInfo) {
        for (const highlightId of this.createOrUpdateHighlight(highlightInfo, false, true)) {
          highlightIdsToRedraw.add(highlightId);
        }
        updatedCount++;
      }
    } else {
      for (const highlightId of this.createOrUpdateHighlight(highlight, false, true)) {
        highlightIdsToRedraw.add(highlightId);
      }
      addedCount++;
    }
  }
  if (knownHighlightIds.size > 0) this.removeHighlights([...knownHighlightIds]);
  this.drawHighlights(highlightIdsToRedraw);

  this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: {
    addedCount: addedCount, removedCount: knownHighlightIds.size, updatedCount: updatedCount,
    totalCount: Object.keys(this._highlightsById).length,
    timeToLoad: Date.now() - startTimestamp,
  } }));
}

// Draw (or redraw) specified highlights, or all highlights on the page
Highlighter.prototype.drawHighlights = function (highlightIds = Object.keys(this._highlightsById)) {
  const options = this._options;
  const additionsRect = this._additionsDiv.getBoundingClientRect();

  // Hide container (repeated DOM manipulations is faster if the container is hidden)
  if (highlightIds.length > 1) {
    this._annotatableContainer.style.display = 'none';
  }

  const sortedHighlights = this.getHighlightInfo(highlightIds);
  for (const highlightInfo of sortedHighlights) {
    const highlightId = highlightInfo.highlightId
    let range = this._getCorrectedRangeObj(highlightId);
    const rangeParagraphs = this._annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);

    // Remove old highlight and wrapper elements
    const existingStartWrapper = this._annotatableContainer.querySelector(`[data-hh-wrapper][data-hh-position="start"][data-hh-highlight-id="${highlightId}"]`);
    const existingEndWrapper = this._annotatableContainer.querySelector(`[data-hh-wrapper][data-hh-position="end"][data-hh-highlight-id="${highlightId}"]`);
    existingStartWrapper?.remove();
    existingEndWrapper?.remove();
    this._undrawHighlight(highlightInfo);

    // Insert wrappers before drawing highlights, so any layout shift from wrapper content is reflected in drawing positions
    if (highlightInfo.wrapper && (options.wrappers[highlightInfo.wrapper]?.start || options.wrappers[highlightInfo.wrapper]?.end)) {
      const insertWrapper = (position, insertionRange, existingEl, innerHtml) => {
        const serializedWrapperVariables = JSON.stringify(highlightInfo.wrapperVariables);
        for (const key of Object.keys(highlightInfo.wrapperVariables)) {
          innerHtml = innerHtml.replaceAll(`{${key}}`, highlightInfo.wrapperVariables[key]);
        }
        let htmlElement;
        if (existingEl) {
          existingEl.dataset.hhColorKey = highlightInfo.color;
          existingEl.dataset.hhStyleKey = highlightInfo.style;
          const wrapperContentChanged = existingEl.dataset.hhWrapperKey !== highlightInfo.wrapper || existingEl.dataset.hhWrapperVariables !== serializedWrapperVariables;
          if (wrapperContentChanged) {
            existingEl.dataset.hhWrapperKey = highlightInfo.wrapper;
            existingEl.dataset.hhWrapperVariables = serializedWrapperVariables;
            existingEl.innerHTML = innerHtml;
          }
          htmlElement = existingEl;
        } else {
          const template = document.createElement('template');
          template.innerHTML = `<span data-hh-wrapper="" data-hh-position="${position}" data-hh-highlight-id="${highlightId}" data-hh-color-key="${highlightInfo.color}" data-hh-style-key="${highlightInfo.style}" data-hh-wrapper-key="${highlightInfo.wrapper}" data-hh-wrapper-variables='${serializedWrapperVariables}' data-hh-ignore="">${innerHtml}</span>`;
          htmlElement = template.content.firstChild;
        }
        if (position === 'start') {
          insertionRange.insertNode(htmlElement);
        } else {
          insertionRange.endContainer.splitText(insertionRange.endOffset);
          insertionRange.endContainer.after(htmlElement);
        }
      }
      const wrapperInfo = options.wrappers[highlightInfo.wrapper];
      insertWrapper('start', range, existingStartWrapper, wrapperInfo.start);
      range = this._getCorrectedRangeObj(highlightId);
      insertWrapper('end', range, existingEndWrapper, wrapperInfo.end);
      range = this._getCorrectedRangeObj(highlightId);

      // If current highlight is active, update selection range to match highlight range
      const selection = globalThis.getSelection();
      const selectionRange = selection.type !== 'None' ? selection.getRangeAt(0) : null;
      if (highlightId === this._activeHighlightId && selectionRange && !(selectionRange.compareBoundaryPoints(Range.START_TO_START, range) === 0 && selectionRange.compareBoundaryPoints(Range.END_TO_END, range) === 0)) {
        globalThis.getSelection().setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
      }
    }

    // Compute merged rects for tap detection (null for highlights drawn as mark elements)
    highlightInfo.resolvedDrawingMode = this._getResolvedDrawingMode(highlightInfo);
    const useMarkElements = highlightInfo.resolvedDrawingMode === 'mark-elements';
    const mergedRects = useMarkElements ? null : this._getMergedRects(range, rangeParagraphs, additionsRect);
    highlightInfo.mergedRects = mergedRects;

    // Draw highlights with mark elements
    if (useMarkElements) {
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
        mark.dataset.hhHighlightId = highlightId;
        mark.dataset.hhColorKey = highlightInfo.color;
        mark.dataset.hhStyleKey = highlightInfo.style;
        return mark;
      };
      for (let tn = 0; tn < relevantTextNodes.length; tn++) {
        const textNode = relevantTextNodes[tn];
        if (textNode.parentElement.dataset.hhHighlightId) overlappingHighlightIds.add(textNode.parentElement.dataset.hhHighlightId);
        const styledMark = createStyledMark();
        if (tn === 0 && tn === relevantTextNodes.length - 1) styledMark.dataset.hhPosition = 'start end';
        else if (tn === 0) styledMark.dataset.hhPosition = 'start';
        else if (tn === relevantTextNodes.length - 1) styledMark.dataset.hhPosition = 'end';
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
    } else if (options.drawingMode === 'highlight-api') {
      let cssHighlight;
      if (CSS.highlights.has(highlightId)) {
        cssHighlight = CSS.highlights.get(highlightId);
        cssHighlight.clear();
      } else {
        cssHighlight = new Highlight();
        CSS.highlights.set(highlightId, cssHighlight);
      }
      cssHighlight.add(range);
      const styleTemplate = this._getStyleTemplate(highlightInfo.style, 'css', null);
      const colorString = options.colors[highlightInfo.color];
      this._highlightApiStylesheet.insertRule(`${this._containerSelector} ::highlight(${highlightInfo.escapedHighlightId}) { --hh-color: ${colorString}; ${styleTemplate} }`);
      this._highlightApiStylesheet.insertRule(`${this._containerSelector} rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
      this._highlightApiStylesheet.insertRule(`${this._containerSelector} img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);

    // Draw highlights with SVG shapes
    } else if (options.drawingMode === 'svg') {
      let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.hhHighlightId = highlightId;
      group.dataset.hhColorKey = highlightInfo.color;
      group.dataset.hhStyleKey = highlightInfo.style;
      let svgContent = '';
      for (const mergedRect of mergedRects) {
        svgContent += this._getStyleTemplate(highlightInfo.style, 'svg', mergedRect);
      }
      group.innerHTML = svgContent;
      this._svgBackground.appendChild(group);
    }
  }

  // Show container
  this._annotatableContainer.style.display = '';
}

// Create a new highlight, or update an existing highlight when it changes
Highlighter.prototype.createOrUpdateHighlight = function (attributes = {}, triggeredByUserAction = true, isBatchProcess = false) {
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
    for (const element of temporaryHtmlElement.querySelectorAll(`a, [data-hh-highlight-id]:not([data-hh-highlight-id="${highlightId}"])`)) element.outerHTML = element.innerHTML;
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
    mergedRects: oldHighlightInfo?.mergedRects ?? null,
    resolvedDrawingMode: null,
  };
  this._highlightsById[highlightId] = newHighlightInfo;
  newHighlightInfo.resolvedDrawingMode = this._getResolvedDrawingMode(newHighlightInfo);

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
  const highlightIdsToRedraw = new Set();
  const wrapperChanged = appearanceChanges.some(k => k.startsWith('wrapper'));
  if (wrapperChanged) {
    highlightIdsToRedraw.add(highlightId);
    if (newHighlightInfo.resolvedDrawingMode === 'mark-elements') {
      // In mark elements drawing mode (or when the highlight is drawn as mark elements), deactivate before redrawing (prevents an invalid selection range when the DOM changes)
      this.deactivateHighlights();
    } else if (options.drawingMode === 'svg') {
      // In SVG drawing mode, redraw all highlights after the current highlight (wrapper change may reflow text, causing misaligned highlights)
      const allHighlights = this.getHighlightInfo();
      const currentIndex = allHighlights.findIndex(h => h.highlightId === highlightId);
      for (const highlightInfo of allHighlights.slice(currentIndex + 1)) {
        highlightIdsToRedraw.add(highlightInfo.highlightId);
      }
    }
  } else if (highlightId !== this._activeHighlightId) {
    highlightIdsToRedraw.add(highlightId);
  }

  // Redraw or return highlight IDs to be redrawn
  if (!isBatchProcess && highlightIdsToRedraw.size > 0) {
    this.drawHighlights(highlightIdsToRedraw);
  }

  if (isNewHighlight) {
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
  } else {
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
  }

  return highlightIdsToRedraw
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
  const highlightRange = this._getCorrectedRangeObj(highlightId);
  this._activeHighlightId = highlightId;
  this._updateSelectionUi('appearance');
  this._updateSelectionUi('bounds');

  // Update the selection range if needed
  // In Android Chrome, sometimes selection handles don't show when a selection is updated programmatically, so it's best to only update the selection if needed.
  let selectionRange = selection.type === 'Range' ? selection.getRangeAt(0) : null;
  if (!selectionRange || !(selectionRange.compareBoundaryPoints(Range.START_TO_START, highlightRange) === 0 && selectionRange.compareBoundaryPoints(Range.END_TO_END, highlightRange) === 0)) {
    selection.setBaseAndExtent(highlightRange.startContainer, highlightRange.startOffset, highlightRange.endContainer, highlightRange.endOffset);
  }

  this._annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
}

// Activate a link by index
Highlighter.prototype.activateHyperlink = function (index) {
  this.deactivateHighlights();
  this._allowHyperlinkClick = true;
  this._hyperlinksByIndex[index].hyperlinkElement.click();
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
    if (highlightInfo && !paragraphId || paragraphId === highlightInfo.startParagraphId) {
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
    if (['colors', 'styles', 'wrappers'].includes(key) && optionsToUpdate[key] != null) {
      options[key] = { ...options[key], ...optionsToUpdate[key] };
    } else {
      options[key] = optionsToUpdate[key] ?? options[key];
    }
  }
  if ('drawingMode' in optionsToUpdate || 'styles' in optionsToUpdate || 'colors' in optionsToUpdate) {
    this._updateAppearanceStylesheet();
  }
  if ('drawingMode' in optionsToUpdate || 'styles' in optionsToUpdate) {
    if (supportsHighlightApi) CSS.highlights.clear();
    this.drawHighlights();
  }
  if ('customHandles' in optionsToUpdate) {
    for (const handle of this._customHandles) {
      handle.children[1].innerHTML = options.customHandles[handle.dataset.hhSide] ?? '';
    }
  }
  if ('hoverEnabled' in optionsToUpdate && !optionsToUpdate.hoverEnabled) this._hoverKey = null;
}

// Get all of the initialized options
Highlighter.prototype.getOptions = function () {
  return this._options;
}

// Remove this Highlighter instance and its highlights
Highlighter.prototype.removeHighlighter = function () {
  this.loadHighlights([]);
  this._additionsDiv.remove();
  _removeStylesheets(this._stylesheets);
  this._resizeObserver.disconnect();
  this._controller.abort();

  delete this._annotatableContainer.dataset.hhContainer;
  this._annotatableContainer.highlighter = undefined;
}


/********************** Private Methods **********************/

// Get highlights, wrappers, and hyperlinks at a given point
Highlighter.prototype._getTargetsAtPoint = function (pointerEvent) {
  const highlightIds = new Set();
  const wrappers = [];
  const hyperlinks = [];
  const wrapperElements = new Set();
  const targetElements = document.elementsFromPoint(pointerEvent.clientX, pointerEvent.clientY);
  for (const element of targetElements) {
    if (element === this._annotatableContainer) break;
    if (element.matches('mark[data-hh-highlight-id]')) {
      highlightIds.add(element.dataset.hhHighlightId);
    }
    const wrapper = element.closest('[data-hh-wrapper]');
    if (wrapper && !wrapperElements.has(wrapper)) {
      wrappers.push({
        position: wrapper.dataset.hhPosition,
        wrapperElement: wrapper,
        highlightInfo: this._highlightsById[wrapper.dataset.hhHighlightId],
      });
      wrapperElements.add(wrapper);
    } else if (element.matches('a') && element.dataset.hhIndex) {
      hyperlinks.push(this._hyperlinksByIndex[element.dataset.hhIndex]);
    }
  }
  const additionsRect = this._additionsDiv.getBoundingClientRect();
  const x = pointerEvent.clientX - additionsRect.left;
  const y = pointerEvent.clientY - additionsRect.top - 5; // Shift hit area down 5 pixels
  for (const highlightId of Object.keys(this._highlightsById)) {
    if (highlightIds.has(highlightId)) continue;
    const mergedRects = this._highlightsById[highlightId].mergedRects;
    if (!mergedRects) continue;
    for (const rect of mergedRects) {
      if (this._isPointInRect(x, y, rect)) { highlightIds.add(highlightId); break; }
    }
  }
  return { highlights: this.getHighlightInfo(highlightIds), wrappers, hyperlinks };
}

// Check if the tap hits any highlights, wrappers, or links
Highlighter.prototype._checkForTapTargets = function (pointerEvent) {
  if (!pointerEvent) return;
  const targets = this._getTargetsAtPoint(pointerEvent);
  const targetCount = targets.highlights.length + targets.wrappers.length + targets.hyperlinks.length;
  return {
    targetCount: targetCount,
    targetFound: targetCount > 0,
    tapRange: this._getCaretFromCoordinates(pointerEvent.clientX, pointerEvent.clientY),
    pointerEvent: pointerEvent,
    ...targets,
  };
}

// Compare new highlight information to old highlight information, returning an object with the properties that changed
Highlighter.prototype._diffHighlight = function (newHighlightInfo, oldHighlightInfo) {
  if (!oldHighlightInfo) return newHighlightInfo;
  const changedHighlightInfo = { highlightId: newHighlightInfo.highlightId };
  let hasChanges = false;
  for (const key of Object.keys(newHighlightInfo)) {
    if (key !== 'highlightId' && Object.hasOwn(oldHighlightInfo, key) && oldHighlightInfo[key] !== newHighlightInfo[key]) {
      changedHighlightInfo[key] = newHighlightInfo[key];
      hasChanges = true;
    }
  }
  return hasChanges ? changedHighlightInfo : null;
}

// Undraw the specified highlight
Highlighter.prototype._undrawHighlight = function (highlightInfo) {
  const highlightId = highlightInfo.highlightId;

  // Remove <mark> highlights and HTML wrappers
  const overlappingHighlightIds = new Set();
  this._annotatableContainer.querySelectorAll(`[data-hh-highlight-id="${highlightId}"]:not(g)`).forEach(element => {
    if (element.parentElement.dataset.hhHighlightId) {
      overlappingHighlightIds.add(element.parentElement.dataset.hhHighlightId);
    }
    for (const childHighlight of element.querySelectorAll('[data-hh-highlight-id]')) {
      overlappingHighlightIds.add(childHighlight.dataset.hhHighlightId);
    }
    if (element.matches('mark')) {
      element.replaceWith(...element.childNodes);
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
  const r = highlightInfo.rangeObj;
  rangeParagraphs.forEach(p => p.normalize());
  this._getCorrectedRangeObj(highlightId);

  // Remove SVG highlights
  this._svgBackground.querySelectorAll(`g[data-hh-highlight-id="${highlightId}"]`).forEach(element => {
    element.remove();
  });

  // Remove Highlight API highlights
  if (supportsHighlightApi && CSS.highlights.has(highlightId)) {
    for (let r = this._highlightApiStylesheet.cssRules.length - 1; r >= 0; r--) {
      if (this._highlightApiStylesheet.cssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`)) this._highlightApiStylesheet.deleteRule(r);
    }
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

  // Draw SVG selection rects (SVG drawing mode only)
  this._svgActiveOverlay.innerHTML = '';
  if (this._activeHighlightId && highlightInfo?.resolvedDrawingMode === 'svg') {
    let range = this._getCorrectedRangeObj(this._activeHighlightId);
    range = this._snapRangeToBoundaries(range);
    const rangeParagraphs = this._annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
    const additionsRect = this._additionsDiv.getBoundingClientRect();
    const mergedRects = this._getMergedRects(range, rangeParagraphs, additionsRect);
    this._svgActiveOverlay.dataset.hhColorKey = color;
    this._svgActiveOverlay.dataset.hhStyleKey = style;
    let svgContent = '';
    for (const mergedRect of mergedRects) {
      svgContent += this._getStyleTemplate(highlightInfo.style, 'svg', mergedRect, true);
    }
    this._svgActiveOverlay.innerHTML = svgContent;

    // Bring active highlight to the front
    const svgHighlight = this._svgBackground.querySelector(`g[data-hh-highlight-id="${this._activeHighlightId}"]`);
    if (svgHighlight) this._svgBackground.appendChild(svgHighlight);
    this._svgBackground.appendChild(this._svgActiveOverlay);
  }

  if (changeType === 'appearance') {
    const colorString = options.colors[color] ?? (CSS.supports('color', 'AccentColor') ? 'AccentColor' : 'dodgerblue');
    this._annotatableContainer.style.setProperty('--hh-color', colorString);

    // Hide the active highlight (and wrappers), and set a selection style that mimics the highlight. This avoids the need to redraw the highlight while actively editing it (especially important for <mark> highlights, because DOM manipulation around the selection can make the selection UI unstable).
    if (this._activeHighlightId && highlightInfo?.resolvedDrawingMode === 'svg') {
      this._selectionStylesheet.replaceSync(`
        ${this._containerSelector} g[data-hh-highlight-id="${this._activeHighlightId}"][data-hh-style-key] { display: none; }
        ${this._containerSelector} [data-hh-wrapper][data-hh-highlight-id="${this._activeHighlightId}"] { visibility: hidden; }
        ${this._containerSelector} ::selection { background-color: transparent; }
      `);
    } else if (this._activeHighlightId) {
      const styleTemplate = this._getStyleTemplate(style, 'css', null, true);
      this._selectionStylesheet.replaceSync(`
        ${this._containerSelector} ::highlight(${highlightInfo.escapedHighlightId}) { all: unset; }
        ${this._containerSelector} mark[data-hh-highlight-id="${this._activeHighlightId}"][data-hh-style-key] { all: unset; }
        ${this._containerSelector} [data-hh-wrapper][data-hh-highlight-id="${this._activeHighlightId}"] { visibility: hidden; }
        ${this._containerSelector} ::selection { --hh-color: ${colorString}; ${styleTemplate} }
        ${this._containerSelector} rt::selection, ${this._containerSelector} img::selection { background-color: transparent; }
      `);

    // No active highlight (show the regular selection UI)
    } else {
      this._selectionStylesheet.replaceSync(`
        ${this._containerSelector} ::selection { background-color: Highlight; color: inherit; }
        ${this._containerSelector} rt::selection, ${this._containerSelector} img::selection { background-color: transparent; }
      `);
    }

    // Send event
    this._annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionstyleupdate', { detail: { color: color, style: style, }}));

  } else if (changeType === 'bounds') {
    // Update selection handle location and visibility
    if (selection.type === 'Range') {
      const selectionRangeRects = selectionRange.getClientRects();
      const startRect = selectionRangeRects[0];
      const endRect = selectionRangeRects[selectionRangeRects.length - 1];
      const additionsRect = this._additionsDiv.getBoundingClientRect();

      if (
        (options.showCustomHandlesOnTouch || this._pointerType === 'mouse')
        && ((options.showCustomHandlesForActiveHighlights && this._activeHighlightId)
          || (options.showCustomHandlesForTextSelection && !this._activeHighlightId))
      ) {
        const startNodeIsRtl = globalThis.getComputedStyle(selectionRange.startContainer.parentElement).direction === 'rtl';
        const endNodeIsRtl = globalThis.getComputedStyle(selectionRange.endContainer.parentElement).direction === 'rtl';
        for (const handle of this._customHandles) {
          let side;
          if (handle.dataset.hhPosition === 'start') {
            side = startNodeIsRtl ? 'right' : 'left';
            handle.style.left = startRect[side] - additionsRect.left + 'px';
            handle.style.height = startRect.height + 'px';
            handle.style.top = startRect.top - additionsRect.top + 'px';
          } else {
            side = endNodeIsRtl ? 'left' : 'right';
            handle.style.left = endRect[side] - additionsRect.left + 'px';
            handle.style.height = endRect.height + 'px';
            handle.style.top = endRect.top - additionsRect.top + 'px';
          }
          if (handle.dataset.hhSide !== side) {
            handle.dataset.hhSide = side;
            this.setOptions({ customHandles: options.customHandles });
          }
        }
        this._setCustomHandleVisibility(true);
      }
    } else {
      this._setCustomHandleVisibility(false);
    }
  }
}

Highlighter.prototype._setCustomHandleVisibility = function (visible = this._customHandles[0].style.visibility === 'hidden') {
  for (const handle of this._customHandles) {
    handle.style.visibility = visible ? 'visible' : 'hidden';
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
  const skipStart = this._shouldSkipTextNode(startNode);
  const skipEnd = this._shouldSkipTextNode(endNode);
  if (this._annotatableContainer.contains(range.commonAncestorContainer) && (skipStart || skipEnd)) {
    if (skipStart) {
      startNode = this._getNextValidTextNode(startNode);
      startOffset = 0;
    }
    if (skipEnd) {
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
    const startText = startNode.data;
    const endText = endNode.data;
    // Trim whitespace and dashes at range start and end
    while (_reWhitespaceDash.test(startOffset < startText.length && startText[startOffset])) startOffset += 1;
    while (endOffset > 0 && _reWhitespaceDash.test(endText[endOffset - 1])) endOffset -= 1;

    // Expand range to word boundaries
    while (startOffset > 0 && _reNonWhitespaceDash.test(startText[startOffset - 1])) startOffset -= 1;
    while (endOffset < endText.length && _reNonWhitespaceDash.test(endText[endOffset])) endOffset += 1;
  }

  const newRange = document.createRange();
  newRange.setStart(startNode, startOffset);
  newRange.setEnd(endNode, endOffset);
  return newRange;
}

// Get the character offset relative to the annotatable paragraph
Highlighter.prototype._getParagraphOffset = function (referenceTextNode, referenceTextNodeOffset) {
  const paragraph = referenceTextNode.parentElement.closest(this._paragraphSelector);
  const walker = this._getTextNodeWalker(paragraph);
  let currentOffset = 0;
  let textNode;
  while (textNode = walker.nextNode()) {
    if (textNode === referenceTextNode) {
      currentOffset += referenceTextNodeOffset;
      break;
    }
    currentOffset += textNode.length;
  }
  return [ paragraph.id, currentOffset ];
}

// Get the character offset relative to the deepest relevant text node
Highlighter.prototype._getTextNodeAndOffset = function (parentElement, targetOffset, position) {
  let textNode, firstTextNode, currentOffset = 0;
  const walker = this._getTextNodeWalker(parentElement);
  while (textNode = walker.nextNode()) {
    if (!firstTextNode) firstTextNode = textNode;
    const nodeLength = textNode.length;
    currentOffset += nodeLength;
    if (currentOffset >= targetOffset) {
      const relativeOffset = nodeLength - currentOffset + targetOffset;
      // If the start offset is at the end of a text node, move it to the beginning of the next text node
      if (position === 'start' && relativeOffset === nodeLength) {
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
    return [ lastTextNode, lastTextNode.length ];
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
  const parentParagraph = textNode.parentNode.closest(this._paragraphSelector);
  const ignoreParent = textNode.parentNode.closest('[data-hh-ignore], .sr-only');
  if (!parentParagraph || ignoreParent || textNode.textContent === '') return true;
  return false;
}

// Get text node walker
Highlighter.prototype._getTextNodeWalker = function (root) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (node) => this._shouldSkipTextNode(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT);
}

// Update appearance stylesheet (user-defined colors and styles)
Highlighter.prototype._updateAppearanceStylesheet = function () {
  const options = this._options;
  let css = '';
  for (const color of Object.keys(options.colors)) {
    css += `[data-hh-color-key="${color}"] { --hh-color: ${options.colors[color]}; }\n`;
  }
  for (const style of Object.keys(options.styles)) {
    const styleTemplate = this._getStyleTemplate(style, 'css', null);
    css += `mark[data-hh-highlight-id][data-hh-style-key="${style}"] { ${styleTemplate} }\n`;
  }
  this._appearanceStylesheet.replaceSync(css);
}

// Get the resolved drawing mode for a highlight
Highlighter.prototype._getResolvedDrawingMode = function (highlightInfo) {
  const options = this._options;
  const resolvedStyle = Object.hasOwn(options.styles, highlightInfo.style) ? highlightInfo.style : options.defaultStyle;
  if ((options.drawingMode === 'svg' && !options.styles[resolvedStyle]?.svg)
    || (options.drawingMode === 'highlight-api' && !supportsHighlightApi)) {
    return 'mark-elements';
  }
  return options.drawingMode;
}

// Get style template for a given highlight style
Highlighter.prototype._getStyleTemplate = function (style, type, mergedRect = null, active = false) {
  const options = this._options;
  style = Object.hasOwn(options.styles, style) ? style : options.defaultStyle;
  let styleTemplate = options.styles[style]?.[type] ?? '';
  if (active) {
    styleTemplate = options.styles[style]?.[`${type}Active`] ?? styleTemplate;
  }
  if (styleTemplate && type === 'svg' && mergedRect) {
    styleTemplate = styleTemplate.replace(/\{(x|y|width|height|top|right|bottom|left)\}/g, (_, key) => mergedRect[key]);
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
    highlightRange.startOffset >= highlightRange.startContainer.length ||
    highlightRange.endOffset > highlightRange.endContainer.length
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
    const caretPosition = document.caretPositionFromPoint(clientX, clientY);
    if (!caretPosition) return;
    range = document.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
  } else if (supportsCaretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY);
  }
  if (!range) return;
  if (range.startContainer.parentElement?.closest('[data-hh-ignore]')) return;
  if (checkXDistance || checkYDistance) {
    const maxDistance = 30;
    const caretClientRect = range.getBoundingClientRect();
    if (checkXDistance && Math.abs(clientX - caretClientRect.x) > maxDistance) return;
    if (checkYDistance && Math.abs(clientY - caretClientRect.top) > maxDistance && Math.abs(clientY - caretClientRect.bottom) > maxDistance) return;
  }
  if (checkAnnotatable && !range.startContainer.parentElement?.closest(this._paragraphSelector)) return;
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
Highlighter.prototype._getMergedRects = function (range, paragraphs, additionsRect) {
  const mergedRects = [];
  const textNodeRange = document.createRange();

  for (const paragraph of paragraphs) {
    const paragraphRect = paragraph.getBoundingClientRect();
    const paragraphStyle = getComputedStyle(paragraph);
    const snapTolerance = Math.max(Number.parseInt(paragraphStyle.fontSize) / 2, 4);
    const topPadding = Number.parseInt(paragraphStyle.paddingTop);
    const textIndent = Number.parseInt(paragraphStyle.textIndent);

    // Build line positions and collect highlight rects
    const linePositions = {};
    const lineBottomKeys = [];
    const unmergedRects = [];
    const walker = this._getTextNodeWalker(paragraph);
    let textNode;
    while (textNode = walker.nextNode()) {
      // Build line positions (skip text nodes in elements that are higher or lower than surrounding text)
      if (!textNode.parentElement.closest('sup, sub, rt')) {
        textNodeRange.selectNode(textNode);
        for (const rect of textNodeRange.getClientRects()) {
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

      // Collect highlight rects from text nodes that intersect the range
      if (range.intersectsNode(textNode)) {
        const start = textNode === range.startContainer ? range.startOffset : 0;
        const end = textNode === range.endContainer ? range.endOffset : textNode.length;
        if (start < end) {
          textNodeRange.setStart(textNode, start);
          textNodeRange.setEnd(textNode, end);
          for (const rect of textNodeRange.getClientRects()) {
            if (rect.width > 0) unmergedRects.push(rect);
          }
        }
      }
    }

    // Assign highlight range rects to matching line positions
    const lineBottoms = lineBottomKeys.sort((a, b) => a - b);
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
      mergedRects.push(new DOMRect(left - additionsRect.left, top - additionsRect.top, width, height));
    }
  }

  return mergedRects;
}


/********************** Utilities **********************/

// Add a CSS stylesheet to the document
function _addStylesheet(stylesheets, stylesheetKey) {
  let stylesheet = stylesheets[stylesheetKey];
  if (!stylesheet) {
    if (supportsCssStylesheetApi) {
      stylesheet = new CSSStyleSheet();
      document.adoptedStyleSheets.push(stylesheet);
    } else {
      // For browsers that don't fully support the CSSStyleSheet API, such as Safari < 16.4.
      // See https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet#browser_compatibility
      stylesheet = document.createElement('style');
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
function _removeStylesheets(stylesheets) {
  const sheets = Object.values(stylesheets);
  if (supportsCssStylesheetApi) {
    const sheetsSet = new Set(sheets);
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => !sheetsSet.has(s));
  } else {
    for (const stylesheet of sheets) stylesheet.remove();
  }
}

// Debounce a function to prevent it from being executed too frequently
// Adapted from https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
function _debounce(func, wait) {
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
  colors: {
    'red': 'hsl(360, 100%, 70%)',
    'orange': 'hsl(30, 100%, 60%)',
    'yellow': 'hsl(50, 100%, 60%)',
    'green': 'hsl(80, 100%, 45%)',
    'blue': 'hsl(180, 100%, 45%)',
  },
  styles: {
    'fill': {
      css: 'background-color: hsl(from var(--hh-color) h s l / 50%);',
      cssActive: 'background-color: hsl(from var(--hh-color) h s l / 80%);',
      svg: '<rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 50%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />',
      svgActive: `
        <rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 80%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />
      `,
    },
    'underline': {
      css: 'text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      cssActive: 'background-color: hsl(from var(--hh-color) h s l / 25%); text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      svg: '<rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />',
      svgActive: `
        <rect x="{x}" y="{y}" rx="4" style="fill: hsl(from var(--hh-color) h s l / 25%); width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />
        <rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />
      `,
    },
  },
  wrappers: {
    'screen-reader-label': {
      start: '<span class="sr-only">{startLabel} </span>',
      end: '<span class="sr-only"> {endLabel}</span>',
    },
  },
  customHandles: {
    left: '<div data-hh-default-handle=""></div>',
    right: '<div data-hh-default-handle=""></div>',
  },
  rememberStyle: true,
  snapToWord: false,
  autoTapToActivate: true,
  longPressTimeout: 500,
  pointerMode: 'auto',
  drawingMode: 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: null,
  highlightIdFunction: _getNewHighlightId,
  showCustomHandlesForActiveHighlights: true,
  showCustomHandlesForTextSelection: false,
  showCustomHandlesOnTouch: false,
  hoverEnabled: false,
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
