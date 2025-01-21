/**
 * Highlight Helper
 * https://github.com/samuelbradshaw/highlight-helper-js
 */

function Highlighter(options = hhDefaultOptions) {
  for (const key of Object.keys(hhDefaultOptions)) {
    options[key] = options[key] ?? hhDefaultOptions[key];
  }
  
  this.annotatableContainer, this.annotatableParagraphs;
  let generalStylesheet, appearanceStylesheet, highlightApiStylesheet, selectionStylesheet;
  let annotatableParagraphIds, hyperlinkElements;
  let svgBackground, svgActiveOverlay, selectionHandles;
  let highlightsById, hyperlinksByPosition;
  let controller;
  
  const initializeHighlighter = (previousContainerSelector = null) => {
    if (!options.paragraphSelector.includes(options.containerSelector)) {
      const paragraphSelectorList = options.paragraphSelector.split(',').map(selector => `${options.containerSelector} ${selector}`);
      options.paragraphSelector = paragraphSelectorList.join(',');
    }
    this.annotatableContainer = document.querySelector(options.containerSelector);
    this.annotatableParagraphs = this.annotatableContainer.querySelectorAll(options.paragraphSelector);
    annotatableParagraphIds = Array.from(this.annotatableParagraphs, paragraph => paragraph.id);
    
    // Handle cases where a highlighter already exists for the container, or one of its children or ancestors
    const previousContainer = document.querySelector(previousContainerSelector) ?? this.annotatableContainer;
    if (previousContainer.highlighter) {
      previousContainer.highlighter.removeHighlighter();
    } else if (this.annotatableContainer.closest('[data-hh-container]') || this.annotatableContainer.querySelector('[data-hh-container]')) {
      console.error(`Unable to create Highlighter with container selector “${options.containerSelector}” (annotatable container can’t be an child or ancestor of another annotatable container).`);
      return false;
    }
    
    // Abort controller can be used to cancel event listeners if the highlighter is removed
    controller = new AbortController;
    
    // Setting tabIndex -1 on <body> allows focus to be set programmatically (needed to initialize text selection in iOS Safari). It also prevents "tap to search" from interfering with text selection in Android Chrome.
    document.body.tabIndex = -1;
        
    // Set up stylesheets
    generalStylesheet = new CSSStyleSheet();
    appearanceStylesheet = new CSSStyleSheet();
    highlightApiStylesheet = new CSSStyleSheet();
    selectionStylesheet = new CSSStyleSheet();
    document.adoptedStyleSheets.push(generalStylesheet);
    document.adoptedStyleSheets.push(appearanceStylesheet);
    document.adoptedStyleSheets.push(highlightApiStylesheet);
    document.adoptedStyleSheets.push(selectionStylesheet);
    generalStylesheet.replaceSync(`
      ${options.containerSelector} {
        position: relative;
        -webkit-tap-highlight-color: transparent;
      }
      .hh-wrapper-start, .hh-wrapper-end {
        -webkit-user-select: none;
        user-select: none;
      }
      .hh-selection-handle {
        position: absolute;
        width: 0;
        display: none;
      }
      .hh-selection-handle-content {
        position: absolute;
        height: 100%;
      }
      .hh-selection-handle [draggable] {
        position: absolute;
        top: 0;
        width: 15px;
        height: calc(100% + 10px);
        background-color: transparent;
        z-index: 1;
      }
      .hh-selection-handle [draggable]:hover,
      .hh-selection-handle [draggable]:active { cursor: ew-resize; }
      .hh-selection-handle[data-position="left"] [draggable] { right: 0; }
      .hh-selection-handle[data-position="right"] [draggable] { left: 0; }
      .hh-default-handle {
        position: absolute;
        width: 10px;
        height: calc(100% + 5px);
        background-color: hsl(from var(--hh-color) h 80% 50% / 1);
        outline: 1px solid white;
        outline-offset: -1px;
        top: 0;
      }
      .hh-selection-handle[data-position="left"] .hh-default-handle {
        right: 0;
        border-radius: 20px 0 10px 10px;
      }
      .hh-selection-handle[data-position="right"] .hh-default-handle {
        left: 0;
        border-radius: 0 20px 10px 10px;
      }
      .hh-svg-background {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
      }
      .hh-svg-background g {
        fill: transparent;
        stroke: none;
      }
      span[data-highlight-id][data-style="fill"][data-start] {
        border-top-left-radius: 0.25em;
        border-bottom-left-radius: 0.25em;
        margin-left: -0.13em; padding-left: 0.13em;
      }
      span[data-highlight-id][data-style="fill"][data-end] {
        border-top-right-radius: 0.25em;
        border-bottom-right-radius: 0.25em;
        margin-right: -0.13em; padding-right: 0.13em;
      }
    `);
    
    // Set up SVG background and selection handles
    svgBackground = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgActiveOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgActiveOverlay.dataset.activeOverlay = '';
    svgBackground.appendChild(svgActiveOverlay);
    svgBackground.classList.add('hh-svg-background');
    this.annotatableContainer.appendChild(svgBackground);
    this.annotatableContainer.insertAdjacentHTML('beforeend', `
      <div class="hh-selection-handle" data-position="left"><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
      <div class="hh-selection-handle" data-position="right"><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
    `);
    selectionHandles = this.annotatableContainer.getElementsByClassName('hh-selection-handle');
    
    // Check for hyperlinks on the page
    hyperlinkElements = this.annotatableContainer.getElementsByTagName('a');
    hyperlinksByPosition = {}
    for (let hyp = 0; hyp < hyperlinkElements.length; hyp++) {
      hyperlinksByPosition[hyp] = {
        'position': hyp,
        'text': hyperlinkElements[hyp].innerHTML,
        'url': hyperlinkElements[hyp].href,
        'hyperlinkElement': hyperlinkElements[hyp],
      }
    }
    
    highlightsById = {};
    this.annotatableContainer.dataset.hhContainer = '';
    this.annotatableContainer.highlighter = this;
    hhHighlighters.push(this);
    
    return true;
  }
  
  const isInitialized = initializeHighlighter();
  if (!isInitialized) return;
  
  let activeHighlightId, previousSelectionRange, activeSelectionHandle, isStylus, tapResult, longPressTimeoutId;
  
  
  // -------- PUBLIC METHODS --------
  
  // Load highlights
  this.loadHighlights = (highlights) => {
    // Don't load highlights until the document is ready (otherwise, highlights may be offset)
    if (document.readyState !== 'complete') return setTimeout(this.loadHighlights, 10, highlights);
    const startTimestamp = Date.now();
    
    // Hide container (repeated DOM manipulations are faster if the container is hidden)
    if (highlights.length > 1) (options.drawingMode === 'svg' ? svgBackground : this.annotatableContainer).style.display = 'none';
    
    // Load read-only highlights first (read-only highlights change the DOM, affecting other highlights' ranges)
    const sortedHighlights = highlights.sort((a,b) => a.readOnly === b.readOnly ? 0 : a.readOnly ? -1 : 1);
    
    const knownHighlightIds = Object.keys(highlightsById);
    let addedCount = 0, updatedCount = 0;
    for (const highlight of sortedHighlights) {
      const highlightInfo = diffHighlight(highlight, highlightsById[highlight.highlightId]);
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
    
    (options.drawingMode === 'svg' ? svgBackground : this.annotatableContainer).style.display = '';
    this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: {
      addedCount: addedCount, removedCount: knownHighlightIds.length, updatedCount: updatedCount,
      totalCount: Object.keys(highlightsById).length,
      timeToLoad: Date.now() - startTimestamp,
    } }));
  }
  
  // Draw (or redraw) specified highlights, or all highlights on the page
  this.drawHighlights = (highlightIds = Object.keys(highlightsById)) => {
    // Hide container (repeated DOM manipulations is faster if the container is hidden)
    if (highlightIds.length > 1) (options.drawingMode === 'svg' ? svgBackground : this.annotatableContainer).style.display = 'none';
    
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      let range = getCorrectedRangeObj(highlightId);
      const rangeParagraphs = this.annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
      const isReadOnly = (options.drawingMode === 'inserted-spans') || highlightInfo.readOnly;
      const wasDrawnAsReadOnly = this.annotatableContainer.querySelector(`[data-highlight-id="${highlightId}"][data-read-only]`);
      
      // Remove old highlight elements and styles
      if (!wasDrawnAsReadOnly || (wasDrawnAsReadOnly && !isReadOnly)) undrawHighlight(highlightInfo);
      
      if (isReadOnly) {
        // Don't redraw a read-only highlight
        if (wasDrawnAsReadOnly) continue;
        
        // Inject HTML <span> elements
        range.startContainer.splitText(range.startOffset);
        range.endContainer.splitText(range.endOffset);
        const textNodeIter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
        const relevantTextNodes = [];
        while (node = textNodeIter.nextNode()) {
          if (range.intersectsNode(node) && node !== range.startContainer && node.textContent !== '' && !node.parentElement.closest('rt')) relevantTextNodes.push(node);
          if (node === range.endContainer) break;
        }
        for (let tn = 0; tn < relevantTextNodes.length; tn++) {
          const textNode = relevantTextNodes[tn];
          const styledSpan = document.createElement('span');
          styledSpan.dataset.highlightId = highlightId;
          styledSpan.dataset.readOnly = '';
          styledSpan.dataset.color = highlightInfo.color;
          styledSpan.dataset.style = highlightInfo.style;
          if (tn === 0) styledSpan.dataset.start = '';
          if (tn === relevantTextNodes.length - 1) styledSpan.dataset.end = '';
          textNode.before(styledSpan);
          styledSpan.appendChild(textNode);
        }
        rangeParagraphs.forEach(p => { p.normalize(); });
        // Update the highlight's stored range object (because the DOM changed)
        range = getCorrectedRangeObj(highlightId);
      } else {
        // Draw highlights with Custom Highlight API
        if (options.drawingMode === 'highlight-api' && supportsHighlightApi) {
          if (CSS.highlights.has(highlightId)) {
            highlightObj = CSS.highlights.get(highlightId);
            highlightObj.clear();
          } else {
            highlightObj = new Highlight();
            CSS.highlights.set(highlightId, highlightObj);
          }
          highlightObj.add(range);
          let styleTemplate = getStyleTemplate(highlightInfo.style, 'css', null).replaceAll('var(--hh-color)', options.colors[highlightInfo.color]);
          highlightApiStylesheet.insertRule(`${options.containerSelector} ::highlight(${highlightInfo.escapedHighlightId}) { ${styleTemplate} }`);
          highlightApiStylesheet.insertRule(`${options.containerSelector} rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightApiStylesheet.insertRule(`${options.containerSelector} img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          
        // Draw highlights with SVG shapes
        } else if (options.drawingMode === 'svg') {
          const clientRects = getMergedClientRects(range, rangeParagraphs);
          let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.dataset.highlightId = highlightId;
          group.dataset.color = highlightInfo.color;
          group.dataset.style = highlightInfo.style;
          let svgContent = '';
          for (const clientRect of clientRects) {
            svgContent += getStyleTemplate(highlightInfo.style, 'svg', clientRect);
          }
          group.innerHTML = svgContent;
          svgBackground.appendChild(group);
        }
      }
      
      // Update wrapper
      // TODO: Enable wrappers for editable highlights
      if (isReadOnly && !wasDrawnAsReadOnly) {
        if (highlightInfo.wrapper && (options.wrappers[highlightInfo.wrapper]?.start || options.wrappers[highlightInfo.wrapper]?.end)) {
          const addWrapper = (edge, range, htmlString) => {
            htmlString = `<span class="hh-wrapper-${edge}" data-highlight-id="${highlightId}" data-color="${highlightInfo.color}" data-style="${highlightInfo.style}">${htmlString}</span>`
            for (const key of Object.keys(highlightInfo.wrapperVariables)) {
              htmlString = htmlString.replaceAll(`{${key}}`, highlightInfo.wrapperVariables[key]);
            }
            const template = document.createElement('template');
            template.innerHTML = htmlString;
            let htmlElement = template.content.firstChild;
            
            const textNodeIter = document.createNodeIterator(htmlElement, NodeFilter.SHOW_TEXT);
            while (node = textNodeIter.nextNode()) node.parentNode.removeChild(node);
            range.insertNode(htmlElement);
          }
          const startRange = highlightInfo.rangeObj;
          const endRange = document.createRange(); endRange.setStart(highlightInfo.rangeObj.endContainer, highlightInfo.rangeObj.endOffset);
          const wrapperInfo = options.wrappers[highlightInfo.wrapper];
          addWrapper('start', startRange, wrapperInfo.start);
          addWrapper('end', endRange, wrapperInfo.end);
          rangeParagraphs.forEach(p => { p.normalize(); });
        }
      }
    }
    
    // Show container
    (options.drawingMode === 'svg' ? svgBackground : this.annotatableContainer).style.display = '';
  }
  
  // Create a new highlight, or update an existing highlight when it changes
  this.createOrUpdateHighlight = (attributes = {}, triggeredByUserAction = true) => {
    let highlightId = attributes.highlightId ?? activeHighlightId ?? options.highlightIdFunction();
    appearanceChanges = [];
    boundsChanges = [];
    
    let isNewHighlight, oldHighlightInfo;
    if (highlightsById.hasOwnProperty(highlightId)) {
      oldHighlightInfo = highlightsById[highlightId];
    } else {
      isNewHighlight = true;
    }
    
    // If a different highlight is active, deactivate it
    if (activeHighlightId && highlightId !== activeHighlightId) this.deactivateHighlights();
    
    // Warn if color, style, or wrapper attributes are invalid
    if (attributes.color && !options.colors.hasOwnProperty(attributes.color)) {
      console.warn(`Highlight color "${attributes.color}" is not defined in options (highlightId: ${highlightId}).`);
    }
    if (attributes.style && !options.styles.hasOwnProperty(attributes.style)) {
      console.warn(`Highlight style "${attributes.style}" is not defined in options (highlightId: ${highlightId}).`);
    }
    if (attributes.wrapper && !options.wrappers.hasOwnProperty(attributes.wrapper)) {
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
    const selection = window.getSelection();
    if (selection.type === 'Range') adjustedSelectionRange = snapRangeToBoundaries(selection.getRangeAt(0));
    if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) || adjustedSelectionRange) {
      let startNode, startOffset, endNode, endOffset;
      if (attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) {
        startParagraphId = attributes.startParagraphId ?? oldHighlightInfo?.startParagraphId;
        startParagraphOffset = parseInt(attributes.startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset);
        endParagraphId = attributes.endParagraphId ?? oldHighlightInfo?.endParagraphId;
        endParagraphOffset = parseInt(attributes.endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset);
        ([ startNode, startOffset ] = getTextNodeAndOffset(document.getElementById(startParagraphId), startParagraphOffset));
        ([ endNode, endOffset ] = getTextNodeAndOffset(document.getElementById(endParagraphId), endParagraphOffset));
      } else if (adjustedSelectionRange) {
        startNode = adjustedSelectionRange.startContainer;
        startOffset = adjustedSelectionRange.startOffset;
        endNode = adjustedSelectionRange.endContainer;
        endOffset = adjustedSelectionRange.endOffset;
        ([ startParagraphId, startParagraphOffset ] = getParagraphOffset(startNode, startOffset));
        ([ endParagraphId, endParagraphOffset ] = getParagraphOffset(endNode, endOffset));
      }
      
      // Create a new highlight range
      highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      
      // Check which bounds properties changed
      for (const key of ['startParagraphId', 'startParagraphOffset', 'endParagraphId', 'endParagraphOffset']) {
        if (isNewHighlight || eval(key) !== oldHighlightInfo[key]) boundsChanges.push(key);
      }
      
      // Set variables that depend on the range
      const temporaryHtmlElement = document.createElement('div');
      temporaryHtmlElement.appendChild(highlightRange.cloneContents());
      for (const hyperlink of temporaryHtmlElement.querySelectorAll('a')) hyperlink.setAttribute('onclick', 'event.preventDefault();');
      rangeText = highlightRange.toString();
      rangeHtml = temporaryHtmlElement.innerHTML;
      let startParagraphIndex = annotatableParagraphIds.indexOf(startParagraphId);
      let endParagraphIndex = annotatableParagraphIds.indexOf(endParagraphId);
      if (startParagraphIndex === -1) startParagraphIndex = 0;
      if (endParagraphIndex === -1) endParagraphIndex = annotatableParagraphIds.length - 1;
      rangeParagraphIds = annotatableParagraphIds.slice(startParagraphIndex, endParagraphIndex + 1);
    }
    
    // If there are no valid changes, return
    if (!highlightRange || highlightRange.toString() === '' || appearanceChanges.length + boundsChanges.length === 0) return;
    
    // Update saved highlight info
    const newHighlightInfo = {
      highlightId: highlightId,
      color: attributes?.color ?? oldHighlightInfo?.color ?? options.defaultColor,
      style: attributes?.style ?? oldHighlightInfo?.style ?? options.defaultStyle,
      wrapper: attributes?.wrapper ?? oldHighlightInfo?.wrapper ?? options.defaultWrapper,
      wrapperVariables: attributes?.wrapperVariables ?? oldHighlightInfo?.wrapperVariables ?? {},
      readOnly: attributes?.readOnly ?? oldHighlightInfo?.readOnly ?? false,
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
    highlightsById[highlightId] = newHighlightInfo;
    
    const detail = {
      highlight: newHighlightInfo,
      changes: appearanceChanges.concat(boundsChanges),
    }
    
    this.drawHighlights([highlightId]);
    if (highlightId === activeHighlightId && appearanceChanges.length > 0) {
      updateSelectionUi('appearance');
    } else if (triggeredByUserAction && highlightId !== activeHighlightId) {
      this.activateHighlight(highlightId);
    }
    
    if (isNewHighlight) {
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
    } else {
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
    }
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    const highlightToActivate = highlightsById[highlightId];
    if (options.drawingMode === 'inserted-spans' || highlightToActivate.readOnly) {
      // If the highlight is read-only, return events, but don't actually activate it
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: { highlight: highlightToActivate } }));
      return;
    }
    const selection = window.getSelection();
    const highlightRange = highlightToActivate.rangeObj.cloneRange();
    activeHighlightId = highlightId;
    updateSelectionUi('appearance');
    if (selection.type !== 'Range') {
      selection.removeAllRanges();
      selection.addRange(highlightRange);
    }
    this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
  }
  
  // Activate a link by position
  let allowHyperlinkClick = false;
  this.activateHyperlink = (position) => {
    this.deactivateHighlights();
    allowHyperlinkClick = true;
    hyperlinksByPosition[position].hyperlinkElement.click();
    allowHyperlinkClick = false;
  }
  
  // Deactivate any highlights that are currently active/selected
  this.deactivateHighlights = (removeSelectionRanges = true) => {
    const deactivatedHighlight = highlightsById[activeHighlightId];
    activeHighlightId = null;
    updateSelectionUi('appearance');
    previousSelectionRange = null;
    const selection = window.getSelection();
    if (removeSelectionRanges && selection.anchorNode && this.annotatableContainer.contains(selection.anchorNode)) {
      selection.removeAllRanges();
    }
    if (deactivatedHighlight) {
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
        highlight: deactivatedHighlight,
      }}));
    }
  }
  
  // Remove the specified highlights, or all highlights on the page
  this.removeHighlights = (highlightIds = Object.keys(highlightsById)) => {
    this.deactivateHighlights();
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      if (highlightInfo) {
        delete highlightsById[highlightId];
        this.annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
          highlightId: highlightId,
        }}));
        undrawHighlight(highlightInfo);
      }
    }
  }
  
  // Get the active highlight ID (if there is one)
  this.getActiveHighlightId = () => {
    return activeHighlightId;
  }
  
  // Get info for specified highlights, or all highlights on the page
  this.getHighlightInfo = (highlightIds = Object.keys(highlightsById), paragraphId = null) => {
    let filteredHighlights = []
    for (highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      if (!paragraphId || paragraphId === highlightInfo.startParagraphId) {
        filteredHighlights.push(highlightInfo);
      }
    }
    // Sort highlights based on their order on the page
    if (filteredHighlights.length > 0) {
      filteredHighlights.sort((a, b) => {
        return (annotatableParagraphIds.indexOf(a.startParagraphId) - annotatableParagraphIds.indexOf(b.startParagraphId)) || (a.startParagraphOffset - b.startParagraphOffset);
      });
    }
    return filteredHighlights;
  }
  
  // Update one of the initialized options
  this.setOption = (key, value) => {
    const containerSelector = options.containerSelector;
    options[key] = value ?? options[key];
    if (key === 'drawingMode' || key === 'styles') {
      updateAppearanceStylesheet();
      if (supportsHighlightApi) CSS.highlights.clear();
      this.drawHighlights();
    } else if (key === 'colors') {
      updateAppearanceStylesheet();
    } else if (key === 'containerSelector' || key === 'paragraphSelector') {
      initializeHighlighter(containerSelector);
    }
  }
  
  // Get all of the initialized options
  this.getOptions = () => {
    return options;
  }
  
  // Remove this Highlighter instance and its highlights
  this.removeHighlighter = () => {
    generalStylesheet.replaceSync('');
    appearanceStylesheet.replaceSync('');
    highlightApiStylesheet.replaceSync('');
    selectionStylesheet.replaceSync('');
    
    this.loadHighlights([]);
    this.annotatableContainer.querySelectorAll('.hh-svg-background, .hh-selection-handle').forEach(el => el.remove())
    controller.abort();
    
    this.annotatableContainer.highlighter = undefined;
    hhHighlighters = hhHighlighters.filter(hhHighlighter => hhHighlighter.annotatableContainer !== this.annotatableContainer);
    delete hhHighlighters[options.containerSelector];
  }
    
  
  // -------- EVENT LISTENERS --------
  
  // Selection change in document (new selection, change in selection range, or selection collapsing to a caret)
  document.addEventListener('selectionchange', (event) => respondToSelectionChange(event), { signal: controller.signal });
  const respondToSelectionChange = (event) => {
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    const selectionRange = selection.type === 'None' ? null : selection.getRangeAt(0);
    
    // Deactivate highlights when tapping or creating a selection outside of the previous selection range
    if (!activeSelectionHandle && selectionRange && previousSelectionRange && (selection.type === 'Caret' || previousSelectionRange.comparePoint(selectionRange.startContainer, selectionRange.startOffset) === 1 || previousSelectionRange.comparePoint(selectionRange.endContainer, selectionRange.endOffset) === -1)) {
      this.deactivateHighlights(false);
    }
    
    if (selection.type === 'Range') {
      // Clear tap result (prevents hh:tap event from being sent when long-pressing or dragging to select text)
      tapResult = null;
      
      if (this.annotatableContainer.contains(selection.anchorNode)) {
        if (activeHighlightId || (options.pointerMode === 'live' || (options.pointerMode === 'auto' && isStylus === true))) {
          this.createOrUpdateHighlight({ highlightId: activeHighlightId, });
        }
        previousSelectionRange = selectionRange.cloneRange();
      }
    }
    
    updateSelectionUi('bounds');
  }
  
  // Pointer down in annotatable container
  this.annotatableContainer.addEventListener('pointerdown', (event) => respondToPointerDown(event), { signal: controller.signal });
  const respondToPointerDown = (event) => {
    isStylus = event.pointerType === 'pen';
    
    // User is dragging a selection handle
    if (event.target && event.target.parentElement.classList.contains('hh-selection-handle')) {
      event.preventDefault();
      activeSelectionHandle = event.target.parentElement;
      this.annotatableContainer.addEventListener('pointermove', respondToSelectionHandleDrag, { signal: controller.signal });
    }
    
    // Return if it's not a regular click, or if the user is tapping away from an existing selection
    if (previousSelectionRange || activeSelectionHandle || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    
    // Trigger a long-press event if the user doesn't lift their finger within the specified time
    if (options.longPressTimeout) longPressTimeoutId = setTimeout(() => respondToLongPress(event), options.longPressTimeout);
    
    const tapRange = getRangeFromTapEvent(event);
    tapResult = checkForTapTargets(tapRange);
  }
  
  // Selection handle drag (this function is added as an event listener on pointerdown, and removed on pointerup)
  const respondToSelectionHandleDrag = (event) => {
    const selection = window.getSelection();
    const selectionRange = selection.getRangeAt(0);
    
    const dragRange = getRangeFromTapEvent(event);
    // TODO: While dragging, the selection startContainer or endContainer frequently gets set to the parent element. This causes the selection to flicker while dragging. The line below is a workaround, but it would be nice to figure out the root cause.
    if (dragRange.startContainer.nodeType !== Node.TEXT_NODE || dragRange.endContainer.nodeType !== Node.TEXT_NODE) return;
    
    const dragPositionRelativeToSelectionStart = dragRange.compareBoundaryPoints(Range.START_TO_START, selectionRange);
    const dragPositionRelativeToSelectionEnd = dragRange.compareBoundaryPoints(Range.END_TO_END, selectionRange);
    
    // TODO: Don't allow Caret (0-width) selections while dragging selection handles
    if (activeSelectionHandle.dataset.position === 'left' && dragPositionRelativeToSelectionEnd === 1 || activeSelectionHandle.dataset.position === 'right' && dragPositionRelativeToSelectionStart === -1) {
      for (const selectionHandle of selectionHandles) {
        selectionHandle.dataset.position = selectionHandle.dataset.position === 'left' ? 'right' : 'left';
      }
      // TODO: Switch selection direction and don't deactivate the highlight
      this.deactivateHighlights();
      activeSelectionHandle = null;
      this.annotatableContainer.removeEventListener('pointermove', respondToSelectionHandleDrag);
    } else if (activeSelectionHandle.dataset.position === 'left' && dragPositionRelativeToSelectionStart !== 0) {
      // Left selection handle is before or after the selection start
      selectionRange.setStart(dragRange.startContainer, dragRange.startOffset);
    } else if (activeSelectionHandle.dataset.position === 'right' && dragPositionRelativeToSelectionEnd !== 0) {
      // Right selection handle is before or after the selection end
      selectionRange.setEnd(dragRange.endContainer, dragRange.endOffset);
    }
  }
  
  // Long press in annotatable container (triggered by setTimeout() in pointerdown event)
  const respondToLongPress = (event) => {
    respondToPointerUp(event, isLongPress = true);
    tapResult = null;
  }
  
  // Pointer up in annotatable container
  this.annotatableContainer.addEventListener('pointerup', (event) => respondToPointerUp(event), { signal: controller.signal });
  const respondToPointerUp = (event, isLongPress = false) => {
    if (tapResult) {
      tapResult.pointerEvent = event;
      tapResult.isLongPress = isLongPress;
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:tap', { detail: tapResult, }));
      if (options.autoTapToActivate && tapResult?.targetFound) {
        if (tapResult.highlights.length === 1 && tapResult.hyperlinks.length === 0 && !isLongPress) {
          return this.activateHighlight(tapResult.highlights[0].highlightId);
        } else if (tapResult.highlights.length === 0 && tapResult.hyperlinks.length === 1 && !isLongPress) {
          return this.activateHyperlink(tapResult.hyperlinks[0].position);
        } else if (tapResult.highlights.length + tapResult.hyperlinks.length > 1) {
          return this.annotatableContainer.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: tapResult, }));
        }
      }
    }
  }
  
  // Pointer up or cancel in window
  window.addEventListener('pointerup', (event) => respondToWindowPointerUp(event), { signal: controller.signal });
  window.addEventListener('pointercancel', (event) => respondToWindowPointerUp(event), { signal: controller.signal });
  const respondToWindowPointerUp = (event) => {
    const selection = window.getSelection();
    if (selection.type === 'Range' && this.annotatableContainer.contains(selection.anchorNode)) {
      const adjustedSelectionRange = snapRangeToBoundaries(selection.getRangeAt(0), selection.anchorNode);
      selection.removeAllRanges();
      selection.addRange(adjustedSelectionRange);
    }
    tapResult = null;
    clearTimeout(longPressTimeoutId);
    if (activeSelectionHandle) {
      activeSelectionHandle = null;
      this.annotatableContainer.removeEventListener('pointermove', respondToSelectionHandleDrag);
    }
  }
  
  // Hyperlink click (for each hyperlink in annotatable container)
  for (const hyperlinkElement of hyperlinkElements) {
    hyperlinkElement.addEventListener('click', (event) => {
      this.deactivateHighlights();
      if (!allowHyperlinkClick) event.preventDefault();
    }, { signal: controller.signal });
  }
  
  // Window resize
  let previousWindowWidth = window.innerWidth;
  const respondToWindowResize = () => {
    // Only respond if the width changed (ignore height changes)
    if (window.innerWidth === previousWindowWidth) return;
    if (options.drawingMode === 'svg') {
      this.drawHighlights();
      if (previousSelectionRange) updateSelectionUi('bounds');
    }
    previousWindowWidth = window.innerWidth;
  }
  const debouncedRespondToWindowResize = debounce(() => respondToWindowResize(), Math.floor(Object.keys(highlightsById).length / 20));
  window.addEventListener('resize', debouncedRespondToWindowResize, { signal: controller.signal });
  
  
  // -------- UTILITY FUNCTIONS --------
  
  // Check if the tap is in the range of an existing highlight or link
  const checkForTapTargets = (tapRange) => {
    if (!tapRange) return;
    
    // Check for tapped highlights and hyperlinks
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlightRange = highlightInfo.rangeObj;
      if (highlightRange.comparePoint(tapRange.startContainer, tapRange.startOffset) === 0) {
        tappedHighlights.push(highlightInfo);
      }
    }
    const tappedHyperlinks = [];
    for (const hyperlinkPosition of Object.keys(hyperlinksByPosition)) {
      const hyperlinkInfo = hyperlinksByPosition[hyperlinkPosition];
      const hyperlinkRange = document.createRange()
      hyperlinkRange.selectNodeContents(hyperlinkInfo.hyperlinkElement);
      if (hyperlinkRange.comparePoint(tapRange.startContainer, tapRange.startOffset) === 0) {
        tappedHyperlinks.push(hyperlinkInfo);
      }
    }
    
    // Sort highlights (hyperlinks should already be sorted)
    const tappedHyperlinkIds = [];
    for (const highlightInfo of tappedHighlights) tappedHyperlinkIds.push(highlightInfo.highlightId);
    const sortedTappedHighlights = this.getHighlightInfo(tappedHyperlinkIds);
    
    return {
      'targetFound': sortedTappedHighlights.length > 0 || tappedHyperlinks.length > 0,
      'tapRange': tapRange,
      'highlights': sortedTappedHighlights,
      'hyperlinks': tappedHyperlinks,
    }
  }
  
  // Compare new highlight information to old highlight information, returning an object with the properties that changed
  const diffHighlight = (newHighlightInfo, oldHighlightInfo) => {
    if (!oldHighlightInfo) return newHighlightInfo;
    const changedHighlightInfo = {}
    for (const key of Object.keys(newHighlightInfo)) {
      if (oldHighlightInfo.hasOwnProperty(key) && oldHighlightInfo[key] !== newHighlightInfo[key]) {
        changedHighlightInfo[key] = newHighlightInfo[key];
      }
    }
    return changedHighlightInfo;
  }
  
  // Undraw the specified highlight
  const undrawHighlight = (highlightInfo) => {
    const highlightId = highlightInfo.highlightId;
    
    // Remove HTML and SVG elements
    if (document.querySelector('[data-highlight-id]')) {
      this.annotatableContainer.querySelectorAll(`[data-highlight-id="${highlightId}"]`).forEach(element => {
        if (element.hasAttribute('data-read-only')) {
          element.outerHTML = element.innerHTML;
        } else {
          element.remove();
        }
      });
      const rangeParagraphs = this.annotatableContainer.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
      rangeParagraphs.forEach(p => { p.normalize(); });
      getCorrectedRangeObj(highlightId);
    }
    
    // Remove Highlight API highlights
    if (supportsHighlightApi && CSS.highlights.has(highlightId)) {
      const ruleIndexesToDelete = [];
      for (let r = 0; r < highlightApiStylesheet.cssRules.length; r++) {
        if (highlightApiStylesheet.cssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`)) ruleIndexesToDelete.push(r);
      }
      for (const index of ruleIndexesToDelete.reverse()) highlightApiStylesheet.deleteRule(index);
      CSS.highlights.delete(highlightId);
    }
  }
  
  // Update selection background and handles
  const updateSelectionUi = (changeType = 'appearance') => {
    const selection = window.getSelection();
    const selectionRange = selection.type === 'None' ? null : selection.getRangeAt(0);
    if (selection.anchorNode && !this.annotatableContainer.contains(selection.anchorNode)) return;
    
    const color = highlightsById[activeHighlightId]?.color;
    const colorString = options.colors[color] ?? 'AccentColor';
    const style = highlightsById[activeHighlightId]?.style;
    
    // Update SVG shapes for the active highlight (bring shape group to front, and duplicate it to make the highlight darker)
    svgActiveOverlay.innerHTML = '';
    if (activeHighlightId && options.drawingMode === 'svg') {
      const svgHighlight = svgBackground.querySelector(`g[data-highlight-id="${activeHighlightId}"]`);
      svgActiveOverlay.dataset.color = color;
      svgActiveOverlay.dataset.style = style;
      svgActiveOverlay.innerHTML = svgHighlight.innerHTML;
      svgBackground.appendChild(svgHighlight);
      svgBackground.appendChild(svgActiveOverlay);
    }
    
    if (changeType === 'appearance') {
      this.annotatableContainer.style = `--hh-color: ${colorString}`;
      
      // Update selection background
      if (activeHighlightId && options.drawingMode === 'svg') {
        selectionStylesheet.replaceSync(`${options.containerSelector} ::selection { background-color: transparent; }`);
      } else if (activeHighlightId) {
        const styleTemplate = getStyleTemplate(style, 'css', null);
        selectionStylesheet.replaceSync(`
          ${options.containerSelector} ::selection { ${styleTemplate} }
          ${options.containerSelector} rt::selection, ${options.containerSelector} img::selection { background-color: transparent; }
        `);
      } else {
        selectionStylesheet.replaceSync(`
          ${options.containerSelector} ::selection { background-color: Highlight; color: HighlightText; }
          ${options.containerSelector} rt::selection, ${options.containerSelector} img::selection { background-color: transparent; }
        `);
      }
      
      // Update selection handles
      if (options.showSelectionHandles) {
        selectionHandles[0].children[1].innerHTML = (options.selectionHandles.left ?? '');
        selectionHandles[1].children[1].innerHTML = (options.selectionHandles.right ?? '');
      }
      
      // Send event
      this.annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: { color: color, style: style, }}));
      
    } else if (changeType === 'bounds') {
      // Update selection handle location and visibility
      if (selection.type === 'Range' && options.showSelectionHandles) {
        const selectionRangeRects = selectionRange.getClientRects();
        const startRect = selectionRangeRects[0];
        const endRect = selectionRangeRects[selectionRangeRects.length-1];
        const annotatableContainerClientRect = this.annotatableContainer.getBoundingClientRect();
        selectionHandles[0].dataset.position = 'left';
        selectionHandles[0].style.display = 'block';
        selectionHandles[0].style.height = startRect.height + 'px';
        selectionHandles[0].style.left = startRect.left - annotatableContainerClientRect.left + 'px';
        selectionHandles[0].style.top = startRect.top - annotatableContainerClientRect.top + 'px';
        selectionHandles[1].dataset.position = 'right';
        selectionHandles[1].style.display = 'block';
        selectionHandles[1].style.height = endRect.height + 'px';
        selectionHandles[1].style.left = endRect.right - annotatableContainerClientRect.left + 'px';
        selectionHandles[1].style.top = endRect.top - annotatableContainerClientRect.top + 'px';
      } else {
        selectionHandles[0].style.display = 'none';
        selectionHandles[1].style.display = 'none';
      }
    }
  }
  
  // Update the selection or highlight range to stay within the annotatable container
  const snapRangeToBoundaries = (range, anchorNode = null) => {
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    
    // Prevent the range from going outside of the annotatable container
    if (!this.annotatableContainer.contains(range.commonAncestorContainer)) {
      if (anchorNode && !this.annotatableContainer.contains(anchorNode)) {
        // Range is from a selection, and the selection anchor is outside of the container
        window.getSelection().collapseToStart();
        return window.getSelection().getRangeAt(0).cloneRange();
      } else if (anchorNode === startNode || this.annotatableContainer.contains(startNode)) {
        // Range starts in the container but ends outside
        const lastParagraphTextNodeWalker = document.createTreeWalker(this.annotatableParagraphs[this.annotatableParagraphs.length - 1], NodeFilter.SHOW_TEXT);
        let nextNode;
        while (nextNode = lastParagraphTextNodeWalker.nextNode());
        endNode = lastParagraphTextNodeWalker.previousNode();
        endOffset = endNode.length;
      } else if (anchorNode === endNode || this.annotatableContainer.contains(endNode)) {
        // Range starts outside of the container but ends inside
        const firstParagraphTextNodeWalker = document.createTreeWalker(this.annotatableParagraphs[0], NodeFilter.SHOW_TEXT);
        startNode = firstParagraphTextNodeWalker.nextNode();
        startOffset = 0;
      }
    }
    
    // Snap to the nearest word
    if (options.snapToWord) {
      // If the range starts at the end of a text node, move it to start at the beginning of the following text node. This prevents the range from jumping across the text node boundary and selecting an extra word.
      if (startOffset === startNode.textContent.length) {
        let parentElement = range.commonAncestorContainer;
        let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
        let nextTextNode = walker.nextNode();
        while (nextTextNode !== startNode) nextTextNode = walker.nextNode();
        nextTextNode = walker.nextNode();
        if (nextTextNode) {
          startNode = nextTextNode;
          startOffset = 0;
        }
      }
      
      // Trim whitespace and dashes at range start and end
      while (/\s|\p{Pd}/u.test(startOffset < startNode.textContent.length && startNode.textContent[startOffset])) startOffset += 1;
      while (endOffset - 1 >= 0 && /\s|\p{Pd}/u.test(endNode.textContent[endOffset - 1])) endOffset -= 1;
      
      // Expand range to word boundaries
      while (startOffset > 0 && /[^\s|\p{Pd}]/u.test(startNode.textContent[startOffset - 1])) startOffset -= 1;
      while (endOffset + 1 <= endNode.textContent.length && /[^\s|\p{Pd}]/u.test(endNode.textContent[endOffset])) endOffset += 1;
    }
    
    let newRange = document.createRange();
    newRange.setStart(startNode, startOffset);
    newRange.setEnd(endNode, endOffset);
    return newRange;
  }
  
  // Get the character offset relative to the annotatable paragraph
  // Adapted from https://stackoverflow.com/a/4812022/1349044
  const getParagraphOffset = (referenceTextNode, referenceTextNodeOffset) => {
    const paragraph = referenceTextNode.parentElement.closest(options.paragraphSelector);
    const referenceRange = document.createRange();
    referenceRange.selectNodeContents(paragraph);
    referenceRange.setEnd(referenceTextNode, referenceTextNodeOffset);
    const paragraphOffset = referenceRange.toString().length;
    return [ paragraph.id, paragraphOffset ];
  }
  
  // Get the character offset relative to the deepest relevant text node
  const getTextNodeAndOffset = (parentElement, targetOffset) => {
    let textNode, firstTextNode, currentOffset = 0;
    const walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
    while (textNode = walker.nextNode()) {
      if (!firstTextNode) firstTextNode = walker.currentNode;
      currentOffset += textNode.textContent.length;
      if (currentOffset >= targetOffset) {
        const relativeOffset = textNode.textContent.length - currentOffset + targetOffset
        return [ textNode, relativeOffset ];
      }
    }
    // TODO: Direction isn't always accurate (maybe it resets when selection is cleared and set to a new range programmatically?)
    const direction = window.getSelection().direction;
    if (direction == 'backward') {
      return [ firstTextNode, 0 ];
    } else {
      const lastTextNode = walker.previousNode();
      return [ lastTextNode, lastTextNode.textContent.length ];
    }
  }
  
  // Update appearance stylesheet (user-defined colors and styles)
  const updateAppearanceStylesheet = () => {
    appearanceStylesheet.replaceSync('');
    for (const color of Object.keys(options.colors)) {
      appearanceStylesheet.insertRule(`[data-color="${color}"] { --hh-color: ${options.colors[color]}; }`);
    }
    for (const style of Object.keys(options.styles)) {
      const styleTemplate = getStyleTemplate(style, 'css', null);
      appearanceStylesheet.insertRule(`span[data-highlight-id][data-style="${style}"] { ${styleTemplate} }`);
    }
  }
  
  // Get style template for a given highlight style
  const getStyleTemplate = (style, type, clientRect) => {
    style = options.styles.hasOwnProperty(style) ? style : options.defaultStyle;
    let styleTemplate = options.styles[style]?.[type] ?? '';
    if (!styleTemplate) {
      console.warn(`Highlight style "${style}" in options does not have a defined "${type}" value.`);
      return;
    }
    if (type === 'svg' && clientRect) {
      const annotatableContainerClientRect = this.annotatableContainer.getBoundingClientRect();
      styleTemplate = styleTemplate
        .replaceAll('{x}', clientRect.x - annotatableContainerClientRect.x)
        .replaceAll('{y}', clientRect.y - annotatableContainerClientRect.y)
        .replaceAll('{width}', clientRect.width)
        .replaceAll('{height}', clientRect.height)
        .replaceAll('{top}', clientRect.top - annotatableContainerClientRect.top)
        .replaceAll('{right}', clientRect.right - annotatableContainerClientRect.right)
        .replaceAll('{bottom}', clientRect.bottom - annotatableContainerClientRect.bottom)
        .replaceAll('{left}', clientRect.left - annotatableContainerClientRect.left);
    }
    return styleTemplate;
  }
  
  // Restore the previous selection range in case the browser clears the selection
  const getRestoredSelectionOrCaret = (selection, pointerEvent = null) => {
    if (selection.type === 'None') {
      if (previousSelectionRange) {
        // iOS Safari deselects text when a button is tapped. This restores the selection.
        selection.addRange(previousSelectionRange);
      } else if (pointerEvent) {
        // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type === "Caret"). iOS Safari instead clears the selection (selection.type === "None"). This restores a Caret selection if the selection type is None.
        let range = getRangeFromTapEvent(pointerEvent);
        selection.addRange(range);
      }
    }
    return selection;
  }
  
  // Fix highlight range if the DOM changed and made the previous highlight range invalid
  const getCorrectedRangeObj = (highlightId) => {
    const highlightInfo = highlightsById[highlightId];
    const highlightRange = highlightInfo?.rangeObj;
    if (highlightRange && (
      highlightRange.startContainer.nodeType !== Node.TEXT_NODE || highlightRange.endContainer.nodeType !== Node.TEXT_NODE ||
      highlightRange.startOffset > highlightRange.startContainer.textContent.length - 1 ||
      highlightRange.endOffset > highlightRange.endContainer.textContent.length
    )) {
      const [ startNode, startOffset ] = getTextNodeAndOffset(document.getElementById(highlightInfo.startParagraphId), highlightInfo.startParagraphOffset);
      const [ endNode, endOffset ] = getTextNodeAndOffset(document.getElementById(highlightInfo.endParagraphId), highlightInfo.endParagraphOffset);
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
    }
    return highlightRange;
  }
  
  // Convert tap or click to a selection range
  // Adapted from https://stackoverflow.com/a/12924488/1349044
  const getRangeFromTapEvent = (event) => {
    let range;
    if (document.caretPositionFromPoint) {
      // Most browsers
      let caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY);
      range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
    } else if (document.caretRangeFromPoint) {
      // Safari
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }
    return range;
  }
  
  // Get merged client rects from the highlight range
  const getMergedClientRects = (range, paragraphs) => {
    const unmergedRects = Array.from(range.getClientRects());
    const mergedRects = [];
    
    // Loop through the highlight's paragraphs
    for (const paragraph of paragraphs) {
      const paragraphRect = paragraph.getBoundingClientRect();
      const computedParagraphStyle = window.getComputedStyle(paragraph);
      const paragraphLineHeight = parseInt((computedParagraphStyle.lineHeight === 'normal' ? computedParagraphStyle.fontSize : computedParagraphStyle.lineHeight).replace('px', ''));
      const paragraphTopPadding = parseInt(computedParagraphStyle.getPropertyValue('padding-top').replace('px', ''));
      
      // Get line positions (bottom edge of each line)
      let linePositions = new Set();
      let lineWalker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      while (textNode = lineWalker.nextNode()) {
        const computedStyle = window.getComputedStyle(textNode.parentElement);
        const lineHeight = parseInt((computedStyle.lineHeight === 'normal' ? computedStyle.fontSize : computedStyle.lineHeight).replace('px', ''));
        if (lineHeight >= paragraphLineHeight) {
          const referenceRange = document.createRange();
          referenceRange.selectNode(textNode);
          for (const rangeRect of referenceRange.getClientRects()) linePositions.add(rangeRect.bottom);
        }
      }
      linePositions = Array.from(linePositions);
      
      // Create a merged rect for each line
      for (let ln = 0; ln < linePositions.length; ln++) {
        const linePosition = linePositions[ln];
        const previousLinePosition = ln === 0 ? paragraphRect.top + paragraphTopPadding : linePositions[ln-1];
        const mergedRect = new DOMRect(paragraphRect.right, previousLinePosition, 0, linePosition - previousLinePosition);
        if (mergedRects.length > 0 && ln === 1 && mergedRects[mergedRects.length-1].height < mergedRect.height) {
          // Increase the row height for the first line in the paragraph to match the second line
          mergedRects[mergedRects.length-1].y += mergedRects[mergedRects.length-1].height - mergedRect.height;
          mergedRects[mergedRects.length-1].height = mergedRect.height;
        }
        for (let r = 0; r < unmergedRects.length; r++) {
          const rect = unmergedRects[r];
          const rectVerticalPosition = rect.y + (rect.height / 2);
          if (Math.round(paragraphRect.width) === Math.round(rect.width) && Math.round(paragraphRect.height) === Math.round(rect.height) && Math.round(paragraphRect.top) === Math.round(rect.top) && Math.round(paragraphRect.left) === Math.round(rect.left)) {
            // Remove rects that are the same size as the paragraph rect (the highlight range gives us these unneeded rects for "middle" paragraphs between the start and end paragraph)
            unmergedRects.splice(r, 1);
            r--;
          } else if (rectVerticalPosition > mergedRect.y && rectVerticalPosition < mergedRect.y + mergedRect.height) {
            // Process then remove rects that apply to the current line
            mergedRect.x = Math.min(mergedRect.x, rect.x);
            mergedRect.width = Math.max(mergedRect.right, rect.right) - mergedRect.x;
            unmergedRects.splice(r, 1); r--;
          }
        }
        if (mergedRect.width > 0) mergedRects.push(mergedRect);
      }
    }
    
    return mergedRects;
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
  
  updateAppearanceStylesheet();
  updateSelectionUi('appearance');
}


// -------- DEFAULTS --------

// Keep track of all Highlighter instances
let hhHighlighters = [];

// Check browser type
const isTouchDevice = navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
const isSafari = /^((?!Chrome|Firefox|Android|Samsung).)*AppleWebKit/i.test(navigator.userAgent);
const supportsHighlightApi = CSS.highlights;

// Workaround to allow programmatic text selection on tap in iOS Safari
// See https://stackoverflow.com/a/79261423/1349044
if (isTouchDevice && isSafari) {
  const tempInput = document.createElement('input');
  tempInput.style.position = 'fixed';
  tempInput.style.top = 0;
  tempInput.style.opacity = 0;
  tempInput.style.height = 0;
  tempInput.style.fontSize = '16px'; // Prevent page zoom on input focus
  tempInput.inputMode = 'none'; // Don't show keyboard
  tempInput.tabIndex = -1; // Prevent user from tabbing to input
  const initializeSelection = (event) => {
    if (document.readyState !== 'complete') return setTimeout(initializeSelection, 10);
    document.body.append(tempInput);
    tempInput.focus();
    setTimeout(() => {
      tempInput.remove();
    }, 100);
  }
  initializeSelection();
  document.addEventListener('visibilitychange', (event) => {
    if (document.visibilityState === 'visible') initializeSelection();
  });
}

// Default function for generating a highlight ID
const hhGetNewHighlightId = () => {
  return 'hh-' + Date.now().toString();
}

// Default options
let hhDefaultOptions = {
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
    },
    'single-underline': {
      'css': 'text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />',
    },
    'double-underline': {
      'css': 'text-decoration: underline; text-decoration-color: var(--hh-color); text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 0.9));" /><rect x="{x}" y="{y}" style="fill: var(--hh-color); width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 1.05));" />',
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
  showSelectionHandles: false,
  rememberStyle: true,
  snapToWord: false,
  autoTapToActivate: true,
  longPressTimeout: 500,
  pointerMode: 'auto',
  drawingMode: 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: hhGetNewHighlightId,
}

console.info('Highlighter loaded');
