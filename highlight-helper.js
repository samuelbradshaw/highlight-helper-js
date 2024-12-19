/**
 * Highlight Helper
 * https://github.com/samuelbradshaw/highlight-helper-js
 */

function Highlighter(options = hhDefaultOptions) {
  for (const key of Object.keys(hhDefaultOptions)) {
    options[key] = options[key] ?? hhDefaultOptions[key];
  }
  const annotatableContainer = document.querySelector(options.containerSelector);
  const annotatableParagraphs = document.querySelectorAll(options.paragraphSelector);
  const annotatableParagraphIds = Array.from(annotatableParagraphs, paragraph => paragraph.id);
  
  // Setting tabIndex -1 on <body> allows focus to be set programmatically (needed to initialize text selection in iOS Safari). It also prevents "tap to search" from interfering with text selection in Android Chrome.
  document.body.tabIndex = -1;
  
  // Set up stylesheets
  const generalStylesheet = new CSSStyleSheet();
  const highlightsStylesheet = new CSSStyleSheet();
  const selectionStylesheet = new CSSStyleSheet();
  document.adoptedStyleSheets.push(generalStylesheet);
  document.adoptedStyleSheets.push(highlightsStylesheet);
  document.adoptedStyleSheets.push(selectionStylesheet);
  generalStylesheet.replaceSync(`
    body {
      -webkit-user-select: none;
      user-select: none;
    }
    ${options.containerSelector} {
      position: relative;
      -webkit-user-select: text;
      user-select: text;
    }
    ${options.containerSelector} rt,
    ${options.containerSelector} img,
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
      background-color: var(--color);
      outline: 1px solid white;
      top: 0;
    }
    .hh-selection-handle[data-position="left"] .hh-default-handle {
      right: 0;
      border-radius: 10px 0 10px 10px;
    }
    .hh-selection-handle[data-position="right"] .hh-default-handle {
      left: 0;
      border-radius: 0 10px 10px 10px;
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
  `);
  
  // Set up SVG background and selection handles
  const svgBackground = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgBackground.classList.add('hh-svg-background');
  annotatableContainer.appendChild(svgBackground);
  annotatableContainer.insertAdjacentHTML('beforeend', `
    <div class="hh-selection-handle" data-position="left"><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
    <div class="hh-selection-handle" data-position="right"><div draggable="true"></div><div class="hh-selection-handle-content"></div></div>
  `);
  const selectionHandles = document.getElementsByClassName('hh-selection-handle');
    
  // Check for hyperlinks on the page
  const hyperlinkElements = annotatableContainer.getElementsByTagName('a');
  const hyperlinksByPosition = {}
  for (let hyp = 0; hyp < hyperlinkElements.length; hyp++) {
    hyperlinksByPosition[hyp] = {
      'position': hyp,
      'text': hyperlinkElements[hyp].innerHTML,
      'url': hyperlinkElements[hyp].href,
      'hyperlinkElement': hyperlinkElements[hyp],
    }
  }
  
  const highlightsById = {};
  let activeHighlightId = null;
  let previousSelectionRange = null;
  let isStylus = false;
  let activeSelectionHandle = null;
  
  
  // -------- PUBLIC METHODS --------
  
  // Load highlights
  this.loadHighlights = (highlights) => {
    // Don't load highlights in SVG mode until the document is ready (otherwise, highlights may be offset)
    if (options.drawingMode == 'svg' && document.readyState !== 'complete') return setTimeout(this.loadHighlights, 10, highlights);
    
    // Load read-only highlights first (read-only highlights change the DOM, affecting other highlights' ranges)
    const sortedHighlights = highlights.sort((a,b) => a.readOnly == b.readOnly ? 0 : a.readOnly ? -1 : 1);
    
    const knownHighlightIds = Object.keys(highlightsById);
    let addedCount = 0; let updatedCount = 0;
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
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: { addedCount: addedCount, removedCount: knownHighlightIds.length, updatedCount: updatedCount, totalCount: Object.keys(highlightsById).length } }));
  }
  
  // Draw (or redraw) specified highlights, or all highlights on the page
  this.drawHighlights = (highlightIds = Object.keys(highlightsById)) => {
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      const range = getRestoredHighlightRange(highlightInfo);
      const rangeParagraphs = document.querySelectorAll(`#${highlightInfo.rangeParagraphIds.join(', #')}`);
      const wasDrawnAsReadOnly = document.querySelector(`.hh-read-only[data-highlight-id="${highlightId}"]`);
      
      // Remove old highlight elements and styles
      if (!wasDrawnAsReadOnly || (wasDrawnAsReadOnly && !highlightInfo.readOnly)) undrawHighlight(highlightInfo);
      
      if (highlightInfo.readOnly) {
        let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
        highlightsStylesheet.insertRule(`.hh-read-only[data-highlight-id="${highlightId}"] { ${styleTemplate} }`);
        
        // Don't redraw a read-only highlight
        if (wasDrawnAsReadOnly) continue;
        
        // Inject HTML <span> elements
        range.startContainer.splitText(range.startOffset);
        range.endContainer.splitText(range.endOffset);
        const textNodeIter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
        const relevantTextNodes = [];
        while (node = textNodeIter.nextNode()) {
          if (range.intersectsNode(node) && node !== range.startContainer && node.textContent != '') relevantTextNodes.push(node);
          if (node === range.endContainer) break;
        }
        for (const textNode of relevantTextNodes) {
          const styledSpan = document.createElement('span');
          styledSpan.classList.add('hh-read-only');
          styledSpan.dataset.highlightId = highlightId;
          textNode.before(styledSpan);
          styledSpan.appendChild(textNode);
        }
        rangeParagraphs.forEach(p => { p.normalize(); });
      } else {        
        // Draw highlights with Custom Highlight API
        if (options.drawingMode == 'highlight-api') {
          if (CSS.highlights.has(highlightId)) {
            highlightObj = CSS.highlights.get(highlightId);
            highlightObj.clear();
          } else {
            highlightObj = new Highlight();
            CSS.highlights.set(highlightId, highlightObj);
          }
          highlightObj.add(range);
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
          highlightsStylesheet.insertRule(`::highlight(${highlightInfo.escapedHighlightId}) { ${styleTemplate} }`);
          highlightsStylesheet.insertRule(`rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
        
        // Draw highlights with SVG shapes
        } else if (options.drawingMode == 'svg') {
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'svg');
          const svgBackgroundClientRect = svgBackground.getBoundingClientRect();
          const mergedClientRects = getMergedClientRects(range, rangeParagraphs);
          let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.dataset.highlightId = highlightId;
          svgContent = '';
          for (const clientRect of mergedClientRects) {
            svgContent += styleTemplate
            .replaceAll('{x}', clientRect.x - svgBackgroundClientRect.x)
            .replaceAll('{y}', clientRect.y - svgBackgroundClientRect.y)
            .replaceAll('{width}', clientRect.width)
            .replaceAll('{height}', clientRect.height)
            .replaceAll('{top}', clientRect.top - svgBackgroundClientRect.top)
            .replaceAll('{right}', clientRect.right - svgBackgroundClientRect.right)
            .replaceAll('{bottom}', clientRect.bottom - svgBackgroundClientRect.bottom)
            .replaceAll('{left}', clientRect.left - svgBackgroundClientRect.left);
          }
          group.innerHTML = svgContent;
          svgBackground.appendChild(group);
        }
      }
      
      // Update wrapper
      // TODO: Enable wrappers for editable highlights
      if (highlightInfo.readOnly && !wasDrawnAsReadOnly) {
        if (highlightInfo.wrapper && (options.wrappers[highlightInfo.wrapper]?.start || options.wrappers[highlightInfo.wrapper]?.end)) {
          function addWrapper(edge, range, htmlString) {
            htmlString = `<span class="hh-wrapper-${edge}" data-highlight-id="${highlightId}">${htmlString}</span>`
            htmlString = htmlString.replaceAll('{color}', options.colors[highlightInfo.color]);
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
    if (activeHighlightId && highlightId != activeHighlightId) this.deactivateHighlights();
    
    // Update defaults
    if (options.rememberStyle && triggeredByUserAction) {
      if (attributes.color) options.defaultColor = attributes.color;
      if (attributes.style) options.defaultStyle = attributes.style;
      if (attributes.wrapper) options.defaultWrapper = attributes.wrapper;
    }
    
    // Check which appearance properties changed
    for (const key of ['color', 'style', 'wrapper', 'wrapperVariables', 'readOnly']) {
      if (isNewHighlight || (attributes[key] != null && attributes[key] != oldHighlightInfo[key])) appearanceChanges.push(key);
    }
    
    // If the highlight was and still is read-only, return
    if (oldHighlightInfo?.readOnly && (attributes.readOnly == null || attributes.readOnly === true)) return this.deactivateHighlights();
    
    // Calculate the bounds of the highlight range, if it's changed
    let selectionRange, highlightRange;
    let rangeText, rangeHtml, rangeParagraphIds;
    let startParagraphId, startParagraphOffset, endParagraphId, endParagraphOffset;
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    if (selection.type == 'Range') selectionRange = selection.getRangeAt(0);
    if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) || selectionRange) {
      let startNode, startOffset, endNode, endOffset;
      if (attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) {
        startParagraphId = attributes.startParagraphId ?? oldHighlightInfo?.startParagraphId;
        startParagraphOffset = parseInt(attributes.startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset);
        endParagraphId = attributes.endParagraphId ?? oldHighlightInfo?.endParagraphId;
        endParagraphOffset = parseInt(attributes.endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset);
        ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(startParagraphId), startParagraphOffset));
        ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(endParagraphId), endParagraphOffset));
      } else if (selectionRange) {
        startNode = selectionRange.startContainer;
        startOffset = selectionRange.startOffset;
        endNode = selectionRange.endContainer;
        endOffset = selectionRange.endOffset;
        ([ startParagraphId, startParagraphOffset ] = getParagraphOffset(startNode, startOffset));
        ([ endParagraphId, endParagraphOffset ] = getParagraphOffset(endNode, endOffset));
      }
      
      // Create a new highlight range
      highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      if (options.snapToWord) highlightRange = snapRangeToWord(highlightRange);
      
      // If there are any issues with the range, set the highlight back to how it was
      if (startNode == null || startOffset == null || endNode == null || endOffset == null || startParagraphId == null || startParagraphOffset == null || endParagraphId == null || endParagraphOffset == null || highlightRange.toString() == '') {
        return isNewHighlight ? null : this.createOrUpdateHighlight(oldHighlightInfo);
      }
      
      // Check which bounds properties changed
      for (const key of ['startParagraphId', 'startParagraphOffset', 'endParagraphId', 'endParagraphOffset']) {
        if (isNewHighlight || eval(key) != oldHighlightInfo[key]) boundsChanges.push(key);
      }
      
      // Set variables that depend on the range
      const temporaryHtmlElement = document.createElement('div');
      temporaryHtmlElement.appendChild(highlightRange.cloneContents());
      for (const hyperlink of temporaryHtmlElement.querySelectorAll('a')) hyperlink.setAttribute('onclick', 'event.preventDefault();');
      rangeText = highlightRange.toString();
      rangeHtml = temporaryHtmlElement.innerHTML;
      rangeParagraphIds = annotatableParagraphIds.slice(annotatableParagraphIds.indexOf(startParagraphId), annotatableParagraphIds.indexOf(endParagraphId) + 1);
    }
    
    // If there are no changes, return
    if (appearanceChanges.length + boundsChanges.length == 0) return;
    
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
    if (isNewHighlight) {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
    } else {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
    }
    
    this.drawHighlights([highlightId]);
    if (triggeredByUserAction) {
      if (appearanceChanges.length > 0) updateSelectionStyle(newHighlightInfo.color, newHighlightInfo.style);
      if (highlightId != activeHighlightId) this.activateHighlight(highlightId);
    }
    return newHighlightInfo;
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    const selection = window.getSelection();
    const highlightToActivate = highlightsById[highlightId];
    if (highlightToActivate.readOnly) {
      // If the highlight is read-only, return an event, but don't actually activate it
      return annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
    }
    const highlightRange = highlightToActivate.rangeObj.cloneRange();
    activeHighlightId = highlightId;
    updateSelectionStyle(highlightToActivate.color, highlightToActivate.style);
    if (selection.type != 'Range') {
      selection.removeAllRanges();
      selection.addRange(highlightRange);
    }
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
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
  this.deactivateHighlights = () => {
    const deactivatedHighlight = highlightsById[activeHighlightId];
    activeHighlightId = null;
    previousSelectionRange = null;
    window.getSelection().removeAllRanges();
    updateSelectionStyle();
    if (deactivatedHighlight) {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
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
        annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
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
      if (!paragraphId || paragraphId == highlightInfo.startParagraphId) {
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
    options[key] = value ?? options[key];
    if (key == 'drawingMode') {
      if (CSS.highlights) CSS.highlights.clear();
      this.drawHighlights();
    }
  }
  
  // Get all of the initialized options
  this.getOptions = () => {
    return options;
  }
  
    
  // -------- EVENT LISTENERS --------
  
  // Selection change in document (new selection, change in selection range, or selection collapsing to a caret)
  document.addEventListener('selectionchange', (event) => respondToSelectionChange(event));
  const respondToSelectionChange = (event) => {
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    updateSelectionHandles();
    if (selection.type == 'None') return;
    const selectionRange = selection.getRangeAt(0);
    
    // Deselect text or deactivate highlights when tapping away, or when long-pressing to select text outside of the previous selection range
    if (!activeSelectionHandle && previousSelectionRange && (previousSelectionRange.comparePoint(selectionRange.startContainer, selectionRange.startOffset) == 1 || previousSelectionRange.comparePoint(selectionRange.endContainer, selectionRange.endOffset) == -1)) {
      this.deactivateHighlights();
    }
    
    if (selection.type == 'Range') {
      if (!activeHighlightId && (options.pointerMode == 'live' || (options.pointerMode == 'auto' && isStylus == true))) {
        this.createOrUpdateHighlight();
      }
      if (activeHighlightId) this.createOrUpdateHighlight({ highlightId: activeHighlightId, });
      previousSelectionRange = selectionRange.cloneRange();
    }
  }
  
  // Pointer down in annotatable container
  tapResult = null;
  annotatableContainer.addEventListener('pointerdown', (event) => respondToPointerDown(event));
  const respondToPointerDown = (event) => {
    isStylus = event.pointerType == 'pen';
    
    // User is dragging a selection handle
    if (event.target && event.target.parentElement.classList.contains('hh-selection-handle')) {
      event.preventDefault();
      activeSelectionHandle = event.target.parentElement;
      annotatableContainer.addEventListener('pointermove', respondToSelectionHandleDrag);
    }
    
    // Return if it's not a regular click, or if the user is tapping away from an existing selection
    if (previousSelectionRange || activeSelectionHandle || event.button != 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    
    const tapRange = getRangeFromTapEvent(event);
    tapResult = checkForTapTargets(tapRange);
  }
  
  // Selection handle drag (this function is added as an event listener on pointerdown, and removed on pointerup)
  const respondToSelectionHandleDrag = (event) => {
    const selection = window.getSelection();
    const selectionRange = selection.getRangeAt(0);
    
    const dragRange = getRangeFromTapEvent(event);
    // TODO: While dragging, the selection startContainer or endContainer frequently gets set to the parent element. This causes the selection to flicker while dragging. The line below is a workaround, but it would be nice to figure out the root cause.
    if (dragRange.startContainer.nodeType != Node.TEXT_NODE || dragRange.endContainer.nodeType != Node.TEXT_NODE) return;
    
    const dragPositionRelativeToSelectionStart = dragRange.compareBoundaryPoints(Range.START_TO_START, selectionRange);
    const dragPositionRelativeToSelectionEnd = dragRange.compareBoundaryPoints(Range.END_TO_END, selectionRange);    
    
    // TODO: Don't allow Caret (0-width) selections while dragging selection handles
    if (activeSelectionHandle.dataset.position == 'left' && dragPositionRelativeToSelectionEnd == 1 || activeSelectionHandle.dataset.position == 'right' && dragPositionRelativeToSelectionStart == -1) {
      for (const selectionHandle of selectionHandles) {
        selectionHandle.dataset.position = selectionHandle.dataset.position == 'left' ? 'right' : 'left';
      }
      // TODO: Switch selection direction and don't deactivate the highlight
      this.deactivateHighlights();
      activeSelectionHandle = null;
      annotatableContainer.removeEventListener('pointermove', respondToSelectionHandleDrag);
    } else if (activeSelectionHandle.dataset.position == 'left' && dragPositionRelativeToSelectionStart != 0) {
      // Left selection handle is before or after the selection start
      selectionRange.setStart(dragRange.startContainer, dragRange.startOffset);
    } else if (activeSelectionHandle.dataset.position == 'right' && dragPositionRelativeToSelectionEnd != 0) {
      // Right selection handle is before or after the selection end
      selectionRange.setEnd(dragRange.endContainer, dragRange.endOffset);
    }
  }
  
  // Pointer up in annotatable container
  annotatableContainer.addEventListener('pointerup', (event) => respondToPointerUp(event));
  const respondToPointerUp = (event) => {
    if (tapResult) {
      tapResult.pointerEvent = event;
      annotatableContainer.dispatchEvent(new CustomEvent('hh:tap', { detail: tapResult, }));
      if (options.autoTapToActivate && tapResult?.targetFound) {
        if (tapResult.highlights.length == 1 && tapResult.hyperlinks.length == 0) {
          return this.activateHighlight(tapResult.highlights[0].highlightId);
        } else if (tapResult.highlights.length == 0 && tapResult.hyperlinks.length == 1) {
          return this.activateHyperlink(tapResult.hyperlinks[0].position);
        } else if (tapResult.highlights.length + tapResult.hyperlinks.length > 1) {
          return annotatableContainer.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: tapResult, }));
        }
      }
    }
  }
  
  // Pointer up or cancel in window
  window.addEventListener('pointerup', respondToWindowPointerUp);
  window.addEventListener('pointercancel', respondToWindowPointerUp);
  function respondToWindowPointerUp(event) {
    const selection = window.getSelection();
    if (selection.type == 'Range' && options.snapToWord) {
      const selectionRange = snapRangeToWord(selection.getRangeAt(0)).cloneRange();
      selection.removeAllRanges();
      selection.addRange(selectionRange);
    }
    tapResult = null;
    if (activeSelectionHandle) {
      activeSelectionHandle = null;
      annotatableContainer.removeEventListener('pointermove', respondToSelectionHandleDrag);
    }
  }
  
  // Hyperlink click (for each hyperlink in annotatable container)
  for (const hyperlinkElement of hyperlinkElements) {
    hyperlinkElement.addEventListener('click', (event) => {
      this.deactivateHighlights();
      if (!allowHyperlinkClick) event.preventDefault();
    });
  }
  
  // Window resize
  let previousWindowWidth = window.innerWidth;
  window.addEventListener('resize', (event) => respondToWindowResize(event));
  const respondToWindowResize = (event) => {
    // Only respond if the width changed (ignore height changes)
    if (window.innerWidth == previousWindowWidth) return;
    if (options.drawingMode == 'svg') this.drawHighlights();
    previousWindowWidth = window.innerWidth;
  }
  
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
      document.body.append(tempInput);
      tempInput.focus();
      setTimeout(() => {
        tempInput.remove();
      }, 100);
    }
    initializeSelection();
    document.addEventListener('visibilitychange', (event) => {
      if (document.visibilityState == 'visible') initializeSelection();
    });
  }
  
  
  // -------- UTILITY FUNCTIONS --------
    
  // Check if the tap is in the range of an existing highlight or link
  const checkForTapTargets = (tapRange) => {
    if ((Object.keys(highlightsById).length + Object.keys(hyperlinksByPosition).length) == 0) return;
    
    // Check for tapped highlights and hyperlinks
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlightRange = highlightInfo.rangeObj;
      if (highlightRange.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
        tappedHighlights.push(highlightInfo);
      }
    }
    const tappedHyperlinks = [];
    for (const hyperlinkPosition of Object.keys(hyperlinksByPosition)) {
      const hyperlinkInfo = hyperlinksByPosition[hyperlinkPosition];
      const hyperlinkRange = document.createRange()
      hyperlinkRange.selectNodeContents(hyperlinkInfo.hyperlinkElement);
      if (hyperlinkRange.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
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
  function diffHighlight(newHighlightInfo, oldHighlightInfo) {
    if (!oldHighlightInfo) return newHighlightInfo;
    const changedHighlightInfo = {}
    for (const key of Object.keys(newHighlightInfo)) {
      if (oldHighlightInfo.hasOwnProperty(key) && oldHighlightInfo[key] != newHighlightInfo[key]) {
        changedHighlightInfo[key] = newHighlightInfo[key];
      }
    }
    return changedHighlightInfo;
  }
  
  // Undraw the specified highlight
  const undrawHighlight = (highlightInfo) => {
    const highlightId = highlightInfo.highlightId;
    for (const svgGroup of svgBackground.querySelectorAll(`g[data-highlight-id="${highlightId}"]`)) svgGroup.remove();
    document.querySelectorAll(`.hh-wrapper-start[data-highlight-id="${highlightId}"], .hh-wrapper-end[data-highlight-id="${highlightId}"]`).forEach(el => el.remove());
    document.querySelectorAll(`.hh-read-only[data-highlight-id="${highlightId}"]`).forEach(span => {
      const parentParagraph = span.closest(options.paragraphSelector);
      const textNode = span.firstChild;
      span.outerHTML = span.innerHTML;
      parentParagraph.normalize();
    });
    if (highlightsById.hasOwnProperty(highlightId)) highlightInfo.rangeObj = getRestoredHighlightRange(highlightInfo);
    const highlightCssRules = highlightsStylesheet.cssRules;
    const ruleIndexesToDelete = [];
    for (let r = 0; r < highlightCssRules.length; r++) {
      if (highlightCssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`) || highlightCssRules[r].selectorText.includes(`[data-highlight-id="${highlightId}"]`)) ruleIndexesToDelete.push(r);
    }
    for (const index of ruleIndexesToDelete.reverse()) highlightsStylesheet.deleteRule(index);
    if (CSS.highlights && CSS.highlights.has(highlightId)) CSS.highlights.delete(highlightId);
  }
  
  // Update the text selection color (to match the highlight color, when a highlight is selected for editing; or, to reset to the default text selection color)
  const updateSelectionStyle = (color, style) => {
    if (color && style) {
      let styleTemplate = getStyleTemplate(color, style, 'css');
      selectionStylesheet.replaceSync(`::selection { ${styleTemplate} }`);
    } else {
      selectionStylesheet.replaceSync(`::selection { background-color: Highlight; color: HighlightText; }`);
    }
    updateSelectionHandles();
    annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: {
      color: color,
      style: style,
    }}));
  }
  
  // Update selection handles
  function updateSelectionHandles() {
    const selection = window.getSelection();
    if (selection.type == 'Range' && options.showSelectionHandles) {
      const colorKey = highlightsById[activeHighlightId]?.color;
      const colorString = options.colors[colorKey] ?? 'AccentColor';
      const selectionRange = selection.getRangeAt(0);
      const selectionRangeRects = selectionRange.getClientRects();
      const startRect = selectionRangeRects[0];
      const endRect = selectionRangeRects[selectionRangeRects.length-1];
      const annotatableContainerClientRect = annotatableContainer.getBoundingClientRect();
      selectionHandles[0].dataset.position = 'left';
      selectionHandles[0].style.display = 'block';
      selectionHandles[0].style.height = startRect.height + 'px';
      selectionHandles[0].style.left = startRect.left - annotatableContainerClientRect.left + 'px';
      selectionHandles[0].style.top = startRect.top - annotatableContainerClientRect.top + 'px';
      selectionHandles[0].children[1].innerHTML = (options.selectionHandles.left ?? '').replace('{color}', colorString);
      selectionHandles[1].dataset.position = 'right';
      selectionHandles[1].style.display = 'block';
      selectionHandles[1].style.height = endRect.height + 'px';
      selectionHandles[1].style.left = endRect.right - annotatableContainerClientRect.left + 'px';
      selectionHandles[1].style.top = endRect.top - annotatableContainerClientRect.top + 'px';
      selectionHandles[1].children[1].innerHTML = (options.selectionHandles.right ?? '').replace('{color}', colorString);
    } else {
      selectionHandles[0].style.display = 'none';
      selectionHandles[1].style.display = 'none';
    }
  }
  
  
  // Snap the selection or highlight range to the nearest word
  function snapRangeToWord(range) {
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    
    // Trim whitespace at range start and end
    while (/\s/.test(startOffset < startNode.wholeText.length && startNode.wholeText[startOffset])) startOffset += 1;
    while (endOffset - 1 >= 0 && /\s/.test(endNode.wholeText[endOffset - 1])) endOffset -= 1;
    
    // If the range starts at the end of a text node, move it to start at the beginning of the following text node. This prevents the range from jumping across the text node boundary and selecting an extra word.
    if (startOffset == startNode.wholeText.length) {
      let parentElement = range.commonAncestorContainer;
      let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while (!textNode || textNode !== startNode) textNode = walker.nextNode();
      textNode = walker.nextNode();
      startNode = textNode;
      startOffset = 1;
    }
    
    // Expand range to word boundaries
    while (startOffset > 0 && /\S/.test(startNode.wholeText[startOffset - 1])) startOffset -= 1;
    while (endOffset + 1 <= endNode.wholeText.length && /\S/.test(endNode.wholeText[endOffset])) endOffset += 1;
    
    let newRange = document.createRange();
    newRange.setStart(startNode, startOffset);
    newRange.setEnd(endNode, endOffset);
    return newRange;
  }
  
  // Get the character offset relative to the annotatable paragraph
  // Adapted from https://stackoverflow.com/a/48812529/1349044
  const getParagraphOffset = (currentNode, currentOffset, annotatableParagraph = null) => {
    if (!currentNode.parentElement) return [ null, currentOffset ]
    if (!annotatableParagraph) annotatableParagraph = currentNode.parentElement.closest(options.paragraphSelector);
    if (currentNode === annotatableParagraph) return [ annotatableParagraph.id, currentOffset ];
    let prevSibling;
    while (prevSibling = (prevSibling || currentNode).previousSibling) {
      let nodeContent = prevSibling.innerText || prevSibling.nodeValue || '';
      currentOffset += nodeContent.length;
    }
    return getParagraphOffset(currentNode.parentElement, currentOffset, annotatableParagraph);
  }
  
  // Get the character offset relative to the deepest relevant text node
  const getTextNodeOffset = (parentElement, targetOffset) => {
    let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
    let textNode = null;
    let currentOffset = 0;
    while(!textNode || currentOffset < targetOffset) {
      textNode = walker.nextNode();
      currentOffset += textNode.wholeText.length;
    }
    let relativeOffset = textNode.wholeText.length - currentOffset + targetOffset;
    return [ textNode, relativeOffset ];
  }
  
  // Get style template for a given highlight style
  const getStyleTemplate = (color, style, type) => {
    color = color in options.colors ? color : options.defaultColor;
    style = style in options.styles ? style : options.defaultStyle;
    let cssColorString = options.colors[color];
    let cssStyleString = options.styles[style][type].replaceAll('{color}', cssColorString);
    return cssStyleString;
  }      
  
  // Restore the previous selection range in case the browser clears the selection
  const getRestoredSelectionOrCaret = (selection, pointerEvent = null) => {
    if (selection.type == 'None') {
      if (previousSelectionRange) {
        // iOS Safari deselects text when a button is tapped. This restores the selection.
        selection.addRange(previousSelectionRange);
      } else if (pointerEvent) {
        // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type == "Caret"). iOS Safari instead clears the selection (selection.type == "None"). This restores a Caret selection if the selection type is None.
        let range = getRangeFromTapEvent(pointerEvent);
        selection.addRange(range);
      }
    }
    return selection;
  }
  
  // Fix highlight range if the DOM changed and made the previous highlight range invalid
  const getRestoredHighlightRange = (highlightInfo) => {
    const highlightRange = highlightInfo.rangeObj;
    if (highlightRange.startContainer.nodeType != Node.TEXT_NODE || highlightRange.endContainer.nodeType != Node.TEXT_NODE) {
      ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.startParagraphId), highlightInfo.startParagraphOffset));
      ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.endParagraphId), highlightInfo.endParagraphOffset));
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
    }
    return highlightRange;
  }
  
  // Convert tap or click to a selection range
  // Adapted from https://stackoverflow.com/a/12924488/1349044
  function getRangeFromTapEvent(event) {
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
  
  // Get merged DOMRects from the highlight range
  const getMergedClientRects = (range, paragraphs) => {
    const unmergedRects = Array.from(range.getClientRects());
    const mergedRects = [];
    
    // Loop through the highlight's paragraphs
    for (const paragraph of paragraphs) {
      const paragraphRect = paragraph.getClientRects()[0];
      const computedParagraphStyle = window.getComputedStyle(paragraph);
      
      // Get line positions (bottom edge of each line)
      let linePositions = new Set();
      let lineWalker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      while (textNode = lineWalker.nextNode()) {
        if (window.getComputedStyle(textNode.parentElement).lineHeight == computedParagraphStyle.lineHeight) {
          const referenceRange = document.createRange();
          referenceRange.selectNode(textNode);
          for (const rangeRect of referenceRange.getClientRects()) linePositions.add(rangeRect.bottom);
        }
      }
      linePositions = Array.from(linePositions);
      
      // Create a merged rect for each line
      for (let ln = 0; ln < linePositions.length; ln++) {
        const linePosition = linePositions[ln];
        const previousLinePosition = ln == 0 ? paragraphRect.top : linePositions[ln-1];
        const mergedRect = new DOMRect(paragraphRect.right, previousLinePosition, 0, linePosition - previousLinePosition);
        for (let r = 0; r < unmergedRects.length; r++) {
          const rect = unmergedRects[r];
          const rectVerticalPosition = rect.y + (rect.height / 2);
          if (paragraphRect.width == rect.width && paragraphRect.height == rect.height && paragraphRect.top == rect.top && paragraphRect.left == rect.left) {
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
        if (mergedRect.width != 0) mergedRects.push(mergedRect);
      }
    }
    
    return mergedRects;
  }
  
  // Debounce a function to prevent it from being executed too frequently
  // Adapted from https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
  const debounce = (func, wait) => {
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
  
}


// -------- DEFAULTS --------

// Check browser type
const isTouchDevice = navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
const isSafari = /^((?!Chrome|Firefox|Android|Samsung).)*AppleWebKit/i.test(navigator.userAgent);

// Default function for generating a highlight ID
const hhGetNewHighlightId = () => {
  return 'hh-' + Date.now().toString();
}

// Default options
let hhDefaultOptions = {
  containerSelector: 'body',
  paragraphSelector: 'h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr',
  colors: {
    'red': 'hsl(352, 99%, 65%)',
    'orange': 'hsl(31, 99%, 58%)',
    'yellow': 'hsl(50, 98%, 61%)',
    'green': 'hsl(75, 70%, 49%)',
    'blue': 'hsl(182, 86%, 47%)',
  },
  styles: {
    'fill': {
      'css': 'background-color: hsl(from {color} h s l / 40%);',
      'svg': '<rect fill="hsl(from {color} h s l / 40%)" x="{x}" y="{y}" rx="4" style="width: calc({width}px + ({height}px / 6)); height: calc({height}px * 0.85); transform: translateX(calc({height}px / -12)) translateY(calc({height}px * 0.14));" />',
    },
    'single-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg': '<rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" />',
    },
    'double-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg': '<rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 0.9));" /><rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 15); transform: translateY(calc({height}px * 1.05));" />',
    },
    'colored-text': {
      'css': 'color: {color};',
      'svg': '',
    },
    'redacted': {
      'css': 'background-color: transparent; color: transparent;',
      'svg': '',
    },
  },
  wrappers: {},
  selectionHandles: {
    'left': '<div class="hh-default-handle" style="--color: {color}"></div>',
    'right': '<div class="hh-default-handle" style="--color: {color}"></div>',
  },
  showSelectionHandles: false,
  rememberStyle: true,
  snapToWord: false,
  autoTapToActivate: true,
  pointerMode: 'auto',
  drawingMode: CSS.highlights ? 'highlight-api' : 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: hhGetNewHighlightId,
}

console.log('Highlighter loaded');
